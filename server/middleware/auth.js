import jwt from 'jsonwebtoken';
import User from '../models/User.js';
export async function auth(req,res,next){try{const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token)return res.status(401).json({message:'Login required'});const payload=jwt.verify(token,process.env.JWT_SECRET);const user=await User.findById(payload.id).select('-passwordHash');if(!user)return res.status(401).json({message:'Invalid session'});req.user=user;next();}catch(e){return res.status(401).json({message:'Invalid or expired token'});}}
export const admin=(req,res,next)=>req.user.role==='admin'?next():res.status(403).json({message:'Admin access required'});
