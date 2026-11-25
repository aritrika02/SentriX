
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import Risk from '../models/Risk.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { auth, admin } from '../middleware/auth.js';

const router = Router();
router.use(auth);

const categories = [
  'Access Control',
  'Data Protection',
  'Infrastructure',
  'Compliance',
  'Other'
];

const schema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(2000),
  category: z.enum(categories),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  controls: z.array(
    z.object({
      name: z.string().trim().min(2).max(120),
      implemented: z.boolean()
    }).strict()
  ).max(15),
  deadline: z.string().nullable().optional(),
  assignedTo: z.string().nullable().optional()
}).strict();

const reportSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(2000),
  category: z.enum(categories),
  selfAssign: z.boolean().optional().default(false)
}).strict();

const validId = id => mongoose.isValidObjectId(id);

const riskScore = risk => risk.likelihood * risk.impact;

// Older risks were created before reviewStatus existed.
// Treat those existing risks as accepted.
const accepted = risk => risk.reviewStatus !== 'pending' &&
  risk.reviewStatus !== 'rejected';


const visible = user => {

  // PERSONAL MODE
  if (
    user.accountMode === 'personal' &&
    user.role === 'personal'
  ) {
    return {
      accountMode: 'personal',
      createdBy: user._id,
      organizationId: null
    };
  }

  // Block accounts without a valid organization
  if (
    user.accountMode !== 'organization' ||
    !user.organizationId
  ) {
    return {
      _id: { $in: [] }
    };
  }

  // ORGANIZATION ADMIN
  if (user.role === 'admin') {
    return {
      accountMode: 'organization',
      organizationId: user.organizationId
    };
  }

  // ORGANIZATION EMPLOYEE
  if (user.role === 'employee') {
    return {
      accountMode: 'organization',
      organizationId: user.organizationId,
      $or: [
        { assignedTo: user._id },
        { createdBy: user._id }
      ]
    };
  }

  // DENY UNKNOWN ROLES
  return {
    _id: { $in: [] }
  };
};

const isPersonal = user =>
  user.accountMode === 'personal' &&
  user.role === 'personal';

const manageRisk = (req, res, next) => {

  if (isPersonal(req.user)) {
    return next();
  }

  if (
    req.user.accountMode === 'organization' &&
    req.user.role === 'admin' &&
    req.user.organizationId
  ) {
    return next();
  }

  return res.status(403).json({
    message: 'Risk management access denied'
  });
};
 async function log(riskId, userId, action, oldValue, newValue) {
  await AuditLog.create({
    riskId,
    performedBy: userId,
    action,
    oldValue,
    newValue
  });
}

async function assignment(id, user) {

  // PERSONAL MODE
  if (isPersonal(user)) {
    return null;
  }

  // ORGANIZATION MEMBERSHIP CHECK
  if (!user.organizationId) {
    throw Object.assign(
      new Error('Organization membership required'),
      { status: 403 }
    );
  }

  if (!id) return null;

  // VERIFY EMPLOYEE BELONGS TO SAME ORGANIZATION
  // VERIFY EMPLOYEE BELONGS TO SAME ORGANIZATION
if (
  !validId(id) ||
  !(await User.exists({
    _id: id,
    role: 'employee',
    accountMode: 'organization',
    organizationId: user.organizationId,
    membershipStatus: 'approved'
  }))
) {
  throw Object.assign(
    new Error('Assign an approved employee from your organization'),
    { status: 400 }
  );
}

  return id;
}


function deadline(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw Object.assign(
      new Error('Invalid deadline'),
      { status: 400 }
    );
  }

  return date;
}

// VIEW RISKS
router.get('/', async (req, res, next) => {
  try {
    const risks = await Risk.find(visible(req.user))
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(500);

    res.json(risks);
  } catch (error) {
    next(error);
  }
});

// EMPLOYEE REPORTS A NEW RISK
router.post('/report', async (req, res, next) => {
  try {

    if (
      req.user.accountMode !== 'organization' ||
      req.user.role !== 'employee' ||
      !req.user.organizationId
    ) {
      return res.status(403).json({
        message: 'Organization employee access required'
      });
    }

    const data = reportSchema.parse(req.body);
    const risk = await Risk.create({
  accountMode: 'organization',
  organizationId: req.user.organizationId,
  title: data.title,
      description: data.description,
      category: data.category,
      severity: 'medium',
      likelihood: 3,
      impact: 3,
      controls: [],
      reviewStatus: 'pending',
      status: 'open',
      createdBy: req.user._id,
      assignedTo: data.selfAssign ? req.user._id : null
    });

    await log(
      risk._id,
      req.user._id,
      'RISK_REPORTED',
      null,
      {
        title: risk.title,
        selfAssign: data.selfAssign
      }
    );

    res.status(201).json(risk);
  } catch (error) {
    next(error);
  }
});

