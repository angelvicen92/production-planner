/** Reproduce the existing test's 24-hour/civil-date confusion on both source trees. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {executionDatabase,actor}=await import(pathToFileURL(resolve('server/fixtures/executionDatabase.ts')).href);
const db=await executionDatabase();
try{
 await db.exec(`ALTER TABLE plans ADD COLUMN work_start text DEFAULT '00:00',ADD COLUMN work_end text DEFAULT '23:59';
  UPDATE plans SET date='2026-10-25';
  INSERT INTO user_entity_links VALUES('${actor(3)}','staff_person',5,true);
  INSERT INTO plan_staff_assignments VALUES(1,5,'space',NULL,10,'production');`);
 for(const file of ['097_audited_execution_time_corrections.sql','098_execution_start_workday.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec(`CREATE OR REPLACE FUNCTION public.execution_clock(p_plan_id bigint)
  RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
  SELECT jsonb_build_object('serverAt','2026-10-25T22:14:00Z','operationalAt','2026-10-25T22:14:00Z','mode','auto','revision',NULL) $$;`);
 const start=(await db.query('SELECT * FROM execute_task_transition(1,$1,\'in_progress\',NULL,0)',[actor(3)])).rows[0];
 const previous24Hours=new Date(new Date(start.start_real_at).getTime()-86400_000).toISOString();
 const previousCivilDay=(await db.query("SELECT (($1::timestamptz AT TIME ZONE 'Europe/Madrid')-interval '1 day') AT TIME ZONE 'Europe/Madrid' AS at",[start.start_real_at])).rows[0].at;
 const dates=(await db.query("SELECT ($1::timestamptz AT TIME ZONE 'Europe/Madrid')::date::text current,($2::timestamptz AT TIME ZONE 'Europe/Madrid')::date::text previous24h,($3::timestamptz AT TIME ZONE 'Europe/Madrid')::date::text previousCivil",[start.start_real_at,previous24Hours,previousCivilDay])).rows[0];
 assert.equal(dates.current,dates.previous24h);assert.notEqual(dates.current,dates.previouscivil);
 await db.exec('BEGIN');
 await db.query('SELECT * FROM correct_task_execution_time(1,$1,\'start\',$2,\'Previous date probe\',1)',[actor(3),previous24Hours]);
 await db.exec('ROLLBACK');
 let rejection:any;
 try{await db.query('SELECT * FROM correct_task_execution_time(1,$1,\'start\',$2,\'Previous date probe\',1)',[actor(3),new Date(previousCivilDay).toISOString()]);}
 catch(e:any){rejection={code:e.code,message:e.message};}
 assert.equal(rejection?.message,'EXECUTION_WORKDAY');
 writeFileSync(process.argv[2],JSON.stringify({pinnedInstant:'2026-10-25T22:14:00Z',dates,previous24Hours,previousCivilDay,oldTestWitnessAccepted:true,civilDayWitnessRejection:rejection,productMigrationsUnchanged:true},null,2));
}finally{await db.close();}
