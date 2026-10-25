# Contratos y autoridades

Autoridad normativa por ámbito: Fuente 00 v2.15; 01 v5.4 (tarea técnica sin participante válida cuando explícita, recursos, autoridad humana/protección); 02 v2.2 (razonamiento interno sin redefinir Stage); 03 v3.8 (unidades, scopes, geometría/matching/materialización y witness futuro); 04 v2.9 (identidad/dependencias lossless, configuración efectiva, provenance, Draft/Stage/replay); 05 v2.8 (Evidence y no confundir truncamiento con inviabilidad); 06 v2.10 (sólo protección del canon A2); 07 v2.3 §4.4 (hipótesis causal falsable). [Índice de lecturas/hashes](authorities.json).

El maestro P0 exige jornadas nuevas, no dependencia de A2. DEP-05 del catálogo orienta a reutilizar `technicalChains.ts`, pero su nota histórica sobre pérdida de siblings no describe el cierre actual: `buildAssistedProblem` **sí** cierra políticas explícitas y conserva futuro. Sus tablas no sustituyen el código. U00o anticipó ausencia de productor de cadenas sin ejecutarla; U00p sólo añadió autoridad de rondas. Esta unidad prueba ambas cosas de nuevo en su base.

## Dos contratos diferentes

**Secuencia inferida:** `Task.dependencies` viene de `dependsOnTemplateIds` congelados y resolución diaria por identidad. Las técnicas del experimento son sin participante; resolver con `contestantId===null` no es adivinar por nombre. Con una sola instancia de cada plantilla se obtiene T1→T2→T3. Una cardinalidad distinta puede ser otra topología y no se certifica aquí. No se añade política al input por derivar esa secuencia.

**Cadena explícita de EngineInput:**

```ts
interface EngineInputTechnicalChainInput {
  id: string;
  orderedTaskIds: number[];
  phases?: number[][];
  adjacency: 'REQUIRED';
  resourceContinuity: 'REQUIRED';
  requiredResourceIds: number[]; // identidades del inventario diario
}
```

`TechnicalChainPolicy` del solver conserva esos campos con namespaces canónicos `task:`, `technical-chain:` y `plan-resource:`. Sus severidades no son OFF/PREFERRED: no se inventa un selector genérico. `phases` permite otro contrato de orden parcial; **no se ejecuta ni se propone habilitarlo aquí**. La política no necesita ser inferida para consumirla: la adaptación proyectada la soporta de forma tipada.

Preflight exige IDs de tareas/recursos existentes, cadena no duplicada, miembros únicos, ≥2, propietario único y fases compatibles cuando existen. El core tiene validación adicional de referencias, linealidad/ciclos e identidad. La comprobación de disponibilidad es física y posterior; política bien formada no equivale a geometría factible.

## Perfil y límites que importan

| Entrada | Admisión / límite actual |
| --- | --- |
| STANDALONE_ONLY | EXACT_CONSTRUCTIVE, sin mainFlow, auxiliary/technical explícitos |
| Técnica lineal completa, byItem nominal | soportada, propuesta y Stages A/B reales |
| Auxiliar independiente física con participante | soportada, continuidad S1→S2 real |
| Técnica aislada sin unidad itinerante física | adapter SUPPORTED; exact standalone UNSUPPORTED. `*-isolated-technical.json` |
| Prefijo inferido protegido y sucesoras pendientes | exact standalone pierde cadena pendiente; rechazo reproducido por producto en A |
| Prefijo explícito protegido | A sí propone continuación en memoria; B conserva rechazo físico correcto |
| Técnica con anyOf/byType como si fuera ordinary auxiliar | no se habilita: las autoridades nominales ordinary y de cadena no son intercambiables; los tests existentes preservan límites |
| Cadena explícita guardable en día nuevo | sin productor; ni perfil general estricto ni `dayConfigEditSchema` admiten `technicalChains` |
| Legacy 088 | lector tipado sí contiene `technicalChains`; JSON histórico inmutable, exclusivo con profile nuevo; no usarlo como migración/editor |
| Combinaciones con rondas/setups/joint/itinerancia | no certificadas por esta unidad |

## Revisión, permisos y replay

`projectEffectiveAuthoritiesFromEngineInputV1` incluye `technicalChains` en la autoridad de workday; la proyección cambia identidad y replay. El fingerprint de snapshot de planning sólo representa decisiones, no reemplaza configuración. El test frío recomputa ambas identidades y ambos replays a partir de sus snapshots oficiales y del input exacto.

Las API usan Auth real con cinco roles y PostgREST; viewer/aux/norole no pueden pedir propuestas. Se verifican 409 de fingerprint de Draft falso, revisión real no reemplazada en el run, apply/validate/accept auténticos y exactitud de decisiones protegidas. SQL 088 impide escribir histórico; 105 mantiene exclusividad de autoridad. Las migraciones 110/113 vinculan certificados físicos, origen, freshness, snapshot y scope; 114 refuerza materialmente rondas nativas, **no todo contrato arbitrario**.

El probe directo de `apply_day_config_operation_v5` es una llamada real service_role con actor ADMIN y CAS/identidades auténticos, dentro de BEGIN/ROLLBACK. Su payload de cambio es `{}`, pero la identidad/replay candidata incluye cadena. Devuelve revisión (no error); la fila recién creada guarda identidad/replay proyectados, mientras el plan conserva profile original y configuración histórica null. Se conserva el recibo completo. La hipótesis “SQL siempre rechaza cualquier autoridad no materializada” queda falsada. Es un límite del writer genérico, no permiso de producción para introducir cadenas ni certificado válido de su geometría.

No se hizo commit de esa revisión, no se desactivó un trigger y no se alteró Auth/RLS. Tras rollback la sesión es idéntica; el run con input proyectado y revisión auténtica devuelve STALE_CONFIG_REVISION. El diseño siguiente debe vincular materialmente autoridad almacenada, identidad/replay y certificado en ambas fronteras; un hash recalculado no basta.
