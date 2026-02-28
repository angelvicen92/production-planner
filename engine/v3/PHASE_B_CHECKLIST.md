# V3 Fase B (CP-SAT) - Checklist de pruebas

- [ ] Caso base con `timeLimitMs=10000`: devuelve rápido (<= 10s + overhead) y conserva solución factible.
- [ ] Caso medio con `timeLimitMs=60000`: score igual o mejor que Fase A en:
  - huecos de plató principal
  - cambios de plantilla por espacio
- [ ] Caso largo con `timeLimitMs=300000`: mantiene hard constraints y reporta best-so-far.
- [ ] Si OR-Tools no está disponible, backend devuelve Fase A con insight técnico (`ortools_import_failed`).
- [ ] Si CP-SAT propone candidato inválido (hard potencialmente rotas), backend rechaza el candidato y mantiene Fase A.
- [ ] Regla casi dura nivel 10:
  - se permite romper como máximo una vez,
  - se reporta `rule`, `taskId`, `spaceId` y motivo.
- [ ] `planning_runs` muestra fase `optimizing` durante Fase B.
