import { Router } from 'express'
import Product from '../models/Product.js'
import StockMovement from '../models/StockMovement.js'
import asyncHandler from '../utils/asyncHandler.js'

const router = Router()

router.get('/', asyncHandler(async (_request, response) => {
  const [products, recentMovements] = await Promise.all([
    Product.find({ isArchived: false }).select('quantity unitCost lowStockThreshold').lean(),
    StockMovement.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
  ])
  const summary = products.reduce((totals, product) => ({
    totalProducts: totals.totalProducts + 1,
    totalUnits: totals.totalUnits + product.quantity,
    inventoryValue: totals.inventoryValue + product.quantity * product.unitCost,
    lowStockCount: totals.lowStockCount + (product.quantity <= product.lowStockThreshold ? 1 : 0),
  }), { totalProducts: 0, totalUnits: 0, inventoryValue: 0, lowStockCount: 0 })
  response.json({ ...summary, todayMovementCount: recentMovements })
}))

export default router
