# P0-U01e — Auditoría causal de fases REQUIRED e itinerancia

**Estado de publicación del borrador:** los cuatro archivos comprimidos `native/repeat/{manifest,receipts}.json.gz` están verificados localmente y pendientes de autorización explícita para adjuntarlos al repositorio público. Los scripts, informes y logs sí forman parte del borrador. La verificación offline de los recibos requiere esos adjuntos; la reproducción desde API puede ejecutarse con el harness.

Base remota comprobada: `main` y rama `codex/p0-u01e-itinerant-phase-composition-audit` en `3ba5d4d393ddf58025622d745a76013ac0ea8399`, tree `7c69a2e453176efd1a54256393059eb2593549f8`. **Diagnóstico; ninguna capacidad productiva habilitada.**

La jornada completa de **17 obligaciones** con unidad fija **sí tiene witness físico en memoria**: tres fases REQUIRED, composición efectiva por operación, conjunta, tres competidoras, dependencias, pausa y disponibilidad. La misma afirmación se comprueba con AB→AC→B,C y con una conjunta que consume una unidad B. Esto amplía materialmente el contrafactual reducido U01c. **No acredita Stage itinerante:** el producto rechaza la autoría antes de buscar.

La primera barrera depende de la operación solicitada. En el flujo ensayado, que configura conjunta antes de fases, es `withDailyJointGroups → jointCombinationSupported`: **422 `UNSUPPORTED_JOINT_COMBINATION`**, incluso cuando la conjunta no consume el equipo. Solicitando fases directamente aparece **422 `UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION`** en `validateDailyTechnicalChains → requiredPhaseCompositionSupported`. Los helpers SQL vigentes reproducen ambos rechazos mediante SELECT. No son errores de aceptación de Stage.

Un control sin ninguna tarea consumidora de equipo guarda la conjunta, pero no las fases, por la mera existencia de snapshots itinerantes. Ese guard es conservador, más amplio que la incompatibilidad física demostrada. Sin embargo, **suprimir guards no basta como solución acreditada**: `joint_task_resources` devuelve `[]` para requisitos aportados sólo por una unidad real. Afecta igualdad física de conjunta, recursos universales de cadena y protección de ediciones de pausas. El witness global SQL ya sabe resolver miembros, elegibilidad, disponibilidad y competencia; sus garantías no deben sustituirse por ese conjunto incompleto.

**Formulación causal obligatoria:**

> Comportamiento X (rechazar la jornada integrada físicamente realizable antes de Stage) está causado por Y (guards diarios/SQL por presencia de itinerancia, con una autoridad SQL de recursos que omite sus miembros fijos) y produce Z (producción debe abandonar REQUIRED o el consumo real de la unidad para continuar).
> El delta mínimo W (certificar composición fija reutilizando los contratos existentes, completar esa autoridad física y acotar conjuntamente sus guards) lo corregirá.
> Esperamos observar M (dos jornadas API reales hasta S1 parcial/S2 SQL con futuro global, liberación, pausas, continuación protegida y negativos materiales con hashes recalculados).

W es la siguiente unidad propuesta, no un cambio implementado ni soporte general acreditado. Su aceptación se detalla en [el único delta](next-delta.md). La evidencia actual justifica intervenir sobre esa autoridad existente; todavía no certifica que SQL acepte la combinación tras la intervención.

- [Obligaciones, perfiles y Fuente 06](profile.md).
- [Matriz antes/después y comparación U01c/U01d/U01e](composition-matrix.md).
- [Primer rechazo, payloads y revisiones](first-rejection.md).
- [Call path, contratos, autoridad y análisis operativo](causal-path.md).
- [Control imposible, coste y límites](validation.md).

**Recibos finales:** `native/` y `repeat/` contienen 125 JSON públicos comprimidos por ejecución y manifiestos de fuentes. Dos stacks completos PostgreSQL 17.11/Auth/PostgREST independientes, ledger 001–123 sin cambios, datos creados mediante API real. Cuatro Stages SQL nominales en total (dos por stack); **cero Stages itinerantes**. 48 witnesses físicos verificados independientemente y 32 casos deterministas entre stacks; el conteo incluye scopes sobre los mismos perfiles, no 48 jornadas distintas. `verification.json` contiene los detalles. `supporting-repair.json` repara supporting en memoria sin alterar propuesta ni aceptar prerrequisitos.

41 pruebas focales PASS; TypeScript del harness PASS; verificación offline PASS. No se ejecuta A2 Full ni suite global. Sin Supabase real, Replit, migraciones productivas ni merge.

## Reproducción

Desde la raíz del repositorio, con dependencias existentes y Docker local:

```sh
node --import tsx docs/evidence/p0-u01e/run.ts work/u01e-candidate
node --import tsx docs/evidence/p0-u01e/run.ts work/u01e-repeat
python3 docs/evidence/p0-u01e/verify.py work/u01e-candidate/native work/u01e-repeat/native work/u01e-verification.json
node --import tsx docs/evidence/p0-u01e/receipt-probes.ts work/u01e-candidate/native work/u01e-supporting.json
node --import tsx docs/evidence/p0-u01e/rest-probe.ts work/u01e-candidate/native work/u01e-rest.json
npx --no-install tsc -p docs/evidence/p0-u01e/tsconfig.json
npx --no-install tsx --test --test-reporter=tap server/requiredPhaseComposition.spec.ts server/technicalChainStructure.spec.ts server/technicalChainSql.spec.ts engine/planner-next/integration/nativeJointGroups.spec.ts engine/planner-next/integration/itinerantComposition.spec.ts engine/planner-next/integration/nativeOperationalMeals.spec.ts engine/planner-next/itinerantUnits.spec.ts
```

Verificación directa de los archivos entregados:

```sh
python3 docs/evidence/p0-u01e/verify.py docs/evidence/p0-u01e/native docs/evidence/p0-u01e/repeat work/u01e-offline.json
```

El runner elimina las credenciales heredadas; sólo el stack descartable genera sus credenciales locales. La copia ejecutada difiere en dispatch de Evidence y caché Vite; ninguna autoridad, guard o algoritmo productivo se modifica. `checkoutDelta=[]`. El checkout inicial era U01b y su proxy Git no respondía: se recuperaron mediante GitHub los 134 archivos distintos y se verificó `git write-tree` contra el tree remoto exacto. Los manifiestos citan el commit local equivalente `0c121912`; el padre del PR remoto es la base autorizada, no ese commit de recuperación.
