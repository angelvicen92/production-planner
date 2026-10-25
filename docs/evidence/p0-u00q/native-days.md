# Dos jornadas nativas y clasificación de contrafactuales

Cada runner arranca PostgreSQL **17**, GoTrue, PostgREST, API con Vite y Chromium locales, aplica las 117 migraciones literales, crea identidades Auth y catálogos por API y crea **los días mediante el diálogo real de Chromium**. No importa fixtures A2 ni variables Supabase productivas. `remoteWrites: 0` significa cero escrituras de base remota; las escrituras locales son las del producto.

## Ventanas y obligaciones declaradas

| Jornada | T1 | T2 | T3 | Independiente | Recurso nominal |
| --- | --- | --- | --- | --- | --- |
| A, 14/06/2027 | 15 min, sala 09:00–09:20 | 20 min, sala 09:15–09:50 | 10 min, sala 09:35–10:00 | 20 min, sala y operador 09:00–11:00 | kit diario 2, 09:00–11:00 |
| B, 17/06/2027 | 20 min, sala 10:00–10:20 | 15 min, sala 10:40–11:30 | 25 min, sala 11:00–12:00 | 15 min, sala y operador 11:30–12:00 | kit diario 7, 10:00–12:00 |

Las dependencias T1→T2→T3 y requisitos byItem se declaran en catálogo; se congelan en snapshots antes de crear instancias. No se inyecta un horario por tarea: las horas finales proceden del solver bajo estas ventanas operativas. El sustituto tiene disponibilidad amplia pero otra identidad. Cada obligación consume capacidad física de su espacio y del kit.

En ambas jornadas: input nativo sin `technicalChains`, preflight y adapter SUPPORTED, readiness READY. Recomendación SPACE_FALLBACK; petición explícita por API selecciona tres técnicas, genera propuesta, comprueba repetición, aplica Draft, valida y acepta S1. El snapshot tiene cuatro obligaciones, tres colocadas y una pendiente; las filas `daily_tasks` sólo se consolidan al aceptar. La siguiente petición coloca la independiente, preserva las tres decisiones y acepta S2 4/4 sin HARD/REQUIRED nuevos. Se guardan requests/resultados, Draft, validation, Stage y filas completas de DB. Rollback S0 y **dos** redos recuperan literalmente S2.

A tiene por coincidencia horarios contiguos; B tiene dos esperas. No se atribuye REQUIRED al éxito ordinario de A. La política explícita es una proyección de IDs verdaderos, con requiredResourceIds diarios verdaderos, y sólo se somete a los consumidores existentes en memoria.

## Prefijo protegido real

Después del recorrido completo de A se vuelve a S0, se solicita T1+T2 y se acepta **Stage 4** con esas dos decisiones y dos obligaciones pendientes. La petición auténtica de T3 no produce propuesta: `ASSISTED_SCOPE_INCOMPLETE`, `UNSUPPORTED_STANDALONE_TASK_KIND:task:3`, cero ramas. Draft y Stage se mantienen intactos. No se usa el fracaso para aceptar un snapshot manipulado.

En memoria, el prefijo fijo T1 y pendientes T2/T3 también falla sin policy; con policy explícita A devuelve 09:15–09:35 y 09:35–09:45 en dos ramas, conservando T1. B con prefijo T1 a 10:00 continúa físicamente imposible para adyacencia, aunque tenga policy. No confundir ambas causas.

La última rama de A queda deliberadamente bloqueada en su prefijo, con los S1/S2 completos anteriores conservados en los recibos/historial. No hay un segundo bootstrap que borre el problema ni un Stage explícito aceptado.

## Matriz de negativos

| Contrafactual | Resultado observado | Clasificación |
| --- | --- | --- |
| Dependencias sin policy, scope de tres | propuesta válida y S1/S2 reales en A/B | capacidad productiva existente |
| Misma A con policy | mismos tres horarios, 14 ramas; scope/futuro/identidad cambian | sensibilidad de autoridad, no prueba de Stage explícito |
| Misma B con policy | ninguna propuesta, 85 ramas; sin budget/time limit | inviabilidad física de adyacencia en ventanas declaradas |
| B, sólo ampliar cierre de sala T1 en memoria | cadena contigua 10:25→10:45→11:00→11:25 | contrafactual que aísla geometría |
| Sustituir sólo recurso de T2 por otro real disponible | `TECHNICAL_CHAIN_VIOLATION`, `TECHNICAL_OPERATION_VIOLATION`; cero candidatos de cadena si cambia el requisito del miembro manteniendo policy | violación HARD/REQUIRED de identidad/continuidad |
| Introducir cinco minutos entre fases | `TECHNICAL_CHAIN_VIOLATION`, más infracciones físicas si aplican | violación REQUIRED; no mera penalización |
| Miembro inexistente | `UNSUPPORTED_TECHNICAL_CHAIN`, adapter UNSUPPORTED | contrato/referencia no representable |
| Dependencia inexistente | `MISSING_DEPENDENCY_REFERENCE`, `UNSUPPORTED_TASK_ROLE` de dependencia técnica; adapter UNSUPPORTED | referencia no representable; no buscar |
| Kit sólo disponible 08:00–08:05 | adapter SUPPORTED, sin propuesta | inviabilidad física posterior; duración/ventanas auténticas incompatibles |
| Sala T2 sólo disponible 08:00–08:05 | adapter SUPPORTED, sin propuesta | inviabilidad física posterior |
| Independiente A 09:10–09:30 consume kit imprescindible | PRUNE, ZERO_DOMAIN completo, culpable `task:4`, 88 ramas del probe | poda válida de alternativa, no eliminación de obligación |
| Independiente A 10:00–10:20 | PASS, witness completo, 13 ramas del probe | alternativa compatible |
| Mismo probe sin presupuesto disponible | ABSTAIN / BUDGET_EXHAUSTED, cero ramas | no certificado de inviabilidad |
| Técnica aislada / raíz sola / prefijo inferido protegido | `UNSUPPORTED_STANDALONE_TASK_KIND`, cero ramas | limitación del consumidor residual, no inviabilidad |
| Política por API general/diaria | HTTP 400 | ausencia de productor de configuración |
| Input explícito en run con revisión auténtica | STALE_CONFIG_REVISION | frontera de identidad, antes de solver |
| Mutar histórico 088 | PLANNER_NEXT_CONFIGURATION_IMMUTABLE | protección correcta |
| Writer SQL genérico con replay añadido, rollback | acepta sólo revisión/metadata; no materializa policy | límite real del guard, no éxito de Stage |

Ninguno de los negativos físicos entregados termina en SEARCH_TIME_LIMIT_REACHED ni en agotamiento de ramas. ABSTAIN de presupuesto se provoca sólo en un probe de diagnóstico con allowance cero; no se modifica ni aumenta ningún presupuesto productivo. No se declara optimalidad.

## Recibos clave

`*-created`, `*-native-input`, `*-explicit-input`, `*-native-preflight`, `*-explicit-preflight`, `*-recommendations`, `*-native/explicit/relaxed-solver`, `*-single/tail/independent`, `*-protected-prefix`, `*-identities`, `*-negative-*`, `*-SQL-*`, `*-authentic-revision-barrier`, `*-S1/S2-run/repeat/draft/validation/accepted/persisted`, `*-restore`. El bundle es un diccionario por nombre de archivo JSON, no extractos seleccionados. `A-native-prefix-*` conserva el caso D real. `A-simulated-explicit-*` está etiquetado simulationOnly y nunca se aplica.
