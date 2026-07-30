import type { PlannerNextProblem, ScheduledTask } from "../../contracts";
import { projectFocalA2BandProblem } from "./focalA2BandReference";

export const realitySourceDocuments = [
  { name: "ENSAYO_A2_LV.pdf", sha256: "0207f3bb59621c263219676153aae50c0cf1a98c1089b8bd732ac63e54f8df18" },
  { name: "ENSAYO_A2_LV 15 JUNIO 2025 - DESGLOSE A2.pdf", sha256: "8f96af987db37a0c8b5c1fd8870aad36d46b721ed81a0535bc22b8fb10f312b3" },
] as const;
export const REALITY_UNIT_IDS = ["reality-unit-morning-a", "reality-unit-morning-b", "reality-unit-afternoon-combined"] as const;
const A = ["reality-unit-morning-a","reality-camera-3","reality-sound-1","reality-editorial-a","reality-production-a"];
const B = ["reality-unit-morning-b","reality-camera-4","reality-sound-2","reality-editorial-b","reality-production-b"];
const C = ["reality-unit-afternoon-combined","reality-camera-3","reality-camera-4","reality-sound-1","reality-editorial-a","reality-production-a"];
type Unit = "MORNING_A"|"MORNING_B"|"AFTERNOON_COMBINED";
const row=(id:string,participantId:string,humanName:string,unit:Unit,duration:number,start:number,end:number,spaceId:string,location:string,annotations:string[]=[],sourceLabel?:string)=>({id,participantId,humanName,unit,duration,humanReference:{start,end},spaceId,location,annotations,sourceLabel,requiredResourceIds:unit==="MORNING_A"?A:unit==="MORNING_B"?B:C});
export const focalA2RealityTasks = [
 row("reality-task-01","cristina-zuloaga","Cristina Zuloaga","MORNING_A",45,660,705,"reality-location-stage","PLATÓ",["CON MADRE"]),
 row("reality-task-02","luis-belda","Luis Belda","MORNING_A",30,720,750,"reality-location-influencer-corner","CORNER INFLUENCER",["TROMBÓN"]),
 row("reality-task-03","jose-javier-cuenca","José Javier Cuenca","MORNING_A",45,765,810,"reality-location-stage","PLATÓ"),
 row("reality-task-04","pere-portero","Pere Portero","MORNING_A",30,810,840,"reality-location-music-corner","CORNER MUSIC",["INSTRUMENTOS: GUITARRA, BAJO, PIANO, CAJÓN"]),
 row("reality-task-05","gisela-montserrat","Gisela Montserrat","MORNING_B",30,675,705,"reality-location-manzano","MANZANO"),
 row("reality-task-06","julio-gomez","Julio Gómez","MORNING_B",45,720,765,"reality-location-stage","PLATÓ",["GUITARRA","CON PADRE"]),
 row("reality-task-07","nela-garcia","Nela García","MORNING_B",30,780,810,"reality-location-hall-p14","HALL P.14",["MAQUILLAJE, ANILLOS, RESPIRADOR, BRILLANTES Y PEINE","ESPEJO GRANDE CON LUCES"]),
 row("reality-task-08","lina-isabel-garcia-salcedo","Lina Isabel García-Salcedo","AFTERNOON_COMBINED",30,960,990,"reality-location-hall-p14","HALL P.14",["TABLET PARA VIDEOLLAMADA"]),
 row("reality-task-09","marta-fonrali","Marta Fonrali","AFTERNOON_COMBINED",30,990,1020,"reality-location-control","CONTROL"),
 row("reality-task-10","linet-varela","Linet Varela","AFTERNOON_COMBINED",30,1020,1050,"reality-location-buggy","BUGGY",["COLLAR AMULETO","TABLET CON MENSAJE"]),
 row("reality-task-11","carmen-maria-saborido","Carmen María Saborido","AFTERNOON_COMBINED",15,1050,1065,"reality-location-red-carpet","ALFOMBRA ROJA",[],"A. ROJA EVA"),
 row("reality-task-12","eva-martin-fernandez","Eva Martín Fernández","AFTERNOON_COMBINED",15,1065,1080,"reality-location-red-carpet","ALFOMBRA ROJA",[],"A. ROJA EVA"),
] as const;
export const assumptionRegister = [
 "REALITY_REFERENCE_TIMES_ARE_EXTERNAL_QUALITY_REFERENCE","REALITY_FIXED_MEALS_PROJECTED_AS_RESOURCE_AVAILABILITY_GAPS","REALITY_AFTERNOON_INTERNAL_PHASES_INCLUDED_IN_TASK_DURATION","NO_ADDITIONAL_UNIFORM_REALITY_TRANSITION_ASSUMED","REALITY_TASK_ORDER_IS_REFERENCE_NOT_HARD_INPUT","REALITY_LOCATIONS_ARE_OPERATIONAL_SPACES","DOWNSTREAM_TOTALS_HANDOFF_DEFERRED",
] as const;
export const deferredObservedOperations = ["posicionamiento posterior del equipo en Totales Post","Totales Post con Lina y Gisela","grabación sin audio de Adrián","Beauties de Alfombra vacía"].map(operation=>({operation,reason:"OUT_OF_SCOPE_DOWNSTREAM_TOTALS_AND_TECHNICAL_HANDOFF" as const}));
export const realityReferenceValidation = {realityTaskCount:12,morningUnitATaskCount:4,morningUnitBTaskCount:3,afternoonCombinedUnitTaskCount:5,uniqueLocationCount:8,totalProductiveMinutes:375,duration15TaskCount:2,duration30TaskCount:7,duration45TaskCount:3,unitMetrics:{MORNING_A:{start:660,end:840,productiveMinutes:150,spanMinutes:180,internalGapMinutes:30,operationalBlockCount:3},MORNING_B:{start:675,end:810,productiveMinutes:105,spanMinutes:135,internalGapMinutes:30,operationalBlockCount:3},AFTERNOON_COMBINED:{start:960,end:1080,productiveMinutes:120,spanMinutes:120,internalGapMinutes:0,operationalBlockCount:1}}};
const spaces=["stage","influencer-corner","music-corner","manzano","hall-p14","control","buggy","red-carpet"].map(x=>({id:`reality-location-${x}`,availability:[{start:540,end:1080}]}));
const resource=(id:string,availability:{start:number,end:number}[],high=false)=>({id,availability,presencePreference:high?"HIGH" as const:"OFF" as const,transitionMinutes:0});
export function projectFocalA2RealityProblem():PlannerNextProblem {
 const p=projectFocalA2BandProblem("CURRENT_PREFERRED");
 const resources=[resource(REALITY_UNIT_IDS[0],[{start:660,end:840}],true),resource(REALITY_UNIT_IDS[1],[{start:675,end:810}],true),resource(REALITY_UNIT_IDS[2],[{start:960,end:1080}],true),...A.slice(1).map(id=>resource(id,[{start:660,end:840},{start:915,end:1080}])),resource("reality-camera-4",[{start:675,end:810},{start:885,end:1080}]),...B.slice(2).map(id=>resource(id,[{start:675,end:810}]))];
 const minimum:Record<string,number>={"linet-varela":1050,"carmen-maria-saborido":1065,"eva-martin-fernandez":1080};
 return {...p,day:{...p.day,end:1080},auxiliaryPolicy:{participantPresencePreference:"HIGH"},spaces:[...p.spaces.map(x=>({...x,availability:x.availability.map(w=>({...w}))})),...spaces],resources:[...p.resources.map(x=>({...x,availability:x.availability.map(w=>({...w}))})),...resources],participants:p.participants.map(x=>({...x,availability:x.availability.map(w=>({...w,end:Math.max(w.end,minimum[x.id]??w.end)}))})),tasks:[...p.tasks.map(x=>({...x,dependencies:[...x.dependencies],requiredResourceIds:x.requiredResourceIds?[...x.requiredResourceIds]:undefined})),...focalA2RealityTasks.map(x=>({id:x.id,kind:"auxiliary" as const,participantId:x.participantId,duration:x.duration,spaceId:x.spaceId,dependencies:[],requiredResourceIds:[...x.requiredResourceIds]}))]};
}
export type RealityScheduledTask = ScheduledTask;
