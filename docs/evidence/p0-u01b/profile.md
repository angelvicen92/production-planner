# Obligaciones y perfiles integrados

El primer perfil conserva el inventario de U01a, creado de nuevo sin fixture A2:

| Trabajo | Obligaciones individuales | Pasos físicos | Recursos/dependencias |
| --- | ---: | ---: | --- |
| Preparaciones individuales | 3 | 3 | Preceden A de cada participante; supporting en scopes de unidad. |
| Fase A | 3 | 3 | 5 min cada una, kit común. |
| Fase B | 2 | 2 | 5 min cada una, depende de A propia. |
| Fase C conjunta + individual | 3 | 2 | Conjunta de 10 min para dos participantes; individual de 5; depende de B/A correspondientes. |
| Cierres independientes | 3 | 3 | Dependen de C; quedan fuera de la unidad contigua. |
| Competidora | 1 | 1 | 15 min, mismo kit, participante del tercer flujo. |
| Pausa física explícita | Canal físico independiente | 1 | 15 min; espacios A/B/C y kit; ventana flexible 09:00–09:30. |

Son **15 tareas, 14 operaciones productivas físicas y una pausa**. La unidad contiene siete operaciones/40 minutos, ocho obligaciones individuales. Kit: 55 minutos físicos de trabajo + 15 de pausa = 70. No se suman dos veces los diez minutos conjuntos.

S1 solicita sólo la competidora: una propuesta/decisión aceptada, witness global de 15 y pausa. S2 incorpora las otras 14 obligaciones sin mover S1. Seleccionar representante, peer no listado como paso o espacio C cierra ocho obligaciones, sin convertir preparaciones en scope solicitado.

La segunda topología usa dos participantes: dos preparaciones, dos A, dos B, dos miembros de una conjunta, dos cierres y competidora = **11 obligaciones**. Fases declaradas `[[A1,A2],[conjunta,B1,B2]]`: cinco operaciones/30 minutos; las dependencias HARD fuerzan B1/B2 antes de conjunta dentro de la segunda fase. Todas consumen kit y cada B consume además una segunda herramienta. Se guarda primero la cadena mediante identidad PRODUCTION y después conjunta y pausa. No depende de tres fases ni de 3/2/2.

El tercer día vuelve al perfil de 15 obligaciones con pausa fija **08:30–08:45**. Obliga a desplazar el bloque completo respecto al perfil flexible y conserva sus permutaciones. Los receipts y `verification.json` fijan los inicios efectivamente encontrados.

El control imposible reduce el kit a **08:00–08:40** y declara pausa 08:20–08:35: 70 > 40 minutos. Guarda la misma autoridad multifase; la búsqueda devuelve NO_PROPOSAL por capacidad material. El test de futuro añade otro control: una prefijación individualmente válida en medio del único intervalo continuo destruye la última realización de 40 minutos y no obtiene propuesta.

Los IDs de los receipts son los retornados por API. Ninguna condición productiva usa nombres o identidades de estos ejemplos. La disponibilidad, duración, márgenes cero y requisitos están explícitos en las plantillas/snapshots creados por producto.

| Perfil | Ramas S1 / S2 | Presupuesto por propuesta | Ramas extra del certificado |
| --- | --- | --- | --- |
| Integrado 3/2/2 | 81 / 80 | 10.000 | 0 |
| Segunda topología 2/3 | 46 / 45 | 10.000 | 0 |
| Pausa fija desplazada | 225 / 224 | 10.000 | 0 |
| Imposible 70/40 | 6, sin propuesta | 10.000 | No se emite certificado |

Los dos descartables repiten exactamente estos contadores. El inicio del bloque pasa de 08:15 a 08:45 al fijar la pausa interior; mantiene sus 40 minutos contiguos. No hubo agotamiento en estos casos.
