import {readFileSync} from 'node:fs';

export function latestAssistedSQLContracts(){
 const files=['078_assisted_planning_workflow.sql','079_assisted_proposal_runs.sql','080_assisted_clean_validation.sql','081_assisted_draft_editing.sql','082_assisted_stage_validation_exceptions.sql','083_assisted_config_refresh.sql','084_day_config_provenance.sql','085_optimizer_day_config_restore.sql','086_assisted_itinerant_resource_persistence.sql','087_participant_transition_margins.sql'];
 const contracts=new Map<string,{definition:string;signature:string;body:string}>();
 for(const file of files)for(const match of readFileSync(`supabase/migrations/${file}`,'utf8').matchAll(/CREATE(?: OR REPLACE)? FUNCTION public\.([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*RETURNS[\s\S]*?\bAS\s*\$\$([\s\S]*?)\$\$;/gi)){
  const name=match[1];if(!name.startsWith('assisted_')&&!['apply_day_config_operation','initialize_day_config_revision'].includes(name))continue;
  const types=match[2].split(',').map(arg=>arg.trim().split(/\s+/)[1].toLowerCase());
  contracts.set(name,{definition:match[0],signature:`public.${name}(${types.join(',')})`,body:match[3].replaceAll('\r\n','\n').trim()});
 }
 return contracts;
}
