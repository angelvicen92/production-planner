import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";

const { Client } = pg;

const requiredEnv = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY"];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);
if (missingEnv.length) {
  console.error(JSON.stringify({ ok: false, stage: "env", missingEnv }, null, 2));
  process.exit(2);
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    return `ERROR: ${String(error?.stderr ?? error?.message ?? error).trim()}`;
  }
}

const report = {
  ok: false,
  mode: "READ_ONLY",
  git: {
    branch: git(["branch", "--show-current"]),
    head: git(["rev-parse", "HEAD"]),
    originMain: git(["rev-parse", "origin/main"]),
    statusPorcelain: git(["status", "--porcelain"]),
  },
  database: {},
  anonRls: {},
};

const tables = [
  "plan_task_template_snapshots",
  "plan_optimizer_snapshots",
  "plan_optimizer_snapshot_heuristics",
  "plan_optimizer_snapshot_grouping_zones",
];

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const identity = await client.query(`
    select current_database() as database_name, current_user as database_user,
           current_setting('server_version') as postgres_version
  `);
  report.database.identity = identity.rows[0];

  const tableState = await client.query(`
    select wanted.table_name,
           to_regclass('public.' || wanted.table_name)::text as regclass,
           coalesce(c.relrowsecurity, false) as rls_enabled
    from (values
      ('plan_task_template_snapshots'),
      ('plan_optimizer_snapshots'),
      ('plan_optimizer_snapshot_heuristics'),
      ('plan_optimizer_snapshot_grouping_zones')
    ) wanted(table_name)
    left join pg_class c on c.oid = to_regclass('public.' || wanted.table_name)
    order by wanted.table_name
  `);
  report.database.tables = tableState.rows;

  const grants = await client.query(`
    select table_name, grantee,
           array_agg(privilege_type order by privilege_type) as privileges
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = any($1::text[])
      and grantee in ('anon', 'authenticated', 'service_role')
    group by table_name, grantee
    order by table_name, grantee
  `, [tables]);
  report.database.grants = grants.rows;

  const constraints = await client.query(`
    select c.relname as table_name,
           con.conname as constraint_name,
           con.contype as constraint_type,
           pg_get_constraintdef(con.oid, true) as definition
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any($1::text[])
    order by c.relname, con.conname
  `, [tables]);
  report.database.constraints = constraints.rows;

  const triggers = await client.query(`
    select event_object_table as table_name, trigger_name,
           event_manipulation, action_timing
    from information_schema.triggers
    where trigger_schema = 'public'
      and event_object_table = any($1::text[])
    order by event_object_table, trigger_name, event_manipulation
  `, [tables]);
  report.database.triggers = triggers.rows;

  const counts = await client.query(`
    select
      (select count(*)::int from public.plans) as plans,
      (select count(*)::int from public.task_templates) as global_task_templates,
      (select count(*)::int from public.plan_task_template_snapshots) as task_template_snapshots,
      (select count(*)::int from public.plan_optimizer_snapshots) as optimizer_snapshots,
      (select count(*)::int from public.plan_optimizer_snapshot_heuristics) as optimizer_heuristic_rows,
      (select count(*)::int from public.plan_optimizer_snapshot_grouping_zones) as optimizer_grouping_zone_rows
  `);
  report.database.counts = counts.rows[0];

  const integrity = await client.query(`
    with heuristic_counts as (
      select s.id, s.plan_id, count(h.id)::int as heuristic_count
      from public.plan_optimizer_snapshots s
      left join public.plan_optimizer_snapshot_heuristics h on h.snapshot_id = s.id
      group by s.id, s.plan_id
    )
    select
      (select count(*)::int
       from public.plans p
       where not exists (
         select 1 from public.plan_task_template_snapshots t where t.plan_id = p.id
       )) as plans_without_any_task_template_snapshot,
      (select count(*)::int
       from public.plans p
       where not exists (
         select 1 from public.plan_optimizer_snapshots s where s.plan_id = p.id
       )) as plans_without_optimizer_snapshot,
      (select count(*)::int from heuristic_counts where heuristic_count <> 9)
        as optimizer_snapshots_with_non_9_heuristics,
      (select count(*)::int
       from (
         select snapshot_id, zone_id, count(*)
         from public.plan_optimizer_snapshot_grouping_zones
         group by snapshot_id, zone_id
         having count(*) > 1
       ) d) as duplicate_grouping_zone_pairs,
      (select count(*)::int
       from public.plan_optimizer_snapshots s
       join public.plan_task_template_snapshots t
         on t.id = s.arrival_plan_template_snapshot_id
       where t.plan_id <> s.plan_id) as cross_plan_arrival_template_refs,
      (select count(*)::int
       from public.plan_optimizer_snapshots s
       join public.plan_task_template_snapshots t
         on t.id = s.departure_plan_template_snapshot_id
       where t.plan_id <> s.plan_id) as cross_plan_departure_template_refs,
      (select count(*)::int
       from public.plan_optimizer_snapshots s
       where s.main_zone_id is not null
         and not exists (
           select 1 from public.plan_zone_settings z
           where z.plan_id = s.plan_id and z.zone_id = s.main_zone_id
         )) as out_of_scope_main_zone_refs,
      (select count(*)::int
       from public.plan_optimizer_snapshot_grouping_zones g
       join public.plan_optimizer_snapshots s on s.id = g.snapshot_id
       where not exists (
         select 1 from public.plan_zone_settings z
         where z.plan_id = s.plan_id and z.zone_id = g.zone_id
       )) as out_of_scope_grouping_zone_refs
  `);
  report.database.integrity = integrity.rows[0];

  const sourceDistribution = await client.query(`
    select source, count(*)::int as count
    from public.plan_optimizer_snapshots
    group by source
    order by source
  `);
  report.database.optimizerSourceDistribution = sourceDistribution.rows;

  const missingOptimizerPlans = await client.query(`
    select p.id as plan_id
    from public.plans p
    where not exists (
      select 1 from public.plan_optimizer_snapshots s where s.plan_id = p.id
    )
    order by p.id
    limit 100
  `);
  report.database.plansWithoutOptimizerSnapshot = missingOptimizerPlans.rows;

  const migrationTable = await client.query(`select to_regclass('supabase_migrations.schema_migrations')::text as regclass`);
  report.database.supabaseMigrationTable = migrationTable.rows[0]?.regclass ?? null;
  if (report.database.supabaseMigrationTable) {
    const migrations = await client.query(`
      select version::text as version
      from supabase_migrations.schema_migrations
      order by version desc
      limit 15
    `);
    report.database.latestMigrationVersions = migrations.rows.map((row) => row.version);
  }
} finally {
  await client.end();
}

