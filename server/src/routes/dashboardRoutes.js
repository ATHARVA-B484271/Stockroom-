import { Router } from 'express'
import Category from '../models/Category.js'
import Product from '../models/Product.js'
import StockMovement from '../models/StockMovement.js'
import { requirePermission } from '../middleware/authorization.js'
import { businessDateBounds, businessMonthBounds, currentBusinessDate } from '../utils/businessTime.js'
import asyncHandler from '../utils/asyncHandler.js'

const router = Router()
const timeZone = () => process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata'

async function inventorySnapshot() {
  const [summary] = await Product.aggregate([
    { $match: { isArchived: false } },
    { $group: {
      _id: null,
      totalProducts: { $sum: 1 },
      totalUnits: { $sum: '$quantity' },
      inventoryValue: { $sum: { $multiply: ['$quantity', '$unitCost'] } },
      lowStockCount: { $sum: { $cond: [{ $lte: ['$quantity', '$lowStockThreshold'] }, 1, 0] } },
    } },
  ])
  const [lowStockItems, categoryBreakdown] = await Promise.all([
    Product.find({ isArchived: false, $expr: { $lte: ['$quantity', '$lowStockThreshold'] } })
      .populate('category', 'name')
      .select('name sku quantity unit lowStockThreshold category')
      .sort({ quantity: 1, name: 1 })
      .limit(100)
      .lean(),
    Product.aggregate([
      { $match: { isArchived: false } },
      { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'category' } },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id: '$category._id',
        name: { $first: { $ifNull: ['$category.name', 'Uncategorized'] } },
        totalProducts: { $sum: 1 },
        totalUnits: { $sum: '$quantity' },
        inventoryValue: { $sum: { $multiply: ['$quantity', '$unitCost'] } },
        lowStockCount: { $sum: { $cond: [{ $lte: ['$quantity', '$lowStockThreshold'] }, 1, 0] } },
      } },
      { $sort: { name: 1 } },
    ]),
  ])
  const categoriesCount = await Category.countDocuments()
  return {
    ...(summary || { totalProducts: 0, totalUnits: 0, inventoryValue: 0, lowStockCount: 0 }),
    totalCategories: categoriesCount,
    lowStockItems,
    categoryBreakdown,
  }
}

async function movementReport(start, end, label, bucketFormat) {
  const timezone = timeZone()
  const match = { createdAt: { $gte: start, $lt: end } }
  const [facets, inventory, recentMovements, movementCount] = await Promise.all([
    StockMovement.aggregate([
      { $match: match },
      { $facet: {
        byType: [
          { $group: {
            _id: '$type',
            transactions: { $sum: 1 },
            units: { $sum: '$quantity' },
            products: { $addToSet: '$product' },
          } },
          { $project: { transactions: 1, units: 1, productsAffected: { $size: '$products' } } },
        ],
        byDay: [
          { $group: {
            _id: { day: { $dateToString: { date: '$createdAt', format: bucketFormat, timezone } }, type: '$type' },
            transactions: { $sum: 1 },
            units: { $sum: '$quantity' },
          } },
          { $sort: { '_id.day': 1 } },
        ],
        topProducts: [
          { $group: { _id: '$product', transactions: { $sum: 1 }, units: { $sum: '$quantity' } } },
          { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
          { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
          { $project: { transactions: 1, units: 1, product: { _id: '$product._id', name: '$product.name', sku: '$product.sku', unit: '$product.unit' } } },
          { $sort: { units: -1, transactions: -1 } },
          { $limit: 10 },
        ],
      } },
    ]),
    inventorySnapshot(),
    StockMovement.find(match)
      .populate('product', 'name sku unit')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    StockMovement.countDocuments(match),
  ])
  const typeSummary = Object.fromEntries(['in', 'out', 'adjustment'].map((type) => {
    const value = facets[0]?.byType.find((row) => row._id === type)
    return [type, value ? { transactions: value.transactions, units: value.units, productsAffected: value.productsAffected } : { transactions: 0, units: 0, productsAffected: 0 }]
  }))
  const dayMap = new Map()
  for (const row of facets[0]?.byDay || []) {
    if (!dayMap.has(row._id.day)) dayMap.set(row._id.day, { date: row._id.day, in: 0, out: 0, adjustment: 0, inUnits: 0, outUnits: 0, adjustmentUnits: 0 })
    const day = dayMap.get(row._id.day)
    day[row._id.type] = row.transactions
    day[`${row._id.type}Units`] = row.units
  }
  const summary = {
    transactions: Object.values(typeSummary).reduce((sum, value) => sum + value.transactions, 0),
    units: Object.values(typeSummary).reduce((sum, value) => sum + value.units, 0),
  }
  const allAffected = await StockMovement.distinct('product', match)
  summary.productsAffected = allAffected.length
  const trendValues = new Map([...dayMap.entries()])
  const trend = 'date' in label
    ? Array.from({ length: 24 }, (_, hour) => {
      const date = `${label.date} ${String(hour).padStart(2, '0')}:00`
      return trendValues.get(date) || { date, in: 0, out: 0, adjustment: 0, inUnits: 0, outUnits: 0, adjustmentUnits: 0 }
    })
    : Array.from({ length: new Date(Date.UTC(label.year, label.month, 0)).getUTCDate() }, (_, index) => {
      const date = `${label.year}-${String(label.month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
      return trendValues.get(date) || { date, in: 0, out: 0, adjustment: 0, inUnits: 0, outUnits: 0, adjustmentUnits: 0 }
    })
  return {
    period: label,
    timeZone: timezone,
    summary,
    byType: typeSummary,
    trend,
    topProducts: (facets[0]?.topProducts || []).filter((item) => item.product?._id),
    inventory,
    recentMovements,
    movementCount,
    note: 'Inventory and low-stock values are the current snapshot; movement totals use the selected historical period.',
  }
}

router.get('/', requirePermission('dashboard.read'), asyncHandler(async (_request, response) => {
  const today = currentBusinessDate(new Date(), timeZone())
  const { start, end } = businessDateBounds(today, timeZone())
  const [snapshot, todayMovementCount] = await Promise.all([
    inventorySnapshot(),
    StockMovement.countDocuments({ createdAt: { $gte: start, $lt: end } }),
  ])
  response.json({ ...snapshot, todayMovementCount })
}))

router.get('/daily', requirePermission('reports.read'), asyncHandler(async (request, response) => {
  const date = typeof request.query.date === 'string' ? request.query.date : currentBusinessDate(new Date(), timeZone())
  const { start, end } = businessDateBounds(date, timeZone())
  response.json(await movementReport(start, end, { date }, '%Y-%m-%d %H:00'))
}))

router.get('/monthly', requirePermission('reports.read'), asyncHandler(async (request, response) => {
  const nowParts = new Intl.DateTimeFormat('en-US', { timeZone: timeZone(), year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const now = Object.fromEntries(nowParts.map(({ type, value }) => [type, value]))
  const month = request.query.month === undefined ? Number(now.month) : Number(request.query.month)
  const year = request.query.year === undefined ? Number(now.year) : Number(request.query.year)
  const { start, end } = businessMonthBounds(month, year, timeZone())
  response.json(await movementReport(start, end, { month, year }, '%Y-%m-%d'))
}))

export default router
