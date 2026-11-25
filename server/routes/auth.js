import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import crypto from 'node:crypto';
import { Resend } from 'resend';

import User from '../models/User.js';
import Organization from '../models/Organization.js';
import { auth, admin } from '../middleware/auth.js';

import {
  recordFailedLogin,
  clearFailedLogin
} from '../utils/securityMonitor.js';

const router = Router();

const credentials = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128)
});

const emailSchema = z.object({
  email: z.string().email().max(254)
});

const resetSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(8).max(128)
});


// REGISTER
router.post('/register', async (req, res, next) => {
  try {

    const data = credentials.extend({

      name: z.string().trim().min(2).max(80),

      accountMode: z.enum([
        'personal',
        'organization'
      ]),

      organizationAction: z.enum([
        'create',
        'join'
      ]).optional(),

      organizationName: z.string()
        .trim().min(2).max(120).optional(),

      organizationId: z.string()
        .regex(/^[a-fA-F0-9]{24}$/).optional()

    }).parse(req.body);

    const email = data.email.toLowerCase();

    if (await User.exists({ email })) {
      return res.status(409).json({
        message: 'Email already registered'
      });
    }

    const passwordHash = await bcrypt.hash(
      data.password, 12
    );


    // PERSONAL ACCOUNT
    if (data.accountMode === 'personal') {

      const user = await User.create({
        name: data.name,
        email,
        passwordHash,
        accountMode: 'personal',
        role: 'personal',
        membershipStatus: 'approved',
        organizationId: null
      });

      return res.status(201).json({
        message: 'Personal account created',
        id: user.id
      });

    }


    // CREATE ORGANIZATION
    if (data.organizationAction === 'create') {

      if (!data.organizationName) {
        return res.status(400).json({
          message: 'Organization name is required'
        });
      }

      const session = await User.startSession();

      let user;

      try {

        await session.withTransaction(async () => {

          user = new User({
            name: data.name,
            email,
            passwordHash,
            accountMode: 'organization',
            role: 'admin',
            membershipStatus: 'approved'
          });

          const organization = new Organization({
            name: data.organizationName,
            createdBy: user._id,
            isActive: true
          });

          user.organizationId = organization._id;

          await organization.save({ session });
          await user.save({ session });

        });

      } finally {

        await session.endSession();

      }

      res.set('Cache-Control', 'no-store');

      return res.status(201).json({
        message: 'Organization created successfully',
        id: user.id
      });

    }


    // JOIN ORGANIZATION
    if (data.organizationAction === 'join') {

      if (!data.organizationId) {

        return res.status(400).json({
          message: 'Please select an organization'
        });

      }

      const organization = await Organization.findOne({
        _id: data.organizationId,
        isActive: true
      });

      if (!organization) {

        return res.status(404).json({
          message: 'Organization not found'
        });

      }

      const user = await User.create({
        name: data.name,
        email,
        passwordHash,
        accountMode: 'organization',
        role: 'employee',
        organizationId: organization._id,
        membershipStatus: 'pending'
      });

      return res.status(201).json({
        message: 'Joining request submitted. Please wait for Admin approval.',
        id: user.id,
        membershipStatus: 'pending'
      });

    }

    return res.status(400).json({
      message: 'Choose to create or join an organization'
    });

  } catch (error) {

    if (error.code === 11000 && error.keyPattern?.email) {

      return res.status(409).json({
        message: 'Email already registered'
      });

    }

    next(error);

  }
});


