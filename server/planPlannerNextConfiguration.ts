import { z } from 'zod';
import type { EngineInput } from '../engine/types';

const id=z.number().int().positive(), minutes=z.number().int().nonnegative();
const ids=z.array(id), text=z.string().min(1), hhmm=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const window=z.object({start:hhmm,end:hhmm}).strict().refine(w=>w.start<w.end);
const task=z.object({taskId:id,plannerNextKind:z.enum(['technical','main','vocal','auxiliary']),
 operationalRole:z.enum(['productive_task','meal_break_placeholder','transport_arrival','transport_departure']),
 breakKind:z.literal('participant_meal').optional(),mealOccupiesSpace:z.boolean().optional(),
 dependsOnTaskIds:ids,jointGroupId:text.optional(),setupFamilyId:text.optional(),
 itinerantTeamId:id.optional(),itinerantTeamRequirement:z.enum(['none','any','specific']).optional(),allowedItinerantTeamIds:ids.optional()}).strict();

/** Explicit per-day authorities, never a stored EngineInput or a scheduled solution. */
export const planPlannerNextConfigurationSchema=z.object({
 contractVersion:z.literal(1),mealTaskTemplateId:id,legacyGroupingMode:z.literal('DISABLED'),
 plannerNext:z.object({searchPolicy:z.enum(['COMPATIBILITY_PRESERVING','EXACT_CONSTRUCTIVE']),
  searchBudget:z.object({bestK:id,maxBacktracks:minutes,maxPatterns:id,maxBranchExpansions:id.max(100_000)}).strict(),
  timeGridMinutes:id,participantTransitionMinutes:minutes,resourceTransitionMinutes:minutes,
  mainFlow:z.object({spaceId:id,preferredEnd:hhmm,continuity:z.literal('REQUIRED'),maxBlocksByKey:id,minTasksPerBlock:id}).strict()}).strict(),
 taskOperations:z.array(task),
 anchoredAccompaniments:z.array(z.object({id:text,anchorTaskId:id,beforeTaskIds:ids,afterTaskIds:ids,adjacency:z.literal('REQUIRED'),internalTransition:z.literal('INCLUDED'),resourceContinuity:z.literal('REQUIRED')}).strict()),
 setupPolicies:z.array(z.object({spaceId:id,families:z.array(text),oneBlockPerFamily:z.literal(true),orderConstraint:z.enum(['EXPLICIT','UNSPECIFIED']),familyOrder:z.array(text).optional(),reentry:z.literal('FORBIDDEN'),preparationMinutesBetweenFamilies:minutes}).strict()),
 roundSynchronizations:z.array(z.object({id:text,synchronization:z.literal('START_TOGETHER_WHILE_ALL_LANES_ACTIVE'),lanes:z.array(z.object({spaceId:id,taskIds:ids,preparationMinutesBetweenRounds:minutes}).strict())}).strict()),
 technicalChains:z.array(z.object({id:text,orderedTaskIds:ids,phases:z.array(ids).optional(),adjacency:z.literal('REQUIRED'),resourceContinuity:z.literal('REQUIRED'),requiredResourceIds:ids}).strict()),
 coachRouteTransitions:z.array(z.object({coachPlanResourceItemId:id,fromSpaceId:id,toSpaceId:id,minutes}).strict()),
 operationalMealPolicies:z.array(z.object({id:text,window,durationMinutes:id,planResourceItemIds:ids,spaceIds:ids.optional()}).strict()),
 itinerantTeamAvailability:z.array(z.object({itinerantTeamId:id,windows:z.array(window).min(1),planResourceItemIds:ids.optional(),transitionMinutes:minutes.optional()}).strict()),
 resourcePresenceConcentrationPolicies:z.record(z.enum(['PREFERRED','REQUIRED'])),
 arrivalMaximumGroupSize:id,departureMaximumGroupSize:id,
}).strict();
export type PlanPlannerNextConfiguration=z.infer<typeof planPlannerNextConfigurationSchema>;

