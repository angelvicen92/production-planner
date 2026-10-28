# Jornada integrada creciente

Se reutiliza la autoría real del perfil U02b. Chromium crea plantillas Main/Vocal, configura el perfil general, crea el día y participantes con coach y ventanas. Las APIs de producto crean catálogos, unidades, las otras plantillas y tareas. Cada día toma snapshots propios; ningún EngineInput, propuesta o horario se importa.

| Grupo original U02b | Obligaciones conservadas |
| --- | ---: |
| Vocal→Main, tres participantes y dos coaches | 6 |
| Tres preparaciones y tres cierres | 6 |
| Fase I ×3, fase II ×2, conjunta ×2 y final alternativo ×1 | 8 |
| Tres competidoras físicas y una técnica independiente | 4 |
| **Total original** | **24** |
| Segmento anterior del primer Main real | +1 |
| Segmento posterior del mismo Main | +1 |
| Reality standalone en otra ubicación, con ámbito propio | +1 |
| **Total creciente** | **27** |

La pausa sigue siendo una obligación física en su canal nativo; no se suma como tarea número 28. La conjunta mantiene dos obligaciones individuales y una operación física. La tripleta contiene el Main ya contado; no se duplica. Resultado: 27 tareas y 26 operaciones tras colapsar únicamente los peers conjuntos; los segmentos conservan sus identidades técnicas.

Cuatro días nuevos prueban dos topologías y ambos órdenes. `integrated` y `reverse-order` mantienen fases 3/2/2, AB fijo en fases I/II, conjunta con B directo, Main/Vocal de 10 min y distribución original de coaches. `segmented-joint` y `segmented-reverse` mantienen la variante U02b: AB→AC compartiendo A, primera fase de 10 min, conjunta con unidad B fija, competidora A de 20 min, Main/Vocal de 15 min y distribución distinta de coaches. No se considera que invertir el orden constituya otra topología.

El anclaje exige AB fijo, con anterior/posterior 5/10 min o 10/5 min. Standalone exige AC más B **directo**, duración 15 o 20 min, ámbito itinerante, OPERATION_ONLY y ocupación física. AB y AC compiten realmente por A; fases, rivales, técnica y pausa también compiten por miembros físicos. Las ventanas 08:00–12:00 de participantes, coaches y herramientas permiten el witness construido, dentro de jornada 08:00–16:00. No se suministran inicios ni locks.

La ubicación independiente tiene un kit fijo adicional. OPERATION_ONLY lo excluye sin eliminar B directo ni miembros AC. Esta asignación no modifica recursos o tareas de las 24 originales. `*-original-24`, `*-obligations`, `*-combined-input` y el verificador comparan las identidades y campos originales.
