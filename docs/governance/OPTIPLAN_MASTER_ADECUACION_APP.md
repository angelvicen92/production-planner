# OptiPlan — Documento maestro de adecuación integral de la aplicación

**Naturaleza:** documento vivo de visión, decisiones, brechas, seguimiento y continuidad. **No es una Fuente oficial 00–07** ni autoriza despliegues.  
**Corte inicial:** 21/10/2026. **Repositorio:** https://github.com/angelvicen92/production-planner  
**Principio rector:** **la producción tiene que salir**.

## GATE P0 DE COMPOSICIÓN TRANSVERSAL Y AVANCE INTEGRADO — decisión permanente de Producción (27/10/2026)

**Aplicación obligatoria en cada chat nuevo, antes de cada prompt de Codex y en cada revisión/merge que afecte Planner/Assisted.** Esta decisión operacionaliza sin sustituir las Fuentes 01 (configuración antes que hardcode), 03 (unidades y construcción), 04 (contratos efectivos tipados y Stage) y 07 §4.4 (auditoría causal y control de rumbo). La última versión oficial de cada Fuente prevalece. `main`, CI y Evidence determinan el estado dinámico.

**Problema histórico a impedir:** las capacidades pueden pasar sus tests y crear Stages por separado mientras el producto rechaza su coexistencia mediante guards amplios. Las iteraciones U00u–U00y demostraron progreso local, pero el conjunto aún no certifica una jornada A2 introducida totalmente desde UI. El nombre «Reality» no origina la regla; el riesgo real es una arquitectura fragmentada por familias y exclusiones globales no justificadas.

**Reglas de decisión para ChatGPT y Codex:**

1. **Objetivo operativo y transversal.** Construir, desde UI y sin scripts de importación ni horas humanas, cualquier jornada factible dentro de contratos soportados. Aplicar el mismo contrato a tareas y departamentos distintos cuando sus requisitos efectivos sean equivalentes. Unidad/agenda itinerante, ocupación física y herencia de recursos son autoridades ortogonales: no convertir nombres, categorías o localizaciones en reglas especiales.
2. **Matriz viva de composición.** Antes de elegir el siguiente PR, reconstruir desde `main` una matriz «capacidad × capacidad»: `PRODUCTIVE_COMPOSED` (Stage y futuro certificado), `PRODUCTIVE_ISOLATED` (sólo individual), `UNSUPPORTED_EXPLICIT` (primer guard conocido), `CONSUMER_DEFECT` (contrafactual real), `PHYSICALLY_INFEASIBLE` o `NOT_TESTED`. No elevar una familia a «general» por dos ejemplos aislados. Registrar el inventario de tareas/obligaciones cubiertas y la primera intersección A2 que sigue impidiendo la jornada completa.
3. **Caso integrado creciente, sin seed.** Mantener/actualizar en Evidence una jornada representativa creada mediante UI/API real con participantes, espacios, recursos y autoridades múltiples. Añadir capacidades sobre el mismo perfil lógico en pruebas descartables y llevarla hasta propuesta → Draft → Stage(s) → continuación cuando el modelo lo permita. El conteo de obligaciones efectivamente representadas, la primera incompatibilidad y la extensibilidad deben ser explícitos. No copiar horarios del A2, no importar fixture como sustituto; conservar por separado la regresión canónica A2 266/266 y controles no A2 con topología distinta. No ejecutar la suite completa en cada diagnóstico: tests focales primero, gate proporcional en merge.
4. **Puerta causal antes de ampliar.** Identificar primer fallo con `input → configuración/guard → preflight → scope → geometría → matching → Future Feasibility → materialización → Stage/SQL`; clasificar si es contrato no representable, inviabilidad real, pérdida del consumidor o agotamiento. Comparar con el baseline. Sólo introducir un delta que altere causalmente ese fallo y tenga evidencia objetiva. Preferir extender/simplificar autoridades y validadores existentes antes de añadir editores, funciones, migraciones o capas nuevas.
5. **Guardias temporales honestas.** Un `UNSUPPORTED` conservador puede proteger integridad mientras falte Evidence, pero no es una limitación de negocio permanente. Prohibido un rechazo global por mera presencia de tareas con equipo itinerante, estructura conjunta u otra familia **sin** justificar la incompatibilidad sobre el scope/miembros afectados y sin registrar las combinaciones válidas excluidas. No retirar un guard sólo para pasar el test: exigir contrafactual físico y certificado SQL/Stage. Nunca introducir hardcodes de nombres, IDs de A2 o topologías de un solo día.
6. **Criterio de cierre y de parada.** Un PR que añade una capacidad nueva debe verificar su recorrido individual **y**, cuando sea materialmente representable, al menos una convivencia con capacidades previas sobre un Stage real; si el cruce sigue bloqueado, declarar PARTIAL y la primera barrera, no inventar integración. Si dos PR consecutivos sólo cambian la primera barrera sin aumentar composición, **parar desarrollo de funcionalidades y auditar la arquitectura/complejidad**. La solución seguirá siendo **una unidad lógica causal por PR**, no un rediseño masivo ni un rule engine opaco.
7. **Priorizar por producto y coste total.** Ordenar próximos deltas según cuántas obligaciones y combinaciones A2 **configurables desde UI** desbloquean, valor fuera de A2, riesgo, complejidad y coste en Codex. No medir éxito por número de merges, ramas, tests verdes o benchmark importado. Elegir Medium/High normalmente; reservar razonamiento máximo para una dificultad causal real, no por hábito.

**Formato mínimo de cierre de cada PR funcional:** `antes → primer blocker → delta causal → matriz de composición antes/después → jornada integrada UI y Stages → regresión A2 separada → límites/complexidad neta → próxima frontera`. Si todavía no se demuestra el cruce, el siguiente paso puede ser un diagnóstico focal; no encadenar por reflejo más guards o productores.

**Orden de arranque de todo nuevo chat:** consultar este gate y `AGENTS.md` junto con Fuentes 00/07; reconstruir `main`, PR, CI, Evidence y matriz de composición antes de recomendar trabajos. Una fotografía histórica de este documento no sustituye GitHub actual.

### P0-U00z — candidato: descansos operativos genéricos (27/10/2026)

