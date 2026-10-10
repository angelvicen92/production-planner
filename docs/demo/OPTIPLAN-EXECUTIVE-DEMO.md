# OPTIPLAN — entrega ejecutiva A2

10 de octubre de 2026. Motor de referencia: PR [#1104](https://github.com/angelvicen92/production-planner/pull/1104), `6c5a1838ed06e0bbd7764a99be027e08b2d23f41`. Sin merge ni escrituras en Supabase.

**La jornada A2 completa ya tiene importador seguro y wiring de las autoridades en la aplicación. Su carga remota está pendiente de confirmar un proyecto Supabase separado. Hoy también se puede mostrar una reproducción verificable y revisar un borrador local. ASST-010 sigue bloqueado en S2.**

El entregable principal es abrir y planificar A2 desde la aplicación real que el usuario publica en Replit. Ver [procedimiento de carga y ensayo](A2-IMPORT-PROCEDURE.md). El usuario conserva la publicación; no se modifica su infraestructura.

## Respaldo local mientras se confirma el destino

Desde la raíz del repositorio, con Node y las dependencias instaladas:

```sh
npm run demo:a2:record
npm run demo:a2
```

Abrir `http://127.0.0.1:4173`. La primera orden ejecuta dos A2 completos desde S0, sin seed ni witness externo; tarda aproximadamente 3–4 minutos en este entorno. Guarda el dataset sin solución, los runs íntegros, snapshots, métricas y fingerprints en `work/a2-demo/`. La segunda abre la reproducción sin generar de nuevo ni conectar con Supabase.

Para una copia estática:

```sh
npm run demo:a2:build
python3 -m http.server 4173 --directory work/a2-demo/site --bind 127.0.0.1
```

El paquete estático permite recorrer las etapas y el timeline. La validación de ajustes requiere el servidor `npm run demo:a2`. El informe y la pantalla identifican expresamente el modo reproducción. No hay botón que simule una generación en directo.

`script/demo/buildA2Demo.ts work/a2-demo --reuse`, ejecutado con `node --import tsx`, permite volver a exportar los dos registros ya existentes; exige los mismos criterios y fingerprints, sin buscar otra solución. Los snapshots capturados se guardan inmediatamente tras cada aceptación. El HEAD del bundle identifica el exportador; la versión del motor de esta entrega es la referencia indicada arriba.

## Qué está probado

| Estado | Capacidad |
|---|---|
| DEMOSTRADO | Dos runs nuevos desde S0: 266/266, diez stages, material idéntico y fingerprint final del baseline. |
| DEMOSTRADO | Request/run/apply, validación y aceptación mediante los servicios reales, con frontera DB en memoria. `proposalRunId` capturado en cada aceptación. |
| DEMOSTRADO | Veinte witnesses completos pasan `validatePlan`, replay JOINT_COMPLETION y cierre `CERTIFY`; protección literal, scope exacto y futuro efímero. |
| DEMOSTRADO | Timeline existente por concursante, espacio y recurso; recorrido S0–S10; copia local de S10 y validación canónica de ajustes. Las etapas registradas no cambian. |
| DEMOSTRADO | Lectura de nueve tablas Supabase con cero filas y exposición de cuatro RPC necesarios mediante OpenAPI. Cero escrituras. |
| EXPERIMENTAL | Generador CP-SAT aislado: fixtures originales de cuatro y seis concursantes certificados y variaciones aprobadas; sin dependencia productiva ni wiring Assisted. |
| DEMOSTRADO | Importador sin solución, 266 obligaciones y C01–C19; igualdad completa del problema tras `buildEngineInput`, también con IDs desplazados; inserción SQL local y guards. |
| DEMOSTRADO | Botón de sugerencia de alcance en la UI real y servicio de solo lectura; reutiliza el recomendador existente. |
| PENDIENTE | Proyecto separado confirmado, carga remota, login/RLS, RPC reales y recuperación tras reiniciar. |
| PENDIENTE | S2 de ASST-010; contratos posteriores no recorridos en el canon auténtico. |

La comprobación de S1 con snapshot real de duraciones/recursos y reconstrucción del input en cada aceptación pasa aislada en **69,981 s**. Un ensayo previo completó 266/266 con S1=143,495 s y falló el gate; no se descarta ese resultado. La confirmación de dos runs completos de esa variante se registra en `DELIVERY-STATUS.md`.

## Métricas ejecutivas

| Indicador | Resultado |
|---|---:|
| Concursantes / obligaciones | 19 / 266: 247 tareas y 19 Sodexo |
| S1 run 1 / run 2 | 65,671 / 80,335 s; ambos ≤120 s |
| Suma de tiempos de etapas run 1 / run 2 | 82,280 / 103,817 s |
| Nuevas violaciones HARD / REQUIRED | 0 / 0 |
| CAM1 | 51 tareas; cero solapamientos; 335 min ocupados de 720 disponibles, 46,53% |
| CAM2 | 275 / 720 min, 38,19% |
| Main Stage | 285 min de tareas + 75 min de comida; un bloque continuo, cero huecos interiores |
| Transporte llegada | 7 grupos: 3, 3, 3, 3, 3, 3, 1 personas |
| Transporte salida | 6 grupos: 1, 1, 1, 4, 6, 6 personas |
| Comidas | 19 Sodexo y 8 pausas operativas certificadas |
| Huecos interiores concursantes | 5.790 min sumados; media 304,74 min; intervalo por concursante 150–410 min |
| Coach José María | 330 min ocupados; 105 min de huecos interiores; 3 bloques |
| Coach Lucía | 240 min ocupados; 30 min de huecos interiores; 2 bloques |

**Definiciones:** ocupación es la unión de intervalos de tareas. Utilización divide esa unión por la disponibilidad configurada, sin descontar comidas. Para concursantes se incluyen las comidas Sodexo en la ocupación. Hueco interior = tramo desde la primera tarea hasta la última menos unión de ocupaciones; incluye desplazamientos y pausas autorizadas y no equivale a espera evitable. Bloques de coach = tramos de ocupación separados por cualquier hueco positivo. La continuidad Main incluye su comida autorizada. Los tiempos son descriptivos de este entorno; el segundo run tuvo otras comprobaciones breves concurrentes. No se atribuye mejora de velocidad al motor, cuyo source no cambia.

No se presenta ahorro de horas ni superioridad frente al A2 humano: falta una comparación con las mismas definiciones. El plan cubre las obligaciones, pero la calidad de itinerarios requiere mejora. Los datos por espacio, recurso, concursante y coach están en `summary.json`, con las definiciones y hashes.

## Guion de 6–7 minutos

1. **0:00–0:45:** S0. Mostrar los 19 concursantes, jornada vacía y obligaciones pendientes. Explicar que se reproduce una ejecución registrada.
2. **0:45–1:30:** Exponer restricciones: coaches, espacios y recursos compartidos; comidas; transporte; decisiones aceptadas protegidas.
3. **1:30–3:15:** Recorrer S1–S10. Cada botón muestra una aceptación ya ejecutada; mostrar duración y número de obligaciones añadidas. Conteos: 19, 38, 46, 65, 75, 111, 169, 207, 209, 266.
4. **3:15–4:30:** S10 por espacio: Main y su comida; por recurso: CAM1, CAM2 y coaches; por concursante: comida y desplazamientos.
5. **4:30–5:45:** Servidor local: abrir una copia de borrador, activar modo manual del timeline, ajustar una tarea y validar. Mostrar conflictos cuando existan. Descartar la copia; el registro permanece intacto.
6. **5:45–6:45:** Mostrar dos runs, certificaciones, tiempos y límites. Explicar que faltan staging y S2 post-refresh; no prometer una solución en directo ni un ahorro no medido.

## Distancia entre benchmark y aplicación

La UI `assisted-planning-workspace.tsx` ya usa las rutas de sesión, proposals/poll/apply, draft, validate, accept-stage, history, rollback/redo y config-refresh. `AssistedPlanningService.start` construye el input con storage, crea revisión y snapshot, y llama a `assisted_bootstrap_session`. Las aceptaciones usan RPC y las tablas `assisted_planning_sessions`, `assisted_planning_stages`, validaciones y exceptions. La recuperación de witness depende del `proposalRunId` persistido y el JSON del run.

A2-ASSIST-8 sustituye storage/RPC/runAccess y `buildInput` por memoria y el fixture. No atraviesa las rutas HTTP, autenticación, RLS ni `buildEngineInput` desde las filas reales. Su fake de clean-validation no prueba el comportamiento del RPC; por eso el exportador revalida independientemente el witness completo de cada etapa.

El nuevo importador prepara filas y SQL transaccional; solo acepta un proyecto independiente sin jornadas. `plans.planner_next_configuration` aporta las autoridades explícitas que faltaban en `buildEngineInput`, con validación de contrato/referencias y protección contra cambios silenciosos. No almacena una solución ni sustituye el input ordinario. La selección de alcance se sugiere desde el recomendador ya existente, sin aceptar ni generar automáticamente. El procedimiento de carga, rol del usuario de demo y verificación de equivalencia está en `A2-IMPORT-PROCEDURE.md`.

La migración 088 está preparada y **no aplicada al proyecto conectado**. Las jornadas sin contrato mantienen el comportamiento anterior. Las reglas nuevas se incorporan al fingerprint/replay diario. No se añade OR-Tools como dependencia del producto. El schema remoto y las RPC deben verificarse en el destino confirmado antes de declarar completada la demo viva.

## Decisión arquitectónica y S2

| Alternativa | Evidencia y coste | Decisión |
|---|---|---|
| Solver propio | Diagnóstico anterior: 193 variables, 4.083 relaciones, ~129 millones de soportes en 60 s y cero hojas. Requeriría cambiar propagación global, soporte binario y estados/reentradas sin prueba de escalabilidad. | Conservar el motor probado para A2. Detener otra expansión de esa DFS en esta entrega. |
| CP-SAT global | Reutiliza dominios y validadores actuales; proceso asíncrono con un worker, 4 GiB, límite CPU, cancelación y timeout. Fixtures originales certificados en 0,457 / 0,547 s de proceso completo; no recibe el witness externo. Canon completo: 30,004 s de solve, 236.583 ramas, 46.316 conflictos y cero candidatos. | Experimental. No integrar ni añadir OR-Tools al producto. `UNKNOWN` es INCONCLUSIVE. |
| Descomposición global–local | A2 tiene un componente conectado; una partición ingenua no independiza recursos compartidos. Puede reducir la decisión global a macroestructuras, pero exige regresar cuando el productor local no cierre. | Dirección preferida para la siguiente prueba, aún no validada como solución. Usar CP-SAT para coordinación global y autoridades canónicas para aceptación. |

La nueva prueba compila desde `source` vigente y protecciones literales: permite cambiar Main/Vocal, inicios, asignaciones de unidades, comidas, órdenes setup y rondas; no lee `priorJoint`, slots previos, fingerprint A2 ni horarios del witness. No llama a `AddHint`. Los candidatos pasan validación completa, replay y cierre. Las restricciones candidatas todavía pueden ser más fuertes o más débiles que algunas autoridades; cualquier negativo conserva INCONCLUSIVE y cualquier discrepancia canónica impide publicar una solución.

Las variaciones de disponibilidad, duración, recursos, protección adicional y renombrado/desplazamiento temporal pasan. El event loop permanece responsive; cancelación y falta de dependencia son INCONCLUSIVE. OR-Tools 9.15.6755 sólo se instaló en un venv bajo `work/`; no se conoce la viabilidad de despliegue del backend productivo. Una integración futura necesitaría un gate explícito, fallback al motor actual y accounting operativo propio verificable, sin conceder otro ledger oculto.

**ASST-010:** S1 y refresh están demostrados en la Evidence anterior. El nuevo generador no produce witness completo protegido, por lo que no supera B3 y no se conecta a `TASK_IDS:[10015]`. El primer bloqueo de esta prueba es la ausencia de candidato en el límite de 30 s. S2 continúa sin propuesta certificada; AcceptedException/provenance/rollback/redo/divergencia siguen NOT_REACHED en el recorrido auténtico. No se repite un ensayo especulativo de 300 s.

## Prioridad operativa hasta la presentación

1. **Imprescindible:** confirmar referencia de un proyecto Supabase independiente. Importador y SQL están listos para revisión; no hay escrituras remotas.
2. **Imprescindible:** preparar schema sin datos, aplicar 088 solo al destino aprobado, cargar la jornada vacía, crear usuarios de demo y verificar igualdad canónica con `demo:a2:verify-database`.
3. **Imprescindible:** el usuario actualiza y publica Replit desde GitHub; ensayar la UI real con diez propuestas/validaciones/aceptaciones, recarga y acceso desde el ordenador del amigo. El botón de sugerencia evita la selección manual de cientos de tareas.
4. **Respaldo:** reproducción/capturas y guion de 6–7 minutos. La ejecución viva tarda aproximadamente dos minutos más interacción; preparar también una jornada ya ensayada, identificada correctamente.
5. **Puede esperar:** S2, comparación homogénea con humano y optimización de esperas. Próxima prueba global–local acotada, con gate pequeño antes del canon completo.

La demo se entrega apilada sobre #1104 y el experimento CP-SAT se publica aparte. Ningún PR se fusiona. URLs, HEAD y CI se completan en `DELIVERY-STATUS.md`.
