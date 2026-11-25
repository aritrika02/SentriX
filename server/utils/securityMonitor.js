
import SecurityEvent from '../models/SecurityEvent.js';
import User from '../models/User.js';

// Single-process failed-login monitoring
const failures = new Map();

const WINDOW = 15 * 60 * 1000;
const THRESHOLD = 5;

const source = req =>
  String(
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown'
  ).slice(0, 120);

// RECORD FAILED LOGIN
export async function recordFailedLogin(req, email) {

  const normalizedEmail = email.trim().toLowerCase();

  const now = Date.now();

  const key = `${source(req)}|${normalizedEmail}`;

  const old = failures.get(key);

  const state =
    !old || now - old.start > WINDOW
      ? {
          start: now,
          count: 0,
          alerted: false
        }
      : old;

  state.count++;

  failures.set(key, state);

  // GENERATE SECURITY ALERT
  if (state.count >= THRESHOLD && !state.alerted) {

    state.alerted = true;

    try {

      const user = await User.findOne({
        email: normalizedEmail
      }).select('_id accountMode organizationId role');

      await SecurityEvent.create({

        accountMode: user?.accountMode || null,

        organizationId: user?.organizationId || null,

        userId: user?._id || null,

        type: 'failed_login',

        severity: 'medium',

        description:
          `${state.count} failed logins for an account within 15 minutes`,

        source: source(req),

        count: state.count,

        status: 'new'

      });

    } catch (error) {

      state.alerted = false;

      console.error(
        'Security event creation failed:',
        error.message
      );

    }
  }

  // REMOVE EXPIRED ENTRIES
  if (failures.size > 5000) {

    for (const [k, v] of failures) {

      if (now - v.start > WINDOW) {
        failures.delete(k);
      }

    }

  }

}

// CLEAR FAILED ATTEMPTS AFTER SUCCESSFUL LOGIN
export function clearFailedLogin(req, email) {

  failures.delete(
    `${source(req)}|${email.trim().toLowerCase()}`
  );

}
