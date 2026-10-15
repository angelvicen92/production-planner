import assert from 'node:assert/strict';
import test from 'node:test';
import {api} from '../shared/routes';

test('the complete creation form is accepted by the strict template contract',()=>{
 const form={name:'Template',abbrev:'TMP',defaultDuration:30,defaultCameras:0,zoneId:null,spaceId:null,uiColor:'#94a3b8',uiColorSecondary:null,hasDependency:false,dependsOnTemplateIds:[],itinerantTeamRequirement:'none',itinerantTeamId:null,autoCreateOnContestantCreate:false,participantMarginBeforeMinutes:null,participantMarginAfterMinutes:0};
 assert.deepEqual(api.taskTemplates.create.input.parse(form),form);
});

test('template margins distinguish absence, inheritance, explicit zero and positive values',()=>{
 for(const input of [api.taskTemplates.create.input,api.taskTemplates.update.input]){
  const base=input===api.taskTemplates.create.input?{name:'Template',defaultDuration:10}:{};
  const absent=input.parse(base);assert.equal(Object.hasOwn(absent,'participantMarginBeforeMinutes'),false);
  for(const before of [null,0,5])for(const after of [null,0,15]){
   const parsed=input.parse({...base,participantMarginBeforeMinutes:before,participantMarginAfterMinutes:after});
   assert.equal(parsed.participantMarginBeforeMinutes,before);assert.equal(parsed.participantMarginAfterMinutes,after);
  }
 }
});

test('both write contracts reject invalid margins and unknown fields',()=>{
 for(const input of [api.taskTemplates.create.input,api.taskTemplates.update.input]){
  const base=input===api.taskTemplates.create.input?{name:'Template',defaultDuration:10}:{};
  for(const key of ['participantMarginBeforeMinutes','participantMarginAfterMinutes'])for(const value of [-1,0.5,NaN,Infinity,'0','',true,{},2147483648])assert.equal(input.safeParse({...base,[key]:value}).success,false);
  assert.equal(input.safeParse({...base,locationLabel:'Legacy label'}).success,false);
  assert.equal(input.safeParse({...base,location_label:null}).success,false);
 }
});
