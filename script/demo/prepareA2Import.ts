import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildA2ImportRows} from './a2ImportRows';

const quote=(value:string)=>`'${value.replaceAll("'","''")}'`;
const literal=(value:unknown)=>value==null?'NULL':typeof value==='number'?String(value):typeof value==='boolean'?String(value):quote(typeof value==='string'?value:JSON.stringify(value));
/** Inserts only. A failed guard, identity collision or constraint rolls back the entire load. */
export function buildA2ImportSQL(date:string,offset=0){
 const dataset=buildA2ImportRows(date,offset);
 const statements=[`-- Generated from canonical A2. No solution, accepted stage or run is imported.
-- Execute only in the separate project explicitly approved by the user.
-- In this SAME session, set optiplan.confirmed_demo_project to that project's ref.
-- Example after approval: SET optiplan.confirmed_demo_project = '<approved-project-ref>';
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(27001);
LOCK TABLE public.plans,public.daily_tasks,public.contestants IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF coalesce(current_setting('optiplan.confirmed_demo_project',true),'') !~ '^[a-z]{20}$' THEN
  RAISE EXCEPTION 'DEMO_TARGET_CONFIRMATION_REQUIRED';
 END IF;
 IF EXISTS(SELECT 1 FROM public.plans) OR EXISTS(SELECT 1 FROM public.daily_tasks) OR EXISTS(SELECT 1 FROM public.contestants) THEN
  RAISE EXCEPTION 'DEMO_REQUIRES_EMPTY_SEPARATE_PROJECT';
 END IF;
END $$;`];
 for(const table of dataset.order){
  for(const row of dataset.tables[table]!){const fields=Object.keys(row);statements.push(`INSERT INTO public.${table} (${fields.join(',')}) OVERRIDING SYSTEM VALUE VALUES (${fields.map(k=>literal(row[k])).join(',')});`);}
  if(!['program_settings','optimizer_settings'].includes(table)&&dataset.tables[table]!.some(row=>row.id!=null))statements.push(`SELECT setval(pg_get_serial_sequence('public.${table}','id'),(SELECT max(id) FROM public.${table}),true);`);
 }
 statements.push(`DO $$ BEGIN
 IF (SELECT count(*) FROM public.daily_tasks WHERE plan_id=${dataset.input.planId})<>266 OR
    (SELECT count(*) FROM public.contestants WHERE plan_id=${dataset.input.planId})<>19 OR
    EXISTS(SELECT 1 FROM public.daily_tasks WHERE plan_id=${dataset.input.planId} AND (start_planned IS NOT NULL OR end_planned IS NOT NULL)) THEN
  RAISE EXCEPTION 'INVALID_A2_IMPORT';
 END IF;
END $$;
COMMIT;
SELECT id,date,status FROM public.plans WHERE id=${dataset.input.planId};`);
 return {dataset,sql:statements.join('\n')};
}

if(process.argv[1]?.endsWith('prepareA2Import.ts')){
 const date=process.argv[2];if(!date)throw Error('Usage: npm run demo:a2:prepare-import -- YYYY-MM-DD [output-directory]');
 const directory=process.argv[3]??'work/a2-import';mkdirSync(directory,{recursive:true});
 const {dataset,sql}=buildA2ImportSQL(date);
 writeFileSync(`${directory}/import.sql`,sql);
 writeFileSync(`${directory}/dataset.json`,JSON.stringify({kind:'CANONICAL_A2_UNSCHEDULED_IMPORT',...dataset},null,2));
 const manifest={version:1,dataset:'A2-FULL-EXEC-001',date,planId:dataset.input.planId,contestants:19,obligations:266,productiveTasks:247,participantMeals:19,
  tables:Object.fromEntries(Object.entries(dataset.tables).map(([k,v])=>[k,v.length])),sha256:createHash('sha256').update(sql).digest('hex'),
  target:'UNCONFIRMED_NO_CONNECTION_OR_WRITE',requiresMigration:'088_plan_planner_next_configuration.sql',safety:'Empty independent project; one transaction; inserts only; collisions fail; no solution import'};
 writeFileSync(`${directory}/manifest.json`,JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest,null,2));
}
