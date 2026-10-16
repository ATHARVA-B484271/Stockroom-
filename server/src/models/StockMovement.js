import mongoose from 'mongoose'

const stockMovementSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  type: { type: String, enum: ['in', 'out', 'adjustment'], required: true },
  quantity: { type: Number, required: true, min: 0 },
  previousStock: { type: Number, required: true, min: 0 },
  newStock: { type: Number, required: true, min: 0 },
  note: { type: String, trim: true, maxlength: 240, default: '' },
  reference: { type: String, trim: true, maxlength: 120, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

stockMovementSchema.index({ createdAt: -1 })

export default mongoose.model('StockMovement', stockMovementSchema)
