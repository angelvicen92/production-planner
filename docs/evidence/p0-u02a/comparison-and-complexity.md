# Comparación, estado de composición y complejidad

| Evidencia | Universo y autoridad demostrada | Stage | Primera frontera respecto al integrado |
| --- | --- | --- | --- |
| U00a | Main/Vocal, dos coaches en segundo día, dependencias, 4/4 y 9/9 | Auténtico; reproducido en esta auditoría | No probó macro por fases itinerante |
| U01d | 17 obligaciones nominales, tres fases, conjunta, liberación de recurso, pausa y competencia; requiredResourceIds vacío explícito | S1 1 → S2 16 SQL; otra topología de 12 | Sin consumo de unidad física; guard standalone |
| U01e | Investigación de unidades fijas con macro, witness/supporting/futuro y pérdidas SQL | Sólo nominal auténtico; itinerante memoria | Helpers físicos SQL incompletos y guards; no es certificación de Stage itinerante |
| U01f | Unidades específicas fijas, recursos cambiantes, conjunta y pausa; AB/AC, otra topología y continuidad | SQL auténtico. Aquí se reproducen ocho perfiles y 16 Stages nuevos | Sigue acotado a standalone; Main sobre macro no habilitado |
| U02a | Misma jornada con 6 Main/Vocal + 17 macro + 1 técnica; dos coaches y participantes compartidos | S0 real; ningún Stage integrado | Dos admisiones TS y equivalentes SQL bloquean; memoria 24/24, futuro global, parcial y continuación válidos |

## Matriz antes/después de este PR diagnóstico

| Cruce | Main U01f, antes | U02a, después | Evidencia nueva |
| --- | --- | --- | --- |
| Main/Vocal básico | PRODUCTIVE_COMPOSED en su alcance | Igual | Control UI 4/4 y 9/9 |
| Fases nominales × conjunta × pausa standalone | PRODUCTIVE_COMPOSED | Igual | Control U01f baseline |
| Unidad fija × fases × conjunta × pausa standalone | PRODUCTIVE_COMPOSED | Igual | 16 Stages nuevos entre ocho perfiles positivos |
| Main/Vocal × macro U01f | UNSUPPORTED_EXPLICIT | **UNSUPPORTED_EXPLICIT** | Primer rechazo auténtico en ambos órdenes; testigo físico y solver en memoria |
| Geometría/matching residual × macro fija | NOT_TESTED para esta intersección | Runtime investigado positivo; Stage NOT_TESTED | 127/160 ramas; no pérdida detectada |
| Supporting reparable × Main y macro | NOT_TESTED | Memoria verificada; Stage NOT_TESTED | Misma propuesta con otra preparación |
| Helpers SQL de recursos × fuentes integradas | NOT_TESTED | Lectura positiva; Stage NOT_TESTED | Igualdad de recursos efectivos de 24 tareas |
| Draft/SQL/continuación productiva integrada | NOT_TESTED | NOT_TESTED | No se atribuye memoria a Stage |
| Main × macro × transporte/setup/rondas/anclajes | NOT_TESTED | NOT_TESTED; hay guards explícitos por familia | Fuera del experimento |
| A2 entero creado desde UI | NOT_TESTED | NOT_TESTED | Inventario actualizado sin ejecutar las 266 tareas |

`Runtime investigado positivo` describe una dimensión de Evidence, no inventa un estado P0. El estado oficial del cruce productivo permanece UNSUPPORTED_EXPLICIT. Los Stages aislados no lo elevan a PRODUCTIVE_COMPOSED.

## Coste actual y simplificaciones

El flujo ya tiene productores tipados, snapshots, identidad, CAS, writer v5, builder, proyección de recursos/unidades, matching, explorer de fases, futuro global, codec, validación y SQL. U01f completó el resolver de miembros; U02a contrasta su igualdad en las fuentes integradas. No se observa una razón para duplicarlos.

La fragmentación actual está en admisiones distribuidas: perfil en `requiredPhaseCompositionSupported`; perfil dentro del helper itinerante; consumidores de conjunta/pausa/vista/rebuild; guards SQL del escenario y de los requisitos itinerantes. Esas condiciones conservadoras son distintas de una incompatibilidad física. Un cambio de una sola línea del endpoint dejaría el resto intacto.

Simplificación candidata dentro del próximo delta: separar los hechos físicos ya comprobados por el helper fijo (identidad, miembros, snapshot, disponibilidad y transición cero) de la restricción de perfil certificado, y alinear la admisión del cruce en los validadores existentes. Evitar un nuevo registro de excepciones o un rule engine de combinaciones. La forma final debe mantener límites materiales para alternativas, transiciones positivas y otras estructuras.

Este PR añade **cero complejidad runtime**. Sus scripts sólo observan, crean datos mediante las rutas oficiales en stacks descartables o ejecutan copias en memoria. El empaquetado y el verificador son Evidence, no nuevas autoridades de viabilidad productiva.

La búsqueda positiva usa 127/160 ramas sin ampliación de presupuesto (10.000). La diferencia entre días no mide una optimización: hay IDs distintos y desempates distintos. El negativo integrado repite decisiones core ante una pausa sin dominio; su coste se registra sin convertirlo en la próxima unidad ni inventar un certificado paralelo.
