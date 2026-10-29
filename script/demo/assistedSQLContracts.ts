import {readFileSync} from 'node:fs';

/** Resolve literal ALTER-body operations for the exact catalog-body gate.
 * This interpreter accepts no SQL execution or arbitrary JavaScript. */
function resolveLiteralReplacements(contracts:Map<string,{definition:string;signature:string;body:string}>,sql:string){
 const split=(source:string,delimiter:string)=>{
  const parts:string[]=[];let start=0,quoted=false,depth=0;
  for(let i=0;i<source.length;i++){
   if(source[i]==="'"){if(quoted&&source[i+1]==="'"){i++;continue;}quoted=!quoted;continue;}
   if(quoted)continue;
   if(source[i]==='(')depth++;if(source[i]===')')depth--;
   if(depth===0&&source.startsWith(delimiter,i)){parts.push(source.slice(start,i).trim());i+=delimiter.length-1;start=i+1;}
  }
  parts.push(source.slice(start).trim());return parts;
 };
 const variables:Record<string,string>={};let targets:string[]=[];let mirrorReaders=false;let readerPatches:Array<[string,string]>=[];
 const literal=(source:string):string=>split(source,'||').map(part=>{
  if(/^'(?:''|[^'])*'$/.test(part))return part.slice(1,-1).replaceAll("''", "'");
  if(Object.hasOwn(variables,part))return variables[part];
  throw Error('Unrecognized migration literal: '+part);
 }).join('');
 const patch=(expression:string)=>{
  const args=split(expression,',');if(args.length!==3||args[0]!=='definition')throw Error('Invalid literal replacement');
  const from=literal(args[1]),to=literal(args[2]);if(!variables.definition.includes(from))throw Error('121 predecessor drift: '+from);
  variables.definition=variables.definition.replaceAll(from,()=>to);
  if(mirrorReaders)readerPatches.push([from,to]);
 };
 const commit=()=>{for(const name of targets){const prior=contracts.get(name)!;contracts.set(name,{...prior,body:variables.definition,definition:prior.definition.replace(prior.body,()=>variables.definition)});}};
 for(const block of sql.matchAll(/DO \$migration\$([\s\S]*?)END \$migration\$;/g)){
  // Private nominal guards are validated by their own SQL/security gates.
  // This catalogue describes public functions only.
  if(block[1].includes("pg_get_functiondef('nominal_resource_private."))continue;
  for(const raw of split(block[1],';')){
   const statement=raw.trim();
   const selection=statement.match(/definition:=pg_get_functiondef\('public\.([a-z0-9_]+)\(/);
   if(selection){mirrorReaders=false;readerPatches=[];targets=[selection[1]];variables.definition=contracts.get(targets[0])!.body;continue;}
   if(statement.includes('definition:=pg_get_functiondef(old_text::regprocedure)')){
    mirrorReaders=true;readerPatches=[];targets=['assisted_expected_obligation_sources'];variables.definition=contracts.get(targets[0])!.body;continue;
   }
   const assignment=statement.match(/(?:^|\n)\s*(old_text|new_text|needle):=([\s\S]*)$/);
   if(assignment){variables[assignment[1]]=literal(assignment[2]);continue;}
   const replacement=statement.match(/(?:^|\n)\s*definition:=replace\(([\s\S]*)\)$/);
   if(replacement){patch(replacement[1]);continue;}
   const execute=statement.match(/(?:^|\n)\s*EXECUTE replace\(([\s\S]*)\)$/);
   if(execute){patch(execute[1]);commit();continue;}
   if(/(?:^|\n)\s*EXECUTE definition$/.test(statement)){
    commit();
    if(mirrorReaders){
     // The loop in 121/127 applies the same literal changes to both readers.
     const name='assisted_preview_s0_additions',prior=contracts.get(name)!;let body=prior.body;
     for(const [from,to] of readerPatches){if(!body.includes(from))throw Error('Transition reader predecessor drift: '+from);body=body.replaceAll(from,()=>to);}
     contracts.set(name,{...prior,body,definition:prior.definition.replace(prior.body,()=>body)});
     mirrorReaders=false;readerPatches=[];
    }
   }
  }
 }
}

export function assistedStageProposalGuardBody(){
 const sql=readFileSync('supabase/migrations/089_assisted_native_sql_integrity.sql','utf8');
 return sql.match(/\$\$([\s\S]*?)\$\$/)![1].replaceAll('\r\n','\n').trim();
}

export function latestAssistedSQLContracts(maxMigration=Infinity){
 const files=['078_assisted_planning_workflow.sql','079_assisted_proposal_runs.sql','080_assisted_clean_validation.sql','081_assisted_draft_editing.sql','082_assisted_stage_validation_exceptions.sql','083_assisted_config_refresh.sql','084_day_config_provenance.sql','085_optimizer_day_config_restore.sql','086_assisted_itinerant_resource_persistence.sql','087_participant_transition_margins.sql','089_assisted_native_sql_integrity.sql','090_assisted_manual_snapshot_fidelity.sql','091_assisted_restart_bootstrap.sql','092_main_flow_soft_preference.sql','099_transport_group_config_integrity.sql','102_round_preparation_day_override.sql','103_atomic_task_template_inverse.sql','104_operation_continuity.sql','105_new_day_planner_configuration.sql','106_itinerant_physical_composition.sql','108_assisted_participant_meal_validation.sql','113_assisted_post_stage_additions.sql','114_daily_round_synchronization.sql','115_daily_required_technical_chains.sql','116_daily_anchored_accompaniments.sql','117_daily_task_operation_scopes.sql'];
 files.push('118_anchored_operation_unit_choices.sql');
 files.push('119_composed_reality_authorities.sql');
 files.push('120_native_joint_groups.sql');
 files.push('121_daily_operational_meals.sql');
 files.push('122_daily_required_phase_composition.sql');
 files.push('123_daily_required_phases_no_common_resource.sql');
 files.push('124_fixed_itinerant_required_phase_composition.sql');
 files.push('125_main_vocal_required_phase_composition.sql');
 files.push('126_composed_anchored_required_authorities.sql');
 files.push('127_resource_route_transitions.sql');
 files.push('128_flexible_participant_meals_required_phases.sql');
 files.push('129_resource_availability_native_ui.sql');
 const contracts=new Map<string,{definition:string;signature:string;body:string}>();
 for(const file of files.filter(file=>Number(file.slice(0,3))<=maxMigration)){
  const sql=readFileSync(`supabase/migrations/${file}`,'utf8');
  for(const rename of sql.matchAll(/ALTER FUNCTION public\.([a-z_][a-z0-9_]*)\s*\([^;]*?\)\s+RENAME TO ([a-z_][a-z0-9_]*);/gi)){
   const prior=contracts.get(rename[1]);if(!prior)continue;
   contracts.delete(rename[1]);contracts.set(rename[2],{...prior,definition:prior.definition.replace(`public.${rename[1]}(`,`public.${rename[2]}(`),signature:prior.signature.replace(`public.${rename[1]}(`,`public.${rename[2]}(`)});
  }
  for(const match of sql.matchAll(/CREATE(?: OR REPLACE)? FUNCTION public\.([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*RETURNS[\s\S]*?\bAS\s*\$\$([\s\S]*?)\$\$;/gi)){
  const name=match[1];if(!['assert_daily_resource_routes','resource_transition_minutes','resource_transition_pair_minutes','guard_daily_resource_routes','assert_daily_technical_chains','assert_daily_technical_chain_snapshot','assert_daily_operational_meals','assert_operational_meal_snapshot','guard_daily_operational_meals'].includes(name)&&!name.startsWith('assisted_')&&!name.startsWith('assert_anchored')&&!name.startsWith('assert_daily_anchored')&&!name.startsWith('guard_anchored')&&!name.startsWith('joint_')&&!name.startsWith('guard_joint')&&!name.startsWith('assert_joint')&&!['guard_daily_joint_groups','assert_daily_joint_groups'].includes(name)&&!['assert_reality_authorities_disjoint','assert_daily_task_operation_scopes','assert_task_scope_snapshot','anchored_contracts','anchored_task_operations','guard_daily_anchored_accompaniments','guard_daily_anchored_stage','apply_day_config_operation','apply_day_config_operation_v4','apply_day_config_operation_v5','initialize_day_config_revision','guard_daily_round_synchronization','round_structure_canonical_json','assert_daily_round_structure','assert_daily_round_snapshot'].includes(name))continue;
  const types=match[2].split(',').filter(arg=>arg.trim()).map(arg=>arg.trim().split(/\s+/)[1].toLowerCase());
  contracts.set(name,{definition:match[0],signature:`public.${name}(${types.join(',')})`,body:match[3].replaceAll('\r\n','\n').trim()});
 }
  if(file.startsWith('129_')){
   // Read this migration's literal branch; PostgreSQL remains the independent
   // authority for the full exact-body comparison. No SQL is evaluated here.
   const branch=sql.match(/branch:=\$branch\$([\s\S]*?)\$branch\$/)![1];
   const patch=(name:string,from:string,to:string)=>{const prior=contracts.get(name)!;if(!prior.body.includes(from))throw Error('129 predecessor drift: '+name);const body=prior.body.replaceAll(from,()=>to);contracts.set(name,{...prior,body,definition:prior.definition.replace(prior.body,()=>body)});};
   patch('apply_day_config_operation_v5','structure_selected:=',branch+'\n structure_selected:=');
   for(const m of sql.matchAll(/branch:=replace\(branch,'((?:''|[^'])*)','((?:''|[^'])*)'\);/g))
    for(const name of ['assisted_expected_obligation_sources','assisted_preview_s0_additions'])patch(name,m[1].replaceAll("''","'"),m[2].replaceAll("''","'"));
  }
  if(file.startsWith('121_')||file.startsWith('122_')||file.startsWith('123_')||file.startsWith('124_')||file.startsWith('125_')||file.startsWith('126_')||file.startsWith('127_')||file.startsWith('128_'))resolveLiteralReplacements(contracts,sql);
  if(file.startsWith('116_')||file.startsWith('117_')||file.startsWith('120_')){
   // Resolve only this migration's literal string replacements. The resulting
   // bodies remain compared byte-for-byte with PostgreSQL by catalog preflight.
   const decode=(v:string)=>v.replaceAll("''", "'");
   const literalExpression=(expression:string)=>{
    const tokens=/'(?:''|[^'])*'|chr\(10\)/g;
    if(expression.replace(tokens,'').replace(/\|\||\s/g,''))throw Error('Unknown 116 SQL expression');
    return [...expression.matchAll(tokens)].map(m=>m[0]==='chr(10)'?'\n':decode(m[0].slice(1,-1))).join('');
   };
   const patch=(name:string,from:string,to:string)=>{
    const prior=contracts.get(name)!;if(!prior.body.includes(from))throw Error('116 predecessor drift '+name);
    const body=prior.body.replaceAll(from,()=>to);contracts.set(name,{...prior,body,definition:prior.definition.replace(prior.body,()=>body)});
   };
   for(const m of sql.matchAll(/old_text:='((?:''|[^'])*)';\s*new_text:='((?:''|[^'])*)';/g))
    for(const name of ['assisted_expected_obligation_sources','assisted_preview_s0_additions'])patch(name,decode(m[1]),decode(m[2]));
   const source=sql.match(/old_text:='((?:''|[^'])*)';\s*IF strpos\(definition,old_text\)=0 THEN RAISE EXCEPTION '(?:ANCHORED|TASK_SCOPE|JOINT_GROUP)_UNEXPECTED_SOURCE_READER';[\s\S]*?old_text\|\|'((?:''|[^'])*)'\);/)!
   patch('assisted_read_bootstrap_sources',decode(source[1]),decode(source[1])+decode(source[2]));
   for(const [name,block] of [...sql.matchAll(/definition:=pg_get_functiondef\('public\.(assisted_accept_stage|assisted_apply_snapshot)[^\n]*\n([\s\S]*?)(?=\n EXECUTE definition;)/g)].map(m=>[m[1],m[2]])){
    const prefix=decode(block.match(/prefix:='((?:''|[^'])*)';/)![1]);
    const suffix=literalExpression(block.match(/suffix:=([^\n]+);/)![1]);
    patch(name,prefix,literalExpression(block.match(/definition:=replace\(definition,prefix,([\s\S]*?)\|\|prefix\);/)![1])+prefix);
    patch(name,suffix,literalExpression(block.match(/definition:=replace\(definition,suffix,([\s\S]*?)\);\s*$/)![1]));
   }
  }
 }
 return contracts;
}