// LOGIN
router.post('/login', async (req, res, next) => {
  try {

    const data = credentials.parse(req.body);

    const user = await User.findOne({
      email: data.email.toLowerCase()
    });

    if (
      !user ||
      !(await bcrypt.compare(
        data.password,
        user.passwordHash
      ))
    ) {

      await recordFailedLogin(req, data.email);

      return res.status(401).json({
        message: 'Invalid credentials'
      });

    }

    clearFailedLogin(req, data.email);


    // VALIDATE ACCOUNT MEMBERSHIP
    const validPersonal =
      user.accountMode === 'personal' &&
      user.role === 'personal' &&
      !user.organizationId;

    const validOrganization =
      user.accountMode === 'organization' &&
      ['admin', 'employee'].includes(user.role) &&
      !!user.organizationId;

    if (!validPersonal && !validOrganization) {

      return res.status(403).json({
        message: 'Invalid account configuration'
      });

    }


    // VERIFY ACTIVE ORGANIZATION
    if (validOrganization) {

      const organization = await Organization.exists({
        _id: user.organizationId,
        isActive: true
      });

      if (!organization) {

        return res.status(403).json({
          message: 'Organization is unavailable'
        });

      }

    }


    // CHECK MEMBERSHIP APPROVAL
    if (user.membershipStatus !== 'approved') {

      return res.status(403).json({

        message: user.membershipStatus === 'pending'
          ? 'Your joining request is awaiting Admin approval.'
          : 'Your account access has not been approved.',

        membershipStatus: user.membershipStatus

      });

    }


    // GENERATE JWT TOKEN
    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.set('Cache-Control', 'no-store');

    res.json({
      token,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        accountMode: user.accountMode,
        membershipStatus: user.membershipStatus,
        organizationId: user.organizationId || null
      }

    });

  } catch (error) {

    next(error);

  }
});


// FORGOT PASSWORD
router.post('/forgot-password', async (req, res, next) => {
  try {

    const { email } = emailSchema.parse(req.body);

    const genericMessage =
      'If an account exists with this email, a password reset link will be sent.';

    const user = await User.findOne({
      email: email.toLowerCase()
    });


    // DO NOT REVEAL WHETHER EMAIL EXISTS
    if (!user) {

      return res.json({
        message: genericMessage
      });

    }

    if (
      !process.env.RESEND_API_KEY ||
      !process.env.CLIENT_ORIGIN
    ) {

      console.error(
        'Password reset email configuration is missing'
      );

      return res.json({
        message: genericMessage
      });

    }


    // GENERATE SECURE RESET TOKEN
    const resetToken = crypto
      .randomBytes(32)
      .toString('hex');

    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    const expires = new Date(
      Date.now() + 15 * 60 * 1000
    );


    // SUPPORT MULTIPLE CLIENT ORIGINS
    const allowedOrigins = process.env.CLIENT_ORIGIN
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean);

    const frontendUrl =
      allowedOrigins.find(origin =>
        origin.startsWith('https://')
      ) || allowedOrigins[0];

    const resetLink = new URL(frontendUrl);

    resetLink.searchParams.set(
      'resetToken',
      resetToken
    );

    const resend = new Resend(
      process.env.RESEND_API_KEY
    );


    // SAVE TOKEN AND EXPIRATION
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = expires;

    await user.save();

    try {

      const { error: emailError } =
        await resend.emails.send({

          from: process.env.RESEND_FROM ||
            'SentriX <onboarding@resend.dev>',

          to: user.email,

          subject: 'Reset Your SentriX Password',

          text: [
            'You requested a password reset for SentriX.',
            '',
            'Click the link below to reset your password:',
            resetLink.toString(),
            '',
            'This link expires in 15 minutes.',
            '',
            'If you did not request this, ignore this email.'
          ].join('\n')

        });

      if (emailError) {

        throw new Error(emailError.message);

      }

    } catch (mailError) {


      // CLEAR ONLY THIS FAILED RESET TOKEN
      await User.updateOne(

        {
          _id: user._id,
          resetPasswordToken: hashedToken
        },

        {
          $unset: {
            resetPasswordToken: '',
            resetPasswordExpires: ''
          }
        }

      );

      console.error(
        'Password reset email delivery failed'
      );

    }

    res.json({
      message: genericMessage
    });

  } catch (error) {

    next(error);

  }
});