// ADMIN OR PERSONAL USER CREATES A RISK
router.post('/', manageRisk, async (req, res, next) => {
  try {
    const data = schema.parse(req.body);

    
const risk = await Risk.create({
  ...data,

  accountMode: isPersonal(req.user)
    ? 'personal'
    : 'organization',

  organizationId: isPersonal(req.user)
    ? null
    : req.user.organizationId,

  deadline: deadline(data.deadline),

  assignedTo: await assignment(
    data.assignedTo,
    req.user
  ),

  createdBy: req.user._id,
  reviewStatus: 'accepted',
  status: 'open'
});

    await log(
      risk._id,
      req.user._id,
      'CREATED',
      null,
      {
        title: risk.title,
        severity: risk.severity
      }
    );

    res.status(201).json(risk);
  } catch (error) {
    next(error);
  }
});

// ADMIN ACCEPTS OR REJECTS AN EMPLOYEE REPORT
router.patch('/:id/review', admin, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid risk ID'
      });
    }

    const { decision } = z.object({
      decision: z.enum(['accepted', 'rejected'])
    }).strict().parse(req.body);

   const risk = await Risk.findOne({
  _id: req.params.id,
  ...visible(req.user)
});

    if (!risk) {
      return res.status(404).json({
        message: 'Risk not found'
      });
    }

    if (risk.reviewStatus !== 'pending') {
      return res.status(409).json({
        message: 'This report has already been reviewed'
      });
    }

    risk.reviewStatus = decision;

    // A rejected report cannot remain assigned.
    if (decision === 'rejected') {
      risk.assignedTo = null;
    }

    await risk.save();

    await log(
      risk._id,
      req.user._id,
      'REPORT_REVIEWED',
      { reviewStatus: 'pending' },
      { reviewStatus: decision }
    );

    res.json(risk);
  } catch (error) {
    next(error);
  }
});

// EMPLOYEE TAKES OWNERSHIP OF AN ACCEPTED, UNASSIGNED RISK
router.patch('/:id/claim', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid risk ID'
      });
    }

   if (
  req.user.role !== 'employee' ||
  req.user.accountMode !== 'organization' ||
  !req.user.organizationId
) {
      return res.status(403).json({
        message: 'Only employees can claim risks'
      });
    }

    // Employees may claim their own reports after approval.
    // Atomic update prevents two claims from overwriting each other.
    const risk = await Risk.findOneAndUpdate(
      {
        _id: req.params.id,
        accountMode: 'organization',
        organizationId: req.user.organizationId,
        createdBy: req.user._id,
        assignedTo: null,
        reviewStatus: 'accepted',
        status: 'open'
      },
      {
        $set: { assignedTo: req.user._id }
      },
      { new: true, runValidators: true }
    );

    if (!risk) {
      return res.status(409).json({
        message: 'Risk is unavailable for self-assignment'
      });
    }

    await log(
      risk._id,
      req.user._id,
      'SELF_ASSIGNED',
      { assignedTo: null },
      { assignedTo: req.user._id }
    );

    res.json(risk);
  } catch (error) {
    next(error);
  }
});

// ADMIN OR PERSONAL USER UPDATES RISK DETAILS
router.patch('/:id', manageRisk, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid risk ID'
      });
    }

    const data = schema.partial().parse(req.body);

  const risk = await Risk.findOne({
  _id: req.params.id,
  ...visible(req.user)
});

    if (!risk) {
      return res.status(404).json({
        message: 'Risk not found'
      });
    }

    if (!accepted(risk)) {
      return res.status(409).json({
        message: 'Accept the report before editing risk details'
      });
    }

    if (risk.status === 'closed') {
      return res.status(409).json({
        message: 'Closed risks cannot be edited'
      });
    }

    if (risk.status === 'pending_review') {
      return res.status(409).json({
        message: 'Return risk to in progress before editing'
      });
    }

    const before = risk.toObject();

    if ('assignedTo' in data) {
      data.assignedTo = await assignment(data.assignedTo, req.user);
    }

    if ('deadline' in data) {
      data.deadline = deadline(data.deadline);
    }

    Object.assign(risk, data);
    await risk.save();

    await log(
      risk._id,
      req.user._id,
      'UPDATED',
      before,
      data
    );

    res.json(risk);
  } catch (error) {
    next(error);
  }
});

