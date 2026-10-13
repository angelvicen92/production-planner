# Siguiente unidad — continuidad y preferencia temporal

Propuesta de contrato a revisar, **no implementada ni autoridad paralela**.
Las Fuentes oficiales vigentes conservan la autoridad.

Separar `continuity = NONE | PREFERRED | REQUIRED` de una preferencia general
`placement = EARLIEST | LATEST | NONE`. La continuidad describe huecos/bloques de
una capacidad; placement ordena candidatos dentro del dominio hard ya calculado.
El margen de participante es una autoridad de viabilidad distinta; EARLIEST/LATEST
no lo sustituye ni lo relaja. `0` explícito conserva su semántica actual.

Estilismo A2 tiene capacidad compartida 1 y continuidad NONE; apertura preferida
EARLIEST sigue derivando de la geometría serial/matching existente. No añadir
continuidad PREFERRED ni penalización de huecos por defecto. Medir IN→Entrada,
última obligación→Salida, Salida→OUT, permanencia, saturación, huecos y slack.
La Evidence compara baseline, modelo corregido y humano sin llamar evitables a
huecos para los que aún no existe un placement alternativo sound.

El siguiente delta sólo procede después de localizar una decisión concreta de
placement que cree espera evitable y certificar una alternativa bajo el mismo
snapshot/capacidad/recursos/dependencias. No debe cambiar topología ni presupuestos
para mejorar un KPI, ni convertir un horario humano en seed/hint/lock.
