import { Router } from 'express'
import mongoose from 'mongoose'
import Category from '../models/Category.js'
import Product from '../models/Product.js'
import { requirePermission } from '../middleware/authorization.js'
import asyncHandler from '../utils/asyncHandler.js'

const router = Router()
const canRead = requirePermission('inventory.read')
const canManage = requirePermission('categories.manage')
const allowedSorts = new Set(['name-asc', 'name-desc', 'quantity-asc', 'quantity-desc', 'last-movement-desc'])

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

router.get('/', canRead, asyncHandler(async (_request, response) => {
  const [categories, totals] = await Promise.all([
    Category.find().sort({ name: 1 }).lean(),
    Product.aggregate([
      { $match: { isArchived: false } },
      { $group: {
        _id: '$category',
        totalProducts: { $sum: 1 },
        totalUnits: { $sum: '$quantity' },
        inventoryValue: { $sum: { $multiply: ['$quantity', '$unitCost'] } },
        lowStockCount: { $sum: { $cond: [{ $lte: ['$quantity', '$lowStockThreshold'] }, 1, 0] } },
      } },
    ]),
  ])
  const byId = new Map(totals.map((total) => [String(total._id), total]))
  response.json({
    categories: categories.map((category) => ({
      ...category,
      summary: byId.get(String(category._id)) || { totalProducts: 0, totalUnits: 0, inventoryValue: 0, lowStockCount: 0 },
    })),
  })
}))

router.get('/:id/products', canRead, asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(400).json({ message: 'Choose a valid category.' })
  const category = await Category.findById(request.params.id).lean()
  if (!category) return response.status(404).json({ message: 'Category not found.' })
  const page = Math.max(1, Number.parseInt(request.query.page, 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(request.query.limit, 10) || 20))
  const status = ['all', 'low', 'in-stock', 'out-of-stock'].includes(request.query.status) ? request.query.status : 'all'
  const sort = allowedSorts.has(request.query.sort) ? request.query.sort : 'name-asc'
  const search = typeof request.query.search === 'string' ? request.query.search.trim().slice(0, 100) : ''
  const match = { category: category._id, isArchived: false }
  if (search) match.$or = [{ name: { $regex: escapeRegex(search), $options: 'i' } }, { sku: { $regex: escapeRegex(search), $options: 'i' } }]
  if (status === 'low') match.$expr = { $lte: ['$quantity', '$lowStockThreshold'] }
  if (status === 'in-stock') match.quantity = { $gt: 0 }
  if (status === 'out-of-stock') match.quantity = 0
  const sortMap = {
    'name-asc': { name: 1 },
    'name-desc': { name: -1 },
    'quantity-asc': { quantity: 1, name: 1 },
    'quantity-desc': { quantity: -1, name: 1 },
    'last-movement-desc': { 'lastMovement.createdAt': -1, name: 1 },
  }
  const [summary, result] = await Promise.all([
    Product.aggregate([
      { $match: { category: category._id, isArchived: false } },
      { $group: {
        _id: null,
        totalProducts: { $sum: 1 },
        totalUnits: { $sum: '$quantity' },
        inventoryValue: { $sum: { $multiply: ['$quantity', '$unitCost'] } },
        lowStockCount: { $sum: { $cond: [{ $lte: ['$quantity', '$lowStockThreshold'] }, 1, 0] } },
      } },
    ]),
    Product.aggregate([
      { $match: match },
      { $lookup: {
        from: 'stockmovements',
        let: { productId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$product', '$$productId'] } } },
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
          { $project: { type: 1, quantity: 1, newStock: 1, createdAt: 1 } },
        ],
        as: 'latestMovement',
      } },
      { $unwind: { path: '$latestMovement', preserveNullAndEmptyArrays: true } },
      { $set: { lastMovement: '$latestMovement' } },
      { $sort: sortMap[sort] },
      { $facet: {
        products: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'category' } },
          { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
          { $project: { name: 1, sku: 1, brand: 1, unit: 1, packSize: 1, packUnit: 1, quantity: 1, unitPrice: 1, unitCost: 1, lowStockThreshold: 1, category: { _id: '$category._id', name: '$category.name' }, lastMovement: 1 } },
        ],
        pagination: [{ $count: 'totalItems' }],
      } },
    ]),
  ])
  const products = result[0]?.products || []
  const totalItems = result[0]?.pagination[0]?.totalItems || 0
  response.json({
    category,
    summary: summary[0] || { totalProducts: 0, totalUnits: 0, inventoryValue: 0, lowStockCount: 0 },
    products,
    pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
  })
}))

router.post('/', canManage, asyncHandler(async (request, response) => {
  const name = typeof request.body.name === 'string' ? request.body.name.trim() : ''
  const description = typeof request.body.description === 'string' ? request.body.description.trim() : ''
  if (!name) return response.status(400).json({ message: 'A category name is required.' })
  const category = await Category.create({ name, description })
  response.status(201).json({ category })
}))

router.delete('/:id', canManage, asyncHandler(async (request, response) => {
  const category = await Category.findById(request.params.id)
  if (!category) return response.status(404).json({ message: 'Category not found.' })
  const inUse = await Product.exists({ category: category.id })
  if (inUse) return response.status(409).json({ message: 'Move or remove this category from its products before deleting it.' })
  await category.deleteOne()
  response.json({ message: 'Category deleted.' })
}))

export default router
