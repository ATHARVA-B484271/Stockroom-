import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { requireAuth } from './src/middleware/auth.js'
import authRoutes from './src/routes/authRoutes.js'
import categoryRoutes from './src/routes/categoryRoutes.js'
import dashboardRoutes from './src/routes/dashboardRoutes.js'
import movementRoutes from './src/routes/movementRoutes.js'
import productRoutes from './src/routes/productRoutes.js'

const requiredVariables = ['MONGODB_URI', 'JWT_SECRET']
const missingVariables = requiredVariables.filter((name) => !process.env[name])
if (missingVariables.length) {
  console.error(`Missing required environment variables: ${missingVariables.join(', ')}. Copy .env.example to .env and configure it.`)
  process.exit(1)
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters long.')
  process.exit(1)
}
const invitationLifetimeHours = Number(process.env.INVITATION_LIFETIME_HOURS || 24)
if (!Number.isInteger(invitationLifetimeHours) || invitationLifetimeHours < 1 || invitationLifetimeHours > 720) {
  console.error('INVITATION_LIFETIME_HOURS must be a whole number between 1 and 720.')
  process.exit(1)
}
try {
  new Intl.DateTimeFormat('en-US', { timeZone: process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata' }).format(new Date())
} catch {
  console.error('BUSINESS_TIMEZONE must be a valid IANA timezone, such as Asia/Kolkata.')
  process.exit(1)
}

const app = express()
const port = Number(process.env.PORT) || 4000
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((origin) => origin.trim())

app.disable('x-powered-by')
app.use(cors({ origin: allowedOrigins }))
app.use(express.json({ limit: '20kb' }))
app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))
app.use('/api/auth', authRoutes)
app.use('/api', requireAuth)
app.use('/api/products', productRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/movements', movementRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api', (_request, response) => response.status(404).json({ message: 'API endpoint not found.' }))
app.use((error, _request, response, _next) => {
  if (error.code === 11000) return response.status(409).json({ message: 'A record with that name, SKU, or email already exists.' })
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return response.status(400).json({ message: error.message })
  }
  if (error instanceof RangeError) return response.status(400).json({ message: error.message })
  if (Number.isInteger(error.status) && error.status >= 400 && error.status <= 599) {
    return response.status(error.status).json({ message: error.message })
  }
  console.error(error)
  response.status(500).json({ message: 'An unexpected server error occurred.' })
})

try {
  await mongoose.connect(process.env.MONGODB_URI)
  app.listen(port, () => console.log(`Inventory API listening on http://localhost:${port}`))
} catch (error) {
  console.error('Could not connect to MongoDB:', error.message)
  process.exit(1)
}
