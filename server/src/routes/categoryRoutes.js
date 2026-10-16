import { Router } from 'express'
import Category from '../models/Category.js'
import Product from '../models/Product.js'
import asyncHandler from '../utils/asyncHandler.js'

const router = Router()

router.get('/', asyncHandler(async (_request, response) => {
  const categories = await Category.find().sort({ name: 1 }).lean()
  response.json({ categories })
}))

router.post('/', asyncHandler(async (request, response) => {
  const name = typeof request.body.name === 'string' ? request.body.name.trim() : ''
  const description = typeof request.body.description === 'string' ? request.body.description.trim() : ''
  if (!name) return response.status(400).json({ message: 'A category name is required.' })
  const category = await Category.create({ name, description })
  response.status(201).json({ category })
}))

router.delete('/:id', asyncHandler(async (request, response) => {
  const category = await Category.findById(request.params.id)
  if (!category) return response.status(404).json({ message: 'Category not found.' })
  const inUse = await Product.exists({ category: category.id })
  if (inUse) return response.status(409).json({ message: 'Move or remove this category from its products before deleting it.' })
  await category.deleteOne()
  response.json({ message: 'Category deleted.' })
}))

export default router
