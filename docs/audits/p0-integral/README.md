# Auditoría integral P0 — índice vivo

**Naturaleza:** documento de diagnóstico y gestión de cobertura; **no es Fuente oficial** ni reemplaza 00–07. La autoridad dinámica del código es `main`; `docs/evidence/`, los benchmarks y CI acreditan cada mejora.

- **Corte documental congelado:** [28-10-2026](2026-10-28/README.md), basado en `39e26f1c2e84cc8160c2066e197d61bc8b972384`. Sus informes, 266 obligaciones, 70 requisitos, 21 intersecciones, gates y roadmap no se reescriben retroactivamente.
- **Diagnóstico posterior:** [P0-U02c](../../evidence/p0-u02c/README.md) y [primer rechazo causal](../../evidence/p0-u02c/next-delta.md) (consultar solo cuando integrado en `main`). U02c documenta incompatibilidad de autoría y SQL con witness de 27 en memoria, no Stage SQL integrado.
- **Candidato funcional posterior:** [P0-U02d](../../evidence/p0-u02d/README.md) y [matriz viva](../../evidence/p0-u02d/composition-matrix.md): cinco autoridades nativas, 27 obligaciones y S1/S2 SQL auténticos en la topología original; AB→AC sigue SEARCH_EXHAUSTED. Recibos de cierre y CI del head determinan la validación final; el corte histórico no cambia.
- **Seguimiento:** tras cada PR de Planner/Assisted actualizar las matrices de cobertura/composición con Evidence vinculada, el primer bloqueo causal restante y la próxima unidad prioritaria. Versionar nuevos cortes; no elevar una celda a PRODUCTIVE_COMPOSED sin Stage SQL y futuro verificable.
- **Orden de verificación:** Fuentes oficiales y Protocolo Maestro → `main`/AGENTS → Evidence del PR → catálogo → matrices de este corte → diagnóstico causal sobre código vivo → próxima unidad. El backlog es orientativo y puede cambiar si nuevas pruebas refutan una hipótesis.
- **Objetivo:** todas las reglas configurables desde UI y aplicadas por motor y SQL para jornadas nuevas de complejidad comparable A2, no un importador o un calendario hardcodeado.

> El reporte original declara U02c en curso porque fue escrito antes de su integración. Para el estado actual consultar el PR/merge real; nunca interpretar esa cabecera histórica como el estado vigente.
