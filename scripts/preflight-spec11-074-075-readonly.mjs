import pg from "pg";
import { execFileSync } from "node:child_process";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  console.error(JSON.stringify({ ok: false, stage: "env", missingEnv: ["DATABASE_URL"] }, null, 2));
  process.exit(2);
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    return `ERROR: ${String(error?.stderr ?? error?.message ?? error).trim()}`;
  }
}

const requiredTablesBefore074 = [
  "plans",
  "task_templates",
  "optimizer_settings",
  "plan_zone_settings",
];

const requiredTaskTemplateColumns = [
  "id",
  "name",
  "default_duration",
  "default_cameras",
  "zone_id",
  "space_id",
  "auto_create_on_contestant_create",
  "requires_auxiliar",
  "requires_coach",
  "requires_presenter",
  "exclusive_auxiliar",
  "has_dependency",
  "depends_on_template_ids",
  "depends_on_template_id",
  "resource_requirements",
  "itinerant_team_requirement",
  "itinerant_team_id",
  "rules_json",
  "setup_id",
];

const requiredOptimizerColumns = [
  "id",
  "optimization_mode",
  "main_zone_id",
  "arrival_grouping_target",
  "departure_grouping_target",
  "arrival_min_gap_minutes",
  "departure_min_gap_minutes",
  "van_capacity",
  "weight_arrival_departure_grouping",
  "near_hard_breaks_max",
  "arrival_task_template_name",
  "departure_task_template_name",
  "grouping_zone_ids",
  "main_zone_priority_level",
  "prioritize_main_zone",
  "main_zone_priority_advanced_value",
  "main_zone_finish_early_level",
  "main_zone_finish_early_advanced_value",
  "main_zone_keep_busy_level",
  "main_zone_keep_busy_advanced_value",
  "contestant_compact_level",
  "contestant_compact_advanced_value",
  "grouping_level",
  "group_by_space_and_template",
  "grouping_advanced_value",
  "contestant_stay_in_zone_level",
  "contestant_stay_in_zone_advanced_value",
  "contestant_total_span_level",
  "contestant_total_span_advanced_value",
];

const report = {
  ok: false,
  mode: "READ_ONLY_PREFLIGHT",
  git: {
    branch: git(["branch", "--show-current"]),
    head: git(["rev-parse", "HEAD"]),
    originMain: git(["rev-parse", "origin/main"]),
    statusPorcelain: git(["status", "--porcelain"]),
  },
  database: {},
};

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const identity = await client.query(`
    select current_database() as database_name,
           current_user as database_user,
           current_setting('server_version') as postgres_version
  `);
  report.database.identity = identity.rows[0];

  const tableRows = await client.query(`
    select wanted.table_name,
           to_regclass('public.' || wanted.table_name)::text as regclass,
           coalesce(c.relrowsecurity, false) as rls_enabled
    from unnest($1::text[]) wanted(table_name)
    left join pg_class c on c.oid = to_regclass('public.' || wanted.table_name)
    order by wanted.table_name
  `, [[
    ...requiredTablesBefore074,
    "plan_task_template_snapshots",
    "plan_optimizer_snapshots",
    "plan_optimizer_snapshot_heuristics",
    "plan_optimizer_snapshot_grouping_zones",
  ]]);
  report.database.tables = tableRows.rows;

  const columns = await client.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = any($1::text[])
    order by table_name, ordinal_position
  `, [["task_templates", "optimizer_settings"]]);

  const byTable = new Map();
  for (const row of columns.rows) {
    const set = byTable.get(row.table_name) ?? new Set();
    set.add(row.column_name);
    byTable.set(row.table_name, set);
  }

  const taskTemplateSet = byTable.get("task_templates") ?? new Set();
  const optimizerSet = byTable.get("optimizer_settings") ?? new Set();
  report.database.missingTaskTemplateColumns = requiredTaskTemplateColumns.filter((name) => !taskTemplateSet.has(name));
  report.database.missingOptimizerSettingsColumns = requiredOptimizerColumns.filter((name) => !optimizerSet.has(name));

  const migrationRegclass = await client.query(`
    select to_regclass('supabase_migrations.schema_migrations')::text as regclass
  `);
  report.database.supabaseMigrationTable = migrationRegclass.rows[0]?.regclass ?? null;
  if (report.database.supabaseMigrationTable) {
    const versions = await client.query(`
      select version::text as version
      from supabase_migrations.schema_migrations
      order by version desc
      limit 25
    `);
    report.database.latestSupabaseMigrationVersions = versions.rows.map((row) => row.version);
  } else {
    report.database.latestSupabaseMigrationVersions = [];
  }

  const roleRows = await client.query(`
    select rolname
    from pg_roles
    where rolname = any($1::text[])
    order by rolname
  `, [["anon", "authenticated", "service_role"]]);
  report.database.availableRoles = roleRows.rows.map((row) => row.rolname);

  const counts = {};
  for (const table of requiredTablesBefore074) {
    const exists = tableRows.rows.some((row) => row.table_name === table && row.regclass);
    if (exists) {
      const result = await client.query(`select count(*)::int as count from public.${table}`);
      counts[table] = result.rows[0].count;
    } else {
      counts[table] = null;
    }
  }
  report.database.prerequisiteCounts = counts;

  const missingRequiredTables = requiredTablesBefore074.filter((table) =>
    !tableRows.rows.some((row) => row.table_name === table && row.regclass)
  );
  const existing074 = tableRows.rows.some((row) => row.table_name === "plan_task_template_snapshots" && row.regclass);
  const existing075Tables = [
    "plan_optimizer_snapshots",
    "plan_optimizer_snapshot_heuristics",
    "plan_optimizer_snapshot_grouping_zones",
  ].filter((table) => tableRows.rows.some((row) => row.table_name === table && row.regclass));
  const missingRoles = ["anon", "authenticated", "service_role"].filter((role) => !report.database.availableRoles.includes(role));

  report.summary = {
    missingRequiredTables,
    missingTaskTemplateColumns: report.database.missingTaskTemplateColumns,
    missingOptimizerSettingsColumns: report.database.missingOptimizerSettingsColumns,
    missingSupabaseRoles: missingRoles,
    migration074AlreadyPresent: existing074,
    migration075TablesAlreadyPresent: existing075Tables,
    safeToAttempt074Then075:
      missingRequiredTables.length === 0 &&
      report.database.missingTaskTemplateColumns.length === 0 &&
      report.database.missingOptimizerSettingsColumns.length === 0 &&
      missingRoles.length === 0 &&
      !existing074 &&
      existing075Tables.length === 0,
    note: "This preflight does not write or apply migrations. safeToAttempt074Then075 only means the structural prerequisites visible to migrations 074/075 are present; the apply step must still run transactionally with ON_ERROR_STOP semantics and post-apply verification.",
  };

  report.ok = report.summary.safeToAttempt074Then075;
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
} finally {
  await client.end();
}
