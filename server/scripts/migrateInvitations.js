import 'dotenv/config'
import mongoose from 'mongoose'
import { rolePermissions } from '../src/middleware/authorization.js'

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is required. Configure server/.env before running this migration.')
  process.exit(1)
}

try {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false })
  const hasInvitationCollection = await mongoose.connection.db.listCollections({ name: 'invitations' }).hasNext()
  if (!hasInvitationCollection) await mongoose.connection.db.createCollection('invitations')
  const collection = mongoose.connection.collection('invitations')
  const indexes = await collection.indexes()
  for (const index of indexes) {
    const fields = Object.keys(index.key || {})
    if ((fields.length === 1 && fields[0] === 'email') || (fields.length === 1 && fields[0] === 'expiresAt' && index.expireAfterSeconds !== undefined)) {
      await collection.dropIndex(index.name)
    }
  }
  const legacyAdminPermissions = rolePermissions.admin
  await collection.updateMany(
    { $or: [{ status: { $exists: false } }, { role: { $exists: false } }, { permissions: { $exists: false } }] },
    { $set: { status: 'pending', role: 'admin', permissions: legacyAdminPermissions } },
  )
  await collection.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } })
  await collection.createIndex({ status: 1, expiresAt: 1 })
  console.log('Invitation records migrated. Existing invitations remain valid as administrator invitations until expiry.')
} catch (error) {
  console.error('Invitation migration failed:', error.message)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
