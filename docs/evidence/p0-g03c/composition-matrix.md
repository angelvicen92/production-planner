# Composición y límites

| Intersección | Base / resultado G03c |
| --- | --- |
| Fases + comidas flexibles | G03b productiva; contrato conservado. |
| Fases + conjunta + pausa global / autoridades U02d | Productiva en las topologías previas; contrato conservado. |
| Fases + conjunta + comidas flexibles, perfil pequeño | `MEMORY_WITNESS_ONLY`: 15 tareas + 3 comidas, 84 ramas, certificado existente sin búsqueda, continuación protegida. |
| Tres fases C/EVA → Alfombra + 19 comidas | `MEMORY_WITNESS_ONLY`: 46+19, ocho obligaciones/siete operaciones físicas; ventana EVA 16:00 sólo en el contrafactual. |
| Autoría nativa de esa macro | 65 altas de campos básicos y siete representantes de fases por UI; conjunta `UNSUPPORTED_EXPLICIT`; disponibilidad horaria de EVA `MISSING_NATIVE_PRODUCER`. No semántica canónica completa. |
| SQL de la nueva intersección | Guard READ ONLY rechaza antes de la autenticación física; S1/S2 nuevos de esa combinación `NOT_REACHED`. |
| A/B positivo, transporte, rondas, setup y requiresBand | Sin cambios de admisión, consumidores o cobertura. |

La ocupación de la conjunta representa dos participantes con dos IDs, iguales inicio/fin/espacio/unidad/recursos. El cursor de la cadena avanza una duración y sus peers permanecen en el witness global. Las comidas conservan identidad, ventana, duración y capacidad. El verificador independiente no acepta un solape de terceros por compartir un `jointGroupId` arbitrario: la excepción exige membresía de la autoridad del problema.

## Negativos y autoridad de cada prueba

| Negativo obligatorio | Comprobación focal / límite |
| --- | --- |
| Comida omitida, duplicada, fuera de ventana o duración alterada | `probe.ts`: certificado INVALID, cero búsqueda. G03b conserva sus ataques SQL materiales. |
| Capacidad simultánea excedida | Probe de tres comidas/capacidad 1: INVALID. |
| Último hueco colectivo perdido | Test existente `flexibleMealPhaseComposition.spec.ts`: dominios individuales no vacíos, realización colectiva rechazada sin agotamiento y contrafactual temprano válido. |
| Miembros con tiempos, espacio, equipo o recursos distintos | Cuatro ataques separados al witness focal: INVALID. |
| Tercero solapando recursos conjuntos | La competidora se desplaza sobre la conjunta: INVALID. |
| Fase con hueco o secuencia incorrecta | Dos ataques al witness focal: INVALID. |
| Supporting aceptado prematuramente | `acceptedSupportingPlacements=[]`; la autoría truncada no solicita ni acepta ninguna propuesta. No se atribuye a esto un ataque SQL de la intersección. |
| Witness falso con hashes recalculados | G03b/U02d acreditan sus canales previos. La nueva intersección no llega a ese consumidor SQL; **autenticidad conjunta pendiente**. No se confunde su guard con una validación material. |
| Revisión stale, permisos, fuente y Stage protegido | Focales vigentes y controles G03b/U02d; sin relajar ninguna protección. La nueva combinación no se presenta como aceptada. |

Los doce ataques en memoria no modifican filas persistidas ni son certificados SQL. El resultado global permanece `DIAGNOSTIC_ONLY`, independientemente de los tests y regresiones verdes.