export function applyPlanPlannerNextConfiguration(input:EngineInput,raw:unknown):EngineInput {
 if(raw==null)return input;
 const config=planPlannerNextConfigurationSchema.parse(raw);
 const taskIds=new Set(input.tasks.map(t=>t.id)),spaces=new Set(input.planSpaceSettings?.map(s=>s.spaceId)),resources=new Set(input.planResourceItems.map(r=>r.id));
 const requireIds=(values:number[],catalog:Set<number>,kind:string)=>{for(const value of values)if(!catalog.has(value))throw Error(`INVALID_PLANNER_NEXT_CONFIGURATION: unknown ${kind} ${value}`);};
 const seen=new Set<number>();
 for(const op of config.taskOperations){if(seen.has(op.taskId))throw Error('INVALID_PLANNER_NEXT_CONFIGURATION: duplicate task operation');seen.add(op.taskId);requireIds([op.taskId,...op.dependsOnTaskIds],taskIds,'task');}
 if(seen.size!==taskIds.size)throw Error('INVALID_PLANNER_NEXT_CONFIGURATION: incomplete task operations');
 requireIds([config.plannerNext.mainFlow.spaceId,...config.setupPolicies.map(p=>p.spaceId),...config.roundSynchronizations.flatMap(p=>p.lanes.map(l=>l.spaceId)),...config.coachRouteTransitions.flatMap(p=>[p.fromSpaceId,p.toSpaceId]),...config.operationalMealPolicies.flatMap(p=>p.spaceIds??[])],spaces,'space');
 requireIds([...config.technicalChains.flatMap(c=>c.requiredResourceIds),...config.coachRouteTransitions.map(c=>c.coachPlanResourceItemId),...config.operationalMealPolicies.flatMap(p=>p.planResourceItemIds),...config.itinerantTeamAvailability.flatMap(p=>p.planResourceItemIds??[]),...Object.keys(config.resourcePresenceConcentrationPolicies).map(Number)],resources,'resource');
 requireIds([...config.anchoredAccompaniments.flatMap(p=>[p.anchorTaskId,...p.beforeTaskIds,...p.afterTaskIds]),...config.technicalChains.flatMap(c=>[...c.orderedTaskIds,...(c.phases??[]).flat()]),...config.roundSynchronizations.flatMap(r=>r.lanes.flatMap(l=>l.taskIds))],taskIds,'task');
 const units=new Set(config.itinerantTeamAvailability.map(u=>u.itinerantTeamId));
 for(const op of config.taskOperations)requireIds([...(op.itinerantTeamId?[op.itinerantTeamId]:[]),...(op.allowedItinerantTeamIds??[])],units,'itinerant unit');
 if(!input.tasks.some(t=>t.templateId===config.mealTaskTemplateId))throw Error('INVALID_PLANNER_NEXT_CONFIGURATION: unknown meal template');
 const operations=new Map(config.taskOperations.map(({taskId,...op})=>[taskId,op]));
 const {contractVersion,taskOperations,legacyGroupingMode,...authorities}=config;
 return {...input,...authorities,transportSettings:input.transportSettings?{...input.transportSettings,arrivalMaximumGroupSize:config.arrivalMaximumGroupSize,departureMaximumGroupSize:config.departureMaximumGroupSize}:undefined,
  // An explicit new day uses its setupPolicies, rather than inferred legacy V3
  // zone defaults. Existing days without this contract retain all legacy fields.
  groupingBySpaceId:{},minimizeChangesBySpace:{},groupingZoneIds:[],maxTemplateChangesByZoneId:{},optimizerGroupBySpaceAndTemplate:false,optimizerGroupingLevel:0,
  optimizerWeights:{...input.optimizerWeights,groupBySpaceTemplateMatch:0,groupBySpaceActive:0},
  tasks:input.tasks.map(t=>({...t,...operations.get(t.id)}))};
}
