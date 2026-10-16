import { Router } from 'express'
import mongoose from 'mongoose'
import Product from '../models/Product.js'
import StockMovement from '../models/StockMovement.js'
import User from '../models/User.js'
import { businessDateBounds } from '../utils/businessTime.js'
import { requirePermission } from '../middleware/authorization.js'
import asyncHandler from '../utils/asyncHandler.js'

const router = Router()
const canRead = requirePermission('movements.read')

function dateFilter(query, filter) {
  const timeZone = process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata'
  if (query.from) filter.$gte = businessDateBounds(query.from, timeZone).start
  if (query.to) filter.$lt = businessDateBounds(query.to, timeZone).end
  if (query.from && query.to && filter.$gte >= filter.$lt) throw new RangeError('The start date must not be after the end date.')
  return filter
}

function movementMatch(query, allowedProductIds, searchMatch = null) {
  const match = {}
  if (query.type) {
    if (!['in', 'out', 'adjustment'].includes(query.type)) throw new RangeError('Choose a valid movement type.')
    match.type = query.type
  }
  if (query.product) {
    if (!mongoose.isValidObjectId(query.product)) throw new RangeError('Choose a valid product.')
    match.product = new mongoose.Types.ObjectId(query.product)
  }
  if (query.category) {
    if (!mongoose.isValidObjectId(query.category)) throw new RangeError('Choose a valid category.')
    if (match.product && !allowedProductIds.some((id) => String(id) === String(match.product))) {
      match.product = { $in: [] }
    } else if (!match.product) {
      match.product = { $in: allowedProductIds }
    }
  }
  if (query.from || query.to) match.createdAt = dateFilter(query, {})
  if (searchMatch) match.$and = [searchMatch]
  return match
}

async function movementSearch(search) {
  if (!search) return null
  const pattern = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(pattern, 'i')
  const [productIds, userIds] = await Promise.all([
    Product.find({ $or: [{ name: regex }, { sku: regex }] }).distinct('_id'),
    User.find({ $or: [{ name: regex }, { email: regex }] }).distinct('_id'),
  ])
  return { $or: [{ note: regex }, { reference: regex }, { product: { $in: productIds } }, { createdBy: { $in: userIds } }] }
}

async function categoryProducts(categoryId) {
  if (!mongoose.isValidObjectId(categoryId)) throw new RangeError('Choose a valid category.')
  return Product.find({ category: categoryId }).distinct('_id')
}

router.get('/summary', canRead, asyncHandler(async (request, response) => {
  const productIds = request.query.category ? await categoryProducts(request.query.category) : []
  const match = movementMatch(request.query, productIds)
  const [aggregate] = await StockMovement.aggregate([
    { $match: match },
    { $facet: {
      totals: [
        { $group: {
          _id: null,
          transactionCount: { $sum: 1 },
          totalUnits: { $sum: '$quantity' },
          products: { $addToSet: '$product' },
        } },
        { $project: { _id: 0, transactionCount: 1, totalUnits: 1, productsAffected: { $size: '$products' } } },
      ],
      byProduct: [
        { $sort: { createdAt: -1 } },
        { $group: {
          _id: '$product',
          transactionCount: { $sum: 1 },
          totalUnits: { $sum: '$quantity' },
          latestMovement: { $first: '$$ROOT' },
        } },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        { $project: {
          _id: 0,
          product: { _id: '$product._id', name: '$product.name', sku: '$product.sku', unit: '$product.unit', quantity: '$product.quantity', lowStockThreshold: '$product.lowStockThreshold', category: '$product.category' },
          transactionCount: 1,
          totalUnits: 1,
          latestMovement: { type: '$latestMovement.type', quantity: '$latestMovement.quantity', previousStock: '$latestMovement.previousStock', newStock: '$latestMovement.newStock', createdAt: '$latestMovement.createdAt', note: '$latestMovement.note' },
        } },
        { $sort: { 'latestMovement.createdAt': -1 } },
      ],
    } },
  ])
  response.json({
    summary: aggregate?.totals[0] || { transactionCount: 0, totalUnits: 0, productsAffected: 0 },
    products: (aggregate?.byProduct || []).filter((item) => item.product?._id),
  })
}))

