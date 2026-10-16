import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import Invitation from '../models/Invitation.js'
import User from '../models/User.js'
import asyncHandler from '../utils/asyncHandler.js'
import { requireAuth } from '../middleware/auth.js'
import { invitationRateLimit, loginRateLimit } from '../middleware/rateLimit.js'

const router = Router()
const invitationLifetimeMs = 24 * 60 * 60 * 1000

function getInvitationTokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

function requireAdmin(request, response, next) {
  if (request.user.role !== 'admin') return response.status(403).json({ message: 'Administrator access is required.' })
  next()
}

router.post('/login', loginRateLimit, asyncHandler(async (request, response) => {
  const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : ''
  const password = typeof request.body.password === 'string' ? request.body.password : ''
  if (!email || !password) return response.status(400).json({ message: 'Email and password are required.' })

  const user = await User.findOne({ email }).select('+passwordHash')
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return response.status(401).json({ message: 'That email and password do not match.' })
  }
  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' })
  response.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
}))

router.get('/me', requireAuth, (request, response) => {
  response.json({ user: { id: request.user.id, name: request.user.name, email: request.user.email, role: request.user.role } })
})

router.get('/admins', requireAuth, requireAdmin, asyncHandler(async (_request, response) => {
  const admins = await User.find().select('name email createdAt').sort({ name: 1 })
  response.json({ admins })
}))

router.post('/invitations', requireAuth, requireAdmin, invitationRateLimit, asyncHandler(async (request, response) => {
  const name = typeof request.body.name === 'string' ? request.body.name.trim() : ''
  const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : ''
  if (!name || !email) return response.status(400).json({ message: 'Name and email are required.' })
  if (name.length > 80) return response.status(400).json({ message: 'Name must be 80 characters or fewer.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).json({ message: 'Enter a valid email address.' })
  if (!process.env.SMTP_URL || !process.env.MAIL_FROM) {
    return response.status(503).json({ message: 'Email invitations are not configured. Set SMTP_URL and MAIL_FROM in the server environment.' })
  }
  if (await User.exists({ email })) return response.status(409).json({ message: 'An administrator already exists for that email.' })

  const token = randomBytes(32).toString('hex')
  await Invitation.findOneAndUpdate(
    { email },
    {
      name,
      email,
      tokenHash: getInvitationTokenHash(token),
      expiresAt: new Date(Date.now() + invitationLifetimeMs),
      createdBy: request.user.id,
    },
    { upsert: true, new: true, runValidators: true },
  )

  const origin = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0].trim()
  const invitationUrl = new URL('/', origin)
  invitationUrl.searchParams.set('invite', token)
  try {
    const transporter = nodemailer.createTransport(process.env.SMTP_URL)
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject: 'Your Stockroom administrator invitation',
      text: `Hello ${name},\n\nAn administrator invited you to join Stockroom. Set your password using this link within 24 hours:\n\n${invitationUrl.href}\n\nIf you were not expecting this invitation, you can ignore this email.`,
    })
  } catch (error) {
    console.error('Could not send administrator invitation:', error.message)
    return response.status(502).json({ message: 'The invitation could not be emailed. Check the SMTP settings and try again.' })
  }

  response.status(201).json({ message: 'Administrator invitation sent.' })
}))

router.post('/invitations/accept', loginRateLimit, asyncHandler(async (request, response) => {
  const token = typeof request.body.token === 'string' ? request.body.token : ''
  const password = typeof request.body.password === 'string' ? request.body.password : ''
  if (!token || !password) return response.status(400).json({ message: 'Invitation token and password are required.' })
  if (password.length < 12) return response.status(400).json({ message: 'Password must be at least 12 characters long.' })

  const invitation = await Invitation.findOne({
    tokenHash: getInvitationTokenHash(token),
    expiresAt: { $gt: new Date() },
  })
  if (!invitation) return response.status(400).json({ message: 'This invitation is invalid or has expired. Ask an administrator to send a new one.' })

  const user = await User.create({
    name: invitation.name,
    email: invitation.email,
    passwordHash: await bcrypt.hash(password, 12),
  })
  await Invitation.deleteOne({ _id: invitation._id })
  const authToken = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' })
  response.status(201).json({ token: authToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
}))

export default router
