# INFORME 00 — Resumen ejecutivo y veredicto P0

> **Corte:** 2026-10-28. `main = 39e26f1c2e84cc8160c2066e197d61bc8b972384` (merge #1213). La rama U02c se excluye. **Tipo de comprobación de esta entrega:** inspección remota de fuentes/código y reconciliación de Evidence existente; no se ejecutó una jornada UI+Postgres/SQL propia en esta auditoría. No afirmar que se visitó Replit/Supabase real.

**Fuentes de autoridad:** [00](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official), [01](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official), [03](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/03_PLANNER_CONSTRUCCION_BUSQUEDA_ASSISTED_v3.8.md), [04](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/04_INTEGRACION_CONFIGURACION_EFECTIVA_v2.9.md), [05](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/05_VALIDACION_CALIDAD_BENCHMARK_v2.8.md), [06](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/06_A2_CANONICO_INTERPRETACION_Y_TAREAS_v2.10.md), [07](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official) y [AGENTS.md](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/AGENTS.md). La Fuente 06 prevalece sobre errores de los PDF humanos. **Nota:** etiquetas `UI_PRESENT_UNVERIFIED` significan componente o Evidence previa localizado, NO prueba end-to-end universal.

## Resultado

**Veredicto P0: PARTIAL para capacidades de producto ya aprovechables; NOT_DONE para la aceptación de P0.** Ninguna evidencia actual demuestra desde UI sin importador/SQL/API externo una nueva jornada de complejidad A2 íntegra y posteriormente 266/266 en Assisted/SQL. Exigiría E2E-0/E2E-1/E2E-2 y para autocompletar E2E-3. Los 266 importados y los 24 nuevos no son intercambiables.

El producto **sí tiene** creación de programas/zonas/espacios/recursos/plantillas/concursantes/días y editores efectivos de muchas estructuras, perfiles Main/Vocal y Standalone, tránsito y setups, rounds, juntas, fases y descansos. `main` tiene el botón **«Completar automáticamente»** y el orquestador real `shared/assistedAutopilot.ts`, que delega etapas limpias hasta que finaliza o se detiene por razón tipada; no está validado para cualquier jornada. Esto descarta como prioridad construir un segundo Autopilot.

## Fotografía GitHub/Evidence

- `main` confirmado en `39e26f1c...` (#1213), migración 125 última. Fuentes oficiales 00 v2.15 / 01 v5.4 / 02 v2.2 / 03 v3.8 / 04 v2.9 / 05 v2.8 / 06 v2.10 / 07 v2.3. Se inspeccionaron directorios `client/src`, `server`, `shared`, `engine/planner-next`, SQL 001–125 y el catálogo, sin ejecutar el proyecto en contenedor local.
- **U02b:** [`cause-and-delta`](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/evidence/p0-u02b/cause-and-delta.md), [`causal-path`](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/evidence/p0-u02b/causal-path.md), [`validación`](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/evidence/p0-u02b/validation.md): 24/24, Stages S1/S2 verdaderos, 12 Stages SQL nuevos en dos bases frías, miembros recursos físicos, fases/conjunta/pausa, dos topologías, reproducibilidad. Producto UI+API, **no autoría exclusivamente UI**.
- **U00x:** [`README`](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/evidence/p0-u00x/README.md): 19/19 y 20/20 con anchored+standalone y Stage SQL, **sin** macro REQUIRED de U02b.
- **U01f:** 17/17 y Stages SQL con macro fixed specific, conjunta/pausa standalone. U02a 24/24 únicamente contrafactual en memoria y 422 en la cadena productiva, reparado en U02b para ese perfil.
- **A2 histórico importado:** 266/266, 11 Stages SQL, 27.049 ramas y fingerprint histórico `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`. No crear confusión con A2 user-authored.
- **Suite global U02b:** 3.305/3.306; ASST-010 NO_PROPOSAL/SEARCH_TIME_LIMIT_REACHED también reproducido antes del PR. Los 44 checks informados del PR #1213 fueron verdes, pero no equivalen a esta suite global ni a E2E-2.
- **U02c:** rama remota localizada, durante la auditoría apareció un commit `3963c744...` con Evidence en rama y referencias al PR #1214; **trabajo en curso, no revisado, no fusionado ni acreditado**. Se esperará aviso del usuario para gate/diff/merge. Nunca mezclarlo con `main`.
- **Comprobación humana histórica:** se había comunicado el 22/10/2026 ejecución visible del Autopilot sobre A2 importado en demo; no es un E2E instrumentado de jornada nativa, no informa del commit real servido al 28/10.
- **Replit y Supabase publicados:** commit, migraciones y servicio actualmente aplicado **no comprobados**, y quedan sin alterar. No se hizo despliegue ni backup.

## Bloqueos priorizados de producto (no simplificar a un único 422)

| Orden lógico | Brecha | Impacto real | Condición de salida |
|---|---|---|---|
| 1 | No editor universal de requisitos físicos `byItem/byType/anyOf` | Jornada nueva necesita API para expresar recursos de plantilla; incumple UI-only | Editor tipado reutiliza schema nativo, round trip y Stage |
| 2 | Falta productor UI nativo de `coachRouteTransitions` | A2 30 min Caracola→Main no es margen global | UI→snapshot→EngineInput→Stage con asimetría |
| 3 | Main+macro+anchored/standalone simultáneos | Cruce crítico de Reality; **U02c en curso** | Gate causal U02c, no presuponer resultado |
| 4 | Alternativas A/B y 15 min transición junto a fases | A2 necesita dominio de unidades, no specific rígido | Candidatos físicos y SQL S1/S2 sin elegir A/B por catálogo |
| 5 | IN/OUT × Main × macro | Transporte aislado no garantiza encadenamiento | Stage nativo mixto, IN/OUT hard/soft semántico |
| 6 | Sodexo 19 + coaches 45 + descansos 75 | Pérdida silenciosa de futuras comidas invalida parcial | Future witness global en cada Stage SQL |
| 7 | Totales 2 lanes × setup P15 × estructuras Reality | Los bloques por unidad deben convivir sin serialización artificial | SQL integrado con 30+5 y CAM2 10 |
| 8 | Pipeline Estilismo/OUT y P14 como scope operativo | Colocaciones tempranas pueden quitar últimas alternativas de cierre | Future validado, scope por unidades, cierre 0 |
| 9 | `requiresBand` operativo | Semántica de dominio no acreditada en contratos | Equivalencia demostrada o delta mínimo tipado |
| 10 | E2E 266 UI, Assisted y Autopilot general | Objetivo del usuario no alcanzado | E2E-0 a 5, sin importador ni placements copiados |

## Hechos que cambian la estrategia

**No construir un motor nuevo de reglas, otro Autopilot, otro esquema de snapshots ni aumentar presupuestos.** El problema U02a→U02b se resolvió ensanchando **dos predicados TS y dos guards SQL**, **sin cambiar solver**, un ejemplo verificable de reutilización y coste reducido. Esto hace imprescindible diagnosticar el *primer* rejection/gate antes de cualquier desarrollo futuro.

Distinguir salida de `plannerReadiness` **READY** de `PROPOSAL` y de Stage SQL. Una jornada puede ser representable y fallar por búsqueda agotada sin ser físicamente imposible. `ASST-010` no se debe tratar como regresión nueva ni como permiso para elevar timeouts.

## Riesgo prioritario / consejo de dirección

No prometer fecha ni cifra de créditos total sin ejecutar gates. Costes relativos están en Informe 05. La ruta de menor riesgo es cerrar autoría UI tipada y, sin interrumpir U02c, construir el día incremental **por estructuras operativas enteras** y Stage SQL, registrando exactamente qué obligación/intersección se amplía. Fuente 01 considera Assisted MVP; el objetivo ampliado de *completar con un botón* se valida después sobre las mismas APIs, no se da por implementado universalmente sólo porque exista el botón.

**Siguiente acción sin PR ni prompt:** al finalizar U02c aplicar Gate 07 al PR y actualizar esta matriz según su Evidence. La primera unidad posterior recomendada (condicional al resultado) es el editor físico tipado de plantillas por contrato ya soportado; detalle en Informe 06.