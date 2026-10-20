#!/usr/bin/env bash
# OptiPlan - preparación segura de una versión para Replit.
# Uso: SHA=<SHA_APROBADO>; git fetch --no-tags origin main && bash <(git show "$SHA:script/deploy/optiplan_preparar_release.sh") "$SHA"
# NO aplica migraciones ni publica: ambos pasos se realizan después de verificar esta salida.
set -Eeuo pipefail
umask 077

say() { printf '\n=== %s ===\n' "$1"; }
fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

EXPECTED_SHA="${1:-}"
[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'Indica el SHA completo (40 caracteres) de main revisado y aprobado.'
[[ -n "${DATABASE_URL:-}" ]] || fail 'DATABASE_URL no está configurada.'
command -v git >/dev/null || fail 'No se encuentra git.'
command -v psql >/dev/null || fail 'No se encuentra psql.'
command -v node >/dev/null || fail 'No se encuentra Node.js.'
command -v npm >/dev/null || fail 'No se encuentra npm.'

# Aceptar únicamente conexión al proyecto Supabase de OptiPlan, directa o vía pooler.
# No imprimimos credenciales ni URI.
node <<'NODE' || exit 1
const project = 'dyqusivzgxebkxkwohwn';
let url;
try { url = new URL(process.env.DATABASE_URL); }
catch { console.error('ERROR: DATABASE_URL no es una URI PostgreSQL válida.'); process.exit(1); }
const host = url.hostname.toLowerCase();
const user = decodeURIComponent(url.username);
const direct = host === `db.${project}.supabase.co`;
const pooler = host.endsWith('.pooler.supabase.com') && user === `postgres.${project}`;
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !(direct || pooler)) {
  console.error('ERROR: DATABASE_URL no apunta inequívocamente al Supabase esperado. Detenido para evitar respaldar otra base.');
  process.exit(1);
}
console.log('Destino verificado: proyecto Supabase OptiPlan (sin exponer credenciales).');
NODE

say 'COMPROBAR REPOSITORIO Y CÓDIGO AUTORIZADO'
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || fail 'Ejecuta el script desde el repositorio OptiPlan en Replit.'
cd "$ROOT"
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  fail 'El repositorio contiene cambios locales o archivos sin seguimiento. No cambiar de rama ni publicar.'
fi
git fetch --no-tags origin main
REMOTE_SHA="$(git rev-parse FETCH_HEAD)"
[[ "$REMOTE_SHA" == "$EXPECTED_SHA" ]] || fail "origin/main ha cambiado ($REMOTE_SHA). Necesita una nueva revisión antes del despliegue."
printf 'Commit autorizado: %s\n' "$REMOTE_SHA"

say 'COMPROBAR BASE DE DATOS'
SERVER_VERSION_NUM="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'SHOW server_version_num')"
[[ "$SERVER_VERSION_NUM" =~ ^[0-9]+$ ]] || fail 'No se pudo identificar la versión PostgreSQL.'
[[ "$SERVER_VERSION_NUM" -ge 170000 && "$SERVER_VERSION_NUM" -lt 180000 ]] || fail "Servidor PostgreSQL no es 17 (versión $SERVER_VERSION_NUM): revisar cliente antes de respaldar."
DB_NAME="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()')" 
[[ "$DB_NAME" == "postgres" ]] || fail "Base inesperada ($DB_NAME): revisar antes de respaldar."
BASELINE="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "SELECT (SELECT count(*) FROM public.plans), (SELECT count(*) FROM public.daily_tasks), (SELECT count(*) FROM public.assisted_planning_stages), (SELECT count(*) FROM public.task_status_events), (SELECT count(*) FROM public.plan_config_revisions), (SELECT count(*) FROM public.planning_stage_validations);")"
LEDGER="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "SELECT version || ':' || name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1")"
printf 'PostgreSQL: 17 · planes|tareas|stages|eventos|revisiones|validaciones: %s\n' "$BASELINE"
printf 'Última migración aplicada: %s\n' "$LEDGER"

say 'GENERAR Y LEER RESPALDO COMPLETO (PostgreSQL 17)'
BACKUP_DIR="$HOME/optiplan-private-backups"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$BACKUP_DIR/optiplan-pre-release-${TIMESTAMP}-${EXPECTED_SHA:0:8}.dump"
BACKUP_TEMP="$(mktemp "$BACKUP_DIR/.optiplan-XXXXXXXX.partial")"
trap '[[ -z "${BACKUP_TEMP:-}" ]] || rm -f -- "$BACKUP_TEMP"' EXIT
export BACKUP_TEMP

