
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import crypto from 'node:crypto';
import { Resend } from 'resend';

import User from '../models/User.js';
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
      name: z.string().trim().min(2).max(80)
    }).parse(req.body);

    const email = data.email.toLowerCase();

    if (await User.exists({ email })) {
      return res.status(409).json({
        message: 'Email already registered'
      });
    }

    const user = await User.create({
      name: data.name,
      email,
      passwordHash: await bcrypt.hash(data.password, 12)
    });

    res.status(201).json({
      message: 'Account created',
      id: user.id
    });
  } catch (error) {
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
      !(await bcrypt.compare(data.password, user.passwordHash))
    ) {
      await recordFailedLogin(req, data.email);

      return res.status(401).json({
        message: 'Invalid credentials'
      });
    }

    clearFailedLogin(req, data.email);

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
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

    // Do not reveal whether an email is registered
    if (!user) {
      return res.json({ message: genericMessage });
    }

    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    if (!process.env.CLIENT_ORIGIN) {
      throw new Error('CLIENT_ORIGIN is not configured');
    }

    // Generate a cryptographically secure token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Store only the SHA-256 hash in MongoDB
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Token expires in 15 minutes
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    const frontendUrl = process.env.CLIENT_ORIGIN;

    const resetLink = new URL(frontendUrl);
    resetLink.searchParams.set('resetToken', resetToken);

    const resend = new Resend(process.env.RESEND_API_KEY);

    // Save token and expiration
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = expires;

    await user.save();

    try {
      const { error: emailError } = await resend.emails.send({
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
        console.error(
          'Resend delivery failed:',
          emailError.message
        );

        throw new Error('Unable to send password reset email');
      }
    } catch (mailError) {
      // Clear token if email delivery fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;

      await user.save();

      throw mailError;
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

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }
    }).select(
      '+resetPasswordToken +resetPasswordExpires'
    );

    if (!user) {
      return res.status(400).json({
        message: 'Invalid or expired password reset link'
      });
    }

    // Hash the new password
    user.passwordHash = await bcrypt.hash(data.password, 12);

    // Invalidate the reset token
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.json({
      message: 'Password reset successful. Please log in.'
    });
  } catch (error) {
    next(error);
  }
});

// GET CURRENT USER
router.get('/me', auth, (req, res) => {
  res.json(req.user);
});

// ADMIN: GET ALL USERS
router.get('/users', auth, admin, async (req, res, next) => {
  try {
    const users = await User.find({})
      .select('name email role')
      .sort({ name: 1 });

    res.json(users);
  } catch (error) {
    next(error);
  }
});

// ADMIN SETUP
// One-time bootstrap only.
// Disable this route before production deployment.
router.post('/setup-admin', async (req, res, next) => {
  try {
    if (
      !process.env.ADMIN_SETUP_KEY ||
      req.headers['x-setup-key'] !== process.env.ADMIN_SETUP_KEY
    ) {
      return res.status(403).json({
        message: 'Invalid setup key'
      });
    }

    if (await User.exists({ role: 'admin' })) {
      return res.status(409).json({
        message: 'Admin already exists'
      });
    }

    const data = credentials.extend({
      name: z.string().trim().min(2).max(80)
    }).parse(req.body);

    const email = data.email.toLowerCase();

    if (await User.exists({ email })) {
      return res.status(409).json({
        message: 'Email already registered'
      });
    }

    const user = await User.create({
      name: data.name,
      email,
      passwordHash: await bcrypt.hash(data.password, 12),
      role: 'admin'
    });

    res.status(201).json({
      message: 'Admin created',
      id: user.id
    });
  } catch (error) {
    next(error);
  }
});

export default router;
