
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import { auth } from '../middleware/auth.js';
import SecurityEvent from '../models/SecurityEvent.js';
import Risk from '../models/Risk.js';
import AuditLog from '../models/AuditLog.js';

const router = Router();

router.use(auth);

// CHECK PERSONAL MODE
const isPersonal = user =>
  user.accountMode === 'personal' &&
  user.role === 'personal';

// CHECK ORGANIZATION ADMIN
const isOrgAdmin = user =>
  user.accountMode === 'organization' &&
  user.role === 'admin' &&
  !!user.organizationId;

// SECURITY EVENT VISIBILITY
const eventScope = user => {

  if (isPersonal(user)) {
    return {
      accountMode: 'personal',
      organizationId: null,
      userId: user._id
    };
  }

  if (isOrgAdmin(user)) {
    return {
      accountMode: 'organization',
      organizationId: user.organizationId
    };
  }

  if (
    user.accountMode === 'organization' &&
    user.role === 'employee' &&
    user.organizationId
  ) {
    return {
      accountMode: 'organization',
      organizationId: user.organizationId,
      userId: user._id
    };
  }

  return {
    _id: { $in: [] }
  };
};

// VIEW SECURITY EVENTS
router.get('/events', async (req, res, next) => {
  try {

    const events = await SecurityEvent.find(
      eventScope(req.user)
    )
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json(events);

  } catch (e) {
    next(e);
  }
});

// CONVERT SECURITY EVENT INTO RISK
router.post('/events/:id/convert', async (req, res, next) => {

  let session;

  try {

    if (!isPersonal(req.user) && !isOrgAdmin(req.user)) {
      return res.status(403).json({
        message: 'Risk conversion access denied'
      });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid event ID'
      });
    }

    const data = z.object({
      title: z.string().trim().min(3).max(120),
      description: z.string().trim().min(5).max(2000)
    }).strict().parse(req.body);

    session = await mongoose.startSession();

    let risk;

    await session.withTransaction(async () => {

      const event = await SecurityEvent.findOne({
        _id: req.params.id,
        status: 'new',
        ...eventScope(req.user)
      }).session(session);

      if (!event) {
        throw Object.assign(
          new Error('Event not found or already converted'),
          { status: 404 }
        );
      }

      const risks = await Risk.create([{

        ...data,

        accountMode: isPersonal(req.user)
          ? 'personal'
          : 'organization',

        organizationId: isPersonal(req.user)
          ? null
          : req.user.organizationId,

        category: 'Access Control',
        severity: 'medium',
        likelihood: 3,
        impact: 3,

        controls: [{
          name: 'Investigate failed logins and document corrective action',
          implemented: false
        }],

        createdBy: req.user._id,
        assignedTo: null,
        reviewStatus: 'accepted',
        status: 'open'

      }], { session });

      risk = risks[0];

      event.status = 'converted';
      event.riskId = risk._id;

      await event.save({ session });

      await AuditLog.create([{
        riskId: risk._id,
        performedBy: req.user._id,
        action: 'CREATED_FROM_SECURITY_EVENT',
        newValue: {
          eventId: String(event._id)
        }
      }], { session });

    });

    res.status(201).json({ risk });

  } catch (e) {
    next(e);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
});

export default router;
