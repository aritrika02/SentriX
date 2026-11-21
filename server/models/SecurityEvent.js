import mongoose from 'mongoose';
const schema=new mongoose.Schema({type:{type:String,enum:['failed_login'],required:true},severity:{type:String,enum:['medium'],default:'medium'},description:{type:String,required:true,maxlength:500},source:{type:String,required:true,maxlength:120},count:{type:Number,default:1},status:{type:String,enum:['new','converted'],default:'new'},riskId:{type:mongoose.Schema.Types.ObjectId,ref:'Risk',default:null}},{timestamps:true});
schema.index({createdAt:-1});
export default mongoose.model('SecurityEvent',schema);
