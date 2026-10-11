import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {inspectA2Catalog} from './a2Preflight';

const tables=['spaces','daily_tasks','resource_pools','plan_resource_pools','resource_types','resource_items','plan_resource_items','space_resource_defaults','plan_space_resource_assignments','zone_resource_type_defaults','space_resource_type_defaults','plan_zone_resource_type_requirements','plan_space_resource_type_requirements','plan_vocal_coach_rules','vocal_coach_rules'];
test('15 table policies resist legacy PUBLIC grants/policies and keep server access, for all six client identities',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE SQL STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   CREATE TABLE public.roles(id uuid PRIMARY KEY,key text); CREATE TABLE public.user_roles(user_id uuid,role_id uuid);`);
  const roles=['admin','production','aux','viewer'];
  for(let i=0;i<roles.length;i++){const id=`00000000-0000-0000-0000-00000000000${i+1}`;await db.exec(`INSERT INTO roles VALUES('${id}','${roles[i]}'); INSERT INTO user_roles VALUES('${id}','${id}')`);}
  const hasRole=readFileSync('supabase/migrations/037_rbac_auth_magic_link.sql','utf8').match(/CREATE OR REPLACE FUNCTION public.has_role[\s\S]*?\$\$;/)![0];
  await db.exec(hasRole);await db.exec('GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role');
  for(const table of tables)await db.exec(`CREATE TABLE ${table}(id integer PRIMARY KEY,name text); INSERT INTO ${table} VALUES(1,'preserved'); GRANT ALL ON ${table} TO anon,authenticated,service_role; CREATE POLICY legacy_wide_policy ON ${table} FOR ALL TO PUBLIC USING(true) WITH CHECK(true)`);
  await db.exec(`SET optiplan.confirmed_demo_project='dyqusivzgxebkxkwohwn'; SET optiplan.security_approved='yes'; SET optiplan.backup_sha256='${'a'.repeat(64)}';`);
  await db.exec(readFileSync('script/demo/sql/security.sql','utf8'));
  const policies=(await db.query<any>('SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname=\'public\'')).rows;
  const catalog={format:1,columns:[],tables:tables.map(name=>({name,rls:true})),roles:[{name:'service_role',bypassRLS:true}],policies,functions:[],grants:[],triggers:[],sequences:[],constraints:[]};
  assert.deepEqual(inspectA2Catalog(catalog,'2026-10-30').issues.filter(issue=>issue.startsWith('SECURITY_')||issue.startsWith('MISSING_SECURITY_POLICY:')),[],'actual PostgreSQL policy contracts must pass the read-only preflight');
  for(const identity of ['anon','norole',...roles]){
   const role=identity==='anon'?'anon':'authenticated',uid=roles.includes(identity)?`00000000-0000-0000-0000-00000000000${roles.indexOf(identity)+1}`:'';
   await db.exec(`SET ROLE ${role}; SET request.jwt.claim.sub='${uid}'`);
   for(const table of tables){
    assert.equal((await db.query<any>(`SELECT count(*) AS n FROM ${table}`)).rows[0].n,roles.includes(identity)?1:0,`${identity} SELECT ${table}`);
    await assert.rejects(()=>db.exec(`INSERT INTO ${table} VALUES(2,'forbidden')`),/row-level security/);
    await db.exec(`UPDATE ${table} SET name='forbidden'; DELETE FROM ${table};`);
   }
   await db.exec('RESET ROLE');
   for(const table of tables)assert.deepEqual((await db.query<any>(`SELECT * FROM ${table}`)).rows,[{id:1,name:'preserved'}]);
  }
  await db.exec('SET ROLE service_role');
  for(const table of tables){await db.exec(`INSERT INTO ${table} VALUES(2,'server'); UPDATE ${table} SET name='server updated' WHERE id=2; DELETE FROM ${table} WHERE id=2;`);assert.equal((await db.query<any>(`SELECT count(*) AS n FROM ${table}`)).rows[0].n,1);}
  await db.exec('RESET ROLE');
  assert.equal((await db.query<any>("SELECT count(*) AS n FROM pg_class WHERE relname=ANY($1) AND relrowsecurity",[tables])).rows[0].n,15);
 }finally{await db.close();}
});
