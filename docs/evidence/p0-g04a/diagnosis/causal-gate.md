# Gate X/Y/Z/W/M — P0-G04a

- **X:** G03e completa 65/65 y 18/18 hasta S1/S2 SQL. La nueva jornada nativa con 19 IN y 19 OUT contiene 103 obligaciones, pero no permite declarar sus fases.
- **Y inicial:** `requiredPhaseCompositionSupported` y `jointCombinationSupported` excluyen `transportSettings` globalmente. La ejecución descubre además el guard anterior de `dayConfigurationService` y la exclusión adicional de `effectiveConfigurationView`.
- **Z:** la autoridad física REQUIRED y la conjunta no pueden guardarse junto a una autoridad de transporte independiente. El rechazo no explora viabilidad.
- **W contrafactual:** mantener todas las autoridades y retirar sólo las exclusiones de admisión en copias descartables. La cadena conserva siete representantes, ocho obligaciones y cero transportes. Reutilizar el motor y sus consumidores existentes.
- **M observado:** UI guarda 103; adapter conserva 84+19; dos bases producen el mismo witness completo en 3.420 ramas y continuación en 1.377, sin violaciones. El consumidor SQL global rechaza con `ANCHORED_WITNESS_SPACE_CONFLICT` después de superar la admisión contrafactual.

## Hipótesis refinada y falsación

El guard global es conservador respecto a la viabilidad física: la solución completa existe. Sin embargo, la hipótesis de una ampliación sólo de admisión queda falsada. SQL clasifica 34 pares autorizados de transporte como conflictos de espacio porque su excepción de operación física sólo autentica anclajes/conjuntas. No hay pérdida de obligaciones en el adapter ni borrado de transporte del witness de memoria.

Call path real: UI → perfil/snapshot/transporte por ID → buildInput → readiness/adapter SUPPORTED → admisión de fases (UI/servicio/TS/SQL) → scope de unidad + IN supporting → proyección colectiva 84+19 → geometría Main/Vocal y matching → macro REQUIRED + comidas → transporte terminal → witness completo → certificado técnico WITNESS/0 → consumidor SQL global → SPACE_CONFLICT.

Clasificación: autoría **guard conservador**; contrafactual TS **físicamente válido**; consumidor SQL **CONSUMER_DEFECT**. No es inviabilidad global ni agotamiento canónico. El ensayo previo con otro margen agotó 10.000 y permanece como cambio de configuración explícito.

## Decisión

**STOP implementación:** el contrato material no queda validado hasta SQL por los consumidores existentes. No se abren guards productivos, no se añade 131 y no se crea PR. El siguiente delta debe certificar la operación de transporte en el consumidor físico global existente, con negativos auténticos y sin convertir IN/OUT en miembros de las fases; después debe demostrar UI → propuesta → Draft → Stage → continuación de 103 y una topología no A2. No hay causa demostrada para cambiar búsqueda ni presupuestos.
