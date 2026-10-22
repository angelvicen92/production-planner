# Validación P0-U00a

- TypeScript del producto, del harness nuevo y del harness A2 existente: PASS.
- Build de producción y secuencia de migraciones: PASS.
- 43 comprobaciones focales con Node 20 (materialización, snapshots, refresh, readiness, HTTP/roles, frontera del engine y UI existente): PASS.
- 11 comprobaciones SQL/preflight/HTTP adicionales tras registrar la migración 105: PASS. La prueba de adopción aplica el ledger posterior a 099 y compara los cuerpos PostgreSQL reales, incluidos el RPC delegado y su wrapper, sin tolerar drift.
- Ledger PostgreSQL/Auth/PostgREST/Chromium descartable con Node 20: PASS; dos jornadas UI con 4/4 y 9/9, negativos de configuración, altas posteriores a S0, snapshots, CAS y matriz completa de permisos. Evidence en `native/`.
- A2 desde S0: baseline exacto y candidato/repetición 266/266, 11 Stages, 27.049 ramas, 8.465 min; snapshots y huella idénticos, 22 certificados revalidados: PASS.
- Gate de producto vigente (`planner-engine-ci`, mismo comando y exclusiones que en la base): **3.056/3.056 PASS**, 0 fallos, 0 omitidos con Node 20. La CI del primer head confirma también `planner-engine-ci` y `new-days` en verde.

## Diagnósticos históricos fuera del gate de producto

Se ejecutó además la suite amplia sin sus exclusiones habituales, conservando asserts, presupuestos y timeouts. No se declara verde ese comando adicional.

- Node 24: 3.056 PASS / 2 fallos. La frontera read-only nueva de readiness necesitaba su entrada explícita en la lista autorizada; corregida y revalidada dentro de los 43 tests focales y del gate completo. El otro fallo es ASST-010 al solicitar su segundo scope tras refresh, con `ASSISTED_SCOPE_INCOMPLETE, SEARCH_TIME_LIMIT_REACHED`.
- Node 20: 3.056 PASS / 2 fallos. ASST-010 vuelve a agotar su límite temporal; el CLI histórico de primera ejecución Full A2 falla porque usa `Object.groupBy`, ausente en Node 20.

Ambos fallos históricos se reprodujeron aislados sobre el checkout exacto `b9802860d8e48b26938e38f82648c328122efd26`: [resultados originales](historical-diagnostics.txt). Sus archivos son idénticos a los de la base. La CI vigente ya excluía ambos del gate de producto y conservaba ASST-010 para dispatch explícito; esta PR no añade exclusiones ni modifica esos diagnósticos. El replay canónico exigido para esta unidad conserva exactamente su completitud y protecciones.

## Registro SQL e integración nativa

La primera CI detectó `RPC_BODY_DRIFT:assisted_apply_config_refresh`: el registro explícito de contratos SQL sólo llegaba a 104, aunque el ledger nativo ya aplicaba 105. Se incorpora la migración nueva al registro y a la prueba de adopción. La comparación estricta del cuerpo, las firmas, la seguridad y el límite 099 de la reparación histórica permanecen vigentes.
