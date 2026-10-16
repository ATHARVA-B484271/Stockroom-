import mongoose from 'mongoose'

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40, unique: true },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  brand: { type: String, trim: true, maxlength: 80, default: '' },
  unit: { type: String, trim: true, maxlength: 40, default: '' },
  packSize: { type: Number, min: 0, default: null },
  packUnit: { type: String, trim: true, maxlength: 40, default: '' },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  quantity: { type: Number, min: 0, default: 0 },
  unitPrice: { type: Number, required: true, min: 0 },
  unitCost: { type: Number, required: true, min: 0 },
  lowStockThreshold: { type: Number, min: 0, default: 5 },
  isArchived: { type: Boolean, default: false },
}, { timestamps: true })

productSchema.index({ name: 'text', sku: 'text' })

export default mongoose.model('Product', productSchema)
