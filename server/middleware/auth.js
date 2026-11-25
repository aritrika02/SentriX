import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import User from '../models/User.js';
import Organization from '../models/Organization.js';


// PERSONAL ACCOUNT CHECK
const isPersonal = user =>
  user?.accountMode === 'personal' &&
  user?.role === 'personal' &&
  user?.membershipStatus === 'approved' &&
  !user?.organizationId;


// ORGANIZATION ACCOUNT CHECK
const isOrganization = user =>
  user?.accountMode === 'organization' &&
  ['admin', 'employee'].includes(user?.role) &&
  user?.membershipStatus === 'approved' &&
  !!user?.organizationId &&
  mongoose.isValidObjectId(user.organizationId);


// AUTHENTICATION MIDDLEWARE
export async function auth(req, res, next) {

  try {

    const token = req.headers.authorization
      ?.match(/^Bearer (.+)$/)?.[1];

    if (!token) {

      return res.status(401).json({
        message: 'Login required'
      });

    }

    let payload;

    try {

      payload = jwt.verify(
        token,
        process.env.JWT_SECRET,
        { algorithms: ['HS256'] }
      );

    } catch {

      return res.status(401).json({
        message: 'Invalid or expired token'
      });

    }


    // VALIDATE USER ID
    if (!mongoose.isValidObjectId(payload?.id)) {

      return res.status(401).json({
        message: 'Invalid session'
      });

    }


    // FETCH CURRENT USER
    const user = await User.findById(payload.id)
      .select(
        '-passwordHash -resetPasswordToken -resetPasswordExpires'
      );

    if (!user) {

      return res.status(401).json({
        message: 'Invalid session'
      });

    }


    // BLOCK PENDING ACCOUNTS
    if (user.membershipStatus === 'pending') {

      return res.status(403).json({

        message: 'Your account is awaiting Admin approval',

        membershipStatus: 'pending'

      });

    }


    // BLOCK REJECTED ACCOUNTS
    if (user.membershipStatus === 'rejected') {

      return res.status(403).json({

        message: 'Your joining request has been rejected',

        membershipStatus: 'rejected'

      });

    }


    // BLOCK ANY UNAPPROVED ACCOUNT
    if (user.membershipStatus !== 'approved') {

      return res.status(403).json({
        message: 'Account access denied'
      });

    }


    // VALIDATE ACCOUNT CONFIGURATION
    if (!isPersonal(user) && !isOrganization(user)) {

      return res.status(403).json({
        message: 'Invalid account configuration'
      });

    }


    // VERIFY ACTIVE ORGANIZATION
    if (isOrganization(user)) {

      const activeOrganization =
        await Organization.exists({

          _id: user.organizationId,

          isActive: true

        });

      if (!activeOrganization) {

        return res.status(403).json({
          message: 'Organization is unavailable'
        });

      }

    }


    // ATTACH USER TO REQUEST
    req.user = user;

    return next();

  } catch (error) {

    next(error);

  }

}


// ADMIN ACCESS
export const admin = (req, res, next) => {

  if (
    isOrganization(req.user) &&
    req.user.role === 'admin'
  ) {

    return next();

  }

  return res.status(403).json({
    message: 'Organization admin access required'
  });

};


// PERSONAL ACCOUNT ACCESS
export const personal = (req, res, next) => {

  if (isPersonal(req.user)) {

    return next();

  }

  return res.status(403).json({
    message: 'Personal account access required'
  });

};


// ORGANIZATION ACCOUNT ACCESS
export const organization = (req, res, next) => {

  if (isOrganization(req.user)) {

    return next();

  }

  return res.status(403).json({
    message: 'Organization account access required'
  });

};