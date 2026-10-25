# Una implementación siguiente posible — sólo diseño

No se implementa en U00q. No se necesita un nuevo algoritmo para el contrato lineal factible demostrado. Tampoco se necesita editor para planificar secuencias que toleran esperas y se seleccionan completas. El objetivo de esta opción sería permitir **declarar** una obligación adicional de adyacencia y equipo nominal continuo, evitando a la vez el corte inferido accidental mediante identidad explícita y cierre de scope.

## Autoridad mínima diaria

Un único contrato diario versionado para una cadena lineal de tareas técnicas reales ya creadas. Shape conceptual (nombre físico de columna a decidir en la implementación):

```ts
{
  contractVersion: 1,
  policies: [{
    id: string,              // estable, creado por servidor
    orderedTaskIds: number[], // >=2, mismo día, roles técnicos explícitos
    adjacency: 'REQUIRED',
    resourceContinuity: 'REQUIRED',
    requiredResourceIds: number[] // inventario diario; presentes en cada miembro
  }],
  by: string, at: string     // provenance producida por writer
}
```

Corte inicial propuesto: como máximo una cadena, lineal, sin `phases`, técnicas sin participante, sin joint/setups/itinerancia/rondas simultáneas en la misma declaración; recursos nominales físicos byItem existentes. Duraciones y ventanas proceden de tareas/espacios/recursos efectivos, sin duplicarlas. El número de fases y las duraciones pueden variar entre días. No inventar OFF/PREFERRED, equipo equivalente, recursos retenidos en huecos ni consumo adicional invisible. Ausencia conserva comportamiento previo.

La restricción inicial es un alcance de gate propuesto, no una nueva regla normativa ni afirmación de incapacidad del core para otros contratos. Toda ampliación necesita Evidence propia.

## Reutilización semántica de U00p

Reutilizar la operación diaria autenticada con CAS, actor ADMIN/PRODUCTION, locks/freshness de fuentes, revisión/diff/provenance y fingerprints/replay. Declarar miembros **después** de existir las instancias. El perfil general congelado no puede almacenar IDs diarios que aún no existen; no se crea un catálogo paralelo de “cadenas del día” en ajustes generales ni se reescribe 088.

La operación candidata debe producir una autoridad efectiva persistida que `buildEngineInput` consuma losslessly. El writer debe comparar materialmente la autoridad anterior/nueva y admitir únicamente el delta autorizado en identidad/replay. El probe SQL actual demuestra que no basta reutilizar v5 con `{}` y añadir un nuevo JSON al replay. Añadir un guard del certificado que ate policy efectiva, miembros/recursos, revisión y snapshot. No duplicar un solver SQL completo; sí impedir omitir o falsificar la autoridad y sus relaciones materiales al aceptar.

UI mínima en Configuración del día: elegir tareas y su orden, mostrar duraciones/ventanas y equipo nominal, explicar que REQUIRED exige cero huecos. Mostrar ausencia, efectiva releída y diagnóstico de incompatibilidad. Guardar una política bien formada no garantiza factibilidad; la propuesta debe explicar el cero dominio cuando las ventanas no permiten continuidad. No permitir que un campo libre de “tipo de cadena” finja topologías no representables.

La unidad explícita reutiliza el recomendador TECHNICAL_CHAIN, cierre de todos los miembros, futuro analítico, explorer y validación actuales. La selección recomendada debe incluir la unidad completa para no aceptar supporting fuera de la intención visible. Preservar separación entre witness futuro y tareas aceptadas.

## Protección e históricos

Aceptar configuración sobre tareas pendientes con Draft limpio y sin propuesta activa, mediante las mismas garantías transaccionales de U00p. Si una política nueva o su edición afecta placements aceptados, `done`, `in_progress` o locks, rechazar conservadoramente salvo un contrato posterior explícito. El soporte del solver para prefijo fijo **no** autoriza por sí mismo editar retrospectivamente la autoridad de un Stage. Las nuevas políticas se configuran antes de aceptar la cadena; luego su identidad permite continuar sin perder el prefijo.

Rollback/redo restaura decisiones y su revisión histórica; no reescribe la regla vigente ni sus snapshots. Conservar origin/admisiones U00n y relación con revisiones de plan/sesión. No rebootstrap para resolver un stale o para ocultar el caso D.

## Gate falsable del siguiente PR

Dos jornadas nuevas configuradas por producto: A alcanza Stage explícito; B conserva NO_PROPOSAL con ventanas imposibles y sólo alcanza Stage tras una corrección de ventana explícita autorizada/versionada, no una inyección. La independiente inicial mantiene witness completo, sin aceptar las técnicas futuras; continuación conserva placements nominales protegidos. Se prueban permisos, CAS, fuentes concurrentes, prefijo/retirada protegidos, falsificación de identidad/replay/snapshot y sustitución de equipo. Las técnicas aisladas y los contratos no habilitados siguen con diagnóstico explícito; esta autoridad no promete resolverlos.

Repetición, validación material de cero huecos y recurso, replay frío y A2 según alcance de cambios. Sin ampliar presupuestos ni migrar producto desde este diagnóstico. Si la siguiente prioridad se limita a secuencias sin adyacencia, el caso D puede justificar en su lugar corregir el reconocimiento residual inferido; no se debe construir este editor sólo para evitar investigar esa clasificación. Es una decisión de alcance posterior, no una segunda implementación propuesta aquí.

Comportamiento X —no poder declarar una cadena REQUIRED diaria— es causado por Y —ausencia de productor efectivo y vínculo material de revisión— y produce Z —orden ordinario aceptable sin garantía de adyacencia—; el delta W debe añadir esa autoridad mínima reutilizando consumidores existentes, y esperamos observar M —Stage explícito auténtico y rechazos físicos, de identidad y de protección sin eludir ninguna frontera—.