Sobre U00y integrado `ade9fd65`, el [PR #1204](https://github.com/angelvicen92/production-planner/pull/1204) incorpora autoría diaria versionada de pausas por listas explícitas de recursos físicos y espacios. La unidad diaria sólo facilita resolver miembros; no infiere otra comida. La [Evidence U00z](../evidence/p0-u00z/README.md) separa rechazo previo del productor, contrafactuales en memoria y fronteras localizadas del consumidor. Certifica plató de varios espacios con una pausa común, dos unidades independientes y miembros recompuestos, separación de ubicación visual/ocupación, Main/Vocal, operaciones conjuntas y comidas individuales con witness global, Stages parciales, continuación protegida y reconstrucción fría. Reutiliza el contrato y solver existentes, el writer v5, CAS y revisiones. 121 es incremental, sin modificar 001–120 ni aplicar nada a Supabase real. Familia global PARTIAL por composición pendiente con rondas, cadenas, setups, transporte y anclajes. El A2 importado conserva dos veces 266/266, 11 Stages, 27.049 ramas y fingerprint canónico; esto no demuestra autoría A2 completa desde UI. La primera frontera general sigue siendo componer las autoridades REQUIRED de Alfombra y su alimentación física. Sin merge ni despliegue; CI y recibos del head final determinan el cierre del candidato.

### P0-U00y — candidato: operaciones conjuntas nativas (27/10/2026)

Sobre U00x integrado `e0403c9`, la [Evidence U00y](../evidence/p0-u00y/README.md) añade autoría diaria versionada de grupos de tareas reales y cierra las pérdidas de visibilidad/futuro demostradas antes del delta. Dos jornadas UI/API hasta Stage: 7/7 standalone y 11/11 con Main/Vocal, grupos de 10/5 minutos, S1 parcial y S2 exacto. Una operación física conserva dos obligaciones individuales. SQL 120 es incremental y sólo se ensaya en PostgreSQL descartable; no aplica 119/120 a Supabase real ni publica Replit. El estado de CI y los recibos finales se verifican en el único PR de la rama `codex/p0-u00y-native-joint-operations`; sin merge automático. PRODUCTIVE para esas combinaciones; familia global PARTIAL por composición con otras estructuras y comidas. La siguiente frontera es diagnosticar la composición REQUIRED de Alfombra, junto a comidas coordinadas y transiciones de coach aún pendientes. A2 manual completo sigue abierto; el benchmark importado no lo sustituye.

### P0-U00x — candidato: composición de Reality nativo (27/10/2026)

El [PR #1202](https://github.com/angelvicen92/production-planner/pull/1202), sobre U00w integrado `cc0b674`, compone las autoridades diarias existentes de anclajes v2 A/B y scopes independientes en tareas disjuntas. La [Evidence U00x](../evidence/p0-u00x/README.md) conserva el 422 previo, contrafactuales de consumidor y dos jornadas hasta Stage: 19/19 y 20/20 con S1 parcial, continuación exacta, witness y consumo físico SQL. 119 es incremental y sólo se ensaya en bases descartables; no se aplica a Supabase real. No hay merge ni despliegue. La CI y los recibos de cierre determinan el estado del candidato. P0/A2 desde UI sigue abierto por operaciones conjuntas, comidas coordinadas, transiciones de coaches, coordinación estructural y `requiresBand`; no se implementan aquí.

> **Orden para un chat nuevo:** antes de proponer trabajo, leer este documento, Fuente 00 y Fuente 07 vigentes, AGENTS.md y las Fuentes especializadas; reconstruir GitHub main/PR/CI/Evidence/benchmark y, si procede, estado Replit/Supabase. Este registro es histórico: autoridad oficial por ámbito y evidencia real del HEAD prevalecen. No pedir información ya accesible.

### Decisión de producción P0-U00e: continuidad y setup (22/10/2026)

Continuidad temporal y agrupación por setup son **dos políticas independientes por espacio**, cada una OFF/PREFERRED/REQUIRED. Continuidad protege ausencia/minimización de huecos; setup REQUIRED prohíbe reentradas, PREFERRED permite regresos penalizados con preparación física hard en cada cambio, y OFF no gobierna agrupaciones. Huecos internos no cambian setup. Fuente 00 v2.14 y Fuentes 01 v5.3, 03 v3.8, 04 v2.8, 05 v2.8 gobiernan. U00e sigue en Draft hasta demostrar motor/UX/Stage real; preservar A2 y despliegue de demo.

## DECISIÓN DE PRODUCTO P0 — JORNADAS NUEVAS REALMENTE PLANIFICABLES (22/10/2026)

**Prioridad absoluta número 1, establecida expresamente por el responsable de producción.** OptiPlan NO tiene como producto «planificar el A2»: debe permitir a producción **crear desde la aplicación cualquier jornada con sus propios participantes, plantillas, tareas y reglas operativas soportadas, y obtener propuestas válidas con Planner Next/Assisted hasta completar todas sus obligaciones factibles, sin código ni JSON preparados para ese día**. El A2 es un benchmark exigente de regresión y calidad, nunca la condición de entrada al motor ni la definición del producto. «Cualquier» describe **cualquier configuración válida dentro de las capacidades declaradas**, no promete solución a restricciones físicamente incompatibles: cuando no haya solución o no se represente un contrato, el sistema debe explicarlo con diagnóstico verificable, nunca inventar una propuesta ni esconder límites de búsqueda.

**Brecha P0 original en el main anterior a #1178 (registro histórico; parcialmente resuelta):** «Crear día» materializa snapshots de plantillas, espacios, recursos y optimización, pero no genera por sí mismo `plans.planner_next_configuration` ni las autoridades estructuradas completas. `buildEngineInput` sólo aplica esa configuración cuando existe; el preflight Planner Next exige explícitamente `searchPolicy`, `searchBudget` y `mainFlow` válidos. Las jornadas A2 configuradas de antemano sí los tienen. Por tanto, **no está validado el recorrido crear día nuevo desde UI → Planner Next → Stages**, aunque crear participantes/tareas y planificar A2 funcionen. Esta brecha prevalece en prioridad sobre otra optimización de horarios A2 o nuevos editores parciales.

**Objetivo de cierre P0:** el flujo normal (no importación, script, SQL manual ni fixture A2) es configurar catálogo y plantillas → **crear una jornada nueva** → crear participantes y tareas/instancias propias o autogeneradas → revisar un **readiness y preflight reales**, con requisitos faltantes legibles y acciones para completarlos → construir `EngineInput` y configuración Next desde autoridades genéricas, con identidad y herencia explícitas → solicitar propuesta Assisted → validarla → aceptar Stage(s) → completar obligaciones factibles; conservar Draft, snapshots, revisión/fingerprint, permisos e historial. La configuración estructural debe poder definirse y reutilizarse desde la app. Un día sin cierto tipo de operación no debe requerir identidades A2 ficticias ni un flujo principal inventado: determinar primero el contrato admitido por el motor/preflight y desarrollar únicamente lo necesario de forma causal.

**Gate de aceptación P0 (no sustituible por tests verdes):** al menos dos escenarios independientes de A2, creados desde cero mediante UI/API real y base descartable, con número diferente de participantes, plantillas/tareas, relaciones, espacios y recursos (uno pequeño y otro con dependencias/equipos o bloques). Comprobar creación → snapshot/revisión → readiness sin falsos READY → `EngineInput`/preflight `SUPPORTED` → propuesta real → Draft → validación → Stages → completitud de todas las obligaciones factibles, con cero infracciones HARD/REQUIRED nuevas, determinismo y coste registrado. Probar también configuración inválida/inviable, error accionable, roles, histórico intacto y segundo día con configuración diferente. La regresión A2 266/266 y 11 Stages es gate adicional, **no prueba suficiente de P0**. No imponer 266, 19 concursantes, cuatro bloques ni actividades especiales a días distintos.

**Orden operativo vigente tras #1175/#1177/#1178:** los tres PR están integrados; **todos los nuevos esfuerzos de desarrollo** se concentran en ampliar P0 para jornadas de distinta topología y reglas soportadas, según diagnóstico causal y gate end-to-end. El primer delta de esa línea requerirá auditoría focal del camino crear día → snapshots → `buildEngineInput` → preflight/adapter → Assisted para identificar la primera autoridad ausente, antes de codificar. No abrir otros frentes de optimización del A2, equipos, rondas o interfaz general hasta demostrar P0 o un prerrequisito causal ineludible. Actualizar esta prioridad al cerrar el gate con Evidence verificable, no por promesas.

---

**P0-U00g — candidato en el mismo PR #1185:** comidas individuales configuradas por ID de plantilla y snapshots diarios, propuestas solo-comidas/mixtas certificadas por la RPC SQL existente y protección de horarios aceptados independiente de la ejecución. Dos jornadas UI/API descartables completan 6/6 en dos Stages y 12/12 en tres, con 19 negativos SQL, ataques a la protección y replay determinista. Las regresiones UI U00a–U00f pasan; A2 aislado conserva 266/266, 11 Stages, 27.049 ramas, 8.465 min de presencia y todos los snapshots/certificados. [Implementación, comparación causal y recibos](../evidence/p0-u00g/implementation/README.md). No implica merge ni publicación; P0 general y la demo servida mantienen sus límites. El estado final de CI se verifica en el head del PR.

**P0-U00h — candidato en PR #1186 sobre U00g integrado (#1185):** la reproducción API en main confirma que byItem ordinario podía pasar preflight sin consumir el recurso. La resolución compartida de identidad diaria se incorpora a la autoridad efectiva existente y a la proyección persistida, con rechazo de ambigüedad/cantidad/capacidad no representable. Dos jornadas API completan 4/4 y 4/4 con ventanas distintas, dependencias, replay y continuación protegida; byType/anyOf y selección genérica de auxiliares/presentador siguen fuera de alcance. [Evidence, negativos y estado de gates](../evidence/p0-u00h/README.md). No declara cierre de P0 general, adopción histórica, merge ni despliegue.

## ESTADO VERIFICADO DE P0 Y DEMO — CORTE 22/10/2026 TRAS PR #1175

- **`main` integrado:** U06c continuidad #1177 → `b9802860`; P0-U00a primeras jornadas nuevas #1178 → `7872b581`; U04a composición física y reconciliación P0 #1175 → `d23861a5`. Los PR #1175, #1177 y #1178 están fusionados. **No volver a solicitarlos ni a tratarlos como pendientes.**
- **P0 demostrado pero NO terminado:** dos jornadas NO A2, creadas mediante UI y stack real descartable (Auth/PostgREST/Chromium), llegan a Stage aceptado con **4/4 y 9/9**, sin HARD/REQUIRED nuevos, 21 y 39 ramas. U04a preserva exactamente sus problemas adaptados, fingerprints de Stage y resultados en días sin equipos itinerantes. Hay composición física genérica reutilizable y continuidad configurable integradas.
- **Límite funcional explícito de P0-U00a:** el primer perfil requiere flujo principal real, preparación vocal previa enlazada y coach asignado. NO soporta aún jornadas sin flujo principal, tareas del perfil consumidoras de equipos itinerantes, transporte, montaje/setup y otras familias estructurales. Un nuevo día con obligaciones añadidas DESPUÉS de S0 cambia la revisión y detiene correctamente un run obsoleto, pero todavía no ofrece reconciliación funcional de Stage/Draft para continuar sin pérdida. No declarar genérico pleno ni simular capacidades faltantes.
- **Candidato P0-U00b (rama `codex/p0-new-day-standalone-no-main-u00b`, base `be5d817c`):** añade `STANDALONE_ONLY`, sin flujo principal ni coach ficticios, reutilizando la continuación standalone del motor. Dos jornadas UI llegan a Stage: auxiliares 6/6 (tres concursantes) y técnicas 3/3 (sin concursantes, recurso compartido). U00a conserva problemas/placements 4/4 y 9/9; A2 conserva 266/266, 11 Stages, 27.049 ramas y 8.465 min. [Evidence y límites](../evidence/p0-u00b/README.md). Es un candidato de esta unidad, no una publicación ni un merge. P0 general sigue abierto. El siguiente bloqueo demostrado continúa siendo la reconciliación de obligaciones añadidas después de S0, con `STALE_CONFIG_REVISION` y Stage/Draft protegidos. No iniciar otra unidad antes de revisar el candidato y su gate.
- **A2 como protección transversal:** baseline vigente repetido tras #1175: **266/266, 11 Stages, 27.049 ramas, 8.465 min, 0 nuevas HARD/REQUIRED**, once snapshots/fingerprints y 22 certificados revalidados sin alteración. Exigir este gate en cada PR P0 que toque materialización/motor.
- **Congelación para demostración del 23/10/2026 a dirección de La Voz:** se conserva la release de demostración, sin publicar Replit, aplicar migraciones productivas ni modificar jornadas A2 reales. La última fotografía operativa previa documentaba deployment `b67c7b94-6a91-462e-9cad-47ed558edddf` y ledger 103; no es una consulta en vivo de esta PR. **Comprobación comunicada por el usuario el 22/10/2026:** la app publicada pasó `Reiniciar Asistida` → `Completar automáticamente` A2. Es una comprobación humana comunicada, no una ejecución instrumentada por U00b; sustituye la petición documental anterior de realizar ese ensayo. No usar reset legacy ni reset de ejecución. Los planes 27001/27002 siguen siendo la salvaguarda visual documentada, sin mutaciones desde esta unidad.
- **Deploy posterior a demo:** leer `docs/operations/OptiPlan_Guia_Replit_Supabase.md` y `script/deploy/optiplan_preparar_release.sh` desde `main`; ejecutar backup fresco verificado, comprobar CI/ledger y aplicar sólo migraciones pendientes en orden y publicar el commit autorizado. Ningún PR verde equivale a código servido en producción.

---

**P0-U00c — candidato en revisión (base U00b #1180 ya integrado, `3bec719`):** incorpora altas posteriores al bootstrap mediante previsualización y confirmación explícita, exclusivamente antes del primer Stage aceptado, con Draft idéntico a S0 y sin propuesta/ejecución/locks protegidos. Una RPC cierra la sesión anterior y reutiliza el bootstrap existente en la misma transacción, manteniendo S0, revisión y replay históricos. La migración 107 captura fuentes completas para demostrar que las tareas existentes siguen intactas: las sesiones históricas sin esa referencia se rechazan explícitamente, sin backfill inferido. [Diseño y Evidence U00c](../evidence/p0-u00c/README.md). P0 general y reconciliación posterior a S1 siguen abiertos. La demo permanece congelada.

**P0-U00d — candidato sobre U00c integrado (#1181, `e8f8927`):** habilita el consumo de composiciones diarias reales en tareas auxiliares/técnicas de los perfiles nuevos. La auditoría UI confirma el rechazo anticipado y tres pérdidas posteriores: miembros de unidades específicas, compatibilidad de técnicas independientes/propiedad de cadenas inferidas con alternativas y recursos declarados en la propuesta persistida. Reutiliza el materializador y las agendas existentes; no cambia budgets ni relaja reglas HARD. Dos días UI completan 4/4 técnicas y 4/4 auxiliares con A/B/C, kit independiente, ventanas y transiciones; los negativos conservan S0/Draft. [Diagnóstico, Evidence y gates](../evidence/p0-u00d/README.md). No habilita MAIN/VOCAL con equipos, otras autoridades estructurales ni adopción histórica; P0 general sigue abierto y la demo continúa congelada.

**P0-U00f — candidato en el mismo PR #1184 (base `72ec8cdc`, diagnóstico `793d4873`):** habilita IN/OUT por identidades estables de plantilla y snapshots existentes en ambos perfiles de jornada nueva. El core standalone vacío deja de entrar al pipeline Main; el fallback frío protegido conserva la política de transporte. Dos jornadas UI reales llegan a Stage con 8/8 y 9/9, parámetros diferentes y seis tareas protegidas intactas. La [Evidence del candidato](../evidence/p0-u00f/README.md) separa diagnóstico histórico, pruebas productivas, negativos, regresiones U00a–U00e y comparación A2/CI. Es candidato pendiente de revisión humana, no capacidad integrada/publicada ni cierre de todo P0. Sin merge, cambios productivos ni publicación de la demo.

## 1. La aplicación que queremos tener

OptiPlan debe convertirse en el **sistema operativo de una jornada de producción audiovisual**, no simplemente en un generador de horarios. Según la Fuente 01, abarca el ciclo completo:

1. **Pre-día:** catálogos y configuración editable; jornada, plantillas, espacios, participantes, recursos, equipos, comidas, descansos, transiciones, coordinación, preparación y permisos.
2. **Planificación Assisted:** propuestas completas y válidas según scope, análisis de alternativas, ajuste humano, Draft, aceptación de Stages y publicación humana de OfficialPlan.
3. **Día en vivo:** hora prevista y realidad, estados y marcas reales, incidencias, respuesta a retrasos, protección de tareas en curso/terminadas, replanificación autorizada, comunicación a equipos.
4. **Centro de Control:** saber qué ocurre, quién está ocupado, próximos riesgos y decisiones necesarias. No ejecutar motores legacy inadvertidamente.
5. **Post-día y mejora continua:** comparar previsto/real, medir duraciones, capacidad, esperas, incidencias y fiabilidad, detectar patrones y producir **conclusiones y acciones de mejora**.

**Decisión expresa del responsable:** «No quiero que solo planifique automáticamente; quiero aprovechar el dato digital para sacar informes, conclusiones y acciones de mejora». También debe poder **dar de alta o cambiar cualquier actividad, plató, equipo y política desde la app**, sin pagar nuevos desarrollos por particularidades operativas.

**Orden de producto:** la Fuente 01 prioriza el MVP de preparación, Assisted, ejecución y vistas operativas. Informes avanzados, analítica predictiva y planificación multi-día no deben retrasarlo; la captura rigurosa de datos sí es requisito de base.

## 2. Autoridad y cinco estados distintos

**Normas:** Fuente 00 e índice del corpus oficial 01–07 en docs/source/official/; los dos PDFs A2 son referencia humana subordinada a interpretaciones/correcciones de Fuente 06, nunca seed, hint o lock. **Código:** main. **Validación:** CI, tests, Evidence y benchmarks del mismo head/configuración. **Producción real:** ledger/esquema de Supabase y artefacto publicado de Replit. Este archivo, AGENTS.md y auditorías son guías, no una Fuente 08.

| Hito | Evidencia |
|---|---|
| DEFINIDA | Contrato en Fuente oficial o decisión humana explícita pendiente de consolidación normativa. |
| IMPLEMENTADA | Código integrado en main; un PR creado no cuenta. |
| VALIDADA | Tests/CI/Evidence representativos del commit, con comparación baseline. |
| PUBLICADA | Migraciones aplicadas y commit publicado realmente verificado; Replit success aislado no basta. |
| OPERATIVA | Recorrido de usuario/rol probado en la aplicación pública sin escrituras destructivas en jornadas históricas. |

**Reglas:** PR creado ≠ aprobado; verde ≠ operativo u óptimo; mergeado ≠ desplegado; selector visible ≠ capacidad configurada/productiva. Conservar siempre alcance y fecha de la prueba.

## 3. No hardcodes: cada singularidad A2 debe ser un parámetro

**Decisión permanente del responsable:** particularidades como continuidad de Estilismo, minutos de cambio de micro en Totales, paquetes de transporte, comida de un plató o composición de un equipo NO se codifican según el nombre, tipo, ID o color del A2. Deben ser **datos estructurados editables en la app**, gobernados por contratos genéricos. Una nueva jornada o plató puede cambiar esas reglas sin Codex. Se mantienen invariantes reales HARD del dominio, seguridad y validación; no se construye un lenguaje opaco universal de reglas.

**Cadena obligatoria de una capacidad PRODUCTIVA:** catálogo general / plantilla → snapshot del día → override de día o instancia → autorización/API/persistencia/revisión/provenance/fingerprint → EngineInput/preflight → motor → validador y Evidence → propuesta/Draft/Stage/replay → prueba de sensibilidad en UI real. Null/heredado NO equivale a 0 explícito. El cambio general posterior no modifica silenciosamente días históricos. EDIT, RESTORE y REFRESH tienen funciones distintas.

### 3.1 Continuidad y agrupación

El jefe de producción debe poder indicar, cuando el contrato lo admita, **sin continuidad / agrupación preferida / continuidad requerida**, precisando **qué grupo de actividades, espacio, unidad o recurso** queda sometido a esa política. No equivale a poner un booleano aislado sobre cada tarea.

- **Estilismo A2:** mismo espacio de capacidad HARD=1, **sin continuidad requerida**. Las entradas y salidas pueden intercalarse; no introducir hueco-penalty sin Fuente.
- **Flujo principal:** bloques, continuidad y preferencia separada de cantidad/reparto SOFT; la continuidad REQUIRED no se convierte en simple preferencia.
- **Setups por familia, cadenas técnicas, operaciones conjuntas/ancladas, recursos itinerantes y concentración de presencia:** contratos distintos que requieren editores y autoridades específicas.
- **PREFERRED/OFF/REQUIRED** describe opciones deseadas únicamente allí donde el contrato de la familia las admite; no inventar opciones o severidades sin formalización normativa.

**Estado:** existen contratos Next, pero NO un editor general→día→motor completo para todas esas políticas. El control heredado «Máximo cambios de tarea (agrupación)» en ajustes de plató no certifica continuidad Next. Referencias: docs/audit/configuration-p1/, shared/configurability.ts, Fuente 04 y U06.

### 3.2 Los cinco minutos de Totales no son código especial

El A2 humano muestra **5 min para cambio de microfonía entre rondas Totales**. Planner Next tiene **roundSynchronizations** y la propiedad **preparationMinutesBetweenRounds** por carril; el valor debe venir de configuración del A2, nunca del nombre «Totales». **Gap:** editor completo desde la app para seleccionar carriles/espacios/tareas elegibles, sincronización, preparación, severidad, origen y override del día, con persistencia y prueba end-to-end. Debe funcionar igual con otro número y otros espacios.

No mezclar:

- **Margen de participante:** default general/día y before/after por plantilla/instancia. Entre A→B se usa el mayor de los overrides explícitos presentes; sin ellos, default. Un cero explícito sustituye el default, no se suman valores.
- **Preparación/cambio de setup entre actividades o rondas:** ocupación derivada de las entidades configuradas, no falsa duración productiva.
- **Hold posterior de tarea:** bloqueo propio de espacio, participante o recursos, duración y severidad; contrato Fuente 04, superficie parcial.
- **Transición de coach/recurso/equipo:** distinta de margen de participante.
- **Comida/descanso:** duración, ventana, entidad/ámbito y validación separados; no comida global ficticia ni doble contabilidad.
- **Coordinación multi-espacio:** compartir zona no fusiona espacios ni supone sincronización.

### 3.3 Catálogos y operaciones futuras

Deben ser gestionables desde UI, con valor general, snapshot, excepciones y pruebas:

- IN/OUT: minimumGroupSize y maximumGroupSize **HARD**, targetGroupSize **PREFERRED**, minGapMinutes entre **inicios** de grupos, no parrilla fija; capacidad del vehículo independiente del máximo de grupo.
- Espacios/platós: capacidad, exclusividad, ocupación física/no física, ventanas, asignaciones y coordinación. blocksSpace=false no significa capacidad genérica mayor que 1.
- Recursos y equipos: necesidades exactas vs alternativas autorizadas, composición real de unidades itinerantes, disponibilidad, desplazamientos y recursos compartidos, sin sustitución por nombre.
- Plantillas: duración, zona/espacio, roles, dependencias, márgenes, recursos, setups y reglas aplicables, sin pérdida al guardar/crear.
- Estructuras: sincronización de rondas, cadenas técnicas de fases parcialmente ordenadas, anclajes y agrupación por familias, sin imponer el orden del PDF humano.
- Optimización: sólo controles con consumidor demostrado de Planner Next; no sliders legacy sin efecto real.

**Prueba de salida:** editar la regla desde una pantalla autorizada, guardar/reabrir, crear un día nuevo, construir propuesta/validación/Stage y demostrar resultado diferencial con **otra tarea u otro plató creados desde la app**, sin código nuevo, manteniendo históricos/protecciones y permisos.

## 4. Planner/Assisted: 266/266 es un comienzo, no la meta completa

Producto oficial: **WorkingPlan → PlanningScope → ScopeProposal → Draft editable → validación → Stage aceptado/protegido → publicación humana OfficialPlan**. El motor propone; no publica ni escribe la decisión humana automáticamente. AutomaticProtection no es lock. AcceptedException no desactiva una regla HARD/REQUIRED ni permite falsear hardValid.

**Benchmark A2:** 19 participantes, 266 obligaciones canónicas, completitud Assisted demostrada en **11 Stages**. Los PDFs humanos son referencia de viabilidad/calidad y no se copian como horarios. Completitud no significa mínimo de permanencia, buena distribución, robustez general o parametrización completa para cualquier producción.

### Lecciones causales y mejoras

- **PR #1164 (auditoría):** algunas horas nominales de Estilismo entrada eran heredadas del witness conjunto S1 y quedaban protegidas luego sin reconsideración. Contrafactual C03 **11:25→09:10**, válido 266/266 sin mover otras tareas, demostrando alternativa no intentada, no poda errónea.
- **PR #1165 (motor):** rematerialización temprana certificada antes de aceptar apertura. Evidence: **cuatro entradas adelantadas; −320 min de espera agregada IN→Estilismo; 266/266; 11 Stages; +1.214 ramas (+4,86 %) contabilizadas**. Fusionado con CI completa.
- **IN:** construir grupos tempranos desde el primer inicio HARD-válido para proteger libertad futura. Canon A2 target 3, máximo 3 y gap 30; NO hacer del target 3 un mínimo HARD.
- **Salida:** contrafactual de C03 demuestra Estilismo salida **17:25→14:45** y OUT **17:30→14:50**, presencia **515→355 min** con 266/266. Adelantar sólo Estilismo sin OUT no libera al participante. **Este contrafactual no acredita aún una implementación productiva del cierre en main.**

### Aclaración operativa expresa sobre posibles retrasos

**No retener artificialmente un participante al final por un riesgo abstracto de retrasos.** Los márgenes y descansos autorizados proporcionan flexibilidad; el jefe adelanta o retrasa trabajo durante la ejecución y registra hechos e incidencias. La salida de Estilismo debe ir pronto tras obligaciones; OUT debe respetar su configuración de grupos/disponibilidad/ventanas. **Medir holgura está bien; inventar un HARD o penalización por «robustez» que retrasaría Estilismo salida NO está autorizado.** La preferencia de permanencia y sus tradeoffs se evalúan con las Fuentes reales.

### Gate causal ineludible Fuente 07 §4.4

Después de cada PR, benchmark o cambio material del Planner/Assisted, y siempre antes de otro prompt Codex, reconstruir estado de entrada/protegidos/scope, arquitectura/geometría, matching/materialización y supporting, Future Feasibility/validación, ramas/poda/backtracking/agotamiento, y decisión donde se perdió una alternativa. Contrastar producción y código, baseline/configuración exactos, regresión vs validación más correcta vs agotamiento. Sólo implementar al poder formular: **«X ocurre por Y y produce Z; W debe cambiarlo y esperamos M»**. Si no se demuestra, diagnóstico focal. No subir budgets/timeouts por reflejo.

## 5. Ejecución real y gestión de desviaciones

**Estados oficiales:** pending, in_progress, done, interrupted, cancelled. Mostrar planificado frente a real sin inferir estados por reloj. Start/Finish/Interrupt y correcciones autorizadas necesitan trazabilidad, permisos y datos fiables; producción manda sobre el horario inicial.

- Jefe de producción puede iniciar antes/después, terminar, interrumpir y reaccionar a imprevistos. Replanning conserva done/in_progress, Stages, locks y ocupaciones; sólo mueve tareas permitidas, sin reescribir historia.
- En planning por concursantes, espacios y recursos, tarjetas horizontales, verticales, listas y móvil, los **cinco estados** han de ser visualmente claros y accesibles, sin depender exclusivamente del color ni borrar el color original de la actividad.
- **Reset de ejecución masivo ADMIN (PR #1162):** atómico, auditado, preserva planning e historial y otras jornadas. **No confundir** con reinicio de Assisted.
- **Reset de planning/Assisted:** necesidad futura distinta, con análisis de Draft/Stages/sesiones/rollback/redo, tareas en curso/completadas, locks y seguridad. No resolver mediante DELETE masivo ni ocultando un historial.
- Control Room, Mi Día, War Room y Planning deben reflejar estados coherentes, distinguiendo datos stale/offline.

### Botón heredado y error de cancelación observados por el usuario

En el Centro de Control, **Generar/Recalcular** llamaba a **useGeneratePlan({mode: full})**, motor legacy, y el usuario observó una ejecución larga que fallaba al intentar cancelar. **PR #1166** cambia **sólo el botón del dashboard** por «Abrir planning» y navega a la pestaña **tab=planning** del plan seleccionado; elimina esa invocación legacy en dicha pantalla.

**No inferir** que el PR repara la cancelación legacy en todo el producto, ni que retira los motores heredados de otras pantallas. Es una corrección de ruta UI localizada que debe validarse y publicarse.

## 6. Datos de ejecución, estadísticas e informes para mejora continua

El objetivo explícito es **usar la verdad digital para adoptar mejores decisiones**: comparar horas y duraciones previstas/realizadas, localizar demoras recurrentes, detectar cuellos y cambiar reglas/plantillas. La Fuente 01 exige registrar bien primero y construir métricas después.

| Indicador a construir/verificar | Decisión que debería facilitar |
|---|---|
| Duración por plantilla y operación | Actualizar duraciones y preparación de tareas sistemáticamente subestimadas. |
| Inicio y fin previsto vs real | Cuánto se adelanta/retrasa, qué retraso se absorbe y cuál se propaga. |
| Utilización por espacio/plató | Tiempo productivo, parado, bloqueado, setups, espera, continuidad. |
| Equipo/recurso/coach | Saturación, cambios de ubicación, esperas e infrautilización. |
| Concursante | Presencia, esperas terminales, huecos, salida efectiva. |
| Fiabilidad del plan | % tareas en hora, replanificaciones, locks, tareas no realizadas. |
| Incidencias recurrentes | Causas por tipo/espacio/recurso/franja y propuestas de acción. |
| Comparación entre jornadas/configuraciones | Comprobar qué cambio produjo una mejora, con revision/fingerprint. |

Conservar identidad, plan previsto original, revisiones del planning, ejecución real, correcciones, causas, incidencias y configuración efectiva; explicar sesgos y no atribuir injustamente fallos a personas. Después: informes por rol, conclusiones, medidas propuestas, responsable de acción y seguimiento.

**Estado:** contratos oficiales y eventos de ejecución sí; **la disponibilidad funcional de informes avanzados no está certificada** en el producto publicado. Auditar cobertura/integridad del dato antes de otro dashboard. La analítica predictiva no debe bloquear MVP.

## 7. Brechas reales documentadas de autoconfigurabilidad

La auditoría **docs/audit/configuration-p1/** inspeccionó 27 capacidades: 3 PRODUCTIVE, 15 PARTIAL, 3 MISSING, 5 BLOCKED, 1 NOT_APPLICABLE a 15/10; es **un corte histórico** y algunas descripciones del registry ya eran antiguas. Contrastar cada hallazgo con HEAD y seguridad live antes de usarlo.

| Área | Existe | Falta |
|---|---|---|
| Continuidad de flujo, Estilismo, concentración | Policies Next y algunas preferencias | Editor tipado por operación/espacio/ámbito y severidad válida, general→día→motor. |
| Totales y cambio de micro | roundSynchronizations, preparationMinutesBetweenRounds | Editor de rondas/carriles/duración/elegibilidad/provenance. |
| Plantillas y dependencias | Catálogo, snapshots, APIs parciales | Guardado completo de márgenes/alta y dependencias inversas atómicas. |
| Seguridad plantillas | Auth y rutas | Reverificar alias real **PATCH /api/ta/:id** frente a mapa de roles; auditar matriz autorizada antes de nuevos editores. |
| Equipos itinerantes y recursos | Catálogos, snapshots, opciones de Next | Editor de miembros, alternativas, disponibilidad, identidad/reconciliación. |
| Espacios y capacidad | Jerarquía, disponibilidad parcial, blocksSpace | Editor/contrato genérico de capacidad y ventanas, prueba de representabilidad. |
| Setups, anclajes, cadenas y sincronía | Contratos y validadores Next | Edición reutilizable lossless por familia, Stage/replay. |
| Comidas, transiciones, holds, presencia | Resolvers parciales | Reglas efectivas por ámbito y edición productiva. |
| IN/OUT | Mín/máx/target/gap por dirección | General/día completo y capacidad de vehículo independiente. |
| Controles de optimización | Algunos Next; sliders legacy | Quitar falsas promesas: enseñar sólo consumidores y preferencias efectivos. |
| Post-día | Estados/eventos, Fuentes | Datos fiables, KPIs verificables, informes y mejora continua. |

Unidades ya identificadas: **U02** plantillas/márgenes, **U03a** permisos, **U06** coordinación en subunidades, **U07/U08** ventanas, comidas y transiciones, **U09** transporte, **U05** fidelidad de UI y **U12** capacidades no representables. No construir un framework universal ni mezclar todos los gaps en un PR.

## 8. PR y trabajos paralelos (fotografía 21/10/2026)

**HEAD main observado:** 78fc59b2e980ec3d86a27eaef95e5c77d3035f93. Verificar en cada chat.

| Trabajo | PR / rama | Situación al corte |
|---|---|---|
| Reset masivo ADMIN **de ejecución** | #1162 | **MERGED**, migración 101 pendiente de aplicar/publicar. |
| Diálogos propios UI | #1163 | **MERGED** tras varias iteraciones y CI integral. |
| Auditoría causal de Estilismo | #1164 | **MERGED**; Evidence contrafactual. |
| Rematerialización Estilismo entrada | #1165 | **MERGED**, 266/266 y mejora cuantificada. |
| Centro de Control «Abrir planning» | #1166 | **ABIERTO, CI en curso al corte**; no merge ni deploy aún. |
| Estilismo salida + OUT | codex/early-styling-exit-out-certification | Prompt enviado en hilo nuevo; no había PR confirmado. |
| Estados visuales ejecución | codex/execution-planning-status-visuals | Prompt enviado en otro hilo nuevo; no había PR confirmado. |
| Drafts históricos apilados | #1085 / #1104 / #1106 | No dar por válidos ni fusionar sin auditar vigencia. |
| Reset planning/Assisted | — | Objetivo futuro diferente del reset de ejecución. |
| Configuración UI completa | Auditoría P1/U02/U03/U06… | Pendiente por unidades causales. |
| Analítica post-día | Fuente 01 | Objetivo definido, implementación integral no certificada. |

**Gobierno:** como máximo **dos hilos Codex de desarrollo en paralelo**, siempre con unidades independientes; GitHub/ChatGPT puede revisar, documentar o corregir un diff pequeño aparte. Si existe PR, revisión independiente de diff/base/head/CI/Evidence/Fuentes y benchmark. Defecto de misma unidad → **segunda o posteriores iteraciones en el mismo PR/hilo**. Sólo cerrar/fusionar tras gate.

## 9. Publicación real: GitHub, Replit y Supabase son estados distintos

**Verificado al corte:**

- Supabase **planificador_audiovisual**, project ref **dyqusivzgxebkxkwohwn**, ACTIVE_HEALTHY, PostgreSQL 17.6. Última migración **100_data_api_explicit_grants**. **101_admin_bulk_execution_reset no aplicada**; la RPC reset_plan_execution aún no estaba instalada. Lecturas: 7 planes, 1.131 tareas, 104 Stages (sólo fotografía).
- Replit app **Code Architect Tool**: https://code-architect-tool--avmb.replit.app, status **success**; **NO se comprobó SHA real publicado**, por tanto no garantizar que tenga todos los merges.
- El botón legacy se vio en la aplicación por captura; corregir GitHub no actualiza automáticamente el deployment.

**Orden obligatorio, sin improvisar:** revisar **docs/operations/OptiPlan_Guia_Replit_Supabase.md** y **script/deploy/optiplan_preparar_release.sh** de main vigente; autorizar commit con CI/Evidence, generar **backup íntegro PostgreSQL 17 verificable** antes de migrar, comparar ledger, aplicar sólo pendientes por conector, verificar grants/RLS/RPC y contadores, publicar Replit de app existente, comprobar status success **y SHA real + navegación/UI**. No probar escritura destructiva sobre A2 histórico. Codex no migra ni publica.

## 10. Backlog de adecuación y pasos siguientes — orden vigente 22/10/2026

**P0 ABSOLUTO — nueva jornada genérica planificable desde UI hasta Stages.** Rige la decisión inicial de este documento: arreglar el recorrido normal de creación/configuración, readiness veraz, materialización de autoridades Next, propuesta Assisted y aceptación, y demostrarlo en dos días no A2 con tests E2E. Este gate prevalece sobre mejoras incrementales del A2 y sobre nuevos controles que no desbloqueen el recorrido.

**Estado vigente:** U06c #1177, P0-U00a #1178 y U04a #1175 ya están fusionados en `main` (`d23861a5`). La primera pareja de jornadas no A2 está demostrada, pero **P0 general sigue abierto** por límites de perfil, uso itinerante dentro del primer perfil y cambios de tareas después de S0. Avanzar por una sola causa real cada vez, manteniendo el gate A2. El candidato U00b amplía a jornadas sin flujo principal; su Evidence y la congelación de la demo figuran al comienzo de este documento. No tratar el candidato como integrado ni P0 general como cerrado.

**P1 — sólo tras el gate P0:** cerrar sucesivamente otras brechas de configurabilidad tipada detectadas por escenarios nuevos: sincronizaciones, setups, cadenas, comidas, transporte, capacidades físicas y recursos, por unidad causal y según bloqueo demostrado. A2 es baseline de regresión.

**P2 — producción real y replanning:** gestión de ejecución, incidencias, replanificación protegida, control operativo y comunicación.

**P3 — aprendizaje medible:** integridad del dato, informes previstos/reales, KPI y mejora continua.

No promover P1/P2/P3 por tener un PR sencillo ni declarar P0 cumplido por 266/266 A2, un botón funcional, preflight aislado o un demo cargado por SQL. Si el gate P0 encuentra una restricción no representable, registrar causa y alcance; no ocultarla con defaults especiales.

## 11. Definición de terminado para cada capacidad

Registrar en PR/Evidence: **necesidad humana → Fuente/contrato → baseline/call path causal → delta mínimo → prueba de UI/API/DB/configuración/EngineInput/motor/validador/Stage proporcional → protección de historial/locks/tareas reales → CI/benchmark/tiempos/branches/determinismo → resultado operativo → merge → estado publicado**.

Para una nueva opción configurable exigir: valor/origen/autoridad, guarda y recarga, permisos, herencia/restore/refresh, efecto en propuesta y validación, histórico inalterado. Ninguna excepción A2 por ID/nombre.

## 12. Protocolo de continuidad y coste de Codex

1. Leer Fuente 00/07, AGENTS.md y este documento, después 01–06 según ámbito.
2. Consultar main SHA, últimos merges, todos los PR activos/relevantes, ramas reales/head/base, CI, Evidence y benchmark. Nunca pedir al usuario un diff/SHA accesible.
3. P0 primero: verificar el recorrido de creación de días nuevos desde UI a Planner Next/Assisted/Stages y su Evidence; además reconstruir baseline A2 266/266/11 Stages como regresión, con calidad/branches/tiempo y Gate de Fuente 07 §4.4 antes de otra implementación Planner.
4. Contrastar docs/audit/configuration-p1/ con código actual y distinguir editor, motor, validación y despliegue.
5. Cuando afecte a Replit/Supabase, leer runbook/script antes de operaciones; diferenciar status success de versión servida.
6. Mantener dos desarrollos paralelos sólo si son independientes; un PR verde requiere revisión independiente y puede exigir varias iteraciones.
7. **Antes de cada prompt Codex:** verificar rama remota exacta en GitHub y mostrar fuera del bloque **Rama Codex: nombre**; proporcionar **un solo bloque Markdown**, una unidad lógica, validación y modelo/esfuerzo.
8. Acuerdo de créditos: **GPT-6.1 Sol Medio/Alto** para UX/deltas acotados, **Sol Muy alto** para motor/causalidad; **GPT-6 Astra Alto/Muy alto** sólo cuando Evidence demuestre valor suficiente. No usar Astra automáticamente.
9. Explicar hechos, conclusión causal, decisión y siguiente paso; no solicitar permiso reiterado si el avance está claro.
10. Actualizar este documento tras cambios **materiales** de visión, decisión, capability o prioridad, sin duplicar Fuentes. Toda regla nueva debe consolidarse en la Fuente competente mediante Fuente 00.

**Texto para empezar chat nuevo:**

> Continúa OptiPlan desde docs/governance/OPTIPLAN_MASTER_ADECUACION_APP.md y Fuentes 00–07. PRIORIDAD ABSOLUTA P0: crear desde la UI jornadas nuevas con cualquier conjunto válido de participantes, tareas y reglas soportadas y planificarlas con Planner Next/Assisted hasta Stages, sin JSON ni fixtures A2. A2 266/266 es regresión, NO objetivo suficiente. Reconstruye main/PR/CI/Evidence; #1175 U04a, #1177 U06c y #1178 P0-U00a ya están fusionados. No confundas P0-U00a (perfil MAIN+VOCAL+COACH) con configurabilidad general. Audita causalmente crear día → snapshots/config Next → buildInput → preflight → Assisted y demuestra dos jornadas nuevas E2E. Prioriza P0 sobre nuevas mejoras A2; no infieras estados de snapshots históricos.

---

## 13. Decisiones nuevas: acceso por invitación y paralelismo vocal (21/10/2026)

### Acceso de usuarios: autorregistro desactivado

**Decisión expresa de producción:** OptiPlan será de **acceso restringido mediante alta/invitación administrativa**; no ofrecer el autorregistro público como vía operativa. Se ha observado en Supabase Auth que «Allow new users to sign up» está OFF, «Confirm email» ON, Site URL es `https://code-architect-tool--avmb.replit.app` y Redirect URLs incluyen `/dashboard` y `/login`. Estas capturas acreditan ajustes visibles en ese momento, **no** una prueba nativa de invitación exitosa. No asumir que crear cuenta o aparecer en Usuarios implica email confirmado.

**Ruta transitoria viable:** administrador crea/invita desde Supabase Authentication → Users con la función de administración autorizada; comprobar que «Invite user» funciona con autorregistro cerrado, correo de invitación, plantilla y redirección, activación y login. La pantalla OptiPlan «Usuarios» actualmente **gestiona cuentas existentes** (roles/vínculos/borrado), no las crea ni invita. Código `/api/bootstrap-role`: a un usuario nuevo sin rol le asigna viewer, pero preserva el rol ya establecido; esto permite preparar permisos antes del primer login. No se deben compartir contraseñas temporales ni exponer service_role en navegador.

**Gap de producto pendiente:** botón «Invitar usuario» sólo ADMIN desde la app, endpoint backend privilegiado, confirmación/establecimiento de contraseña por el invitado, selección de rol/vinculación segura, estado «invitación pendiente / email confirmado» veraz, reenvío/caducidad, duplicados y revocación, pruebas de roles y del flujo end-to-end. Ocultar o deshabilitar «Registrarse» en UI cuando autorregistro está OFF para evitar un flujo fallido; no implementar esta unidad mientras esté en marcha una release crítica. Las URL de Auth correctas no reparan por sí solas un enlace `otp_expired` antiguo: no reutilizarlo.

### Vocal Coaches: dos salas independientes pueden solaparse

**Regla de producto (ya reflejada en Fuentes 04/06):** Caracola José María y Caracola Lucía son **espacios y coaches distintos**. Se permite que dos Pruebas Vocales ocurran a la vez si no hay participante, coach, recurso, ocupación, ventana o dependencia REAL compartidos. No crear una exclusión por nombre «Caracola», zona, grupo de Stages ni pertenencia al pipeline Estudio 7. Conjuntar una unidad operativa no significa serializarla por defecto. Tampoco imponer coincidencia forzada.

**Prueba positiva read-only:** Supabase productivo, plan `27001`, espacios independientes `caracola-jose-maria` y `caracola-lucia`, tres pruebas simultáneas por sala durante **10:55–11:40**. Evidence `docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/schedule.csv` reproduce coincidencias 10:55–11:25. En el código, `placement.ts` y `validate.ts` sólo prohíben solape si se comparten participantes, coach, espacio físico o recursos explícitos; `exactFeederStartDomain` excluye blockers del mismo coach y el test `exactMainAndFeederCore.spec.ts` verifica paralelismo posible entre coaches diferentes. No existe regla general HARD de serialización intercoaches.

**Observación del usuario:** en otra pantalla/día concreto las dos columnas parecían totalmente secuenciales. Eso **no prueba prohibición** ni demuestra qué decisión del motor produjo el orden. Para diagnosticar calidad: identificar plan/revisión/Stage/horarios, resolver recursos efectivos de ese snapshot, seguir scope → arquitectura de bloques main → feeder matching/start domains → selección nominal/witness → validación → replay. Comparar contrafactual que adelante pruebas y mejore duración/espera del día **sin degradar 266/266 ni otras autoridades**. Si hay secuencialidad evitable recurrente, plantear diagnóstico focal y sólo después un delta causal; no introducir una preferencia de paralelismo o una poda nueva sin medición/contrato.

**Nota:** este registro de decisiones no modifica las Fuentes oficiales ni implica que todos los horarios sean óptimos.

---

## 14. Mantenimiento y horizonte

Este maestro es mapa de adecuación y decisiones, **no una Fuente 08 ni un ledger automático**. Se actualiza al cambiar visión, prioridad o capacidad probada; registrar cada trabajo en su PR y Evidence, cada release en ledger/runbook, cada nueva norma en su Fuente. Si se corrige o descarta una decisión, dejar motivo y prueba.

**Horizonte:** el usuario puede añadir o cambiar actividad, plató, recurso y política desde la app; el planificador cumple todas sus obligaciones con criterio operativo, el jefe controla y ajusta la ejecución real y los datos sirven para mejorar la siguiente jornada.

### P0-U00i — gate causal BLOCKED (24/10/2026)

Sobre main #1186 (`e79f8ee`, CI remoto verde), una jornada API nueva demuestra que `anyOf(A,B), quantity=1` se rechaza antes de buscar aunque flexible→B y crítica→A completan 2/2 simultáneamente. El contrafactual que retira sólo la guardia pierde el recurso. Los replays concretos descubren además una pérdida de futuro físico entre participantes distintos y ausencia de integridad de recursos ordinarios en validación/fingerprint; Main tiene una frontera contractual de matching por tarea/posición. Se detiene la implementación antes de ampliar esas autoridades, conforme al alcance de parada. [Evidence y frontera exacta](../evidence/p0-u00i/README.md). No habilita alternativas ni acredita dos jornadas hasta Stage; producto y demo conservan todos sus bytes de base. P0 general permanece abierto. Sin solver nuevo, presupuestos mayores, migraciones, despliegue ni merge.

### P0-U00i — continuación productiva limitada en el mismo PR #1187

La decisión humana posterior al diagnóstico autoriza exclusivamente STANDALONE_ONLY, ordinary auxiliary sin agrupación, un grupo anyOf de cantidad 1 y físicos exclusivos. El candidato incorpora elección reversible en variantes/backtracking, preserva byItem y recursos independientes y utiliza la proyección productora existente para certificar el futuro entre scopes sin persistir elecciones provisionales. La identidad diaria aceptada queda protegida sin locks artificiales. La migración 110 añade integridad en la validación mediante un trigger privado, sin nuevos RPCs ni permisos. La edición manual exige volver al flujo de propuesta certificada. Main/Vocal y modalidades no certificadas permanecen UNSUPPORTED. El diagnóstico anterior conserva su valor histórico y no describe los bytes del candidato. [Evidence productiva y estado de gates](../evidence/p0-u00i/implementation/README.md). P0 general permanece abierto; sin cambios de demo, producción, despliegue ni merge.

### P0-U00e — continuación v2 en PR #1183 (candidato)

Se conserva la decisión documental de `4cc64b3`/`3a05cb0`. El contrato v2 incorpora los dos ejes independientes por espacio, preparación física por entrada/reentrada y scoring real; la adopción se ofrece sólo para futuras jornadas. Las jornadas históricas y A2 conservan su contrato previo. El caso de hueco interno del primer borrador ya pasa con continuidad OFF, y sigue rechazándose bajo REQUIRED sin pausa autorizada. Las nueve combinaciones y dos jornadas UI→Stage (4/4 y 6/6) están demostradas. Gates locales PASS: 3.117 pruebas globales, 95 focales, regresiones U00a–U00d y A2 aislado 266/266 en 11 Stages con informes/snapshots iguales salvo duraciones; tiempos medidos y comparación completa en [Evidence U00e](../evidence/p0-u00e/validation.md). La continuación conserva el contexto protegido y deriva montajes antes/después de tareas aceptadas, incluidas reentradas. READY depende además de CI verde en el head remoto de #1183. Sin nuevo solver, budgets/timeouts mayores, cambios productivos, migraciones, publicación ni merge. No cierra P0 general.

### P0-U00f — gate causal BLOCKED (23/10/2026)

Sobre main #1183 (`72ec8cdc`, CI posterior verde), el contrafactual de wiring lleva una jornada nueva Main+Vocal+IN/OUT a 8/8 y Stage; la continuación conserva seis tareas aceptadas mediante su certificado persistido. La segunda jornada UI standalone tiene nueve obligaciones factibles, pero el motor entra al pipeline Main vacío y falla en `layers[0].styling`. Además, el replay frío protegido sin certificado pierde la autoridad de transporte en su fallback. [Causa, Evidence y reproducción](../evidence/p0-u00f/README.md).

U00f no es sólo wiring: **se detiene antes de implementar producto o modificar motor**. Único PR diagnóstico, BLOCKED; no declarar soporte standalone de transporte ni completitud general. El gate completo A2/U00a–U00e corresponde a un futuro candidato de integración; sus resultados anteriores se mantienen como baseline histórico. Sin presupuestos/timeouts mayores, solver nuevo, migraciones, cambios productivos, publicación ni merge. Se conserva la congelación de la demo.

### P0-U00j — tipo exclusivo quantity=1 (candidato #1188)

El contrafactual sobre main #1187 prueba que byType se rechazaba antes de una solución B/A factible. El candidato amplía la autoridad nominal existente a un tipo diario exacto y conserva selección, recursos independientes y alternativas futuras entre Stages. La migración 111 se justifica mediante una omisión aceptada por SQL con hashes recalculados antes de su activación. Dos jornadas API/UI completan 2/2 y 4/4; la segunda selecciona una identidad diaria ad hoc y conserva S1 en S2. [Gates, límites, auditoría causal y estado](../evidence/p0-u00j/README.md). Mantiene la frontera ordinary auxiliary/STANDALONE_ONLY/EXACT_CONSTRUCTIVE; sin merge, demo, producción ni despliegue. P0 general sigue abierto.

### P0-U00n — candidato: incorporación después de Stage

Sobre U00m integrado (#1191, `382e796`), la transición de obligaciones avanza revisión, replay y origen operativo en la misma sesión, manteniendo el Stage histórico literal. La proyección explícita conserva altas posteriores pendientes en rollback/redo; una rama nueva archiva el futuro sin borrar tareas. La aclaración humana está consolidada en 01 v5.4 y 04 v2.9 mediante 00 v2.15. [Evidence, gates, límites y diagnóstico comparativo](../evidence/p0-u00n/README.md). El estado del candidato se verifica en su PR/CI; no declara cierre de todo P0, merge ni publicación.
