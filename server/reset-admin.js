
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import User from './models/User.js';

const rl = createInterface({ input: stdin, output: stdout });

try {
  await mongoose.connect(process.env.MONGO_URI);

  const email = (await rl.question('Admin email: ')).trim().toLowerCase();
  const user = await User.findOne({ email, role: 'admin' });

  if (!user) {
    console.log('Admin account not found.');
  } else {
    const password = await rl.question('New password (8+ characters): ');

    if (password.length < 8 || password.length > 128) {
      console.log('Password must be 8–128 characters.');
    } else {
      user.passwordHash = await bcrypt.hash(password, 12);
      await user.save();
      console.log('Admin password reset successfully!');
    }
  }
} catch (error) {
  console.error('Password reset failed:', error.message);
} finally {
  rl.close();
  await mongoose.disconnect();
}
