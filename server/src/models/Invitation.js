import mongoose from 'mongoose'

const invitationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true },
  tokenHash: { type: String, required: true, unique: true },
  role: { type: String, enum: ['admin', 'inventory_manager', 'staff'], default: 'staff' },
  permissions: { type: [String], default: [] },
  status: { type: String, enum: ['pending', 'accepted', 'revoked', 'expired'], default: 'pending' },
  message: { type: String, trim: true, maxlength: 240, default: '' },
  expiresAt: { type: Date, required: true },
  acceptedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

invitationSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } })
invitationSchema.index({ status: 1, expiresAt: 1 })

export default mongoose.model('Invitation', invitationSchema)
