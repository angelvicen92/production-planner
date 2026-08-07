import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";

const { Client } = pg;

const MIGRATION_REF = "607ab53f3662a42c92f1e70f0c9788c28cda0143";
const MIGRATIONS = [
  "supabase/migrations/074_plan_task_template_snapshots.sql",
  "supabase/migrations/075_plan_optimizer_snapshots.sql",
];
const TARGET_TABLES = [
  "plan_task_template_snapshots",
  "plan_optimizer_snapshots",
  "plan_optimizer_snapshot_heuristics",
  "plan_optimizer_snapshot_grouping_zones",
];
const REQUIRED_TABLES = ["plans", "task_templates", "optimizer_settings", "plan_zone_settings"];
const REQUIRED_ROLES = ["anon", "authenticated", "service_role"];
const REQUIRED_TASK_TEMPLATE_COLUMNS = [
  "id", "name", "default_duration", "default_cameras", "zone_id", "space_id",
  "auto_create_on_contestant_create", "requires_auxiliar", "requires_coach", "requires_presenter",
  "exclusive_auxiliar", "has_dependency", "depends_on_template_ids", "depends_on_template_id",
  "resource_requirements", "itinerant_team_requirement", "itinerant_team_id", "rules_json", "setup_id",
];
const REQUIRED_OPTIMIZER_COLUMNS = [
  "id", "optimization_mode", "main_zone_id", "arrival_grouping_target", "departure_grouping_target",
  "arrival_min_gap_minutes", "departure_min_gap_minutes", "van_capacity", "weight_arrival_departure_grouping",
  "near_hard_breaks_max", "arrival_task_template_name", "departure_task_template_name", "grouping_zone_ids",
  "main_zone_priority_level", "prioritize_main_zone", "main_zone_priority_advanced_value",
  "main_zone_finish_early_level", "main_zone_finish_early_advanced_value",
  "main_zone_keep_busy_level", "main_zone_keep_busy_advanced_value",
  "contestant_compact_level", "contestant_compact_advanced_value", "grouping_level",
  "group_by_space_and_template", "grouping_advanced_value", "contestant_stay_in_zone_level",
  "contestant_stay_in_zone_advanced_value", "contestant_total_span_level", "contestant_total_span_advanced_value",
];

function fail(message, details = undefined) {
  const payload = { ok: false, stage: "preflight", message, ...(details ? { details } : {}) };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(2);
}

