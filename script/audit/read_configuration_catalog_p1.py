"""GET-only, explicit column allowlist. No operational rows or personal data dumps."""
import os,json,urllib.request,urllib.error,datetime,pathlib,argparse
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',default='work/configuration-audit/catalog-allowlisted.json');args=parser.parse_args()
root=pathlib.Path('work/configuration-audit');root.mkdir(parents=True,exist_ok=True)
base=os.environ['SUPABASE_URL'].rstrip('/')+'/rest/v1/'
headers={'apikey':os.environ['SUPABASE_SERVICE_ROLE_KEY'],'Authorization':'Bearer '+os.environ['SUPABASE_SERVICE_ROLE_KEY']}
columns={
 'task_templates':'id,name,default_duration,zone_id,space_id,has_dependency,depends_on_template_id,depends_on_template_ids,itinerant_team_requirement,itinerant_team_id,rules_json,resource_requirements,setup_id,auto_create_on_contestant_create,participant_margin_before_minutes,participant_margin_after_minutes',
 'zones':'id,name,default_availability_start,default_availability_end',
 'spaces':'id,name,zone_id,parent_space_id,default_availability_start,default_availability_end',
 'resource_types':'id,name,code',
 'staff_assignment_defaults':'id,scope_type,zone_id,space_id,itinerant_team_id',
 'plan_staff_assignments':'id,plan_id,scope_type,zone_id,space_id,itinerant_team_id',
 'plan_zone_resource_type_requirements':'id,plan_id,zone_id,resource_type_id,quantity',
 'plan_space_resource_type_requirements':'id,plan_id,space_id,resource_type_id,quantity',
 'plan_config_revisions':'id,plan_id,parent_revision_id',
 'assisted_planning_sessions':'id,plan_id,current_config_revision_id',
 'assisted_planning_stages':'id,plan_id,session_id,config_revision_id',
 'resource_items':'id,name,type_id,is_active,default_availability_start,default_availability_end',
 'itinerant_teams':'id,name,code,is_active',
 'resource_bundles':'id,name,is_active',
 'daily_tasks':'id,plan_id,template_id,zone_id,space_id,assigned_resource_ids',
 'plans':'id,date,status,planner_next_configuration',
 'plan_task_template_snapshots':'id,plan_id,source_template_id,source,default_zone_id,default_space_id,dependency_template_ids,itinerant_team_id,allowed_itinerant_team_ids,resource_requirements,setup_id',
 'plan_resource_items':'id,plan_id,resource_item_id',
 'resource_item_components':'id,parent_resource_item_id,component_resource_item_id,quantity',
 'resource_bundle_components':'id,bundle_id,resource_id,resource_item_id',
 'zone_resource_defaults':'id,zone_id,resource_item_id',
 'space_resource_defaults':'id,space_id,resource_item_id',
 'plan_zone_resource_assignments':'id,plan_id,zone_id,plan_resource_item_id',
 'plan_space_resource_assignments':'id,plan_id,space_id,plan_resource_item_id',
 'plan_zone_settings':'id,plan_id,zone_id',
 'plan_space_settings':'id,plan_id,space_id,zone_id',
 'vocal_coach_rules':'id,vocal_coach_resource_item_id,task_template_id,default_space_id',
 'plan_vocal_coach_rules':'id,plan_id,vocal_coach_plan_resource_item_id,task_template_id,default_space_id',
 'plan_optimizer_snapshots':'id,plan_id,main_zone_id,arrival_plan_template_snapshot_id,departure_plan_template_snapshot_id',
 'plan_optimizer_snapshot_grouping_zones':'id,snapshot_id,zone_id',
}
rows={};fail=[]
for t,cols in columns.items():
 rows[t]=[]
 try:
  for offset in range(0,100000,500):
   req=urllib.request.Request(base+t+'?select='+cols+'&offset='+str(offset)+'&limit=500&order=id',headers=headers,method='GET')
   with urllib.request.urlopen(req,timeout=30) as r:page=json.load(r)
   rows[t].extend(page)
   if len(page)<500:break
  else:raise RuntimeError('Read limit reached: observation is incomplete; do not certify catalog')
 except urllib.error.HTTPError as e:fail.append({'table':t,'http':e.code})
result={'mode':'REMOTE_REST_GET_ONLY_EXPLICIT_COLUMNS','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'writes':0,'complete':not fail,'counts':{t:len(v) for t,v in rows.items()},'columns':columns,'failures':fail,'rows':rows,'rlsCertification':'PENDING_PG_CATALOG_SELECT; service role bypass does not certify RLS','unreadReferences':['plan_config_revisions JSON','assisted Stage/session/proposal/replay JSON','plan_resource_bundle_snapshots JSON','staff identities excluded; scope IDs only']}
pathlib.Path(args.output).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['rows','columns']},indent=2))
