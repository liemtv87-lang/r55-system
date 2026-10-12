import {cleanupR55} from "lib/compactR55.js";
export const access="scheduler";
export const methods=["GET","POST"];
export default async function(req,res){
 const result=await cleanupR55();
 return res.json(result);
}