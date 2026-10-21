import type {AppRole} from './authz';
import type {RequestHandler} from 'express';

// Supabase service_role bypasses RLS; every API handler needs this boundary.
export function apiRequiredRoles(method:string,path:string):readonly AppRole[]|null {
 const within=(prefix:string)=>path===prefix||path.startsWith(`${prefix}/`);
 if(within('/debug'))return ['admin'];
 if(/^\/plans\/[^/]+\/execution\/reset\/?$/i.test(path))return ['admin'];
 if(/^\/plans\/[^/]+\/header-notes(?:\/|$)/i.test(path))return method==='GET'||method==='HEAD'?['admin','production','aux','viewer']:['admin','production'];
 if(/^\/plans\/[^/]+\/incidents(?:\/|$)/.test(path))return method==='GET'?['admin','production','aux','viewer']:['admin','production','aux'];
 if(/^\/tasks\/[^/]+\/execution-history\/?$/i.test(path))return ['admin','production','aux','viewer'];
 if(/^\/tasks\/[^/]+\/(?:status|real-time)\/?$/i.test(path))return ['admin','production','aux'];
 if(/^\/tasks\/[^/]+\/reset\/?$/.test(path))return ['admin','production'];
 const catalogs=['/settings','/program-settings','/optimizer-settings','/task-templates','/zones','/spaces','/resource-types','/resource-items','/resource-pools','/staff-people','/staff-defaults','/itinerant-teams'];
 // Match these catalog routes with Express's default casing semantics and segment limits.
 if(catalogs.some(within)||/^\/(?:ta|task-templates|zones|spaces)(?:\/|$)/i.test(path)||/^\/vocal-coach-rules\/?$/i.test(path))return method==='GET'?['admin','production','aux','viewer']:['admin'];
 if(['/plans','/locks','/daily-tasks'].some(within))return method==='GET'?['admin','production','aux','viewer']:['admin','production'];
 return null;
}

export function createApiAuthorization(dependencies:{authenticate:RequestHandler;lookupRole:(id:string)=>Promise<AppRole|null>;authorizeTask?:(taskId:number,userId:string)=>Promise<boolean>}):RequestHandler {
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
    const taskMatch=/^\/tasks\/([^/]+)\/(?:status|real-time)\/?$/i.exec(req.path);
    if(taskMatch && (!Number.isSafeInteger(Number(taskMatch[1])) || Number(taskMatch[1])<=0))return res.status(400).json({message:'Actividad no válida.'});
    if(taskMatch && (!dependencies.authorizeTask || !await dependencies.authorizeTask(Number(taskMatch[1]),id)))return res.status(403).json({type:'permission_denied',message:'No tienes autoridad operativa sobre esta actividad.'});
    return next();
   }catch{return res.status(500).json({message:'Failed to validate permissions'});}
  });
 };
}
