import mongoose from 'mongoose'

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  description: { type: String, trim: true, maxlength: 240, default: '' },
}, { timestamps: true })

categorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } })

export default mongoose.model('Category', categorySchema)
