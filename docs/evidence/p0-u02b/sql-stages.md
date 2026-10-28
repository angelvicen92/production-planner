# Stages SQL auténticos

Dos bases frías independientes repiten estas filas literalmente, incluidos IDs, ordinal, snapshot y fingerprint. Los recibos `*-S1/S2-run`, `draft`, `accepted` y `sql` enlazan propuesta real → Draft → servicio/RPC → SELECT de `assisted_planning_stages`. No se importa ni acepta un witness como propuesta.

| Jornada | Stage | Propuesta | Colocadas SQL | ID SQL (base A) | Fingerprint |
| --- | --- | ---: | ---: | ---: | --- |
| integrated | S1 | 1 | 1/24 | 3 | `cf443cbda8cfa9f465c06142d623745d8e16bb21d4a340bce9c3fcafe03be80e` |
| integrated | S2 | 23 | 24/24 | 5 | `eae11771617102add798f28b03f49926a01960d6ace2735daf12649b854be1e8` |
| reverse-order | S1 | 1 | 1/24 | 8 | `1183036a35c0cc99a05eacad3156b7f78463e6de1732fc41ffca7ee67da624c1` |
| reverse-order | S2 | 23 | 24/24 | 10 | `0087dbaaae9354b20e8d02aa18707bbb4404e9ed5a776105d90cf1eee0437ccf` |
| segmented-joint | S1 | 1 | 1/24 | 13 | `1e2ee16bf92e0f32df79c2c212ab3a3a65f6e2ede559bcab0afe2f6c9c39e810` |
| segmented-joint | S2 | 23 | 24/24 | 15 | `426a3d25916394c57f30a1dd6e82bfde01ccf0e2d68d09dee2de7228989f6baa` |

Cada S1 tiene exactamente una tarea colocada; las otras 23 permanecen pendientes en su snapshot completo. Cada S2 contiene 24 colocadas y conserva literalmente la fila de S1. El witness físico de cada run contiene 24 tareas y una pausa; el certificado técnico WITNESS consume cero ramas adicionales. `verify.py` comprueba además la física de las 23 operaciones reales.

Los Stages históricos del upgrade son otro conjunto de 11 filas, preservadas y no contadas entre los 12 Stages integrados nuevos. Ningún Stage histórico remoto se toca.
