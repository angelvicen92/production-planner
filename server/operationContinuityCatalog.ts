import type { Express } from "express";
import { z } from "zod";
import { continuityGroupWriteSchema } from "../shared/operationContinuity";
import { catalogContinuityGroup } from "./operationContinuity";

export function registerOperationContinuityCatalog(app: Express, database: any) {
  app.get("/api/operation-continuity-groups", async (req, res) => {
    if (!(req as any).user?.id) return void res.status(401).json({message:"Unauthorized"});
    if (!["admin","production","aux","viewer"].includes((req as any).userRole)) return void res.status(403).json({message:"Forbidden"});
    try {
      const {data,error}=await database.from("operation_continuity_groups").select("*").order("name").order("id");
      if(error) throw error;
      res.json((data??[]).map((row:any)=>catalogContinuityGroup(row)));
    } catch {res.status(500).json({message:"No se pudieron cargar los grupos de continuidad."});}
  });
  app.put("/api/operation-continuity-groups/:id", async (req,res)=>{
    if (!(req as any).user?.id) return void res.status(401).json({message:"Unauthorized"});
    if ((req as any).userRole!=="admin") return void res.status(403).json({message:"Solo ADMIN puede editar el catálogo."});
    try {
      const id=z.string().uuid().parse(req.params.id), value=continuityGroupWriteSchema.parse(req.body);
      const {data,error}=await database.rpc("save_operation_continuity_group",{p_id:id,p_actor:(req as any).user.id,p_value:value});
      if(error) throw error;
      res.json(catalogContinuityGroup(data));
    } catch(error:any) {
      const status=error instanceof z.ZodError?400:/CONFLICT/.test(error.message)?409:/FORBIDDEN/.test(error.message)?403:500;
      res.status(status).json({message:status===409?"El grupo ha cambiado. Recarga antes de guardar.":"No se pudo guardar el grupo de continuidad."});
    }
  });
}
