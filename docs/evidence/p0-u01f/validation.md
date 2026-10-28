# Validación, determinismo y límites

Los resultados y tiempos definitivos están en `validation.json`; el verificador independiente produce `verification.json`. `native/` y `repeat/` son dos bases PostgreSQL/Auth/PostgREST nuevas, con ledger literal 001–124 y datos creados por API. Los manifests contienen hashes del checkout ejecutado y `checkoutDelta=[]`. El overlay del runner sólo afecta dispatch de Evidence y caché Vite del archivo descartable.

La física se verifica independientemente de SQL: identidad y mapping diario; recursos efectivos exactos; disponibilidad de persona/espacio/recurso/unidad; dependencias; deduplicación de conjunta; conflictos de recursos compartidos; adyacencia y orden de fases; pausa; preservación literal de S1 en S2. Después se comparan entre bases propuestas, snapshots y fingerprints, unidades/miembros, witness, certificado y contadores work completos, sin normalización.

A, B, C, baseline y snapshot sin consumidor conservan **83/82 ramas**. D conserva **179/178**, igual al perfil U01e con la pausa temprana. common-unit conserva 83/82. La segunda topología usa S1 macro+preparaciones, en lugar de sólo competidora: **47/5**; es un cambio explícito de scope, no una modificación de búsqueda. El imposible conserva 4.278 ramas y NO_PROPOSAL para 55>40. Los certificados consumen cero búsqueda adicional.

## Gates y alcance de los resultados

- TypeScript del producto y harness, build, secuencia de migraciones y 44 pruebas focales.
- Bases limpias 001–124; upgrade poblado 123→124 con datos/lectores/políticas y metadata de permisos idénticos. 599 tasks y 11 Stages históricos permanecen intactos.
- UI existente recargada y editada; API real, roles negativos, CAS concurrente 200/409, revisión obsoleta, materialización y reconstrucción.
- Negativos SQL con hashes recalculados y snapshots reales; protección de Stage por privilegios y trigger; rollback/redo.
- Regresiones U01d, U01b y cadena lineal; A2 importado separado 266/266, 11 Stages, 27.049 ramas y fingerprint histórico.

La suite local global tiene **3.304/3.305 PASS**. El único fallo es ASST-010 en `runA2Assist7Evidence.ts:181`: NO_PROPOSAL / ASSISTED_SCOPE_INCOMPLETE / SEARCH_TIME_LIMIT_REACHED. U01d ya documentaba este fallo en su base. La reproducción adicional sobre la base exacta se conserva en `checks/baseline-asst010.log`; no se aumenta el timeout ni se cambia ese benchmark para hacerlo verde. No se declara un gate global totalmente verde. La CI del PR y del head vivo prevalece sobre esta fotografía.

La regresión lineal comparte la corrección de caché Vite ya usada por U01b/U01d: cada archivo descartable tiene su propio optimizer cache aunque las dependencias sean compartidas. No cambia código productivo ni timeouts. U01d compara los cuerpos SQL vigentes en lugar de fijar 123; su perfil y expectativas se mantienen.

El harness conserva cualquier 409 de fuentes. Sólo permite una nueva solicitud de validación si **token de fuentes, Draft y base siguen idénticos**; no reintenta otra búsqueda ni modifica límites. El guard NOWAIT y la protección CAS permanecen activos. Los intentos fallidos y diagnósticos están descritos en `attempts.json`.

## Límites explícitos

No certifica alternativas any/byType/anyOf, membresía dinámica, transiciones positivas ni ausentes, scopes complejos de agenda/herencia/ocupación, Main/Vocal, setup, rondas, transporte o anclajes asociados a esta macro. SQL no aplica todavía el margen positivo de unidad en todas las parejas independientes: por eso se mantiene fuera, sin convertirlo en regla universal de negocio. No añade otra autoridad de continuidad, matriz de recursos por fase, solver ni editor.

El A2 histórico es una regresión importada, no autoría completa desde UI. La siguiente frontera de composición sigue siendo ámbitos explícitos y transiciones materialmente certificadas, antes de alternativas y dinámica; no se implementa aquí. No hay Supabase remoto, Replit, despliegue ni merge.
