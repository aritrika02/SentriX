import {Router} from 'express';
import mongoose from 'mongoose';
import {z} from 'zod';
import {auth,admin} from '../middleware/auth.js';
import SecurityEvent from '../models/SecurityEvent.js';
import Risk from '../models/Risk.js';
import AuditLog from '../models/AuditLog.js';
const router=Router();router.use(auth,admin);
router.get('/events',async(req,res,next)=>{try{res.json(await SecurityEvent.find({}).sort({createdAt:-1}).limit(100).lean());}catch(e){next(e)}});
router.post('/events/:id/convert',async(req,res,next)=>{try{
 if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:'Invalid event ID'});
 const data=z.object({title:z.string().trim().min(3).max(120),description:z.string().trim().min(5).max(2000)}).strict().parse(req.body);
 const event=await SecurityEvent.findOneAndUpdate({_id:req.params.id,status:'new'},{$set:{status:'converted'}},{new:true});
 if(!event)return res.status(404).json({message:'Event not found or already converted'});
 try{
  const risk=await Risk.create({...data,category:'Access Control',severity:'medium',likelihood:3,impact:3,controls:[{name:'Investigate failed logins and document corrective action',implemented:false}],createdBy:req.user._id,status:'open'});
  await SecurityEvent.updateOne({_id:event._id},{$set:{riskId:risk._id}});
  await AuditLog.create({riskId:risk._id,performedBy:req.user._id,action:'CREATED_FROM_SECURITY_EVENT',newValue:{eventId:String(event._id)}});
  res.status(201).json({risk});
 }catch(e){await SecurityEvent.updateOne({_id:event._id,riskId:null},{$set:{status:'new'}});throw e;}
}catch(e){next(e)}});
export default router;
