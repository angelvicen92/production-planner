# P0-U01d — REQUIRED por fases sin identidad física universal

Base autorizada: `main @ 5343f569b9ef93884e7bc9dcc0e05f57f86d0641`. Una extensión del contrato diario existente: **`requiredResourceIds: []` explícito sólo con `phases`**. El campo sigue obligatorio; omitido y `null` se rechazan. Una lista no vacía conserva su garantía universal. Sin fases se conserva el contrato lineal histórico.

**La misma jornada mixta U01c de 17 obligaciones ahora se guarda, recarga y edita desde TechnicalChainEditor y alcanza S1/S2 SQL con su autoridad REQUIRED activa.** S1 acepta sólo la competidora A; su witness físico cubre las 17 tareas y la pausa. S2 completa las 16 restantes conservando S1 literalmente. Fases 3/2/2, conjunta indivisible, AB/AB/B,C, tres competidoras independientes, dependencias, descanso y disponibilidad reales. Cero HARD/REQUIRED; certificado WITNESS con `consumed: 0`.

Otra jornada no A2 tiene 12 obligaciones, dos fases 2/3 y distribución AB → AC/B. El orden nominal de la segunda fase pone primero la conjunta, pero las dependencias obligan a realizarla después de sus otros miembros. También alcanza S1/S2 sin recurso universal. El control con A común conserva 17/17. En dos bases independientes se acreditan **12 Stages SQL: ocho con conjunto común vacío y cuatro con A común**, sin contar S0. Propuestas, witness, trabajo y fingerprints SQL son idénticos en repetición fría, sin normalización.

El control imposible conserva A disponible 40 minutos frente a 55 de demanda física: NO_PROPOSAL, cero Stages adicionales, 4.278 ramas y sin BUDGET_EXHAUSTED. SQL admite competencia de A durante la fase que lo libera y rechaza esa misma ocupación cuando la autoridad fuente realmente exige A; estos probes transaccionales se revierten y no se cuentan como Stages.

Reutiliza schema, editor, `validateDailyTechnicalChains`/`validatePhasedMembers`, resolver físico, adapter, explorer, Future Feasibility, certificado, snapshots y writer existentes. **123** modifica únicamente los dos validadores SQL existentes, expresa `jsonb_agg(∅)` como `[]` y conserva autenticación y comprobaciones físicas globales. No modifica 001–122, no crea writers, tablas, triggers, RPC, solver, prioridades ni budgets.

- [Causalidad, contrafactual y coste](causal-path.md).
- [Perfil y obligaciones](profile.md).
- [Matriz y frontera pendiente](composition-matrix.md).
- [Negativos SQL y garantías](negatives-and-protection.md).
- [Validación y límites de la entrega](validation.json).
- `verification.json`: física y determinismo independientes; `native/` y `repeat/`: recibos públicos comprimidos y capturas directas del editor. No incluyen logs privados ni credenciales.

## Reproducción

Docker local y Chromium; ningún acceso a Supabase remoto. Los runners eliminan credenciales heredadas y arrancan sus propios PostgreSQL 17.11/Auth/PostgREST por loopback, sin seed A2 para las jornadas nuevas. `run.ts` ejecuta un archivo descartable del checkout con overlay y hashes de los archivos actuales; sólo cambia dispatch y caché Vite de esa copia. `checkoutDelta=[]` acredita que las fuentes no cambiaron durante la ejecución.

```sh
npm run check
npm run check:migrations
npm run build
npm test
npx --no-install tsc -p docs/evidence/p0-u01d/tsconfig.json
node --import tsx docs/evidence/p0-u01d/upgrade123.ts work/u01d-upgrade
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u01d/run.ts work/u01d-native
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u01d/run.ts work/u01d-repeat
python3 docs/evidence/p0-u01d/verify.py work/u01d-native/native work/u01d-repeat/native work/u01d-verification.json
node --import tsx docs/evidence/p0-u00n/a2.ts work/u01d-a2
node --import tsx docs/evidence/p0-u00n/a2.ts work/u01d-a2-repeat
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u01b/run.ts work/u01d-u01b
```

Los recibos archivados se verifican directamente con `python3 docs/evidence/p0-u01d/verify.py docs/evidence/p0-u01d/native docs/evidence/p0-u01d/repeat /tmp/u01d-offline.json`.

**A2 importado, separado:** dos ejecuciones conservan 266/266, 11 Stages, 27.049 ramas, fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`, informes completos iguales salvo duraciones y todos los snapshots idénticos. No acredita autoría completa del A2 por UI. Sin migración real, publicación ni merge. CI/HEAD vivos prevalecen sobre la fotografía de esta Evidence.

## Limitación del gate global

La suite local completa se ejecutó: **3.301/3.302**, con un único fallo ASST-010 (`ASSISTED_SCOPE_INCOMPLETE / SEARCH_TIME_LIMIT_REACHED`, en `runA2Assist7Evidence.ts:181`). Un archivo limpio de la base autorizada, sin overlay, reproduce exactamente el mismo fallo y punto de llamada. `checks/full-suite.log` y `checks/baseline-asst010.log` conservan ambos recibos. No se aumenta presupuesto/timeout ni se corrige ese benchmark ajeno al delta. El gate funcional U01d, build, composición, catálogos, upgrade, U01b, cadena lineal y las dos regresiones A2 descritas sí pasan. El PR se entrega como candidato revisable con esta limitación explícita; no se declara un merge gate local totalmente verde.

La regresión lineal usa `docs/evidence/p0-u00s/run.ts work/u01d-legacy`; su manifiesto conserva la etiqueta histórica del bootstrap y los hashes exactos del checkout ejecutado. `legacy/manifest.json.gz.archiveCheckoutHead` registra la base actual. Los positivos U01b se ejecutan íntegros; su única adaptación de harness compara los cuerpos SQL vigentes en vez de fijar el ledger a 122. `attempts.json` identifica ajustes de los ataques y ensayos fallidos del harness; no los presenta como rechazos productivos de la extensión.
