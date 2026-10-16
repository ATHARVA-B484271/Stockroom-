import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import nodemailer from 'nodemailer'
import Invitation from '../models/Invitation.js'
import User from '../models/User.js'
import asyncHandler from '../utils/asyncHandler.js'
import { requireAuth } from '../middleware/auth.js'
import { effectivePermissions, isAllowedRole, permissionsForRole, publicUser, requirePermission } from '../middleware/authorization.js'
import { invitationRateLimit, loginRateLimit } from '../middleware/rateLimit.js'

const router = Router()
const invitationLifetimeMs = Number(process.env.INVITATION_LIFETIME_HOURS || 24) * 60 * 60 * 1000
const canManageTeam = requirePermission('team.manage')

function getInvitationTokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

function makeInvitationUrl(token) {
  const origin = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0].trim()
  const url = new URL('/', origin)
  url.searchParams.set('invite', token)
  return url.href
}

function invitationInput(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = body.role
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!name || !email) return { error: 'Name and email are required.' }
  if (name.length > 80) return { error: 'Name must be 80 characters or fewer.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' }
  if (role !== undefined && !isAllowedRole(role)) return { error: 'Choose a valid team role.' }
  if (message.length > 240) return { error: 'Invitation message must be 240 characters or fewer.' }
  try {
    const selectedRole = role || 'staff'
    return { name, email, role: selectedRole, permissions: permissionsForRole(selectedRole, body.permissions), message }
  } catch (error) {
    return { error: error.message }
  }
}

async function createOrResendInvitation(input, actorId, previousId = null, previousExpired = false) {
  const token = randomBytes(32).toString('hex')
  const invitationUrl = makeInvitationUrl(token)
  const session = await mongoose.startSession()
  let invitation
  try {
    await session.withTransaction(async () => {
      if (previousId) {
        const previous = await Invitation.updateOne(
          { _id: previousId, status: 'pending' },
          previousExpired ? { status: 'expired' } : { status: 'revoked', revokedAt: new Date() },
          { session },
        )
        if (!previous.modifiedCount) throw Object.assign(new Error('The invitation is no longer pending. Refresh the team list and try again.'), { status: 409 })
      } else {
        await Invitation.updateMany(
          { email: input.email, status: 'pending', expiresAt: { $lte: new Date() } },
          { status: 'expired' },
          { session },
        )
      }
      ;[invitation] = await Invitation.create([{
      ...input,
      tokenHash: getInvitationTokenHash(token),
      expiresAt: new Date(Date.now() + invitationLifetimeMs),
      acceptedAt: null,
      revokedAt: null,
      status: 'pending',
      createdBy: actorId,
      }], { session })
    })
  } finally {
    await session.endSession()
  }
  if (!process.env.SMTP_URL || !process.env.MAIL_FROM) {
    const origin = new URL(process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    if (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) {
      return { invitation, invitationUrl, preview: true }
    }
    await Invitation.updateOne({ _id: invitation._id, status: 'pending' }, { $set: { status: 'revoked', revokedAt: new Date() } })
    throw Object.assign(new Error('Email invitations are not configured. Set SMTP_URL and MAIL_FROM in the server environment.'), { status: 503 })
  }
  try {
    const transporter = nodemailer.createTransport(process.env.SMTP_URL)
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: input.email,
      subject: `Your StockRoom ${input.role.replace('_', ' ')} invitation`,
      text: `Hello ${input.name},\n\nYou have been invited to join StockRoom as ${input.role.replace('_', ' ')}.${input.message ? `\n\n${input.message}` : ''}\n\nSet your password using this link within ${process.env.INVITATION_LIFETIME_HOURS || 24} hours:\n\n${invitationUrl}\n\nIf you were not expecting this invitation, you can ignore this email.`,
    })
  } catch (error) {
    console.error('Could not send StockRoom invitation. Verify the configured SMTP settings.')
    await Invitation.updateOne({ _id: invitation._id, status: 'pending' }, { $set: { status: 'revoked', revokedAt: new Date() } })
    throw Object.assign(new Error('The invitation could not be emailed. Check the SMTP settings and try again.'), { status: 502 })
  }
  return { invitation, preview: false }
}

