# Stages SQL auténticos

Cada base fría reproduce estas ocho filas. `native/` y `repeat/` contienen propuestas, Drafts, validaciones, Stages, lectura desde otra conexión SQL, protección y rollback/redo. Son 16 Stages nuevos entre ambas bases. Los supporting del witness permanecen fuera de la aceptación.

| Jornada | Recorrido | Paso | ID SQL | Ordinal | Aceptadas / pendientes | Propuesta | Ramas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| integrated | competitor | S1 | 3 | 1 | 1 / 26 | 1 | 207 |
| integrated | competitor | S2 | 5 | 2 | 27 / 0 | 26 | 205 |
| integrated | anchor | S1 | 7 | 3 | 4 / 23 | 4 | 207 |
| integrated | anchor | S2 | 9 | 4 | 27 / 0 | 23 | 185 |
| reverse-order | competitor | S1 | 12 | 1 | 1 / 26 | 1 | 207 |
| reverse-order | competitor | S2 | 14 | 2 | 27 / 0 | 26 | 205 |
| reverse-order | anchor | S1 | 16 | 3 | 4 / 23 | 4 | 207 |
| reverse-order | anchor | S2 | 18 | 4 | 27 / 0 | 23 | 189 |

Los ordinales 3/4 corresponden a la ruta alternativa desde S0 después de rollback; no reemplazan las filas históricas de la primera ruta. `sql-stages.json` conserva todos los fingerprints. Los aceptados quedan inmóviles durante S2; las filas de `daily_tasks` releídas mediante el builder coinciden en horarios y asignaciones con el último Stage. El verificador independiente no importa App ni motor.

AB→AC, en ambos órdenes: las cinco autoridades se guardan; la propuesta original agota 10.000 ramas y no acepta Stage. El probe separado condicionado después de la ventana de pausa produce 26 pendientes con witness de 27+pausa en 217 ramas. Nunca se aplica a un Draft o Stage.
