import {readFileSync} from 'node:fs';

export function assistedStageProposalGuardBody(){
 const sql=readFileSync('supabase/migrations/089_assisted_native_sql_integrity.sql','utf8');
 return sql.match(/\$\$([\s\S]*?)\$\$/)![1].replaceAll('\r\n','\n').trim();
}

export function latestAssistedSQLContracts(maxMigration=Infinity){
 const files=['078_assisted_planning_workflow.sql','079_assisted_proposal_runs.sql','080_assisted_clean_validation.sql','081_assisted_draft_editing.sql','082_assisted_stage_validation_exceptions.sql','083_assisted_config_refresh.sql','084_day_config_provenance.sql','085_optimizer_day_config_restore.sql','086_assisted_itinerant_resource_persistence.sql','087_participant_transition_margins.sql','089_assisted_native_sql_integrity.sql','090_assisted_manual_snapshot_fidelity.sql','091_assisted_restart_bootstrap.sql','092_main_flow_soft_preference.sql','099_transport_group_config_integrity.sql','102_round_preparation_day_override.sql','103_atomic_task_template_inverse.sql','104_operation_continuity.sql','105_new_day_planner_configuration.sql','106_itinerant_physical_composition.sql'];
 const contracts=new Map<string,{definition:string;signature:string;body:string}>();
 for(const file of files.filter(file=>Number(file.slice(0,3))<=maxMigration)){
  const sql=readFileSync(`supabase/migrations/${file}`,'utf8');
  for(const rename of sql.matchAll(/ALTER FUNCTION public\.([a-z_][a-z0-9_]*)\s*\([^;]*?\)\s+RENAME TO ([a-z_][a-z0-9_]*);/gi)){
   const prior=contracts.get(rename[1]);if(!prior)continue;
   contracts.delete(rename[1]);contracts.set(rename[2],{...prior,definition:prior.definition.replace(`public.${rename[1]}(`,`public.${rename[2]}(`),signature:prior.signature.replace(`public.${rename[1]}(`,`public.${rename[2]}(`)});
  }
  for(const match of sql.matchAll(/CREATE(?: OR REPLACE)? FUNCTION public\.([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*RETURNS[\s\S]*?\bAS\s*\$\$([\s\S]*?)\$\$;/gi)){
  const name=match[1];if(!name.startsWith('assisted_')&&!['apply_day_config_operation','initialize_day_config_revision'].includes(name))continue;
  const types=match[2].split(',').map(arg=>arg.trim().split(/\s+/)[1].toLowerCase());
  contracts.set(name,{definition:match[0],signature:`public.${name}(${types.join(',')})`,body:match[3].replaceAll('\r\n','\n').trim()});
 }
 }
 return contracts;
}
