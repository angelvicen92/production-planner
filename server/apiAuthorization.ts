import type {AppRole} from './authz';
import type {RequestHandler} from 'express';

// Supabase service_role bypasses RLS; every API handler needs this boundary.
export function apiRequiredRoles(method:string,path:string):readonly AppRole[]|null {
 const within=(prefix:string)=>path===prefix||path.startsWith(`${prefix}/`);
 if(within('/debug'))return ['admin'];
 const catalogs=['/settings','/program-settings','/optimizer-settings','/task-templates','/zones','/spaces','/resource-types','/resource-items','/resource-pools','/staff-people','/staff-defaults','/itinerant-teams'];
 if(catalogs.some(within))return method==='GET'?['admin','production','aux','viewer']:['admin'];
 if(['/plans','/locks','/daily-tasks'].some(within))return method==='GET'?['admin','production','aux','viewer']:['admin','production'];
 return null;
}

export function createApiAuthorization(dependencies:{authenticate:RequestHandler;lookupRole:(id:string)=>Promise<AppRole|null>}):RequestHandler {
 return (req,res,next)=>{
  if(req.path==='/health')return next();
  return dependencies.authenticate(req,res,async()=>{
   const allowed=apiRequiredRoles(req.method.toUpperCase(),req.path);
   if(!allowed)return next();
   const id=(req as any).user?.id;
   if(!id)return res.status(401).json({message:'Unauthorized'});
   try{
    const role=await dependencies.lookupRole(id);(req as any).userRole=role;
    if(!role||!allowed.includes(role))return res.status(403).json({type:'permission_denied',message:'No tienes permisos para esta acción.'});
    return next();
   }catch{return res.status(500).json({message:'Failed to validate permissions'});}
  });
 };
}
