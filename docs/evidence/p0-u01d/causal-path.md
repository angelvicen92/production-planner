# Antes → primer blocker → delta → después

U01c demostró un defecto de representación, no inviabilidad del perfil: UI sin opciones comunes y Guardar deshabilitado; schema `min(1)` → HTTP 400; lista nominal ficticia → 422 del servicio; SQL 122 rechazaba el mismo contrato. Sus Stages mixtos **sin fases** no acreditaban continuidad REQUIRED. Su contrafactual en memoria sí conservaba fases, recursos por tarea, conjunta y pausa: 17 tareas hard-valid y certificado WITNESS, sin búsqueda de certificado adicional.

U01d expone esa representación existente sin otra autoridad. El schema exige siempre el array y permite vacío sólo si hay fases. El editor explica continuidad temporal y validación física individual, permite conservar recursos comunes y exige retirarlos explícitamente si una edición deja de hacerlos comunes. Recarga y edición conservan ID, conjunta, fases y `[]`; la edición probada permuta miembros de una fase flexible y crea su revisión. El guard lineal sigue necesitando equipo común.

`validateDailyTechnicalChains → validatePhasedMembers` no inventa un recurso: `some` sobre el conjunto vacío no añade permanencia universal. Los recursos efectivos siguen procediendo del resolver de tareas. Las listas no vacías mantienen la misma comprobación para todos los miembros. El preflight de EngineInput deja de convertir una ausencia inválida en vacío; el preflight core devuelve diagnóstico en vez de tratar ese campo inválido como una lista válida. Adapter y canonicalización preservan el array.

El recorrido restante se reutiliza: revisión/snapshot → buildEngineInput → preflight/adapter → cierre de scope y peers → explorer de fases → colocación física → futuro global con pausa → certificado existente → propuesta → Draft → validar → aceptar Stage SQL → continuar con S1 protegido. No se cambian geometría, matching, prioridades, heurísticas ni ledger. El perfil STANDALONE_ONLY no ejecuta matching Main.

123 elimina sólo el mínimo de un elemento en la rama SQL de fases; la rama lineal queda literal. El consumidor de snapshot sigue invocando `assert_anchored_choice_witness` y `assert_operational_meal_snapshot` antes de validar orden/adyacencia de fases. Conserva revisión, run auténtico, fuente material, conjunto completo de obligaciones, igualdad de recursos efectivos, conjunta, dependencias, disponibilidad y protección. `coalesce(jsonb_agg(...),'[]'::jsonb)` expresa la contención vacía sin depender de `IF NOT NULL`. Una tarea sin recursos puede omitir su array opcional; no puede omitir ningún requisito físico real. Los ataques demuestran la comprobación material independiente.

## Comparación sobre la misma jornada

| Ejecución | Autoridad real | S1/S2 | Ramas S1/S2 | Búsqueda del certificado |
| --- | --- | --- | --- | --- |
| U01c mixto productivo | Sin fases | 1+16, sin acreditar REQUIRED | 20/19 | Sin certificado de cadena |
| U01c mixto contrafactual | Fases sólo en memoria | Ningún Stage de esa autoridad | 83/82 | 0 |
| U01d mixto productivo, dos descartables | Fases guardadas, conjunto común `[]` | 1+16 por SQL | 83/82 | 0 |
| U01d segunda topología | Dos fases, conjunto común `[]` | 1+11 por SQL | 47/46 | 0 |
| U01d común | Fases y A común real | 1+16 por SQL | 83/82 | 0 |

El incremento frente al control **sin fases** corresponde a exigir la nueva autoridad real; no se oculta como coste cero. Frente al contrafactual U01c autorizado no aumenta el trabajo. El imposible productivo con fases explora 4.278 ramas, igual al contrafactual U01c con fases; el antiguo producto sin fases exploraba 23. Son contratos distintos. No se aumenta el presupuesto 10.000 ni ningún timeout.

La migración 122→123 sobre histórico poblado conserva filas, 599 tareas, 11 Stages, lectores, políticas RLS y ACL/configuración de todas las funciones. Sólo cambian los cuerpos de los dos validadores. La fuente A2 importada se conserva como regresión separada, no como solución de esta jornada.
