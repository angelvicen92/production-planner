# A/B y una sola unidad funcional posterior

## A — componer lo que existe

Se evalúa antes de diseñar otro contrato físico.

| Autoridad existente | Qué aporta | Por qué no resuelve por sí sola el caso |
| --- | --- | --- |
| Dependencias de plantillas/tareas | Precedencia de cada participante, respetada por todas las realizaciones. | No prohíben huecos ni establecen orden de fases entre participantes. Crear precedencias por nombre o una secuencia nominal observada sería una regla inventada. |
| `operationContinuity` | Continuidad temporal de miembros declarados; separada de ocupación. | Preflight observado: `UNSUPPORTED_OPERATION_CONTINUITY_MEMBERS` por multi-espacio/conjunta. No describe fases parcialmente ordenadas. Relajar sólo este guard no crea esa semántica. |
| Continuidad por espacio | Huecos de la actividad de ese espacio. | Tres espacios independientes no expresan adyacencia entre fases; tampoco obliga a ocupar recursos fuera de las operaciones. |
| Presencia de recurso REQUIRED | Concentra operaciones que consumen un recurso real. | No existe recurso común. Usar un recurso ficticio o extender A a la fase final cambia la física y puede eliminar competencia legítima. |
| Varias cadenas locales | Garantías locales de subconjuntos. | API admite máximo una; incluso ampliándolo, falta adyacencia y orden entre las unidades locales. No recomendar esa ampliación lateral. |
| `taskOperationScopes` | Agenda, herencia, ocupación y declaraciones directas independientes. | No establece secuencia. PUT real con conjunta da 422. No usar una autoridad visual/espacial como sustituto de continuidad temporal. |
| Composición itinerante fija | Resuelve miembros físicos de una unidad configurada. | Aporta AB a las fases que la requieren; asignarla a una operación C añade AB y produce ABC. No libera miembros de la misma unidad. Una operación posterior puede dejar de declarar la unidad y usar recursos propios, pero la cadena diaria excluye hoy incluso ese caso. |
| `technicalChains.phases` interno + recursos efectivos de tareas | Orden entre fases, permutación interna, adyacencia, conjunta y disponibilidad física por operación. | **Sí basta en el consumidor existente**, con conjunto común vacío. No atraviesa los contratos diarios/SQL actuales. |

Conclusión: A no basta **sin cambio de autoría/certificación**, pero evita crear otra implementación funcional de secuencia o asignación. No hay motivo demostrado para un nuevo solver, editor, tabla, matcher, presupuesto o ledger de recursos.

## B — extensión mínima de la autoridad existente

Una descripción de continuidad por fase/recurso completa podría declarar qué identidad persiste, dónde hay transición o recomposición y durante qué tramo. **Este caso no exige esa nueva matriz**: los requisitos nominales de cada operación ya declaran AB/AB/B,C. Duplicarlos en una segunda autoridad introduciría sincronización y más validadores sin una garantía nueva demostrada.

El delta mínimo recomendado expone explícitamente una posibilidad ya representable internamente: **una policy por fases con `requiredResourceIds: []` significa que no añade permanencia nominal universal; mantiene `adjacency: REQUIRED`, `resourceContinuity: REQUIRED` y todos los requisitos efectivos de las operaciones.** No se admite campo ausente como sinónimo de vacío; las policies previas no vacías siguen imponiendo exactamente su garantía común. La rama lineal anterior conserva su contrato. Debe preservarse la distinción en schema, editor existente, revisión/replay y consumidores SQL, con compatibilidad/versionado explícitos dentro de esa misma autoridad.

No se propone quitar `requiredResourceIds` ni relajar `resourceContinuity` globalmente. La retirada ciega de una garantía común real permitiría declaraciones falsas. El contrafactual conserva la propiedad de tiempo y prueba por separado que los recursos físicos no se pierden, que la conjunta no se divide y que los HARD materiales siguen rechazándose.

## Próxima unidad única: fases nominales REQUIRED sin recurso común

Alcance recomendado: perfil nominal `STANDALONE_ONLY` ya certificado por U01b, con conjunto común explícitamente vacío y recursos fijos por operación, conjunta y pausa. Reutilizar explorer, placement, futuro colectivo, certificado, proyección y writer existentes. Alinear productores y validadores existentes, sin añadir capas ni representar recursos por nombre.

Aceptación falsable para esa unidad funcional, todavía pendiente:

1. Guardar y recargar las fases mixtas desde el editor y API existentes; revisión/fingerprint/replay conservan el conjunto común vacío explícito. Campo ausente, recurso desconocido, cantidad no representable y lista falsa no vacía continúan rechazándose.
2. El perfil de **17 obligaciones** llega a S1 competidora A y S2 restante por SQL auténtico **con la autoridad de fases mixta guardada**; futuro global de 17 y pausa, cero HARD/REQUIRED nuevos, identidad de S1 conservada y certificado sin segunda búsqueda. Añadir otra topología nominal no equivalente como gate funcional, sin asumir que el control itinerante de tres tareas la sustituye.
3. SQL autentica recursos exactos de cada operación, identidad de conjunta, fases, adyacencia, dependencias, disponibilidad, descanso, revisión/run, Draft y protección. Rechaza ataques materiales con hashes recalculados. Maneja ∅ explícitamente, sin semántica accidental de NULL en `jsonb_agg`.
4. Se conserva la política común no vacía de U01b y su rama lineal histórica; no se permite liberar un recurso cuya permanencia sí se declaró. No alterar 001–122: cualquier cambio SQL funcional sería incremental en aquella unidad, nunca en esta auditoría.
5. El negativo 55/40 sigue sin propuesta, sin Stage y sin exhaustion. A liberado puede competir durante fase 3; un hold explícitamente declarado lo impide. No inventar hold, preparación ni transición por cambio de nombre/fase.
6. Evidencia de determinismo, continuación y coste proporcionada. No aumentar presupuestos ni introducir otro solver. Regresión focal primero; A2 separado sólo según riesgo material de la implementación posterior.

**Fuera de esa unidad:** itinerancia general, alternativas de equipos, recomposición dinámica de miembros, herencia/agenda complejas, transiciones positivas entre estos ámbitos, Main/Vocal, transporte, setup y rondas junto a la cadena. La exclusión itinerante es conservadora en el control probado, pero abrirla requiere su propio certificado SQL material; no se encadena por transitividad con el soporte nominal.

Experimento mínimo pendiente antes de declarar W productivo: el mismo `mixed` con fases aceptadas por una extensión revisable del contrato diario y sus validadores existentes, seguido de apply→Draft→validate→S1/S2 y ataques SQL auténticos. **No falta evidencia para identificar W; falta el gate funcional de su implementación autorizada en otra unidad.**
