import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'inventory_manager', 'staff'], default: 'admin' },
  permissions: { type: [String], default: undefined },
  isActive: { type: Boolean, default: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  lastLoginAt: { type: Date, default: null },
}, { timestamps: true })

export default mongoose.model('User', userSchema)