router.post('/login', loginRateLimit, asyncHandler(async (request, response) => {
  const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : ''
  const password = typeof request.body.password === 'string' ? request.body.password : ''
  if (!email || !password) return response.status(400).json({ message: 'Email and password are required.' })

  const user = await User.findOne({ email }).select('+passwordHash')
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return response.status(401).json({ message: 'That email and password do not match.' })
  }
  if (!user.isActive) return response.status(403).json({ message: 'Your account has been deactivated. Contact an administrator.' })
  user.lastLoginAt = new Date()
  await user.save()
  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' })
  response.json({ token, user: publicUser(user) })
}))

router.get('/me', requireAuth, (request, response) => {
  response.json({ user: publicUser(request.user) })
})

router.get('/admins', requireAuth, canManageTeam, asyncHandler(async (_request, response) => {
  const admins = await User.find().select('name email role permissions isActive createdAt lastLoginAt').sort({ name: 1 }).lean()
  response.json({ admins: admins.map(publicUser) })
}))

router.get('/team', requireAuth, canManageTeam, asyncHandler(async (_request, response) => {
  const [users, invitations] = await Promise.all([
    User.find().select('name email role permissions isActive invitedBy createdAt lastLoginAt').populate('invitedBy', 'name email').sort({ name: 1 }).lean(),
    Invitation.find({ status: { $in: ['pending', 'revoked', 'accepted', 'expired'] } })
      .select('name email role permissions status message expiresAt acceptedAt revokedAt createdBy createdAt')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
  ])
  const now = new Date()
  response.json({
    users: users.map(publicUser),
    invitations: invitations.map((invitation) => ({
      ...invitation,
      canResend: invitation.status === 'pending',
      status: invitation.status === 'pending' && invitation.expiresAt <= now ? 'expired' : invitation.status || 'pending',
    })),
  })
}))

router.patch('/team/:id', requireAuth, canManageTeam, asyncHandler(async (request, response) => {
  if (!['role', 'permissions', 'isActive'].some((field) => Object.hasOwn(request.body, field))) {
    return response.status(400).json({ message: 'Provide a role, permissions, or active status to update.' })
  }
  const user = await User.findById(request.params.id)
  if (!user) return response.status(404).json({ message: 'Team member not found.' })
  const nextRole = request.body.role ?? user.role
  if (!isAllowedRole(nextRole)) return response.status(400).json({ message: 'Choose a valid team role.' })
  if (user.id === request.user.id && (request.body.isActive === false || nextRole !== 'admin')) {
    return response.status(400).json({ message: 'You cannot deactivate or remove administrator access from your own account.' })
  }
  if (user.role === 'admin' && nextRole !== 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin', isActive: true })
    if (adminCount <= 1) return response.status(409).json({ message: 'At least one active administrator must remain.' })
  }
  user.role = nextRole
  if (Object.hasOwn(request.body, 'permissions') || Object.hasOwn(request.body, 'role')) {
    try {
      user.permissions = permissionsForRole(nextRole, request.body.permissions)
    } catch (error) {
      return response.status(400).json({ message: error.message })
    }
  }
  if (Object.hasOwn(request.body, 'isActive')) {
    if (typeof request.body.isActive !== 'boolean') return response.status(400).json({ message: 'isActive must be a boolean.' })
    if (user.role === 'admin' && !request.body.isActive && await User.countDocuments({ role: 'admin', isActive: true }) <= 1) {
      return response.status(409).json({ message: 'At least one active administrator must remain.' })
    }
    user.isActive = request.body.isActive
  }
  await user.save()
  response.json({ user: publicUser(user) })
}))

