export const access="public";
export const methods=["GET"];
export default async function(req,res){res.status(403).json({ok:false,error:"customer_auth_not_migrated",message:"Snapshots remain private until customer code/device/expiration verification is implemented."})}