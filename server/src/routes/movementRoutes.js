import { Router } from 'express'
import mongoose from 'mongoose'
import Product from '../models/Product.js'
import StockMovement from '../models/StockMovement.js'
import asyncHandler from '../utils/asyncHandler.js'

const router = Router()

router.get('/', asyncHandler(async (request, response) => {
  const limit = Math.min(Math.max(Number.parseInt(request.query.limit, 10) || 50, 1), 200)
  const movements = await StockMovement.find().populate('product', 'name sku').sort({ createdAt: -1 }).limit(limit).lean()
  response.json({ movements })
}))

router.post('/', asyncHandler(async (request, response) => {
  const { type, product: productId, note = '' } = request.body
  const quantity = Number(request.body.quantity)
  if (!['in', 'out', 'adjustment'].includes(type)) return response.status(400).json({ message: 'Choose a valid movement type.' })
  if (!mongoose.isValidObjectId(productId)) return response.status(400).json({ message: 'Choose a valid product.' })
  if (!Number.isInteger(quantity) || quantity < 0 || (type !== 'adjustment' && quantity < 1)) {
    return response.status(400).json({ message: type === 'adjustment' ? 'New quantity must be a non-negative whole number.' : 'Quantity must be a positive whole number.' })
  }
  if (typeof note !== 'string' || note.length > 240) return response.status(400).json({ message: 'Notes must be 240 characters or fewer.' })

  const product = await Product.findOne({ _id: productId, isArchived: false })
  if (!product) return response.status(404).json({ message: 'Product not found.' })
  const previousStock = product.quantity
  const newStock = type === 'in' ? previousStock + quantity : type === 'out' ? previousStock - quantity : quantity
  if (newStock < 0) return response.status(409).json({ message: `Only ${previousStock} units are available.` })

  const updatedProduct = await Product.findOneAndUpdate(
    { _id: product._id, quantity: previousStock, isArchived: false },
    { quantity: newStock },
    { new: true },
  )
  if (!updatedProduct) return response.status(409).json({ message: 'This product changed while you were recording the movement. Refresh and try again.' })

  const movement = await StockMovement.create({
    product: product._id,
    type,
    quantity: type === 'adjustment' ? Math.abs(newStock - previousStock) : quantity,
    previousStock,
    newStock,
    note: note.trim(),
    createdBy: request.user._id,
  })
  await movement.populate('product', 'name sku')
  response.status(201).json({ movement })
}))

export default router
