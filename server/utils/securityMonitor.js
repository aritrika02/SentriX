import SecurityEvent from '../models/SecurityEvent.js';
// Simple single-process demonstration, not a distributed brute-force protection service.
const failures=new Map();const WINDOW=15*60*1000;const THRESHOLD=5;
const source=req=>String(req.ip||req.socket?.remoteAddress||'unknown').slice(0,120);
export async function recordFailedLogin(req,email){
 const now=Date.now(),key=`${source(req)}|${email.toLowerCase()}`;
 const old=failures.get(key);
 const state=!old||now-old.start>WINDOW?{start:now,count:0,alerted:false}:old;
 state.count++;failures.set(key,state);
 if(state.count>=THRESHOLD&&!state.alerted){state.alerted=true;await SecurityEvent.create({type:'failed_login',description:`${state.count} failed logins for an account within 15 minutes`,source:source(req),count:state.count});}
 if(failures.size>5000)for(const [k,v] of failures)if(now-v.start>WINDOW)failures.delete(k);
}
export function clearFailedLogin(req,email){failures.delete(`${source(req)}|${email.toLowerCase()}`);}
