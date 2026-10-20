import type pg from 'pg';

/** Effective PostgreSQL privileges, including column grants and PUBLIC inheritance. */
export async function dataApiCatalog(db: pg.Client) {
  const tables = (await db.query(`SELECT c.relname AS name,c.relkind AS kind,c.relrowsecurity AS rls,c.reloptions AS options,
    r.role, ARRAY(SELECT p FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
      WHERE has_table_privilege(r.role,c.oid,p)) AS privileges,
    (SELECT coalesce(jsonb_object_agg(a.attname,ARRAY(SELECT p FROM unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p
      WHERE has_column_privilege(r.role,c.oid,a.attnum,p))),'{}') FROM pg_attribute a
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns
    FROM pg_class c CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) r(role)
    WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','v','p') ORDER BY c.relname,r.role`)).rows;
  const sequences = (await db.query(`SELECT c.relname AS name,r.role,
    ARRAY(SELECT p FROM unnest(ARRAY['USAGE','SELECT','UPDATE']) p WHERE has_sequence_privilege(r.role,c.oid,p)) AS privileges,
    (SELECT d.refobjid::regclass::text FROM pg_depend d WHERE d.objid=c.oid AND d.deptype IN ('a','i') LIMIT 1) AS owned_by
    FROM pg_class c CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) r(role)
    WHERE c.relnamespace='public'::regnamespace AND c.relkind='S' ORDER BY c.relname,r.role`)).rows;
  const functions = (await db.query(`SELECT p.oid::regprocedure::text AS signature,p.prosecdef AS definer,p.proconfig AS settings,
    pg_get_function_result(p.oid) AS result,r.role,has_function_privilege(r.role,p.oid,'EXECUTE') AS execute,
    md5(pg_get_functiondef(p.oid)) AS definition_hash
    FROM pg_proc p CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) r(role)
    WHERE p.pronamespace='public'::regnamespace ORDER BY signature,r.role`)).rows;
  const policies = (await db.query('SELECT * FROM pg_policies WHERE schemaname IN (\'public\',\'incident_private\') ORDER BY schemaname,tablename,policyname')).rows;
  return { tables, sequences, functions, policies };
}

export type DataApiCatalog = Awaited<ReturnType<typeof dataApiCatalog>>;

/** Reviewable contract; keep column-only permissions visible without repeating every column. */
export function privilegeContract(catalog: DataApiCatalog) {
  return {
    tables: catalog.tables.map(t => ({name:t.name,role:t.role,kind:t.kind,rls:t.rls,options:t.options,
      privileges:t.privileges,columns:Object.fromEntries(Object.entries(t.columns as Record<string,string[]>).flatMap(([name,privileges])=>{
        const columnOnly=privileges.filter(p=>!t.privileges.includes(p));
        return columnOnly.length?[[name,columnOnly]]:[];
      }))})),
    sequences: catalog.sequences,
    functions: catalog.functions.map(({signature,role,execute})=>({signature,role,execute})),
  };
}