// UPDATE RISK STATUS
router.patch('/:id/status', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid risk ID'
      });
    }

 const { status } = z.object({
  status: z.enum([
    'open',
    'in_progress',
    'pending_review',
    'closed'
  ])
}).strict().parse(req.body);
if (status === 'closed' && !isPersonal(req.user)) {
  return res.status(403).json({
    message: 'Organization risks require admin verification'
  });
}
const risk = await Risk.findOne({
  _id: req.params.id,
  ...visible(req.user)
});

if (!risk) {
  return res.status(404).json({
    message: 'Risk not found'
  });
}

if (
  (status === 'pending_review' || status === 'closed') &&
  risk.controls.some(control => !control.implemented)
) {
  return res.status(409).json({
    message: 'Complete all controls before closing the risk'
  });
}

    if (!accepted(risk)) {
      return res.status(409).json({
        message: 'Risk report has not been accepted'
      });
    }

    if (
      req.user.role === 'employee' &&
      String(risk.assignedTo) !== String(req.user._id)
    ) {
      return res.status(403).json({
        message: 'Only the assigned employee can update this risk'
      });
    }

    if (risk.status === 'closed') {
      return res.status(409).json({
        message: 'Risk already closed'
      });
    }

    if (
      req.user.role === 'employee' &&
      status === 'open'
    ) {
      return res.status(403).json({
        message: 'Employees cannot reopen risks'
      });
    }

    if (
      status === 'pending_review' &&
      risk.controls.some(control => !control.implemented)
    ) {
      return res.status(409).json({
        message: 'Complete all controls before verification'
      });
    }

    const oldStatus = risk.status;

    risk.status = status;
    await risk.save();

    await log(
      risk._id,
      req.user._id,
      'STATUS_CHANGED',
      { status: oldStatus },
      { status }
    );

    res.json(risk);
  } catch (error) {
    next(error);
  }
});

// ADMIN VERIFIES COMPLETED RISK
router.patch('/:id/verify', admin, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid risk ID'
      });
    }

   const risk = await Risk.findOne({
  _id: req.params.id,
  ...visible(req.user)
});
    if (!risk) {
      return res.status(404).json({
        message: 'Risk not found'
      });
    }

    if (!accepted(risk)) {
      return res.status(409).json({
        message: 'Risk report has not been accepted'
      });
    }

    if (risk.status !== 'pending_review') {
      return res.status(409).json({
        message: 'Risk must be pending review'
      });
    }

    if (risk.controls.some(control => !control.implemented)) {
      return res.status(409).json({
        message: 'Compliance controls incomplete'
      });
    }

    risk.status = 'closed';
    risk.verifiedBy = req.user._id;

    await risk.save();

    await log(
      risk._id,
      req.user._id,
      'VERIFIED',
      { status: 'pending_review' },
      { status: 'closed' }
    );

    res.json(risk);
  } catch (error) {
    next(error);
  }
});

// ADMIN AND PERSONAL DASHBOARD METRICS
router.get('/summary/metrics', manageRisk, async (req, res, next) => {
  try {
    const risks = await Risk.find({
  ...visible(req.user),
  reviewStatus: { $nin: ['pending', 'rejected'] }
}).lean();

    res.json({
      total: risks.length,
      overdue: risks.filter(
        risk =>
          risk.deadline &&
          new Date(risk.deadline) < new Date() &&
          risk.status !== 'closed'
      ).length,
      highPriority: risks.filter(
        risk =>
          riskScore(risk) >= 15 &&
          risk.status !== 'closed'
      ).length,
      controlsImplemented: risks.reduce(
        (total, risk) =>
          total +
          (risk.controls || []).filter(
            control => control.implemented
          ).length,
        0
      ),
      controlsTotal: risks.reduce(
        (total, risk) =>
          total + (risk.controls || []).length,
        0
      )
    });
  } catch (error) {
    next(error);
  }
});

// VIEW RISK AUDIT LOGS
router.get('/:id/logs', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid risk ID'
      });
    }

    const risk = await Risk.findOne({
      _id: req.params.id,
      ...visible(req.user)
    });

    if (!risk) {
      return res.status(404).json({
        message: 'Risk not found'
      });
    }

    const logs = await AuditLog.find({
      riskId: risk._id
    })
      .populate('performedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(logs);
  } catch (error) {
    next(error);
  }
});

export default router;
