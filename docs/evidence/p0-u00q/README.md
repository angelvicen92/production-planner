# P0-U00q — auditoría causal de cadenas técnicas

Base ejecutada: **`8868ebc365a4941977050d337b4b00a5d2ca553f`**, U00p integrado mediante #1194, comprobado en GitHub. Diagnóstico exclusivamente: código productivo, Fuentes 00–07, migraciones históricas, presupuestos y Evidence anterior permanecen literales. No hay implementación, merge, despliegue ni escritura remota de BD.

**Veredicto principal B:** la secuencia técnica lineal ya funciona mediante dependencias y recursos nominales explícitos hasta Stages reales. Falta un productor diario configurable/versionado para declarar **adyacencia y continuidad REQUIRED**. No se pierde una política nativa guardada en EngineInput: no existe esa escritura. La diferencia es material, no presentación.

**Además existe un caso D reproducido:** una cadena inferida no conserva su identidad operativa cuando un prefijo pasa a contexto protegido. A acepta realmente T1+T2; al pedir T3 obtiene `UNSUPPORTED_STANDALONE_TASK_KIND:task:3`, con cero ramas. La cadena explícita sí permite continuar un prefijo fijo en la geometría factible de A, en memoria. No se declara que añadir un editor resuelva todas las tareas técnicas o todas las combinaciones del perfil.

| Resultado real | Jornada A | Jornada B |
| --- | --- | --- |
| Creación Chromium | 14/06/2027, plan 1 | 17/06/2027, plan 2 |
| Tareas / espacios propios | 1–4 / 1–4 | 5–8 / 5–8 |
| Duraciones T1/T2/T3 + independiente | 15/20/10 + 20 min | 20/15/25 + 15 min |
| Recurso nominal diario / catálogo | 2 / 2 | 7 / 4 |
| T1 | 09:00–09:15 | 10:00–10:20 |
| T2 | 09:15–09:35 | 10:40–10:55 |
| T3 | 09:35–09:45 | 11:00–11:25 |
| Huecos entre fases | 0 / 0 min | **20 / 5 min** |
| S1 real, tres completas y una pendiente | Stage 2 | Stage 6 |
| S2 real, cuatro completas | Stage 3 | Stage 7 |
| Independiente en S2, mismo recurso físico | 09:45–10:05 | 11:30–11:45 |
| Ramas nativas del scope técnico | 11 | 18 |
| Misma jornada con política explícita, en memoria | tres placements, 14 ramas | sin propuesta, dominio cero, 85 ramas |
| Stage explícito aceptado | **ninguno** | **ninguno** |

Son dos catálogos, jornadas, geometrías y equipos distintos, sin IDs ni horarios de A2. Las tres técnicas no tienen participante; la independiente es una auxiliar con operador real que consume el mismo equipo exclusivo. Todos los requisitos se crean por API antes de S0. La coincidencia numérica catálogo/día en A no autoriza intercambiar namespaces: B demuestra la transformación 4 → 7, conservada hasta `daily_tasks.assigned_resource_ids`.

En B, cambiar sólo el cierre del primer espacio de 10:20 a 11:00 **en memoria** permite 10:25–10:45 → 10:45–11:00 → 11:00–11:25 (31 ramas). No cambia recursos ni duraciones. Es la sensibilidad que distingue falta de configuración de inviabilidad de una declaración REQUIRED concreta. No se guarda esa ventana ni se presenta la proyección como Stage.

[Recorrido causal y nueve respuestas](causal-path.md) · [Contratos y autoridades](contracts.md) · [Jornadas y negativos](native-days.md) · [Matching y futuro](matching-future.md) · [Una implementación siguiente, sólo diseño](next-implementation.md).

## Fronteras probadas