router.post('/invitations', requireAuth, canManageTeam, invitationRateLimit, asyncHandler(async (request, response) => {
  const input = invitationInput(request.body)
  if (input.error) return response.status(400).json({ message: input.error })
  if (await User.exists({ email: input.email })) return response.status(409).json({ message: 'A team account already exists for that email.' })
  if (await Invitation.exists({ email: input.email, status: 'pending', expiresAt: { $gt: new Date() } })) {
    return response.status(409).json({ message: 'An active invitation already exists for that email. Resend or revoke it first.' })
  }
  const result = await createOrResendInvitation(input, request.user.id)
  response.status(201).json({
    message: result.preview ? 'Invitation created. Use the local development link to accept it.' : 'Invitation sent.',
    invitation: { id: result.invitation.id, email: result.invitation.email, role: result.invitation.role, expiresAt: result.invitation.expiresAt },
    ...(result.preview ? { invitationUrl: result.invitationUrl } : {}),
  })
}))

router.post('/invitations/:id/resend', requireAuth, canManageTeam, invitationRateLimit, asyncHandler(async (request, response) => {
  const invitation = await Invitation.findById(request.params.id)
  if (!invitation || invitation.status !== 'pending') {
    return response.status(404).json({ message: 'Pending invitation not found. Create a new invitation instead.' })
  }
  if (await User.exists({ email: invitation.email })) return response.status(409).json({ message: 'A team account already exists for that email.' })
  const result = await createOrResendInvitation({
    name: invitation.name,
    email: invitation.email,
    role: invitation.role,
    permissions: invitation.permissions,
    message: invitation.message,
  }, request.user.id, invitation._id, invitation.expiresAt <= new Date())
  response.json({
    message: result.preview ? 'Invitation renewed. Use the local development link to accept it.' : 'Invitation resent.',
    invitation: { id: result.invitation.id, email: result.invitation.email, role: result.invitation.role, expiresAt: result.invitation.expiresAt },
    ...(result.preview ? { invitationUrl: result.invitationUrl } : {}),
  })
}))

router.delete('/invitations/:id', requireAuth, canManageTeam, asyncHandler(async (request, response) => {
  const invitation = await Invitation.findOneAndUpdate(
    { _id: request.params.id, status: 'pending' },
    { status: 'revoked', revokedAt: new Date() },
    { new: true },
  )
  if (!invitation) return response.status(404).json({ message: 'Pending invitation not found.' })
  response.json({ message: 'Invitation revoked.' })
}))

router.post('/invitations/accept', loginRateLimit, asyncHandler(async (request, response) => {
  const token = typeof request.body.token === 'string' ? request.body.token : ''
  const password = typeof request.body.password === 'string' ? request.body.password : ''
  if (!token || !password) return response.status(400).json({ message: 'Invitation token and password are required.' })
  if (password.length < 12) return response.status(400).json({ message: 'Password must be at least 12 characters long.' })

  const invitation = await Invitation.findOne({
    tokenHash: getInvitationTokenHash(token),
    status: 'pending',
    expiresAt: { $gt: new Date() },
  })
  if (!invitation) return response.status(400).json({ message: 'This invitation is invalid or has expired. Ask an administrator to send a new one.' })
  const session = await User.startSession()
  let user
  try {
    await session.withTransaction(async () => {
      const [createdUser] = await User.create([{
        name: invitation.name,
        email: invitation.email,
        passwordHash: await bcrypt.hash(password, 12),
        role: invitation.role,
        permissions: invitation.permissions,
        invitedBy: invitation.createdBy,
      }], { session })
      const accepted = await Invitation.updateOne(
        { _id: invitation._id, status: 'pending', expiresAt: { $gt: new Date() } },
        { status: 'accepted', acceptedAt: new Date() },
        { session },
      )
      if (!accepted.modifiedCount) throw Object.assign(new Error('This invitation has already been used or expired.'), { status: 409 })
      user = createdUser
    })
  } finally {
    await session.endSession()
  }
  const authToken = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' })
  response.status(201).json({ token: authToken, user: publicUser(user) })
}))

export default router
