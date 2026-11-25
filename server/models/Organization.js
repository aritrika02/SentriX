import mongoose from 'mongoose';

const schema = new mongoose.Schema({

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
    index: true
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  isActive: {
    type: Boolean,
    default: true
  }

}, {
  timestamps: true
});

export default mongoose.model('Organization', schema);