- Perfil general estricto y operación diaria: `technicalChains` devuelve HTTP 400. `planner_next_configuration` histórico: `PLANNER_NEXT_CONFIGURATION_IMMUTABLE`.
- Input proyectado con **lectura/revisión auténticas**: `AssistedProposalService.run` rechaza `STALE_CONFIG_REVISION` antes de resolver. No se reutiliza el fingerprint antiguo.
- SQL genérico v5, con service_role y actor ADMIN válidos, **sí acepta** identidad/replay candidato con cadenas dentro de una transacción después revertida. No materializa una autoridad diaria: el profile sigue igual y `planner_next_configuration` sigue null. No existe un guard genérico de todas las autoridades sólo por tener hash. No se hizo commit ni se utilizó esta aceptación de metadatos para eludir el run/Stage.
- Una segunda simulación de A sustituye exclusivamente la lectura de revisión en memoria y captura `finish` en memoria. Produce snapshot completo de cuatro obligaciones, tres planificadas, fingerprint recomputado y validación canónica válida. No escribe run, Draft, configuración ni Stage. Su fingerprint coincide con S1 ordinario porque los placements coinciden; la identidad de configuración difiere. **El hash del planning no certifica por sí solo la autoridad REQUIRED.**

## Gates y límites

Dos ejecuciones completas desde bases vacías, PostgreSQL 17 + GoTrue + PostgREST + API + Chromium. Cada una aplica 117 migraciones, acepta cinco Stages reales (S1/S2 de ambos días y el prefijo alternativo de A), comprueba permisos, stale, protección, rollback y dos redos. Los históricos completos de A permanecen en Evidence; su última rama activa es deliberadamente el prefijo con continuación bloqueada. No se oculta ese estado como completitud.

Pasan **120 tests focales existentes**, **7 tests de replay frío**, TypeScript de producto/diagnóstico, secuencia de migraciones y verificador. El replay comprueba inmutabilidad, inversión de colecciones sin invertir el orden semántico de miembros, fingerprints, identidad/replay y negativos. Sólo se excluyen siete campos CPU de futuras unidades, enumerados en código; no se excluyen ramas, placements ni fingerprints.

Los manifiestos verifican **4.223 archivos previos** de producto, scripts, Fuentes y Evidence. A2 sigue **266/266, 11 Stages, 27.049 ramas**, fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`, por su recibo U00p protegido por hash. **No se repite el benchmark A2** al no modificar producto. No se afirma cobertura de fases flexibles, cadenas con auxiliares/joint groups, mezclas con rondas/setups, selección nominal alternativa ni transporte.

## Recibos y reproducción

[native/receipts.json.gz](native/receipts.json.gz) y [native/repeat-receipts.json.gz](native/repeat-receipts.json.gz): 122 JSON originales por ejecución. Capturas reales: [A S1](native/A-S1.png), [A S2](native/A-S2.png), [B S1](native/B-S1.png), [B S2](native/B-S2.png). Los manifiestos describen el único dispatch temporal en un `git archive` descartable; el checkout no cambia su harness. JWT, contraseñas, logs privados y trazas de navegador no se empaquetan.

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  node --import tsx docs/evidence/p0-u00q/run.ts /tmp/u00q-fresh
python3 docs/evidence/p0-u00q/pack.py /tmp/u00q-fresh /tmp/u00q-public
U00Q_RECEIPTS=/tmp/u00q-public/receipts.json.gz \
  node --import tsx docs/evidence/p0-u00q/replay.spec.ts
npx --no-install tsc -p docs/evidence/p0-u00q/tsconfig.json
python3 docs/evidence/p0-u00q/verify.py
```

Docker, Chromium y dependencias exactas del lockfile son requisitos. El verificador contrasta los dos bundles entregados y los archivos protegidos contra la base. Cada runner destruye sólo sus propios contenedores. [Validación](validation.json) y [autoridades consultadas](authorities.json).

Comportamiento X —una jornada nueva ordena operaciones y acepta Stages, pero no puede declarar su continuidad REQUIRED y puede bloquearse al cortar una cadena inferida— es causado por Y —ausencia de productor diario y reconocimiento residual basado sólo en tareas pendientes— y produce Z —intención no validada y continuación UNSUPPORTED—; el delta W debe aportar la mínima autoridad diaria explícita con revisión, cierre y guard material, y esperamos observar M —cadenas configuradas hasta Stage auténtico, futuro preservado y prefijos protegidos continuables en geometrías factibles—.