router.get('/latest-by-product', canRead, asyncHandler(async (_request, response) => {
  const latestMovements = await StockMovement.aggregate([
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$product', latest: { $first: '$$ROOT' } } },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: { 'product.isArchived': false } },
    { $project: {
      _id: 0,
      productId: '$product._id',
      type: '$latest.type',
      quantity: '$latest.quantity',
      previousStock: '$latest.previousStock',
      newStock: '$latest.newStock',
      note: '$latest.note',
      reference: '$latest.reference',
      createdAt: '$latest.createdAt',
    } },
  ])
  response.json({ latestMovements })
}))

router.get('/', canRead, asyncHandler(async (request, response) => {
  const page = Math.max(1, Number.parseInt(request.query.page, 10) || 1)
  const limit = Math.min(Math.max(Number.parseInt(request.query.limit, 10) || 50, 1), 200)
  const productIds = request.query.category ? await categoryProducts(request.query.category) : []
  const search = typeof request.query.search === 'string' ? request.query.search.trim().slice(0, 100) : ''
  const match = movementMatch(request.query, productIds, await movementSearch(search))
  const [movements, totalItems] = await Promise.all([
    StockMovement.find(match)
      .populate({ path: 'product', select: 'name sku unit category', populate: { path: 'category', select: 'name' } })
      .populate('createdBy', 'name email')
      .sort({ createdAt: request.query.sort === 'oldest' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    StockMovement.countDocuments(match),
  ])
  response.json({ movements, pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) } })
}))

router.post('/', (request, response, next) => {
  const permission = request.body.type === 'in' ? 'movements.in' : request.body.type === 'out' ? 'movements.out' : 'movements.adjust'
  return requirePermission(permission)(request, response, next)
}, asyncHandler(async (request, response) => {
  const { type, product: productId, note = '', reference = '' } = request.body
  const quantity = Number(request.body.quantity)
  if (!['in', 'out', 'adjustment'].includes(type)) return response.status(400).json({ message: 'Choose a valid movement type.' })
  if (!mongoose.isValidObjectId(productId)) return response.status(400).json({ message: 'Choose a valid product.' })
  if (!Number.isInteger(quantity) || quantity < 0 || (type !== 'adjustment' && quantity < 1)) {
    return response.status(400).json({ message: type === 'adjustment' ? 'New quantity must be a non-negative whole number.' : 'Quantity must be a positive whole number.' })
  }
  if (typeof note !== 'string' || note.length > 240) return response.status(400).json({ message: 'Notes must be 240 characters or fewer.' })
  if (typeof reference !== 'string' || reference.length > 120) return response.status(400).json({ message: 'References must be 120 characters or fewer.' })
  if (type === 'adjustment' && !note.trim()) return response.status(400).json({ message: 'An adjustment reason is required.' })

  const session = await mongoose.startSession()
  let movement
  let failure
  try {
    await session.withTransaction(async () => {
      const product = await Product.findOne({ _id: productId, isArchived: false }).session(session)
      if (!product) {
        failure = { status: 404, message: 'Product not found.' }
        return
      }
      const previousStock = product.quantity
      const newStock = type === 'in' ? previousStock + quantity : type === 'out' ? previousStock - quantity : quantity
      if (newStock < 0) {
        failure = { status: 409, message: `Only ${previousStock} units are available.` }
        return
      }

      const updatedProduct = await Product.findOneAndUpdate(
        { _id: product._id, quantity: previousStock, isArchived: false },
        { quantity: newStock },
        { new: true, session },
      )
      if (!updatedProduct) {
        failure = { status: 409, message: 'This product changed while you were recording the movement. Refresh and try again.' }
        return
      }

      ;[movement] = await StockMovement.create([{
        product: product._id,
        type,
        quantity: type === 'adjustment' ? Math.abs(newStock - previousStock) : quantity,
        previousStock,
        newStock,
        note: note.trim(),
        reference: reference.trim(),
        createdBy: request.user._id,
      }], { session })
    })
  } finally {
    await session.endSession()
  }
  if (failure) return response.status(failure.status).json({ message: failure.message })
  await movement.populate({ path: 'product', select: 'name sku unit category', populate: { path: 'category', select: 'name' } })
  await movement.populate('createdBy', 'name email')
  response.status(201).json({ movement })
}))

export default router
