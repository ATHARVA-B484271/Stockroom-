import { Router } from 'express'
import mongoose from 'mongoose'
import Category from '../models/Category.js'
import Product from '../models/Product.js'
import StockMovement from '../models/StockMovement.js'
import { effectivePermissions, requirePermission } from '../middleware/authorization.js'
import asyncHandler from '../utils/asyncHandler.js'

const router = Router()
const canRead = requirePermission('inventory.read')
const canManage = requirePermission('products.manage')
const numericFields = ['unitPrice', 'unitCost', 'lowStockThreshold', 'packSize']

function validateProduct(body, creating) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const sku = typeof body.sku === 'string' ? body.sku.trim().toUpperCase() : ''
  if (creating && (!name || !sku)) return 'Product name and SKU are required.'
  if (body.name !== undefined && !name) return 'Product name cannot be empty.'
  if (body.sku !== undefined && !sku) return 'Product SKU cannot be empty.'
  for (const field of ['description', 'brand', 'unit', 'packUnit']) {
    if (body[field] !== undefined && typeof body[field] !== 'string') return `${field} must be text.`
  }
  for (const field of numericFields) {
    if (body[field] === undefined) {
      if (creating && (field === 'unitPrice' || field === 'unitCost')) return `${field} is required.`
      continue
    }
    if (field === 'packSize' && body.packSize !== '' && Number(body.packSize) === 0) return 'packSize must be greater than zero.'
    if (!Number.isFinite(Number(body[field])) || Number(body[field]) < 0) return `${field} must be a non-negative number.`
  }
  if (creating && (!Number.isInteger(Number(body.quantity)) || Number(body.quantity) < 0)) {
    return 'Starting quantity must be a non-negative whole number.'
  }
  return null
}

async function categoryValue(value) {
  if (!value) return null
  if (!mongoose.isValidObjectId(value)) return undefined
  const category = await Category.findById(value)
  return category || undefined
}

router.get('/', canRead, asyncHandler(async (request, response) => {
  const query = { isArchived: request.query.includeArchived === 'true' ? true : false }
  const products = await Product.find(query).populate('category', 'name').sort({ updatedAt: -1 }).lean()
  response.json({ products })
}))

router.post('/', canManage, asyncHandler(async (request, response) => {
  const validationError = validateProduct(request.body, true)
  if (validationError) return response.status(400).json({ message: validationError })
  if (Number(request.body.quantity) > 0 && !effectivePermissions(request.user).includes('movements.in')) {
    return response.status(403).json({ message: 'Recording opening stock also requires permission to record stock in.' })
  }
  const category = await categoryValue(request.body.category)
  if (request.body.category && !category) return response.status(400).json({ message: 'Choose a valid category.' })
  const session = await mongoose.startSession()
  let product
  try {
    await session.withTransaction(async () => {
      ;[product] = await Product.create([{
        name: request.body.name,
        sku: request.body.sku,
        description: request.body.description,
        brand: request.body.brand,
        unit: request.body.unit,
        packSize: request.body.packSize === '' || request.body.packSize === undefined ? null : Number(request.body.packSize),
        packUnit: request.body.packUnit,
        category: category?._id || null,
        quantity: Number(request.body.quantity),
        unitPrice: Number(request.body.unitPrice),
        unitCost: Number(request.body.unitCost),
        lowStockThreshold: Number(request.body.lowStockThreshold ?? 5),
      }], { session })
      if (product.quantity > 0) {
        await StockMovement.create([{
          product: product._id,
          type: 'in',
          quantity: product.quantity,
          previousStock: 0,
          newStock: product.quantity,
          note: 'Initial inventory',
          createdBy: request.user._id,
        }], { session })
      }
    })
  } finally {
    await session.endSession()
  }
  await product.populate('category', 'name')
  response.status(201).json({ product })
}))

router.patch('/:id', canManage, asyncHandler(async (request, response) => {
  if (Object.hasOwn(request.body, 'quantity')) {
    return response.status(400).json({ message: 'Use a stock movement to change on-hand quantity so the adjustment is recorded in movement history.' })
  }
  const validationError = validateProduct(request.body, false)
  if (validationError) return response.status(400).json({ message: validationError })
  const product = await Product.findOne({ _id: request.params.id, isArchived: false })
  if (!product) return response.status(404).json({ message: 'Product not found.' })
  if (Object.hasOwn(request.body, 'category')) {
    const category = await categoryValue(request.body.category)
    if (request.body.category && !category) return response.status(400).json({ message: 'Choose a valid category.' })
    product.category = category?._id || null
  }
  for (const field of ['name', 'sku', 'description', 'brand', 'unit', 'packUnit', ...numericFields]) {
    if (request.body[field] !== undefined) {
      product[field] = field === 'unitPrice' || field === 'unitCost' || field === 'lowStockThreshold' || field === 'packSize'
        ? request.body[field] === '' && field === 'packSize' ? null : Number(request.body[field])
        : request.body[field]
    }
  }
  await product.save()
  await product.populate('category', 'name')
  response.json({ product })
}))

router.patch('/:id/archive', canManage, asyncHandler(async (request, response) => {
  const product = await Product.findOneAndUpdate({ _id: request.params.id, isArchived: false }, { isArchived: true }, { new: true })
  if (!product) return response.status(404).json({ message: 'Product not found.' })
  response.json({ product })
}))

export default router
