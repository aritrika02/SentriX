
import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },

    description: {
      type: String,
      required: true
    },

    category: {
      type: String,
      enum: [
        'Access Control',
        'Data Protection',
        'Infrastructure',
        'Compliance',
        'Other'
      ],
      default: 'Other'
    },

    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },

    likelihood: {
      type: Number,
      min: 1,
      max: 5,
      default: 3
    },

    impact: {
      type: Number,
      min: 1,
      max: 5,
      default: 3
    },

    controls: [
      {
        name: {
          type: String,
          required: true
        },
        implemented: {
          type: Boolean,
          default: false
        }
      }
    ],

    reviewStatus: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    },

    status: {
      type: String,
      enum: [
        'open',
        'in_progress',
        'pending_review',
        'closed'
      ],
      default: 'open'
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    deadline: {
      type: Date,
      default: null
    },

    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model('Risk', schema);
