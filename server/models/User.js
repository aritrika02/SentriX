
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  passwordHash: {
    type: String,
    required: true
  },

  // Account mode
  accountMode: {
    type: String,
    enum: ['personal', 'organization'],
    default: 'organization',
    required: true
  },

  // User role
  role: {
    type: String,
    enum: ['admin', 'employee', 'personal'],
    default: 'employee'
  },

  // Organization membership
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
    index: true
  },
membershipStatus: {
  type: String,
  enum: ['pending', 'approved', 'rejected'],
  default: 'pending',
  required: true
},
  // Password reset fields
  resetPasswordToken: {
    type: String,
    select: false
  },

  resetPasswordExpires: {
    type: Date,
    select: false
  }

}, { timestamps: true });

export default mongoose.model('User', schema);