const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

for (const table of tables) {
  const { data, error, status } = await anon.from(table).select("*", { head: true, count: "exact" }).limit(1);
  report.anonRls[table] = {
    status,
    denied: Boolean(error),
    errorCode: error?.code ?? null,
    errorMessage: error?.message ?? null,
    countVisible: data?.length ?? null,
  };
}

const tableChecks = report.database.tables ?? [];
const allTablesExist = tableChecks.length === tables.length && tableChecks.every((row) => row.regclass && row.rls_enabled === true);
const grantLeak = (report.database.grants ?? []).some((row) =>
  ["anon", "authenticated"].includes(row.grantee) && Array.isArray(row.privileges) && row.privileges.includes("SELECT")
);
const integrity = report.database.integrity ?? {};
const integrityFailures = [
  "optimizer_snapshots_with_non_9_heuristics",
  "duplicate_grouping_zone_pairs",
  "cross_plan_arrival_template_refs",
  "cross_plan_departure_template_refs",
  "out_of_scope_main_zone_refs",
  "out_of_scope_grouping_zone_refs",
].filter((key) => Number(integrity[key] ?? 0) !== 0);
const anonDeniedEverywhere = Object.values(report.anonRls).every((entry) => entry.denied === true);

report.summary = {
  allTablesExistWithRls: allTablesExist,
  anonAuthenticatedSelectGrantLeak: grantLeak,
  integrityFailures,
  anonReadDeniedEverywhere: anonDeniedEverywhere,
  plansWithoutAnyTaskTemplateSnapshot: Number(integrity.plans_without_any_task_template_snapshot ?? 0),
  plansWithoutOptimizerSnapshot: Number(integrity.plans_without_optimizer_snapshot ?? 0),
  note: "Missing optimizer snapshots on legacy plans require diagnosis; migration 075 intentionally refuses ambiguous active transport or out-of-scope legacy configuration instead of inventing a match.",
};

report.ok = allTablesExist && !grantLeak && integrityFailures.length === 0 && anonDeniedEverywhere;
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