if [[ -x /usr/lib/postgresql/17/bin/pg_dump && -x /usr/lib/postgresql/17/bin/pg_restore ]]; then
  /usr/lib/postgresql/17/bin/pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$BACKUP_TEMP"
  /usr/lib/postgresql/17/bin/pg_restore --list "$BACKUP_TEMP" >/dev/null
  /usr/lib/postgresql/17/bin/pg_restore --file=/dev/null "$BACKUP_TEMP"
elif [[ "$(pg_dump --version 2>/dev/null || true)" =~ ^pg_dump\ \(PostgreSQL\)\ 17\. ]] && [[ "$(pg_restore --version 2>/dev/null || true)" =~ ^pg_restore\ \(PostgreSQL\)\ 17\. ]]; then
  pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$BACKUP_TEMP"
  pg_restore --list "$BACKUP_TEMP" >/dev/null
  pg_restore --file=/dev/null "$BACKUP_TEMP"
else
  command -v nix-shell >/dev/null || fail 'pg_dump 17 no disponible. Instalar Nix o PostgreSQL 17 antes de avanzar.'
  # Replit Nixpkgs 24.05 no contiene postgresql_17: se usa Nixpkgs 25.05 solo para el backup.
  nix-shell \
    -I nixpkgs=https://github.com/NixOS/nixpkgs/archive/nixos-25.05.tar.gz \
    -p postgresql_17 \
    --run 'pg_dump --version && pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$BACKUP_TEMP" && pg_restore --list "$BACKUP_TEMP" >/dev/null && pg_restore --file=/dev/null "$BACKUP_TEMP"'
fi
[[ -s "$BACKUP_TEMP" ]] || fail 'El archivo generado está vacío.'
mv -- "$BACKUP_TEMP" "$BACKUP"
BACKUP_TEMP=""
chmod 600 "$BACKUP"
sha256sum "$BACKUP" > "${BACKUP}.sha256"
chmod 600 "${BACKUP}.sha256"
{
  printf 'commit=%s\n' "$EXPECTED_SHA"
  printf 'dump=%s\n' "$BACKUP"
  printf 'sha256=%s\n' "$(sha256sum "$BACKUP" | awk '{print $1}')"
  printf 'postgres_server_version_num=%s\n' "$SERVER_VERSION_NUM"
  printf 'plans|tasks|stages|task_events|config_revisions|validations=%s\n' "$BASELINE"
  printf 'last_applied_migration=%s\n' "$LEDGER"
} > "${BACKUP}.manifest.txt"
chmod 600 "${BACKUP}.manifest.txt"
ls -lh "$BACKUP"
sha256sum "$BACKUP"

say 'VERIFICAR QUE LA BASE NO CAMBIÓ DURANTE EL RESPALDO'
AFTER="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "SELECT (SELECT count(*) FROM public.plans), (SELECT count(*) FROM public.daily_tasks), (SELECT count(*) FROM public.assisted_planning_stages), (SELECT count(*) FROM public.task_status_events), (SELECT count(*) FROM public.plan_config_revisions), (SELECT count(*) FROM public.planning_stage_validations);")"
if [[ "$AFTER" != "$BASELINE" ]]; then
  fail "Los contadores cambiaron durante el backup ($BASELINE → $AFTER). Conservar respaldo, pero realizar comprobación de concurrencia antes de migrar."
fi

say 'PREPARAR RELEASE EXACTA'
RELEASE_BRANCH="release-optiplan-${EXPECTED_SHA:0:8}-${TIMESTAMP}"
git switch -c "$RELEASE_BRANCH" FETCH_HEAD
npm run check
npm run build
[[ "$(git rev-parse HEAD)" == "$EXPECTED_SHA" ]] || fail 'El checkout no tiene el commit autorizado.'
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || fail 'El build dejó cambios en el repositorio: detener despliegue.'

say 'RELEASE PREPARADA: LISTA PARA GATE DE SUPABASE + PUBLICACIÓN POR CHATGPT'
printf 'RELEASE_SHA=%s\n' "$EXPECTED_SHA"
printf 'RELEASE_BRANCH=%s\n' "$RELEASE_BRANCH"
printf 'BACKUP_PATH=%s\n' "$BACKUP"
printf 'BACKUP_SHA256=%s\n' "$(sha256sum "$BACKUP" | awk '{print $1}')"
printf 'COUNTS=%s\n' "$AFTER"
printf 'LATEST_MIGRATION=%s\n' "$LEDGER"
printf '%s\n' 'IMPORTANTE: este comando NO aplica migraciones ni publica Replit.'
printf '%s\n' 'Entrega estas líneas a ChatGPT para que valide/aplique las migraciones pendientes y publique.'