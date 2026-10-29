# P0-G03e — gate causal

Base y rama verificadas en GitHub: `8d97d4c6f30fb13a97fe673845755422f50cb3c1`, `codex/p0-g03e-joint-required-phases-flexible-meals-sql`. El checkout inicial G03c estaba limpio; se recuperó la base autorizada antes de editar.

- **X:** G03d guarda la ventana diaria, las fases y las comidas, pero la conjunta sigue deshabilitada.
- **Y:** `jointCombinationSupported` exige pausa global; `requiredPhaseCompositionSupported` excluye todos los peers en modo flexible. SQL 120/128 repite ambas exclusiones.
- **Z:** las dos obligaciones conjuntas no pueden adquirir su autoridad física y llegar juntas a Stage.
- **W:** admitir únicamente comida flexible con fases REQUIRED, utilizando el mismo witness global y los mismos validadores. Guardar primero fases y después conjunta; sin fases, la conjunta flexible permanece explícitamente cerrada en TS y SQL.
- **M:** autoría UI y reconstrucción → scope desde cada peer → propuesta auténtica → Draft → validación → S1/S2 SQL → lectura PostgreSQL nueva y continuación protegida, con todas las comidas globales certificadas.

## Antes

El probe G03c se repitió sobre G03d sin modificaciones: 15 productivas + 3 comidas, 84 ramas, 8 obligaciones visibles desde el peer, certificado WITNESS y cero búsqueda adicional, 12 negativos en memoria, continuación exacta. No es un Stage.

## Autoridades y consumidores reutilizados

`effectiveConfigurationView` publica la admisión a los dos editores. El writer v5 guarda las fases y luego `dailyJointGroups` mediante revisión/CAS. `buildInput` reconstruye fases → anclajes → ámbitos → conjunta → pausas → rutas y revalida propiedad de fases tras materializar peers. No se cambia ese orden.

`assistedScopeResolver` cierra peers antes y después de propiedad REQUIRED. `buildAssistedProblem` conserva comidas analíticas y la proyección colectiva; `executeAssistedPlanning` utiliza el planificador existente. `technicalChains` permuta dentro de cada fase, materializa los dos peers mediante `scheduleJointGroup` y avanza una duración.

`certifyDailyTechnicalChain` consume el mismo witness completo, sin búsqueda. `assertNominalProposalWitness` autentica identidad, recursos, unidad, geometría y correspondencia con Draft. SQL `assert_anchored_choice_witness` autentica los dos IDs y su igualdad física y conserva todos los enfrentamientos con terceros. 128 ya incorpora todas las comidas a ese consumidor cuando existen fases; por eso no se amplía a conjunta flexible sin fases.

130 sólo cambia los dos predicados SQL de admisión. Los cuerpos efectivos se reconstruyen con el lector de contratos existente y se comparan con PostgreSQL. No hay scheduler, certificado, resolver, writer o sistema de revisión nuevo. Motor, presupuestos, matching, poda y Future Feasibility permanecen literales.

## Autoría y determinismo

La UI muestra que las fases deben guardarse primero. Una conjunta nueva deriva su identidad de los IDs ordenados de miembros; preserva la identidad de grupos ya guardados y evita colisiones al reutilizar antiguas selecciones. No utiliza nombres, IDs de fixtures, horas ni duraciones del escenario.

## Experimentos de entorno

Los intentos iniciales con servidor Vite agotaron conexiones de Chromium y mostraron `ERR_INSUFFICIENT_RESOURCES`/`ERR_NETWORK_CHANGED`. No llegaron al consumidor nuevo. El harness usa el build de producción local en Chromium y mantiene exactamente Auth, PostgREST, el ledger y los endpoints reales; no cambia timeouts o presupuestos de producto. Las bases se ejecutan secuencialmente para evitar cambios de red Docker durante navegación.
