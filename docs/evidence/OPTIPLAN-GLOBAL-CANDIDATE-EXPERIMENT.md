# Generador global acotado — experimental

Motor base: #1104 / 6c5a1838ed06e0bbd7764a99be027e08b2d23f41. No integrado, sin dependencia productiva.

## Decisión arquitectónica y S2

| Alternativa | Evidencia y coste | Decisión |
|---|---|---|
| Solver propio | Diagnóstico anterior: 193 variables, 4.083 relaciones, ~129 millones de soportes en 60 s y cero hojas. Requeriría cambiar propagación global, soporte binario y estados/reentradas sin prueba de escalabilidad. | Conservar el motor probado para A2. Detener otra expansión de esa DFS en esta entrega. |
| CP-SAT global | Reutiliza dominios y validadores actuales; proceso asíncrono con un worker, 4 GiB, límite CPU, cancelación y timeout. Fixtures originales certificados en 0,457 / 0,547 s de proceso completo; no recibe el witness externo. Canon completo: 30,004 s de solve, 236.583 ramas, 46.316 conflictos y cero candidatos. | Experimental. No integrar ni añadir OR-Tools al producto. `UNKNOWN` es INCONCLUSIVE. |
| Descomposición global–local | A2 tiene un componente conectado; una partición ingenua no independiza recursos compartidos. Puede reducir la decisión global a macroestructuras, pero exige regresar cuando el productor local no cierre. | Dirección preferida para la siguiente prueba, aún no validada como solución. Usar CP-SAT para coordinación global y autoridades canónicas para aceptación. |

La nueva prueba compila desde `source` vigente y protecciones literales: permite cambiar Main/Vocal, inicios, asignaciones de unidades, comidas, órdenes setup y rondas; no lee `priorJoint`, slots previos, fingerprint A2 ni horarios del witness. No llama a `AddHint`. Los candidatos pasan validación completa, replay y cierre. Las restricciones candidatas todavía pueden ser más fuertes o más débiles que algunas autoridades; cualquier negativo conserva INCONCLUSIVE y cualquier discrepancia canónica impide publicar una solución.

Las variaciones de disponibilidad, duración, recursos, protección adicional y renombrado/desplazamiento temporal pasan. El event loop permanece responsive; cancelación y falta de dependencia son INCONCLUSIVE. OR-Tools 9.15.6755 sólo se instaló en un venv bajo `work/`; no se conoce la viabilidad de despliegue del backend productivo. Una integración futura necesitaría un gate explícito, fallback al motor actual y accounting operativo propio verificable, sin conceder otro ledger oculto.

**ASST-010:** S1 y refresh están demostrados en la Evidence anterior. El nuevo generador no produce witness completo protegido, por lo que no supera B3 y no se conecta a `TASK_IDS:[10015]`. El primer bloqueo de esta prueba es la ausencia de candidato en el límite de 30 s. S2 continúa sin propuesta certificada; AcceptedException/provenance/rollback/redo/divergencia siguen NOT_REACHED en el recorrido auténtico. No se repite un ensayo especulativo de 300 s.


## Reproducir la prueba

```sh
python3 -m venv work/cpsat-venv
work/cpsat-venv/bin/pip install ortools==9.15.6755
node --import tsx script/experimental/runGlobalCandidate.ts fixtures
node --import tsx script/experimental/runGlobalCandidate.ts docs/evidence/ASST-010-S2-PROTECTED-FEASIBLE.json work/global-candidate/full
node --import tsx --test --test-isolation=none script/experimental/globalCandidate.spec.ts script/diagnostics/asst010JointComponentExperiment.spec.ts
```

La prueba recibe únicamente `source`, `protectedTasks` y `protectedOperationalMeals`. El artifact externo es un contenedor de autoridades; el witness no cruza el compilador ni se usa como hint. Los fixtures se extraen sin modificar expectativas del diagnóstico original para reutilizarlos. Diez tests del generador y seis del diagnóstico original pasan. No se intenta un S2 real porque el canon completo no supera B3. El resultado negativo no prueba infeasibilidad global. No se aplica migración ni se modifica backend productivo.
