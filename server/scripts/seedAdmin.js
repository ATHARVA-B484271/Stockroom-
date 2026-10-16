import 'dotenv/config'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import User from '../src/models/User.js'

const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env
const resetPassword = process.argv.includes('--reset-password')
if (!MONGODB_URI || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in .env before seeding.')
  process.exit(1)
}
if (ADMIN_PASSWORD.length < 12) {
  console.error('ADMIN_PASSWORD must be at least 12 characters long.')
  process.exit(1)
}

try {
  await mongoose.connect(MONGODB_URI)
  const email = ADMIN_EMAIL.trim().toLowerCase()
  const existingUser = await User.findOne({ email })
  if (existingUser) {
    if (!resetPassword) {
      console.error(`An administrator already exists for ${email}. No password was changed.`)
      process.exitCode = 1
    } else {
      existingUser.passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12)
      await existingUser.save()
      console.log(`Administrator password reset for ${email}.`)
    }
  } else if (resetPassword) {
    console.error(`No administrator exists for ${email}. Run "npm run seed:admin" to create one.`)
    process.exitCode = 1
  } else {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12)
    await User.create({ name: ADMIN_NAME, email, passwordHash })
    console.log(`Administrator created for ${email}.`)
  }
} catch (error) {
  console.error('Could not create administrator:', error.message)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
