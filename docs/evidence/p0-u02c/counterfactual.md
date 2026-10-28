# Contrafactual físico y verificador independiente

`memory.ts` parte del EngineInput reconstruido desde la App. Retira temporalmente sólo las marcas de familias ajenas durante cada llamada a los projectors de anclaje, ámbitos, conjunta y pausa. Las fases se proyectan con `withDailyTechnicalChains`. Después reúne todas las autoridades y restaura los peers. No se reemplazan tareas, duración, ventanas, coaches, recursos, composición diaria, perfil o políticas físicas. `actual-input` queda inmutable y los originales se comparan por identidad/campos.

La fuente normativa es 01 §§2–3, 03 sobre supporting reparable/testigo global, 04 sobre configuración efectiva/Stage/anclajes y 06 v2.10 sobre agenda/ocupación/herencia. El tamaño 27 y los nombres de estas jornadas sólo pertenecen al harness diagnóstico.

Se ejecutan seis scopes por día: completo; competidora A sola; continuación con esa decisión protegida; anclaje con Vocal visible; continuación con esa operación protegida; peer conjunto con supporting fuera de selección. Cada llamada usa el mismo budget 10.000 ramas, 50 backtracks, 20 patrones y bestK=3. No se usa el witness anterior como seed.

`*-full`, `*-partial`, `*-continuation`, `*-anchor-partial`, `*-anchor-continuation` y `*-supporting-scope` contienen preflight, adapter, scope, problema efectivo, resultado y contadores. `*-witness-validations` valida tareas **y todos los canales físicos**, incluida pausa, sobre el problema global. No se confunde validar sólo la selección visible con certificar el futuro completo.

`verify.py` no importa solver, `validatePlan`, projectors ni App. Desde recursos/snapshots/autoridades comprueba:

- Identidad de las 27 obligaciones y conservación de los campos físicos de las 24 originales.
- Tres Main y tres Vocal, coach exacto, dependencias y ventanas de participante/recurso/unidad/espacio/jornada.
- Recursos directos por identidad diaria, miembros físicos de unidad y herencia LOCATION/OPERATION_ONLY por separado.
- Duración, continuidad before→Main→after, unidad común y Main físicamente exclusivo.
- No solapamiento de recursos compartidos, unidades, participantes o espacios físicos; los segmentos virtuales no consumen capacidad del Main.
- Peers conjuntos sincronizados, fases REQUIRED contiguas y en orden de fase, pausa en su ventana y sin invasión física.
- Selecciones parciales y decisiones protegidas conservadas en el witness de continuación; supporting sin aceptación automática.

El propio verificador recibe nueve falsificaciones por perfil: directo omitido, herencia indebida, Main virtual, anclaje separado, peer separado, hueco de fase, miembro compartido solapado, obligación ausente e invasión de pausa. Debe rechazarlas. Son controles del verificador independiente, **no ataques Stage autenticados ni pruebas SQL**.

`verification.json` y `determinism.json` son los recibos de cierre. El resultado físico en memoria se clasifica separadamente de `UNSUPPORTED_EXPLICIT` productivo. No hay evidencia que justifique otro solver o aumentar budgets.

## Resultado acotado

La topología original completa en ambos órdenes: full y parcial 207 ramas, continuación 1→26 en 205; continuación con anclaje 4→23 en 185/189 según identidades diarias. Se verifican seis witnesses por orden y nueve falsificaciones por perfil positivo. La variante AB→AC agota 10.000 en los seis scopes solicitados y no genera continuación ni witness original. Sus pruebas condicionadas de una sola decisión, separadas en [agotamiento](search-exhaustion.md), producen witness físico completo en 217 ramas. El verificador comprueba esos dos witnesses también, sin contarlos como búsqueda original exitosa.
