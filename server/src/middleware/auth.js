import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import asyncHandler from '../utils/asyncHandler.js'

export const requireAuth = asyncHandler(async (request, response, next) => {
  const authorization = request.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  if (!token) return response.status(401).json({ message: 'Sign in to continue.' })

  let claims
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return response.status(401).json({ message: 'Your session has expired. Please sign in again.' })
  }
  const user = await User.findById(claims.sub).select('name email role')
  if (!user) return response.status(401).json({ message: 'Your account is no longer available.' })
  request.user = user
  next()
})
