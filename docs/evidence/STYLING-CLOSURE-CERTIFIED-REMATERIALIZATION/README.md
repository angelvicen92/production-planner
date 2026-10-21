# Cierre temprano certificado: Estilismo salida y OUT

Base `78fc59b2e980ec3d86a27eaef95e5c77d3035f93`, `main` con #1165 integrado. Autoridades: AGENTS.md; Fuentes oficiales 00 v2.13, 03 v3.7, 05 v2.7, 06 v2.10 §7.7.3 y 07 v2.2 §4.4; catálogo de capacidades; Evidence causal #1164 y rematerialización de entrada #1165. No se modifican las Fuentes.

## Gate causal anterior — Fuente 07 §4.4

1. **Estado recibido.** A2 completo de 266 obligaciones. S1 construye `JOINT_COMPLETION`; S2–S11 reciben sus placements todavía efímeros y las ocupaciones realmente aceptadas. IN y entrada aceptados permanecen protegidos. Configuración efectiva, márgenes, comidas y presupuesto son los del snapshot; no se introduce una policy de permanencia global.
2. **Recorrido real.** Recomendador de unidades → request/run → `buildAssistedProblem` → `executeAssistedPlanning` → `executePlannerNext` → `constructExactItinerantPlan` → replay completo en `runExactItinerantPlanSearch` → cierre futuro y validación proyectada → propuesta → apply/validate/accept. En construcción fría se elige la primera terminación completa con prerrequisitos de OUT tardíos. Los replay posteriores conservaban esas horas hasta S11.
3. **Lectura de producción.** Conservar estructura, comidas y decisiones aceptadas es correcto. Un horario terminal todavía efímero puede reconsiderarse antes de aceptar `PARTICIPANT_CLOSURE`. Adelantar únicamente salida desplaza la espera hasta OUT; no libera al participante.
4. **Primera decisión causal.** El retorno del replay, después de certificar el incumbent, proyectaba literalmente el cierre nominal. #1164 prueba una alternativa completa C03 14:45/14:50 que conserva las otras obligaciones. El fallo es una oportunidad no intentada; no demuestra una poda incorrecta ni inviabilidad.
5. **Comparación.** Se usa el `main` vigente, con la apertura de #1165. La Evidence #1164 se mantiene como historia y contrafactual separado. El benchmark legado llamado Full A2 de construcción fría no sustituye el resultado Assisted actual.
6. **Clasificación.** Optimización nominal local ausente. No se cambia configuración, severidad, geometría, matching del flujo principal ni búsqueda fría para alcanzar la referencia.
7. **Hipótesis falsable.** X, el cierre nominal tardío, es causado por Y, el retorno literal del certificado y la primera terminación anterior, y produce Z, espera terminal y permanencia innecesarias. W, reconsiderar conjuntamente sólo el cierre editable con las autoridades existentes, debe producir M, salidas anteriores con 266/266, once Stages, decisiones ajenas intactas y coste contabilizado. Una pérdida de cobertura, una tarea ajena modificada o un replay inválido refutaría el cambio.

## Delta y límites

Se reutiliza el punto de materialización de #1165. El nombre interno `nominalTaskIds` refleja que ya transportaba todos los IDs explícitos del scope. La entrada conserva su implementación. `earlyClosureMaterialization.ts` selecciona las salidas auxiliares por la frontera terminal que ya define `PreparedFutureCollectiveParticipantClosure`, y los OUT explícitos de la policy. Sólo se consideran IDs visibles y no protegidos.

Hay **una alternativa conjunta**, sin otra capa de búsqueda. Las demás tareas, comidas, preparaciones, recursos y assignments se conservan literalmente. En un problema efímero se limita el final admisible de cada vértice editable a su final anterior: ninguna salida ni OUT puede retrasarse. La autoridad existente calcula un matching temprano de los cierres; se reutiliza su preparación del contexto fijo para evitar recalcularlo para cada slot. El agrupador existente materializa OUT ordenando por liberación efectiva, buscando el target y respetando mínimos, máximos y separación entre inicios. No se crea una parrilla ni se congela la composición de los grupos todavía editables.

Los transportes que permanecen en contexto se conservan mediante `preserveFixedTransportDirections`, ya existente. Esto evita expandir otra vez una dirección completa con miembros protegidos. La validación final sigue comprobando conjuntamente todos los grupos, incluida la cardinalidad simultánea. En geometrías no representables o cuando esta alternativa falla, se conserva el incumbent; no se declara imposible el problema ni se abre una búsqueda global.

El matching y ambos usos del agrupador consumen el mismo ledger. Se añade únicamente una callback optativa de consumo al camino de matching de intervalos de transporte, que antes no recibía el callback de fallback. Sólo la pasada nominal la activa; cada estado comprueba presupuesto y checkpoint. La construcción fría conserva su ordering y accounting. Los dominios y el candidato también se cobran. Replay y cierre cobran sus vértices por las autoridades existentes.

El candidato debe adelantar al menos un OUT y no retrasar ningún vértice. Después se firma con `fingerprintJointCompletionWitness`, pasa `revalidateJointCompletionWitness` contra el problema completo, cierre futuro `CERTIFY` y la validación de la proyección de producto. Un rechazo, presupuesto agotado o timeout devuelve el último certificado completo válido, también si todavía es el original. La propuesta no acepta supporting ni concede protección; sólo la aceptación del Stage lo hace.

