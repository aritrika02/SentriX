import mongoose from 'mongoose';
const schema=new mongoose.Schema({riskId:{type:mongoose.Schema.Types.ObjectId,ref:'Risk',required:true},performedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},action:{type:String,required:true},oldValue:{type:mongoose.Schema.Types.Mixed,default:null},newValue:{type:mongoose.Schema.Types.Mixed,default:null}},{timestamps:true});
export default mongoose.model('AuditLog',schema);