function gitShow(ref, path) {
  return execFileSync("git", ["show", `${ref}:${path}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
}

const missingEnv = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY"].filter((name) => !process.env[name]);
if (missingEnv.length) fail("Missing required environment variables", { missingEnv });

let migrationSql;
try {
  migrationSql = MIGRATIONS.map((path) => ({ path, sql: gitShow(MIGRATION_REF, path) }));
} catch (error) {
  fail("Could not load the audited migration SQL from Git", {
    migrationRef: MIGRATION_REF,
    error: String(error?.stderr ?? error?.message ?? error).trim(),
  });
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const report = {
  ok: false,
  mode: "TRANSACTIONAL_APPLY_AND_VERIFY",
  migrationRef: MIGRATION_REF,
  migrations: MIGRATIONS,
  action: null,
  preflight: {},
  postApply: {},
  anonRls: {},
  warnings: [],
};

async function getTableState(names) {
  const result = await client.query(`
    select wanted.table_name,
           to_regclass('public.' || wanted.table_name)::text as regclass,
           coalesce(c.relrowsecurity, false) as rls_enabled
    from unnest($1::text[]) wanted(table_name)
    left join pg_class c on c.oid = to_regclass('public.' || wanted.table_name)
    order by wanted.table_name
  `, [names]);
  return result.rows;
}

async function missingColumns(tableName, requiredColumns) {
  const result = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = $1
  `, [tableName]);
  const present = new Set(result.rows.map((row) => row.column_name));
  return requiredColumns.filter((column) => !present.has(column));
}

try {
  const baseState = await getTableState(REQUIRED_TABLES);
  const missingBaseTables = baseState.filter((row) => !row.regclass).map((row) => row.table_name);
  const targetState = await getTableState(TARGET_TABLES);
  const presentTargets = targetState.filter((row) => row.regclass).map((row) => row.table_name);
  const missingTargets = targetState.filter((row) => !row.regclass).map((row) => row.table_name);

  const taskTemplateMissing = await missingColumns("task_templates", REQUIRED_TASK_TEMPLATE_COLUMNS);
  const optimizerMissing = await missingColumns("optimizer_settings", REQUIRED_OPTIMIZER_COLUMNS);

  const roles = await client.query(`select rolname from pg_roles where rolname = any($1::text[]) order by rolname`, [REQUIRED_ROLES]);
  const roleSet = new Set(roles.rows.map((row) => row.rolname));
  const missingRoles = REQUIRED_ROLES.filter((role) => !roleSet.has(role));

  const counts = await client.query(`
    select
      (select count(*)::int from public.plans) as plans,
      (select count(*)::int from public.task_templates) as task_templates,
      (select count(*)::int from public.optimizer_settings) as optimizer_settings,
      exists(select 1 from public.optimizer_settings where id = 1) as optimizer_settings_id_1_exists
  `);

  report.preflight = {
    requiredTables: baseState,
    targetTables: targetState,
    missingBaseTables,
    missingTaskTemplateColumns: taskTemplateMissing,
    missingOptimizerSettingsColumns: optimizerMissing,
    missingRoles,
    counts: counts.rows[0],
  };

  if (missingBaseTables.length || taskTemplateMissing.length || optimizerMissing.length || missingRoles.length) {
    fail("Structural prerequisites changed since the read-only preflight; refusing to write", report.preflight);
  }
  if (!counts.rows[0].optimizer_settings_id_1_exists) {
    fail("optimizer_settings row id=1 is required by migration 075; refusing to write", report.preflight);
  }
  if (presentTargets.length > 0 && missingTargets.length > 0) {
    fail("Partial 074/075 state detected; refusing to guess or repair automatically", { presentTargets, missingTargets });
  }

  if (presentTargets.length === TARGET_TABLES.length) {
    report.action = "VERIFY_EXISTING_ONLY";
  } else {
    report.action = "APPLY_074_AND_075";
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query("SET LOCAL statement_timeout = '120s'");
      for (const migration of migrationSql) {
        await client.query(migration.sql);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(JSON.stringify({
        ok: false,
        stage: "transaction",
        action: report.action,
        rollback: true,
        migrationRef: MIGRATION_REF,
        error: String(error?.message ?? error),
        code: error?.code ?? null,
        detail: error?.detail ?? null,
        hint: error?.hint ?? null,
        constraint: error?.constraint ?? null,
      }, null, 2));
      process.exit(3);
    }
  }

  const finalState = await getTableState(TARGET_TABLES);
  const countsAfter = await client.query(`
    select
      (select count(*)::int from public.plans) as plans,
      (select count(*)::int from public.task_templates) as global_task_templates,
      (select count(*)::int from public.plan_task_template_snapshots) as task_template_snapshots,
      (select count(*)::int from public.plan_optimizer_snapshots) as optimizer_snapshots,
      (select count(*)::int from public.plan_optimizer_snapshot_heuristics) as optimizer_heuristic_rows,
      (select count(*)::int from public.plan_optimizer_snapshot_grouping_zones) as optimizer_grouping_zone_rows
  `);

  const integrity = await client.query(`
    with heuristic_counts as (
      select s.id, s.plan_id, count(h.id)::int as heuristic_count
      from public.plan_optimizer_snapshots s
      left join public.plan_optimizer_snapshot_heuristics h on h.snapshot_id = s.id
      group by s.id, s.plan_id
    )
    select
      (select count(*)::int from public.plans p
       where not exists (select 1 from public.plan_task_template_snapshots t where t.plan_id = p.id))
        as plans_without_any_task_template_snapshot,
      (select count(*)::int from public.plans p
       where not exists (select 1 from public.plan_optimizer_snapshots s where s.plan_id = p.id))
        as plans_without_optimizer_snapshot,
      (select count(*)::int from heuristic_counts where heuristic_count <> 9)
        as optimizer_snapshots_with_non_9_heuristics,
      (select count(*)::int from (
        select snapshot_id, zone_id, count(*) from public.plan_optimizer_snapshot_grouping_zones
        group by snapshot_id, zone_id having count(*) > 1
      ) d) as duplicate_grouping_zone_pairs,
      (select count(*)::int from public.plan_optimizer_snapshots s
       join public.plan_task_template_snapshots t on t.id = s.arrival_plan_template_snapshot_id
       where t.plan_id <> s.plan_id) as cross_plan_arrival_template_refs,
      (select count(*)::int from public.plan_optimizer_snapshots s
       join public.plan_task_template_snapshots t on t.id = s.departure_plan_template_snapshot_id
       where t.plan_id <> s.plan_id) as cross_plan_departure_template_refs,
      (select count(*)::int from public.plan_optimizer_snapshots s
       where s.main_zone_id is not null and not exists (
         select 1 from public.plan_zone_settings z where z.plan_id = s.plan_id and z.zone_id = s.main_zone_id
       )) as out_of_scope_main_zone_refs,
      (select count(*)::int from public.plan_optimizer_snapshot_grouping_zones g
       join public.plan_optimizer_snapshots s on s.id = g.snapshot_id
       where not exists (
         select 1 from public.plan_zone_settings z where z.plan_id = s.plan_id and z.zone_id = g.zone_id
       )) as out_of_scope_grouping_zone_refs
  `);

  const missingOptimizerPlans = await client.query(`
    select p.id as plan_id
    from public.plans p
    where not exists (select 1 from public.plan_optimizer_snapshots s where s.plan_id = p.id)
    order by p.id
  `);

  const grants = await client.query(`
    select table_name, grantee, array_agg(privilege_type order by privilege_type) as privileges
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = any($1::text[])
      and grantee in ('anon', 'authenticated', 'service_role')
    group by table_name, grantee
    order by table_name, grantee
  `, [TARGET_TABLES]);

  const sequenceGrants = await client.query(`
    select object_name as sequence_name, grantee, array_agg(privilege_type order by privilege_type) as privileges
    from information_schema.role_usage_grants
    where object_schema = 'public'
      and object_type = 'SEQUENCE'
      and object_name = any($1::text[])
      and grantee in ('anon', 'authenticated', 'service_role')
    group by object_name, grantee
    order by object_name, grantee
  `, [[
    "plan_task_template_snapshots_id_seq",
    "plan_optimizer_snapshots_id_seq",
    "plan_optimizer_snapshot_heuristics_id_seq",
    "plan_optimizer_snapshot_grouping_zones_id_seq",
  ]]);

  const triggers = await client.query(`
    select event_object_table as table_name, trigger_name, event_manipulation, action_timing
    from information_schema.triggers
    where trigger_schema = 'public'
      and trigger_name in ('spec11_plan_optimizer_snapshot_scope', 'spec11_plan_optimizer_grouping_zone_scope')
    order by trigger_name, event_manipulation
  `);

  report.postApply = {
    tables: finalState,
    counts: countsAfter.rows[0],
    integrity: integrity.rows[0],
    plansWithoutOptimizerSnapshot: missingOptimizerPlans.rows,
    grants: grants.rows,
    sequenceGrants: sequenceGrants.rows,
    triggers: triggers.rows,
  };

  const expectedTaskSnapshots = countsAfter.rows[0].plans * countsAfter.rows[0].global_task_templates;
  if (countsAfter.rows[0].task_template_snapshots !== expectedTaskSnapshots) {
    report.warnings.push({
      code: "TASK_TEMPLATE_SNAPSHOT_COUNT_UNEXPECTED",
      expected: expectedTaskSnapshots,
      actual: countsAfter.rows[0].task_template_snapshots,
    });
  }
  if (integrity.rows[0].plans_without_optimizer_snapshot > 0) {
    report.warnings.push({
      code: "LEGACY_PLANS_WITHOUT_OPTIMIZER_SNAPSHOT",
      count: integrity.rows[0].plans_without_optimizer_snapshot,
      planIds: missingOptimizerPlans.rows.map((row) => row.plan_id),
      note: "Migration 075 intentionally skips legacy plans whose active transport mapping or daily-zone scope cannot be resolved safely. Diagnose before repairing; do not invent a first match.",
    });
  }

  const allTablesWithRls = finalState.length === TARGET_TABLES.length && finalState.every((row) => row.regclass && row.rls_enabled === true);
  const grantLeak = grants.rows.some((row) => ["anon", "authenticated"].includes(row.grantee) && row.privileges.length > 0);
  const integrityFailureKeys = [
    "plans_without_any_task_template_snapshot",
    "optimizer_snapshots_with_non_9_heuristics",
    "duplicate_grouping_zone_pairs",
    "cross_plan_arrival_template_refs",
    "cross_plan_departure_template_refs",
    "out_of_scope_main_zone_refs",
    "out_of_scope_grouping_zone_refs",
  ].filter((key) => Number(integrity.rows[0][key] ?? 0) !== 0);
  const triggerNames = new Set(triggers.rows.map((row) => row.trigger_name));
  const requiredTriggersPresent = triggerNames.has("spec11_plan_optimizer_snapshot_scope") && triggerNames.has("spec11_plan_optimizer_grouping_zone_scope");

  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (const table of TARGET_TABLES) {
    const { error, status, count } = await anon.from(table).select("*", { head: true, count: "exact" }).limit(1);
    report.anonRls[table] = {
      status,
      denied: Boolean(error),
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null,
      countVisible: count ?? null,
    };
  }
  const anonDeniedEverywhere = Object.values(report.anonRls).every((entry) => entry.denied === true);

  report.ok = allTablesWithRls && !grantLeak && integrityFailureKeys.length === 0 && requiredTriggersPresent && anonDeniedEverywhere;
  report.summary = {
    action: report.action,
    transactionApplied: report.action === "APPLY_074_AND_075",
    allTablesExistWithRls: allTablesWithRls,
    anonAuthenticatedGrantLeak: grantLeak,
    requiredTriggersPresent,
    integrityFailureKeys,
    anonReadDeniedEverywhere: anonDeniedEverywhere,
    expectedTaskTemplateSnapshots: expectedTaskSnapshots,
    actualTaskTemplateSnapshots: countsAfter.rows[0].task_template_snapshots,
    plansWithoutOptimizerSnapshot: integrity.rows[0].plans_without_optimizer_snapshot,
    warnings: report.warnings.length,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 4);
} finally {
  await client.end();
}
