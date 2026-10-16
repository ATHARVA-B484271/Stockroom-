import 'dotenv/config'
import mongoose from 'mongoose'
import Category from '../src/models/Category.js'
import Product from '../src/models/Product.js'
import StockMovement from '../src/models/StockMovement.js'
import User from '../src/models/User.js'

const categoryNames = [
  'Grains & Flours',
  'Pulses & Lentils',
  'Edible Oils & Ghee',
  'Spices & Masalas',
  'Daily Essentials',
  'Snacks & Packaged Food',
  'Dairy Products',
  'Household & Personal Care',
]

const products = [
  { sku: 'GRA001', name: 'Basmati Rice', category: 'Grains & Flours', unit: 'bag', packSize: 25, packUnit: 'kg', unitCost: 1500, unitPrice: 1650, quantity: 100, lowStockThreshold: 10 },
  { sku: 'GRA002', name: 'Wheat Flour', category: 'Grains & Flours', unit: 'bag', packSize: 50, packUnit: 'kg', unitCost: 1600, unitPrice: 1750, quantity: 80, lowStockThreshold: 10 },
  { sku: 'PUL001', name: 'Toor Dal', category: 'Pulses & Lentils', unit: 'bag', packSize: 30, packUnit: 'kg', unitCost: 3600, unitPrice: 3900, quantity: 50, lowStockThreshold: 5 },
  { sku: 'PUL002', name: 'Moong Dal', category: 'Pulses & Lentils', unit: 'bag', packSize: 30, packUnit: 'kg', unitCost: 3000, unitPrice: 3300, quantity: 40, lowStockThreshold: 5 },
  { sku: 'OIL001', name: 'Sunflower Oil', category: 'Edible Oils & Ghee', unit: 'tin', packSize: 15, packUnit: 'litre', unitCost: 1950, unitPrice: 2100, quantity: 40, lowStockThreshold: 5 },
  { sku: 'SPI001', name: 'Turmeric Powder', category: 'Spices & Masalas', unit: 'carton', packSize: 10, packUnit: 'kg', unitCost: 1200, unitPrice: 1400, quantity: 25, lowStockThreshold: 3 },
  { sku: 'ESS001', name: 'Sugar', category: 'Daily Essentials', unit: 'bag', packSize: 50, packUnit: 'kg', unitCost: 2100, unitPrice: 2250, quantity: 70, lowStockThreshold: 10 },
  { sku: 'ESS002', name: 'Iodized Salt', category: 'Daily Essentials', unit: 'bag', packSize: 25, packUnit: 'kg', unitCost: 400, unitPrice: 475, quantity: 60, lowStockThreshold: 10 },
  { sku: 'SNK001', name: 'Biscuits', category: 'Snacks & Packaged Food', unit: 'carton', packSize: 1, packUnit: 'carton', unitCost: 450, unitPrice: 510, quantity: 100, lowStockThreshold: 10 },
  { sku: 'HOU001', name: 'Detergent Powder', category: 'Household & Personal Care', unit: 'carton', packSize: 1, packUnit: 'carton', unitCost: 900, unitPrice: 1020, quantity: 45, lowStockThreshold: 5 },
]

const openingMovements = [
  { sku: 'GRA001', reference: 'OPENING-001' },
  { sku: 'GRA002', reference: 'OPENING-002' },
  { sku: 'PUL001', reference: 'OPENING-003' },
  { sku: 'OIL001', reference: 'OPENING-004' },
  { sku: 'ESS001', reference: 'OPENING-005' },
]

if (!process.env.MONGODB_URI || !process.env.ADMIN_EMAIL) {
  console.error('Set MONGODB_URI and ADMIN_EMAIL in server/.env before importing sample inventory.')
  process.exit(1)
}

try {
  await mongoose.connect(process.env.MONGODB_URI)
  const admin = await User.findOne({ email: process.env.ADMIN_EMAIL.trim().toLowerCase() })
  if (!admin) {
    throw new Error('The configured administrator does not exist. Create it first with "npm run seed:admin".')
  }

  const existingCategories = await Category.find({
    name: { $in: categoryNames },
  }).collation({ locale: 'en', strength: 2 })
  const categoryByName = new Map(existingCategories.map((category) => [category.name.toLowerCase(), category]))
  let categoriesAdded = 0
  for (const name of categoryNames) {
    if (categoryByName.has(name.toLowerCase())) continue
    const category = await Category.create({ name })
    categoryByName.set(name.toLowerCase(), category)
    categoriesAdded += 1
  }

  const existingProducts = await Product.find({ sku: { $in: products.map(({ sku }) => sku) } })
  const productBySku = new Map(existingProducts.map((product) => [product.sku, product]))
  let productsAdded = 0
  for (const item of products) {
    if (productBySku.has(item.sku)) continue
    const product = await Product.create({
      sku: item.sku,
      name: item.name,
      brand: 'Generic',
      unit: item.unit,
      packSize: item.packSize,
      packUnit: item.packUnit,
      unitCost: item.unitCost,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lowStockThreshold: item.lowStockThreshold,
      category: categoryByName.get(item.category.toLowerCase())._id,
      isArchived: false,
    })
    productBySku.set(item.sku, product)
    productsAdded += 1
  }

  let movementsAdded = 0
  for (const movementInfo of openingMovements) {
    const product = productBySku.get(movementInfo.sku)
    const expected = products.find(({ sku }) => sku === movementInfo.sku)
    if (product.quantity !== expected.quantity) continue
    const note = `Opening Stock · ${movementInfo.reference}`
    const alreadyRecorded = await StockMovement.exists({ product: product._id, type: 'in', note })
    if (alreadyRecorded) continue
    await StockMovement.create({
      product: product._id,
      type: 'in',
      quantity: expected.quantity,
      previousStock: 0,
      newStock: expected.quantity,
      note,
      createdBy: admin._id,
    })
    movementsAdded += 1
  }

  console.log(`Grocery inventory import complete. Added ${categoriesAdded} categories, ${productsAdded} products, and ${movementsAdded} opening movements. Existing categories and products were left unchanged.`)
} catch (error) {
  console.error('Could not import grocery inventory:', error.message)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
