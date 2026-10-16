# Fuentes oficiales de OptiPlan

**Autoridad documental:** `00_INDICE_Y_AUTORIDAD_FUENTES_OPTIPLAN_v2.13.md`. **Estado implementado:** GitHub `main` y Evidence/CI.

| Documento | Ámbito |
|---|---|
| `00_INDICE_Y_AUTORIDAD_FUENTES_OPTIPLAN_v2.13.md` | Índice, precedencia y autoridad documental |
| `01_PRODUCTO_DOMINIO_OPERACION_v5.2.md` | Producto, dominio y operación |
| `02_ORC_CORE_CONSOLIDADO_v2.2.md` | Core ORC |
| `03_PLANNER_CONSTRUCCION_BUSQUEDA_ASSISTED_v3.7.md` | Planner, scopes, construcción, Assisted |
| `04_INTEGRACION_CONFIGURACION_EFECTIVA_v2.7.md` | Configuración efectiva, snapshots, stages y persistencia |
| `05_VALIDACION_CALIDAD_BENCHMARK_v2.7.md` | Validación, CI, Evidence y benchmarks |
| `06_A2_CANONICO_INTERPRETACION_Y_TAREAS_v2.10.md` | Canon A2, interpretación y obligaciones |
| `07_PROTOCOLO_MAESTRO_CONTINUIDAD_v2.2.md` | Protocolo Maestro, continuidad y auditoría causal |
| `ENSAYO_A2_LV.pdf` | Evidencia humana primaria A2 (PDF original) |
| `ENSAYO_A2_LV 15 JUNIO 2025 -  DESGLOSE A2.pdf` | Evidencia humana primaria A2 (PDF original) |

## Regla de lectura

Leer 00 antes de interpretar prioridades entre Fuentes. Leer 07 para el protocolo de trabajo. Consultar 01–06 y los PDFs sólo en los ámbitos relevantes. La Fuente 06 prevalece sobre los PDFs cuando contiene correcciones expresas. Las Fuentes son requisitos, y `main` demuestra lo implementado; no convertir un comentario de código en norma.

## Gestión de versiones

El corpus oficial se mantiene en este directorio mediante PR. Cuando se eleva una Fuente, actualizar la Fuente 00, este README y `SHA256SUMS`; retirar los documentos normativos anteriores sin perder su historial Git. No crear una segunda copia normativa. Los PDFs se conservan sin modificaciones; sus interpretaciones se reflejan en 06.

### Integridad

`SHA256SUMS` contiene SHA256 exactos de los 10 originales. En este directorio ejecutar `sha256sum -c SHA256SUMS`.
