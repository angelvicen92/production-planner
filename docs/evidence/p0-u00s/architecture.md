# Autoridad y camino efectivo

Base `ed4cc0b32c6a5850292c7157f07dee570180696b` (#1196). Fuente 00 v2.15 y autoridades 01–07 vigentes; método causal 07 §4.4. U00q identifica la ausencia del productor y el ataque de replay; U00r conserva el reconocimiento inferido, sin cambios en esta unidad.

Una columna nullable `plans.daily_technical_chains` conserva `{contractVersion:1,policies:[…],by,at}`. Máximo una policy, orden lineal explícito, ≥2 técnicas sin participante, dependencias exactamente del componente lineal demostrado, recursos nominales diarios requeridos por byItem en cada miembro. Las tareas existen antes de la selección. Duraciones, espacios, disponibilidad y requisitos siguen en sus autoridades anteriores. No hay catálogo de IDs diarios ni cambios en perfiles congelados/088.

`technicalChainStructureSchema` → Configuración del día → operación EDIT existente con expectedRevisionId → `validateDailyTechnicalChains` → identidad/replay canónicos → RPC v5. La procedencia y el actor salen de SQL. ADMIN/PRODUCTION, CAS, locks de fuentes, Draft limpio y ausencia de propuesta pendiente se comprueban en transacción. La policy no puede modificarse ni retirarse si toca tareas ejecutadas, locks, placements actuales o miembros colocados en cualquier Stage histórico, incluso tras rollback.

`buildEngineInput` aplica la autoridad real al final de la composición diaria. Sólo la autoridad nativa añade `dailyTechnicalChainsVersion=1`: selecciona explícitamente todos los compañeros elegibles y activa el certificado productivo nuevo. La policy conserva su orden por array en identidad, replay y adapter, aunque sus IDs no sean crecientes. Sin autoridad el input original se devuelve literalmente; una retirada no añade policy efectiva. El marcador no es una segunda autoridad ni se usa para redefinir fingerprints.

Los consumidores anteriores resuelven preflight, adapter, recomendación TECHNICAL_CHAIN, geometría contigua, matching nominal byItem, Future Feasibility, búsqueda exacta, validatePlan y Proposed Draft. No se modifican algoritmos, presupuestos ni el reconocimiento U00r. La selección ordinaria sin policy sigue permitiendo esperas.

Para una propuesta nativa, `certifyDailyTechnicalChain` conserva todos los placements aceptados/propuestos y reutiliza el explorador de cadenas con la parte **no consumida** del presupuesto existente. Revalida con el scope y contexto de Assisted; guarda un witness material bajo Evidence, separado del Draft. Sus ramas adicionales quedan explícitas en `technicalChainCertificate.consumed`; `execution.work` conserva los contadores originales. Si no alcanza el presupuesto, el resultado no se promueve a PROPOSAL ni se declara inviabilidad. No hay segundo solver ni retención en huecos.

## Fronteras SQL de 115

La implementación v5 de 114 permanece una sola vez: se renombra y el wrapper conserva el punto de entrada service-only. El wrapper nuevo comprueba únicamente la transición de cadenas y delega las demás categorías, inserción final de revisión, actualizaciones de sesión e invalidación. Los tres lectores de fuentes se extienden para reconocer también `technicalChainTransition`; conservan literalmente los registros de transición de rondas.

El writer genérico de 104 ya captura una revisión CANONICAL_MATERIALIZATION si el puntero de plan precede al estado canónico/bootstrap actual. Para cadenas se ejecuta esa misma captura **antes** de cambiar la autoridad, bajo los mismos locks/CAS y dentro de la misma transacción. No se actualiza ninguna revisión histórica. Así el guard universal puede verificar materialmente tanto el estado anterior como el candidato. No hay excepción al guard para una metadata candidata coherente.

`guard_technical_chain_revision` comprueba cada INSERT de revisión, incluidos inicialización y writers anteriores: technicalChains del replay debe ser idéntico a la autoridad efectiva real. El ataque U00q —payload vacío con hashes/replay de cadena pero sin autoridad— se rechaza incluso con identidad consistente. Toda inserción/cambio parcial revierte con el statement.

`assert_daily_technical_chain_snapshot` se ejecuta al insertar una validación y al insertar un Stage posterior a S0. Contrasta revisión vigente/replay, identidades diarias, byItem, duraciones, espacios, disponibilidad de día/zona/espacio/equipo, comida global, dependencias, orden, adyacencia exacta, transiciones físicas y conflictos con otros placements. Cuando no están colocados todos los miembros exige el witness de una propuesta auténtica asociado al mismo snapshot/revisión/run. Un prefijo tiene que ser inicial, literal y compatible con el witness completo; no acepta huecos interiores ni subconjuntos arbitrarios. El guard no busca horarios en SQL.

No es necesario aceptar una cadena futura para proteger su factibilidad. El gate D acepta sólo la independiente; sus tres técnicas siguen pendientes. El SQL revalida la realización completa efímera frente a esa independiente. El guard de Stage vuelve a comprobar la misma autoridad al consolidar, además de freshness/source/origin/validación de 110/113/114. Rollback/redo conserva la regla vigente y los snapshots históricos.

## Complejidad y frontera

La migración añade una columna, un wrapper acotado, guards materiales y extensiones de lectores ya existentes. Evita duplicar íntegramente v5, copiar el solver a SQL, añadir tablas de políticas o un framework estructural. El código de hashing JSON y las garantías de rondas se reutilizan sin reescribir migraciones históricas.

Fuera de soporte: más de una cadena, phases/orden parcial, ciclos/branching, recursos alternativos/equivalentes, soft/OFF/PREFERRED, técnicos con participante y mezclas con setup, joint, sincronización o itinerancia. La UI selecciona la unidad completa; no ofrece crear prefijos arbitrarios. El guard material sí admite prefijos iniciales cuando una propuesta auténtica proporciona su continuación certificada, probado focalmente sin fingir un Stage parcial nativo.
