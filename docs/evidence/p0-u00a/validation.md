# Validación P0-U00a

- TypeScript del producto, del harness nuevo y del harness A2 existente: PASS.
- Build de producción y secuencia de migraciones: PASS.
- 43 comprobaciones focales con Node 20 (materialización, snapshots, refresh, readiness, HTTP/roles, frontera del engine y UI existente): PASS.
- Ledger PostgreSQL/Auth/PostgREST/Chromium descartable: PASS; dos jornadas UI con 4/4 y 9/9, negativos de configuración, altas posteriores a S0, snapshots, CAS y matriz completa de permisos. Evidence en `native/`.
- A2 desde S0: baseline exacto y candidato/repetición 266/266, 11 Stages, 27.049 ramas, 8.465 min; snapshots y huella idénticos, 22 certificados revalidados: PASS.

## Suite amplia: resultados y límites

Se ejecutó la suite completa, sin cambiar asserts, presupuestos ni timeouts.

- Node 24: 3.056 PASS / 2 fallos. La frontera read-only nueva de readiness necesitaba su entrada explícita en la lista autorizada; corregida y revalidada dentro de los 43 tests focales. El otro fallo es ASST-010 al solicitar su segundo scope tras refresh, con `ASSISTED_SCOPE_INCOMPLETE, SEARCH_TIME_LIMIT_REACHED`.
- Node 20: 3.056 PASS / 2 fallos. ASST-010 vuelve a agotar su límite temporal; el CLI histórico de primera ejecución Full A2 falla porque usa `Object.groupBy`, ausente en Node 20. Ese archivo es idéntico al de la base.

Estos resultados no se presentan como una suite global verde. El replay canónico exigido para esta unidad sí conserva exactamente su completitud y protecciones. Se está contrastando ASST-010 aislado en el checkout exacto de la base, y se conserva el resultado antes de cerrar la entrega. No se amplía U00a para modificar el solver o un benchmark histórico.
