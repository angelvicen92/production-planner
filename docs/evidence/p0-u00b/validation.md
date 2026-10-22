# Validación del candidato P0-U00b

- Node 20.20.2, dependencias exactas del lockfile sin cambios: PASS.
- TypeScript de producto, harness ampliado (incluye los dos specs standalone) y harness compartido `tsconfig.integration.json`: PASS. La primera CI detectó tres accesos a MAIN en observadores A2; reciben sólo assertions de tipo, sin alterar datos, assertions de benchmark ni comportamiento runtime.
- Build de producción: PASS. Avisos habituales de tamaño del bundle/Browserslist; no fallos.
- Secuencia de migraciones y ledger completo en PostgreSQL nativo descartable: PASS. Sin migraciones nuevas.
- Gate completo de producto vigente: **3.076/3.076 PASS**, cero fallos, omitidos o cancelados. Se mantienen únicamente las dos exclusiones históricas preexistentes del workflow; no se añaden exclusiones ni se alteran presupuestos/timeouts. Resumen original en `product-gate.txt`.
- Focales standalone: auxiliares, técnica sin participante, scopes protegidos, ventanas/pausa, recursos, ciclos/referencias, contradicciones, presupuesto, inviabilidad y continuidad REQUIRED: PASS. La suite completa incorpora estos tests.
- Auth/PostgREST/PostgreSQL/Chromium descartables: U00b **6/6 y 3/3** hasta Stage, cero nuevas HARD/REQUIRED. Negativos con `NO_PROPOSAL`, permisos, CAS e inmutabilidad: PASS. `native/integration.json` registra `remoteWrites=0`.
- U00a instrumentado nuevamente: **4/4 y 9/9** hasta Stage. Comparación exacta de problemas, fingerprints, identity maps y snapshots/placements contra Evidence de la base integrada: PASS. Matriz nativa completa de privilegios y denegación REST: PASS.
- A2 desde S0, base exacta/candidato/repetición bajo el mismo runtime: **266/266, 11 Stages, 27.049 ramas, 8.465 min**, snapshots/horarios/huella idénticos, 22 certificados y Future Feasibility revalidados: PASS. No se modifican datos de fixtures ni assertions canónicas.
- Precisión final de readiness: un rol MAIN/VOCAL prohibido conserva `UNSUPPORTED` aunque falte coach. Se refuerza la aserción focal y se repite el recorrido nativo completo, además de TypeScript/build, sobre ese ajuste.
- CI remota: se comprueba en el PR y sobre su head exacto. Sus resultados finales se registran en la conversación y descripción del PR; este archivo describe las ejecuciones locales instrumentadas.

Los primeros intentos de preparar el entorno no forman parte de los PASS anteriores: se restauró el lockfile completo antes de la instrumentación válida con Node 20 y se corrigió un selector del harness técnico. El comparador A2 exige runtimes iguales; la base se volvió a ejecutar con Node 20 en checkout descartable. No se cambió ninguna assertion para aceptar esos intentos.

Sin migraciones productivas, publicación Replit, modificación de jornadas A2 reales ni merge. La comprobación publicada comunicada por el usuario el 22/10 se identifica separadamente en README y continuidad.
