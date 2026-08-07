import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const { Client } = pg;
const TABLES = [
  "plan_task_template_snapshots",
  "plan_optimizer_snapshots",
  "plan_optimizer_snapshot_heuristics",
  "plan_optimizer_snapshot_grouping_zones",
];

const missingEnv = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY"].filter((name) => !process.env[name]);
if (missingEnv.length) {
  console.error(JSON.stringify({ ok: false, stage: "env", missingEnv }, null, 2));
  process.exit(2);
}

const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const report = {
  ok: false,
  mode: "READ_ONLY_SECURITY_VERIFICATION",
  database: {},
  anonHttp: {},
};

try {
  const rows = await db.query(`
    select
      c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      has_table_privilege('anon', format('public.%I', c.relname), 'SELECT') as anon_select,
      has_table_privilege('authenticated', format('public.%I', c.relname), 'SELECT') as authenticated_select,
      has_table_privilege('service_role', format('public.%I', c.relname), 'SELECT') as service_role_select,
      (select count(*)::int from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policy_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relname = any($1::text[])
    order by c.relname
  `, [TABLES]);

  const counts = await db.query(`
    select
      (select count(*)::int from public.plan_task_template_snapshots) as plan_task_template_snapshots,
      (select count(*)::int from public.plan_optimizer_snapshots) as plan_optimizer_snapshots,
      (select count(*)::int from public.plan_optimizer_snapshot_heuristics) as plan_optimizer_snapshot_heuristics,
      (select count(*)::int from public.plan_optimizer_snapshot_grouping_zones) as plan_optimizer_snapshot_grouping_zones
  `);

  report.database.tables = rows.rows;
  report.database.rowCounts = counts.rows[0];
} finally {
  await db.end();
}

const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

for (const table of TABLES) {
  const { data, error, status } = await anon.from(table).select("id").limit(1);
  report.anonHttp[table] = {
    status,
    errorCode: error?.code ?? null,
    errorMessage: error?.message ?? null,
    visibleRowCount: Array.isArray(data) ? data.length : null,
  };
}

const tableMap = new Map(report.database.tables.map((row) => [row.table_name, row]));
const allTablesChecked = TABLES.every((table) => tableMap.has(table));
const rlsEverywhere = TABLES.every((table) => tableMap.get(table)?.rls_enabled === true);
const noAnonSelectPrivilege = TABLES.every((table) => tableMap.get(table)?.anon_select === false);
const noAuthenticatedSelectPrivilege = TABLES.every((table) => tableMap.get(table)?.authenticated_select === false);
const serviceRoleCanSelect = TABLES.every((table) => tableMap.get(table)?.service_role_select === true);
const anonSeesNoRows = TABLES.every((table) => {
  const result = report.anonHttp[table];
  return Boolean(result?.errorCode) || result?.visibleRowCount === 0;
});

report.summary = {
  allTablesChecked,
  rlsEverywhere,
  noAnonSelectPrivilege,
  noAuthenticatedSelectPrivilege,
  serviceRoleCanSelect,
  anonSeesNoRows,
  interpretation: "HTTP success with zero rows is safe under RLS; an error is also safe. The unsafe state is any anonymous row becoming visible or an effective anon/authenticated SELECT privilege.",
};
report.ok = allTablesChecked && rlsEverywhere && noAnonSelectPrivilege && noAuthenticatedSelectPrivilege && serviceRoleCanSelect && anonSeesNoRows;

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
