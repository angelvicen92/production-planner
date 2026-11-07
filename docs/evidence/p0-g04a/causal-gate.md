# Gate X/Y/Z/W/M — P0-G04a, continuación

El [corte anterior](diagnosis/causal-gate.md) queda conservado: witness en memoria, cero Stages y rechazo SQL. Esta continuación repara el consumidor demostrado.

- **X:** los IN sincronizados task:34/C12 y task:37/C13, 09:00–09:05, espacio 8, paquete `[34,37,40]` válido, son rechazados por SQL 130.
- **Y:** `assert_anchored_choice_witness` autentica anclajes/conjuntas como una operación; omite el paquete de transporte que TS reconoce mediante `synchronizedTransportTasks`. El trigger nominal ya contiene su chequeo de paquetes.
- **Z:** una jornada nativa físicamente realizable de 103 obligaciones queda fuera de Stage, pese a 3.420/1.377 ramas y certificado WITNESS/0.
- **W:** factorizar la autoridad SQL de paquetes existente en 131, vincularla a templates/snapshots/revisión y reutilizarla en la competencia global. Abrir la admisión nativa de fases/conjunta con preflight estricto; conservar la ocupación externa y transporte independiente de fases.
- **M:** witness original aceptado por SQL; ataques materiales rechazados, incluidos tercero/etiqueta falsificada/recurso externo; propuesta auténtica → Draft → validación → S1/S2 SQL 103/103 y topología alternativa 28/28. Dos bases frías comparadas sin normalizar diferencias físicas.

## Falsación

El positivo original se ensaya con metadata sintética y rollback antes de generar propuestas productivas. No se cuenta como Stage. La [pareja causal](implementation/causal-pair.json) y las [definiciones PostgreSQL instaladas](implementation/first-falsation/manifest.json) identifican la pérdida exacta.

La excepción exige que ambos IDs pertenezcan a un mismo paquete devuelto por el consumidor autenticado. Coincidir en hora, espacio o etiqueta no basta. Cada transporte tiene participante/dirección únicos, grupo sincronizado dentro de mínimos/máximos y gaps, y fronteras frente a toda obligación, incluidas comidas. Disponibilidad, dependencias, recursos, coaches, identidad de propuesta/Draft/revisión y protección se comprueban por los consumidores vigentes.

`blocksSpace=false` es una representación permitida por Fuente 04. Se mantiene la exclusividad existente y se exceptúa sólo la competencia interna del paquete. Así se preserva su conflicto con terceros sin introducir otra regla de ocupación.

## Continuación y coste

El [replay original](implementation/memory-replay/comparison.json) conserva 3.420/1.377 ramas y las propuestas originales. La continuación productiva usa 205 por el witness `JOINT_COMPLETION` que el servicio ya recupera del linaje de S1; retirar exclusivamente ese witness vuelve a 1.377. Se reproduce el witness del servicio literalmente. No cambia búsqueda, presupuesto ni heurística.

La macro conserva siete representantes y ocho obligaciones físicas, sin IN/OUT dentro de fases. S1=8 es el resultado real del resolver con supporting auténtico; no es una imposición del arnés. Las 19 comidas y todos los transportes pendientes conservan witness global hasta S2=103.

El genérico conserva 28 obligaciones con cinco participantes, otra política IN/OUT, sensor con ventana propia, conjunta y competidora externa. Su ataque de recurso evita el margen tras IN, aislando `ANCHORED_WITNESS_RESOURCE_CONFLICT`. Los ajustes de arnés (Chrome local, ejecución secuencial ante ERR_NETWORK_CHANGED y lector 131) no modifican el producto ni sus límites.

## Complejidad y frontera

Se añade un helper SQL al servidor, compartido por dos consumidores, y se sustituyen exclusiones de admisión. No se añade scheduler, verificador de comidas ni segunda búsqueda para certificar. 131 conserva firmas/metadatos/ACL/RLS anteriores y no cambia filas históricas durante upgrade.

La siguiente frontera hacia 266 nativas son los cruces con anclajes/ámbitos, pausas físicas/operativas, rutas, transiciones positivas, rondas, setups, alternativas y requiresBand. Siguen sin certificarse aquí. El benchmark A2 histórico no acredita su autoría desde UI.