// RESET PASSWORD
router.post('/reset-password', async (req, res, next) => {
  try {

    const data = resetSchema.parse(req.body);

    const hashedToken = crypto
      .createHash('sha256')
      .update(data.token)
      .digest('hex');

    const tokenFilter = {

      resetPasswordToken: hashedToken,

      resetPasswordExpires: {
        $gt: new Date()
      }

    };

    const user = await User.findOne(
      tokenFilter
    ).select('_id');

    if (!user) {

      return res.status(400).json({
        message: 'Invalid or expired password reset link'
      });

    }

    const passwordHash = await bcrypt.hash(
      data.password, 12
    );


    // UPDATE PASSWORD AND INVALIDATE TOKEN ATOMICALLY
    const updated = await User.findOneAndUpdate(

      {
        _id: user._id,
        resetPasswordToken: hashedToken,
        resetPasswordExpires: {
          $gt: new Date()
        }
      },

      {
        $set: {
          passwordHash
        },

        $unset: {
          resetPasswordToken: '',
          resetPasswordExpires: ''
        }
      },

      {
        new: true,
        runValidators: true
      }

    );

    if (!updated) {

      return res.status(400).json({
        message: 'Invalid or expired password reset link'
      });

    }

    res.json({
      message: 'Password reset successful. Please log in.'
    });

  } catch (error) {

    next(error);

  }
});


// GET CURRENT USER
router.get('/me', auth, (req, res) => {

  res.set('Cache-Control', 'no-store');

  res.json({

    _id: req.user._id,
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    accountMode: req.user.accountMode,
    membershipStatus: req.user.membershipStatus,
    organizationId: req.user.organizationId || null

  });

});


// ADMIN: GET APPROVED USERS FROM OWN ORGANIZATION
router.get('/users', auth, admin, async (req, res, next) => {
  try {

    if (
      req.user.accountMode !== 'organization' ||
      !req.user.organizationId
    ) {

      return res.status(403).json({
        message: 'Organization membership required'
      });

    }

    const users = await User.find({

      role: {
        $in: ['admin', 'employee']
      },

      accountMode: 'organization',

      organizationId: req.user.organizationId,

      membershipStatus: 'approved'

    })
      .select('name email role accountMode organizationId')
      .sort({ name: 1 });

    res.json(users);

  } catch (error) {

    next(error);

  }
});


// SEARCH ACTIVE ORGANIZATIONS
router.get('/organizations', async (req, res, next) => {
  try {

    const search = z.string()
      .trim()
      .min(2)
      .max(120)
      .parse(req.query.search || '');

    const escaped = search.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

    const organizations = await Organization.find({

      isActive: true,

      name: {
        $regex: escaped,
        $options: 'i'
      }

    })
      .select('_id name')
      .sort({ name: 1 })
      .limit(20);

    res.json(organizations);

  } catch (error) {

    next(error);

  }
});


// ADMIN: VIEW PENDING JOINING REQUESTS
router.get(
  '/organization/requests',
  auth,
  admin,
  async (req, res, next) => {

    try {

      const requests = await User.find({

        organizationId: req.user.organizationId,

        accountMode: 'organization',

        role: 'employee',

        membershipStatus: 'pending'

      })
        .select('name email membershipStatus createdAt')
        .sort({ createdAt: -1 });

      res.json(requests);

    } catch (error) {

      next(error);

    }

  }
);


// ADMIN: APPROVE OR REJECT JOINING REQUEST
router.patch(
  '/organization/requests/:id',
  auth,
  admin,
  async (req, res, next) => {

    try {

      const id = z.string()
        .regex(/^[a-fA-F0-9]{24}$/)
        .parse(req.params.id);

      const { decision } = z.object({

        decision: z.enum([
          'approved',
          'rejected'
        ])

      }).strict().parse(req.body);

      const employee = await User.findOneAndUpdate(

        {
          _id: id,

          organizationId: req.user.organizationId,

          accountMode: 'organization',

          role: 'employee',

          membershipStatus: 'pending'
        },

        {
          $set: {
            membershipStatus: decision
          }
        },

        {
          new: true,
          runValidators: true
        }

      ).select('name email role membershipStatus');

      if (!employee) {

        return res.status(404).json({
          message: 'Pending joining request not found'
        });

      }

      res.json({

        message: `Joining request ${decision}`,

        employee

      });

    } catch (error) {

      next(error);

    }

  }
);


// LEGACY ADMIN SETUP DISABLED
router.post('/setup-admin', (req, res) => {

  return res.status(410).json({
    message: 'Admin setup is disabled. Create an organization through registration.'
  });

});

export default router;