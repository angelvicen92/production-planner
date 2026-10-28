# Jornada integrada y mapa de obligaciones

Recibos: `native/receipts.json.gz`, claves `integrated-*`, `reverse-order-*`, `impossible-*` y `api-receipts.json`. PostgreSQL 17.11, Auth real, PostgREST, Express y Chromium; altas mediante rutas oficiales. No se importan posiciones ni fixtures del A2. Los nombres son etiquetas editables de catálogo, nunca reglas. Cámara, operador, técnico y coaches son recursos persistidos y materializados en snapshots; no son IDs ficticios de EngineInput.

## Composición del primer día

Día creado con **Crear día**: 01/06/2027, plan 1. Jornada 08:00–16:00, pausa global 14:00–15:00; personas, recursos y unidades disponibles 08:00–12:00. Main REQUIRED, fin preferido 11:00, dos coaches, máximo un bloque por coach, mínimo una tarea por bloque. Rejilla 5 min, transición de recurso/unidad 0 explícita; default de participante 5 y overrides por tarea 0. Ninguna hora de tarea está asignada al autorizar el día.

Los tres participantes de la macro tienen también su propio Main/Vocal. Tres participantes independientes compiten por recursos. Una tarea técnica no tiene participante. No se añaden Main/Vocal ficticios a los competidores.

| Operación / obligación | IDs auténticos, primer día | Duración | Recursos / relación |
| --- | --- | ---: | --- |
| Vocal → Main, participante 1 | 1 → 2 | 10 + 10 | Coach diario 4; dependencia por snapshot de plantilla |
| Vocal → Main, participante 2 | 8 → 9 | 10 + 10 | Coach diario 5 |
| Vocal → Main, participante 3 | 15 → 16 | 10 + 10 | Coach diario 4 |
| Preparaciones | 3, 10, 17 | 3 × 5 | Cada una alimenta su primera fase |
| Fase I | 4, 11, 18 | 3 × 5 | Unidad diaria AB; cámara 1 + operador 2 |
| Fase II | 5, 12 | 2 × 5 | Misma AB; depende de I del participante |
| Fase III conjunta | 6 + 13 | Una operación de 10 | Operador 2; dos obligaciones, un intervalo |
| Fase III individual | 19 | 5 | Técnico de sonido 3 |
| Cierres | 7, 14, 20 | 3 × 5 | Posteriores a conjunta/final propio |
| Competidoras independientes A/B/C | 21, 22, 23 | 15 / 10 / 10 | Recursos 1 / 2 / 3, espacios independientes |
| Técnica independiente | 24 | 5 | Unidad B específica (operador 2) + técnico 3 |
| Pausa operativa | Canal `operationalMealPolicies` | 15 | Cámara 1 + operador 2 y los tres espacios de fases; ventana 09:00–09:30 |

Total: **24 obligaciones, 23 operaciones físicas, una pausa**. Las siete referencias de fases representan ocho obligaciones al incluir el peer 13. La macro conserva exactamente las 17 obligaciones U01f; las seis de Main/Vocal y la técnica se suman. No se elimina ninguna para conseguir preflight.

Se crean unidades de catálogo AB, AC, B y AB de ventana corta por reutilización del recorrido U01f. Los snapshots diarios conservan source/team/members. Este integrado consume AB y B; AC y la unidad corta son snapshots sin consumidor. El cruce AB→AC está certificado en el control U01f, **no en el Main de este integrado**. El siguiente gate debe incluir esa variante expresamente.

## Qué se editó realmente

| Autoría de esta ejecución | Canal realmente usado | Alcance de UI comprobado |
| --- | --- | --- |
| Login, plantillas Main/Vocal, roles, espacios de plantilla, dependencia feeder, duración y márgenes | UI Chromium | Guardado real de plantillas |
| Selección Main y fin preferido | API para contrato completo; UI para edición y guardado | Configuración general recargada y capturada |
| Crear los tres días | UI Chromium | POST real desde el modal |
| Tres participantes con coaches y disponibilidad | UI Chromium | Formulario del día, coaches auténticos del snapshot |
| Catálogo de zona, espacios, tipos, recursos físicos, coaches y unidades | API oficial | Editores existentes por lectura de código; esta ejecución **no certifica su autoría UI** |
| Plantillas de macro/técnica y tareas diarias, competidores | API oficial | El harness no prueba su edición UI; los requisitos genéricos concretos/alternativos no se atribuyen a un editor genérico inexistente |
| Pausa, miembros, espacios, ventana y duración | UI Chromium | Guardar, recargar y persistencia auténtica |
| Conjunta y fases | UI observada deshabilitada + intentos API oficiales | No editables en esta combinación; no se afirma guardado UI |
| Snapshots/revisiones | Lecturas API, builder y SELECT | No hay UPDATE manual de autoridades ni EngineInput persistido |

La lista completa de payloads y respuestas está en `api-receipts.json`; los POST originados por la UI se registran por los propios datos devueltos y snapshots, y por el código del recorrido, no se presentan como recibos del wrapper API. Las capturas de configuración muestran el día después del guardado UI de pausa.

El segundo día (plan 2, 02/06/2027) conserva 24 tareas, fuentes y disponibilidad equivalentes y sólo invierte el orden de las autoridades rechazadas. Sus IDs distintos alteran desempates del matching (160 frente a 127 ramas); eso no es efecto físico del orden de PUT. El tercero estrecha el recurso A a 08:00–08:40 y se trata exclusivamente como negativo.
