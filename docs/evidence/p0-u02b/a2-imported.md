# A2 histórico importado, regresión separada

Ejecutado con `docs/evidence/p0-u00n/a2.ts`, reutilizando el benchmark Assisted histórico y su importador. Resultado: **266/266**, **11 Stages**, **27.049 ramas**, fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`. El informe completo coincide con el histórico salvo duración; todos los snapshots son idénticos y se revalidan 11 certificados. Los artefactos están en `a2/`.

Este benchmark es independiente de las jornadas UI/API nuevas y no demuestra autoría A2 completa desde la App. Los Stages SQL integrados se acreditan por sus propios recibos PostgreSQL. El upgrade histórico también conserva literalmente 599 tareas y 11 Stages poblados, sin adopción de nuevas autoridades.

ASST-010 es otro control: la suite global falla en `runA2Assist7Evidence.ts:181`, NO_PROPOSAL, ASSISTED_SCOPE_INCOMPLETE y SEARCH_TIME_LIMIT_REACHED. Se reproduce sobre un archivo limpio de la base exacta `6e6901ad` con el mismo punto y diagnóstico. No se eleva su timeout ni se llama completamente verde a la suite global.
