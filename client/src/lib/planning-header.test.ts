import test from "node:test";
import assert from "node:assert/strict";
import { projectPlanningHeader, type HeaderData } from "./planning-header";

const data: HeaderData = {
  spaces: [{id: 1, name: "Corner", zoneId: 14}, {id: 2, name: "Pasillo", zoneId: 14}, {id: 3, name: "Giratuto", zoneId: 14}, {id: 4, name: "Croma", zoneId: 15}, {id: 5, name: "Estrellas/Sillón", zoneId: 15}, {id: 6, name: "Totales 1", zoneId: 16}, {id: 7, name: "Totales Coreo", zoneId: 16}],
  spaceAssignments: {1:[101],2:[101],4:[102],5:[102],6:[105],7:[106]}, zoneAssignments:{},
  resourceNames: {101:"CAM1",102:"CAM2",105:"CAM5",106:"CAM6",107:"Técnico real"},
  tasks: [{id: 1,spaceId: 1,zoneId: 14,assignedResources:[107,101,107],itinerantTeamId: 20}, {id: 2,spaceId: 2,zoneId: 14,assigned_resource_ids:[107]}], staff:[], staffModes:[], teams:[{id:20,name:"Equipo móvil"}], teamMemberships:[{itinerantTeamId:20,planResourceItemIds:[107]}],
};
test("A2 cameras follow explicit space scope and never spread to adjacent locations", () => {
  for(const [id,name] of [[1,"CAM1"],[2,"CAM1"],[4,"CAM2"],[5,"CAM2"],[6,"CAM5"],[7,"CAM6"]] as const) assert.ok(projectPlanningHeader({scopeType:"space",scopeId:id},data).resources.some(r=>r.name===name));
  assert.deepEqual(projectPlanningHeader({scopeType:"space",scopeId:3},data).resources,[]);
  assert.deepEqual(projectPlanningHeader({scopeType:"space",scopeId:4},data).production,[]);
});
test("one resource identity preserves multiple scopes and task-only resources do not become permanent",()=>{
  const header=projectPlanningHeader({scopeType:"space",scopeId:1},{...data,zoneAssignments:{14:[101]}});
  assert.deepEqual(header.resources.find(r=>r.id===101)?.scopes,["Zona","Espacio","Por tarea"]);
  assert.deepEqual(header.resources.find(r=>r.id===107)?.scopes,["Por tarea"]);
  assert.deepEqual(header.resources.find(r=>r.id===107)?.taskIds,[1]);
  const zone=projectPlanningHeader({scopeType:"zone",scopeId:14},data);
  assert.deepEqual(zone.resources.find(r=>r.id===101)?.scopes,["Espacio: Corner","Espacio: Pasillo","Por tarea"]);
  assert.equal(zone.resources.filter(r=>r.id===107).length,1);
  assert.deepEqual(zone.resources.find(r=>r.id===107)?.taskIds,[1,2]);
});
test("staff mode has no fallback and deduplicates by real identity, preserving homonyms",()=>{
  const staff = [{staffRole:"production" as const,staffPersonId:1,staffPersonName:"Ana",scopeType:"zone",zoneId:14,spaceId:null,itinerantTeamId:null}, {staffRole:"production" as const,staffPersonId:2,staffPersonName:"Ana",scopeType:"space",zoneId:null,spaceId:1,itinerantTeamId:null}];
  assert.deepEqual(projectPlanningHeader({scopeType:"space",scopeId:1},{...data,staff}).production,["Ana"]);
  assert.deepEqual(projectPlanningHeader({scopeType:"space",scopeId:2},{...data,staff,staffModes:[{zoneId:14,mode:"space"}]}).production,[]);
  assert.deepEqual(projectPlanningHeader({scopeType:"zone",scopeId:14},{...data,staff:[staff[0],staff[0],{...staff[0],staffPersonId:3}]}).production,["Ana","Ana"]);
  const aggregate=projectPlanningHeader({scopeType:"zone",scopeId:14},{...data,staff:[staff[0],staff[1],{...staff[1],spaceId:2}],staffModes:[{zoneId:14,mode:"space"}]});
  assert.deepEqual(aggregate.production,["Ana (Corner · Pasillo)"]);assert.equal(aggregate.staffScope,"espacios");
  assert.deepEqual(projectPlanningHeader({scopeType:"zone",scopeId:14},{...data,staff:[{...staff[0],staffPersonId:undefined},{...staff[0],staffPersonId:undefined}]}).production,["Ana","Ana"]);
});
test("team membership is explicit, task location is scoped and conflicting hierarchy does not inherit zone",()=>{
  const team=projectPlanningHeader({scopeType:"itinerant_team",scopeId:20},data);
  assert.deepEqual(team.resources.find(r=>r.id===107)?.scopes,["Miembro del equipo","Por tarea"]);
  assert.deepEqual(team.resources.find(r=>r.id===101)?.scopes,["Por tarea"]);
  assert.equal(projectPlanningHeader({scopeType:"space",scopeId:1},data).teams.length,1);
  assert.equal(projectPlanningHeader({scopeType:"space",scopeId:2},data).teams.length,0);
  const copy=structuredClone(data);copy.tasks=[{id:3,spaceId:1,zoneId:99}];copy.zoneAssignments={99:[102]};
  assert.ok(!projectPlanningHeader({scopeType:"space",scopeId:1},copy).resources.some(r=>r.id===102));
});
test("projection is pure, defensively filters invalid IDs and preserves unknown references",()=>{
  const before=structuredClone(data);
  projectPlanningHeader({scopeType:"space",scopeId:1},data);assert.deepEqual(data,before);
  const result=projectPlanningHeader({scopeType:"space",scopeId:1},{...data,spaceAssignments:{1:[999,-1,NaN,1.2,null as any]}});
  assert.equal(result.resources.find(r=>r.id===999)?.name,"Recurso con nombre no disponible");
  assert.ok(result.resources.every(r=>r.id>0&&Number.isInteger(r.id)));
});

test("itinerant agenda resources never become physical header task assignments; fixed location resources remain",()=>{
  const data:any={tasks:[{id:1,spaceId:3,zoneId:1,itinerantTeamId:20,agendaScope:"ITINERANT_UNIT",resourceInheritance:"OPERATION_ONLY",assignedResources:[9,10]},
    {id:2,spaceId:3,zoneId:1,agendaScope:"PHYSICAL_SPACE",assignedResources:[7]}],
    spaces:[{id:3,name:"Set",zoneId:1}],zoneAssignments:{},spaceAssignments:{3:[7]},resourceNames:{7:"Fixed",9:"Mobile",10:"Sound"},staff:[],staffModes:[],teams:[{id:20,name:"Unit"}],teamMemberships:[{itinerantTeamId:20,planResourceItemIds:[9,10]}]};
  assert.deepEqual(projectPlanningHeader({scopeType:"space",scopeId:3},data).resources.map(r=>r.id),[7]);
  assert.deepEqual(projectPlanningHeader({scopeType:"zone",scopeId:1},data).resources.map(r=>r.id),[7]);
  assert.deepEqual(projectPlanningHeader({scopeType:"itinerant_team",scopeId:20},data).resources.map(r=>r.id),[9,10]);
});
