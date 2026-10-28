# Jornadas, obligaciones y composición

Todas las jornadas se crean mediante catálogo/plantillas/días/participantes/tareas y autoridades de la API real, sin importar EngineInput ni horarios humanos. Preparaciones, duraciones, dependencias y disponibilidades del perfil creciente U01e se conservan.

| Obligación del perfil integrado | Cantidad | Operación física |
| --- | ---: | --- |
| Preparación individual | 3 | 5 min cada una |
| Fase I | 3 | 5 min cada una; unidad AB |
| Fase II | 2 | 5 min cada una; AB o AC |
| Fase III conjunta | 2 | Una operación de 10 min |
| Fase III individual | 1 | 5 min |
| Cierres | 3 | 5 min cada uno |
| Competidoras independientes A/B/C | 3 | 15/10/10 min |
| Pausa física A+B | Canal independiente | 15 min, no tarea ficticia |

**17 obligaciones individuales, 16 operaciones físicas y una pausa.** Fases 3/2/2 representantes, ocho obligaciones al incluir el peer. El orden dentro de fases es flexible. Las operaciones finales B/C liberan A porque no lo declaran. Las dependencias enlazan preparación propia, fases y cierres.

Día 08:00–16:00; personas y recursos 08:00–12:00; break global 14:00–15:00. Unidades AB, AC y B: disponibilidad propia 08:00–12:00, transición explícita cero. Pausa ordinaria 09:00–09:30/duración 15; D y el imposible usan pausa fija 08:20–08:35. Son parámetros sintéticos configurados, independientes del A2.

| Perfil | Fases y unidad | S1 → S2 |
| --- | --- | --- |
| baseline | byItem AB/AB/B,C; sin catálogo itinerante | Sólo A → otras 16 |
| A-fixed | AB/AB/B,C | Sólo A → otras 16 |
| B-segments | AB/AC/B,C; comparten A | Sólo A → otras 16 |
| C-joint-unit | AB/AB/**unidad B**,C | Sólo A → otras 16 |
| D-rest-competition | AB/AC/B,C; pausa temprana A+B | Sólo A → otras 16 |
| unused-snapshot | byItem AB/AB/B,C, snapshots sin consumo | Sólo A → otras 16 |
| second | 12 obligaciones, dos fases 2/3; conjunta nominalmente primera en II pero dependiente de los otros miembros | Macro y preparaciones (8) → dos cierres y dos competidoras |
| common-unit | AB/AB/AB,ABC con A universal declarado; unidad distinta, fija, disponible hasta 11:00 | Sólo A → otras 16 |
| impossible | Perfil A; A sólo 08:00–08:40 | NO_PROPOSAL; sin Stage adicional |

La segunda topología tiene dos participantes productivos, dos competidores, dos fases y selección de scope distinta. Carece de pausa inicial: esto permite probar una **nueva pausa de A en un espacio independiente** contra tareas ya aceptadas cuyo A procede exclusivamente de una unidad. Los perfiles A–D conservan íntegra su pausa original. common-unit certifica el recurso universal aportado sólo por unidad y el consumo ABC cuando el final conserva AB además de su requisito independiente C.

| Cruce | U01d | U01e | U01f |
| --- | --- | --- | --- |
| 17 nominales × REQUIRED × conjunta × pausa | PRODUCTIVE_COMPOSED | PRODUCTIVE_COMPOSED | PRODUCTIVE_COMPOSED, regresión |
| 17 × unidad fija AB × fases × conjunta × pausa | UNSUPPORTED_EXPLICIT | Witness sólo memoria | PRODUCTIVE_COMPOSED, S1/S2 SQL |
| AB→AC × miembro A compartido | Sin Stage integrado | Witness sólo memoria | PRODUCTIVE_COMPOSED |
| Conjunta con unidad fija común | Sin Stage integrado | Helper SQL incompleto | PRODUCTIVE_COMPOSED |
| Descanso de miembros × competencia en otro espacio | Aislado | Memoria | PRODUCTIVE_COMPOSED y negativo SQL |
| Snapshot sin consumidor × fases nominales | Rechazado | Primer guard reproducido | PRODUCTIVE_COMPOSED |
| Recurso universal de unidad × continuidad | No acreditado | Resolver SQL incompleto | PRODUCTIVE_COMPOSED y negativos |
| Segunda topología itinerante × continuación | Sin Stage | No acreditado | PRODUCTIVE_COMPOSED |
| Alternativas any, cambios de miembros, transición positiva | Fuera de intersección | Fuera de intersección | UNSUPPORTED_EXPLICIT, sin ampliación |
| Scopes complejos / Main / Vocal / setup / rondas / transporte / anclajes sobre esta macro | No acreditado | Contrafactuales parciales | No habilitado |
| A2 completo introducido desde UI | NOT_TESTED | NOT_TESTED | NOT_TESTED; regresión importada separada |

La analogía con Fuente 06 §§8.2–8.3 es estructural: fases continuas, conjunta y liberación del miembro que ya no se requiere. No se copian las 16:00 de EVA, nombres como reglas, orden humano, duración A2 ni operaciones técnicas de la cabecera del PDF.
