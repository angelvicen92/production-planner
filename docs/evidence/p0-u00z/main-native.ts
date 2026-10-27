import assert from 'node:assert/strict';
import {buildEngineInput} from '../../../engine/buildInput';
import {nativeDay} from './native';
/** Native Main/Vocal control: two cohorts, a Main pause and independent feeders. */
export async function mainDay(ctx:any){
 const {api,page,appUrl}=ctx;const {storage}=await import('../../../server/storage');
 const zone=await api('/api/zones','POST',{name:'Continuity production'}),spaces:any[]=[];
 for(const name of ['Main floor','Feeder room'])spaces.push(await api('/api/spaces','POST',{name,zoneId:zone.id}));
 const type=await api('/api/resource-types','POST',{code:'vocal_coach',name:'Coaches'}),coaches:any[]=[];
 for(const name of ['Coach silver','Coach copper'])coaches.push(await api('/api/resource-items','POST',{typeId:type.id,name,defaultAvailabilityStart:'08:00',defaultAvailabilityEnd:'16:00'}));
 const feeder=await api('/api/task-templates','POST',{name:'Continuity feeder',defaultDuration:10,spaceId:spaces[1].id,zoneId:zone.id,requiresCoach:true,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,rulesJson:{plannerNextOperation:{contractVersion:1,kind:'vocal'}}});
 const main=await api('/api/task-templates','POST',{name:'Continuity main',defaultDuration:15,spaceId:spaces[0].id,zoneId:zone.id,requiresCoach:true,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,dependsOnTemplateIds:[feeder.id],rulesJson:{plannerNextOperation:{contractVersion:1,kind:'main'}}});
 const profile=await api('/api/new-day-planner-configuration');await api('/api/new-day-planner-configuration','PUT',{expectedRevision:profile.revision,configuration:{contractVersion:1,scenario:'MAIN_WITH_VOCAL_FEEDER',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0,mainFlow:{spaceId:spaces[0].id,preferredEnd:'11:00',continuity:'REQUIRED',maxBlocksByKey:1,minTasksPerBlock:1}}});
 await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Fecha',{exact:true}).fill('2027-11-12');const creating=page.waitForResponse((r:any)=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Crear día',exact:true}).click();const response=await creating;assert.equal(response.status(),201);const planId=Number((await response.json()).id);
 const resources=await api(`/api/plans/${planId}/resource-items`);
 for(const [i,w] of [['09:20','09:50'],['10:20','11:30']].entries()){
  const coach=resources.find((r:any)=>r.resourceItemId===coaches[i].id);const p=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:'Cohort '+i,availabilityStart:w[0],availabilityEnd:w[1],vocalCoachPlanResourceItemId:coach.id});
  for(const t of [feeder,main])await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id});
 }
 const ordinary=await buildEngineInput(planId,storage),state=await api(`/api/plans/${planId}/assisted/session`,'POST',{});
 await nativeDay({...ctx,label:'C',planId,ordinary,state,policies:[{id:'main-availability',window:{start:'09:40',end:'10:35'},durationMinutes:45,planResourceItemIds:[],spaceIds:[spaces[0].id]},{id:'explicit-unused-members',window:{start:'12:05',end:'12:45'},durationMinutes:20,planResourceItemIds:[ordinary.planResourceItems.find(r=>r.name==='Sound amber')!.id],spaceIds:[]}]});
}