## Resultado y gate causal posterior

Los valores verificables están en [report.json](report.json), [participants.csv](participants.csv) y [candidate-witness.json](candidate-witness.json). El verificador exige igualdad profunda de dos ejecuciones salvo `iterations[*].durationMs`, snapshots idénticos, S1–S10 literalmente iguales al baseline, preservación de todas las decisiones aceptadas, de IN/entrada y de las tareas ajenas al cierre. Revalida independientemente el certificado completo de los once Stages y la proyección manual final.

El primer cambio aparece al materializar S11. Se conserva 266/266, once Stages y cero nuevas HARD/REQUIRED. C03 alcanza salida **14:45** y OUT **14:50** también en el A2 completo vigente: permanencia **515 → 355 min**. Se reproduce por tanto la referencia #1164 sin atribuir sus horas a una regla del motor. La permanencia agregada pasa de **9180 a 8465 min (−715)**; quince participantes salen antes y ninguno empeora. La espera terminal bruta pasa de **1075 a 360 min**. No se modifica el cierre global de 19:00.

La contabilidad total pasa de **26197 a 27049 ramas (+852; +3,25%)**, dentro de las mismas 100000 por Stage. S1–S10 conservan todo su accounting. El informe contiene tiempos por Stage y repetición; los tiempos bajo carga concurrente se distinguen de la comparación final. Los fingerprints cambian por las horas terminales, y coinciden entre repeticiones del candidato.

| Medición secuencial | main | Candidato | Repetición |
|---|---:|---:|---:|
| A2 completo | 84,365 s | 98,937 s | 92,329 s |
| S1 (mismas decisiones y ramas) | 82,057 s | 92,499 s | 86,471 s |
| S11 | 0,150 s | 3,815 s | 3,619 s |

La certificación nominal añade aproximadamente **3,5–3,7 s en S11**; no se presenta como una aceleración. Los totales observados aumentan y su diferencia se concentra principalmente en S1, cuyo árbol y resultado se conservan literalmente y cuyo tiempo varía entre runs. Estas muestras no prueban igualdad de tiempo de CPU. Los once Stages siguen dentro del objetivo interactivo de dos minutos por Stage y del techo vigente, sin ampliar presupuesto. La decisión de aceptación debe considerar el coste de certificación junto con los 715 minutos de permanencia reducidos.

En #1164 se registraron 24983 ramas y 87,078/75,051 s, con fingerprint de producto `b9df8795…`; su runtime usaba otra versión de tsx y se conserva esa limitación. Su contrafactual de cierre de una sola persona consigue 9020 minutos agregados, frente a 8465 de esta pasada conjunta. Los hashes completos, las métricas individuales y los dos tipos de fingerprint (producto/certificado) figuran en el informe; no se mezclan sus ledgers offline con el del motor.

La Evidence posterior confirma la hipótesis en su frontera causal: el certificado inicial era válido, las obligaciones productivas no cambian, y la pasada nominal introduce los adelantos antes de proteger S11. No se desplaza un blocker ni se compra cobertura relajando reglas. Los casos no soportados conservan la solución previa y su extensibilidad demostrada.

## Calidad y robustez

Se miden permanencia individual/agregada, espera bruta antes de salida y entre salida/OUT, y margen observado/requerido/holgura desde la obligación anterior. La espera terminal bruta incluye márgenes y no se presenta como una descomposición completa de espera evitable. Se conserva la comparación individual con #1164 y su contrafactual de un solo participante.

C03 consume la holgura Croma→salida: gap **165 → 5 min**, sobre un mínimo de 5; holgura **160 → 0**. Así, un pequeño retraso en Croma puede exigir reparar el cierre. Las comidas y el certificado futuro siguen pasando; esto no implica igual capacidad de absorción de retrasos. Sobre las 19 fronteras de tarea previa→salida, la mediana de holgura pasa de 25 a 0 min; las fronteras con margen sobrante cero pasan de 1 a 11. No se inventa un umbral HARD de robustez ni se declara superioridad Pareto/P10 completo. La cantidad de trabajo de Estilismo permanece en 285 minutos; no se persigue su compactación visual.

## Reproducción y alcance de las pruebas

```sh
bash docs/evidence/STYLING-CLOSURE-CERTIFIED-REMATERIALIZATION/reproduce.sh /tmp/closure-reproduction
```

El script exporta la base exacta a un checkout temporal, reutiliza las dependencias fijadas, ejecuta baseline y dos candidatos, y valida decisiones, certificados, proyección, hashes y determinismo. No sobrescribe Evidence histórica.

El benchmark de captura es **offline**, con servicios request/run/apply/validate/accept y persistencia en memoria. Las integraciones descartables de PostgreSQL/Auth/PostgREST/HTTP/Chromium se documentan aparte en [validation.md](validation.md); no se presentan como una prueba de Supabase conectado, Replit publicado o datos productivos. Se conservan sólo informes públicos de esos ensayos, nunca logs privados ni credenciales.

La pasada nominal es deliberadamente acotada al matching existente. Puede abstenerse ante geometrías no representables o una primera alternativa que rompe otra autoridad REQUIRED; no enumera todos los matchings ni garantiza un óptimo de permanencia. Las horas humanas, IDs y espacios A2 no aparecen en lógica productiva. No se cambia Main, IN, entrada aceptada, presupuestos, timeouts, SQL/RLS, API, UI ni código de estados visuales. No se hace merge ni despliegue.
