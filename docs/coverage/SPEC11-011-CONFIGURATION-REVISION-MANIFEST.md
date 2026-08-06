# SPEC11-011 — Manifiesto de revisión efectiva y vínculo con planning runs

**Estado:** contrato productivo documental  
**Clasificación futura de implementación:** DB Safe Merge  
**Depende de:** snapshots tipados y fingerprints canónicos  
**Ámbito:** configuración efectiva → revisión inmutable → planning run → resultado → auditoría

---

## 1. Objetivo

Vincular cada ejecución de planificación con:

- la configuración efectiva exacta que consumió;
- el estado operativo exacto que recibió;
- el `EngineInput` exacto entregado al motor;
- el motor, versión, política y presupuesto;
- el resultado completo producido;
- la publicación que el humano aceptó.

El vínculo permitirá detectar si el planning visible continúa actualizado después de modificar configuración, tareas o locks.

---

## 2. Separación obligatoria

### Configuración tipada

Permanece en sus tablas autoritativas:

- jornada;
- snapshots espaciales;
- recursos;
- participantes;
- snapshots de plantillas;
- snapshot del optimizador;
- políticas tipadas;
- overrides.

### Revisión de configuración

Identidad inmutable del conjunto anterior.

Responde:

> ¿Qué configuración gobernaba el día?

### Estado operativo

Incluye:

- tareas;
- status;
- intervalos protegidos;
- locks;
- pausas;
- asignaciones de instancia;
- trabajo pendiente.

Responde:

> ¿Qué realidad se pidió planificar?

### Planning run

Ejecución concreta que une revisión, estado, motor y resultado.

### Publicación

Decisión humana que acepta un run completo y hard-valid.

---

## 3. Decisión de modelo

Se crearán conceptos equivalentes a:

```text
plan_configuration_revisions
plan_configuration_revision_components
```

Y `planning_runs` conservará referencias equivalentes a:

```text
configuration_revision_id
operational_state_fingerprint
engine_input_fingerprint
adapter_version
policy_fingerprint
```

El manifiesto no será una tabla universal de reglas.

Sólo conserva referencias, versiones y fingerprints.

---

## 4. Contrato V1

```ts
interface PlanConfigurationRevisionV1 {
  readonly id: string;
  readonly planId: number;
  readonly contractVersion: 1;
  readonly configurationFingerprint: string;
  readonly components: readonly PlanConfigurationComponentRefV1[];
  readonly createdAt: string;
  readonly createdBy: string | null;
}
```

```ts
interface PlanConfigurationComponentRefV1 {
  readonly componentType: PlanConfigurationComponentTypeV1;
  readonly componentContractVersion: number;
  readonly sourceRef: string;
  readonly fingerprint: string;
  readonly source: "INHERITED" | "DAY_OVERRIDE" | "LEGACY_BACKFILL" | "AD_HOC" | "SYSTEM";
}
```

---

## 5. Componentes V1

Como mínimo:

```text
PLAN_WORKDAY
SPATIAL_AVAILABILITY
RESOURCE_INVENTORY
RESOURCE_ASSIGNMENTS
PARTICIPANT_AVAILABILITY
TASK_TEMPLATE_CATALOG
OPTIMIZER_POLICY
BREAK_POLICY
TYPED_OPERATION_POLICIES
```

Las políticas tipadas pueden dividirse por capacidad cuando aporte mejor trazabilidad:

- setup;
- operaciones conjuntas;
- operaciones ancladas;
- rondas sincronizadas;
- holds;
- coordinación entre espacios.

El componente conserva el fingerprint del contrato efectivo, no sus datos completos.

---

## 6. Fingerprint de revisión

Se deriva de:

```text
contractVersion
+
lista canónica de:
  componentType
  componentContractVersion
  sourceRef
  componentFingerprint
  source semántico
```

No incluye:

- timestamps;
- usuario;
- orden de consulta;
- textos visibles;
- latencia;
- ID autoincremental.

Dos revisiones con contenido idéntico tendrán el mismo fingerprint.

---

## 7. Content addressing

La persistencia utilizará unicidad equivalente a:

```text
(plan_id, configuration_fingerprint)
```

Si la configuración no cambia:

- se reutiliza la revisión;
- no se crean componentes duplicados;
- un nuevo run referencia la misma revisión.

Si cambia un componente:

- se crea una revisión nueva;
- la anterior permanece inmutable;
- los runs anteriores conservan su vínculo.

---

## 8. Estado operativo separado

Cada run conservará un fingerprint distinto para:

- tareas y status;
- intervalos protegidos;
- locks;
- pausas;
- dependencias efectivas;
- asignaciones de instancia;
- tareas canceladas;
- trabajo pendiente.

Esto diferencia:

```text
misma configuración + distinto progreso
```

La configuración no debe cambiar porque una tarea pase a `done`.

El estado operativo sí cambia.

---

## 9. Fingerprint de EngineInput

El run conservará el fingerprint canónico del `EngineInput` realmente entregado al motor.

Debe poder verificarse:

```text
revisión de configuración
+
estado operativo
+
versión del adapter
        ↓
EngineInput fingerprint
```

No se supondrá que los dos primeros fingerprints bastan si el adapter incorpora más contratos.

---

## 10. Persistencia objetivo

### plan_configuration_revisions

- `id`;
- `plan_id`;
- `contract_version`;
- `configuration_fingerprint`;
- `created_at`;
- `created_by` nullable;
- unicidad por plan y fingerprint.

La fila es inmutable.

### plan_configuration_revision_components

- `revision_id`;
- `component_type`;
- `component_contract_version`;
- `source_ref`;
- `component_fingerprint`;
- `source`;
- unicidad por revisión y clave canónica.

### planning_runs

- `configuration_revision_id`;
- `operational_state_fingerprint`;
- `engine_input_fingerprint`;
- `adapter_version`;
- `policy_fingerprint` cuando corresponda.

---

## 11. Inmutabilidad

Una revisión creada no se actualiza.

Prohibido:

- cambiar componentes;
- recalcular el fingerprint sobre la misma fila;
- reemplazar referencias;
- sincronizar con global;
- corregir un backfill legacy en lugar.

Toda corrección crea una revisión nueva.

---

## 12. Referencias históricas

`sourceRef` debe apuntar a una identidad diaria o versionada.

Opciones válidas:

- ID de snapshot diario inmutable;
- ID de versión;
- clave compuesta plan/capability/version.

No utilizar:

- nombre;
- posición;
- ID global mutable sin versión;
- índice de array.

---

## 13. Flujo al planificar

1. cargar configuración efectiva tipada;
2. validar componentes;
3. calcular fingerprints de componentes;
4. construir manifiesto canónico;
5. buscar o crear revisión;
6. cargar estado operativo;
7. calcular fingerprint operativo;
8. construir `EngineInput`;
9. calcular fingerprint de `EngineInput`;
10. crear planning run vinculado;
11. ejecutar motor;
12. validar resultado;
13. publicar sólo mediante decisión separada.

No se deja un run publicable si falta cualquiera de sus vínculos obligatorios.

---

## 14. Coherencia y concurrencia

Si la configuración cambia mientras se construye el manifiesto:

- comparar versiones o fingerprints antes y después;
- abortar con conflicto; o
- reintentar bajo política explícita y acotada.

No se mezclan componentes de dos revisiones.

El run consume un snapshot lógico coherente.

---

## 15. Publicación

La publicación referencia:

```text
planning_run_id
```

El run referencia revisión, estado e input.

No se publica:

- resultado parcial;
- run cancelado;
- run con error;
- resultado no hard-valid;
- fingerprints inconsistentes.

---

## 16. Planning obsoleto

La aplicación comparará:

```text
revisión del planning publicado
        vs
configuración efectiva actual
```

Y:

```text
estado operativo del run
        vs
estado operativo actual
```

Estados:

- `CURRENT`;
- `CONFIGURATION_CHANGED`;
- `OPERATIONAL_STATE_CHANGED`;
- `BOTH_CHANGED`;
- `LEGACY_UNKNOWN`;
- `NO_PUBLISHED_PLAN`.

Un cambio no ejecuta replanificación automática.

El humano decide cuándo simular y publicar.

---

## 17. Cambios semánticos

Marcan configuración distinta:

- jornada;
- disponibilidad;
- recursos;
- participantes;
- plantillas efectivas;
- snapshot del optimizador;
- holds;
- coordinación;
- setup;
- operaciones tipadas.

Marcan estado operativo distinto:

- tareas;
- status;
- locks;
- pausas;
- intervalos protegidos;
- asignaciones de instancia.

No marcan cambio semántico:

- color UI;
- traducción;
- estado de panel;
- orden visual;
- texto explicativo que no decide identidad.

---

## 18. Diff explicable

Los fingerprints detectan cambios.

Los contratos tipados explican cambios.

Salida conceptual:

```ts
interface ConfigurationRevisionDiff {
  readonly fromRevisionId: string;
  readonly toRevisionId: string;
  readonly changedComponents: readonly {
    readonly componentType: string;
    readonly fromFingerprint: string | null;
    readonly toFingerprint: string | null;
    readonly summary: readonly string[];
  }[];
}
```

No se mostrará sólo “el hash cambió”.

---

## 19. Legacy

Runs antiguos sin revisión se marcan:

```text
LEGACY_UNKNOWN
```

No se inventa una revisión histórica.

Un manifiesto reconstruido posteriormente deberá indicar:

```text
LEGACY_RECONSTRUCTION
```

No se asociará como si representara exactamente el estado original del run.

---

## 20. Evidence

Evidence de un run incluirá:

- `configurationRevisionId`;
- `configurationFingerprint`;
- componentes y fingerprints;
- `operationalStateFingerprint`;
- `engineInputFingerprint`;
- adapter version;
- motor y versión;
- policy fingerprint;
- result fingerprint;
- publicación;
- comparación current/stale cuando se consulta posteriormente.

No es necesario duplicar valores resolubles desde snapshots inmutables.

---

## 21. UI

La pantalla de planning mostrará:

```text
Configuración usada: revisión R…
```

Con:

- fecha;
- origen;
- fingerprint abreviado;
- estado current/stale;
- componentes cambiados;
- diff;
- run;
- motor;
- advertencias legacy.

No se mostrará “desactualizado” sin causa.

---

## 22. ORC

ORC podrá consumir la revisión como contexto inmutable.

Una recomendación que cambie configuración crea una revisión candidata.

ORC no modifica una revisión existente ni aplica configuración de otro plan por inferencia.

---

## 23. Tests obligatorios

### Fingerprints

- orden canónico;
- componente añadido;
- componente eliminado;
- valor cambiado;
- timestamps ignorados;
- determinismo;
- input inmutable.

### Reutilización

- misma configuración reutiliza revisión;
- distinta configuración crea revisión;
- planes distintos no comparten fila;
- concurrencia no duplica.

### Runs

- vínculo obligatorio;
- fingerprints exactos;
- run error;
- run cancelado;
- run completo;
- no publicación parcial.

### Estado stale

- sólo configuración;
- sólo operación;
- ambos;
- metadata visual neutral;
- legacy unknown.

### Regresión

- comportamiento histórico cuando la capacidad está ausente;
- tareas protegidas intactas;
- locks intactos;
- SPEC10-021 intacta;
- Focal A2 determinista.

---

## 24. Fases futuras

### Checkpoint 1

Fingerprints de componentes y tests puros.

### Checkpoint 2

Persistencia de revisiones y componentes.

### Checkpoint 3

Vínculo con `planning_runs`.

### Checkpoint 4

Estado stale y diff.

### Checkpoint 5

Publicación, UI y Evidence.

No se implementará antes de que existan suficientes snapshots tipados.

---

## 25. Qué no hacer

- no copiar configuración completa a JSON;
- no usar el manifiesto como motor de reglas;
- no mutar revisiones;
- no inventar historia;
- no incluir timestamps en fingerprints;
- no mezclar configuración y estado;
- no marcar stale por metadata visual;
- no replanificar automáticamente;
- no tocar SPEC10-021.

---

## 26. Criterios de aceptación

SPEC11-011 queda documentalmente completa cuando:

- separa configuración, estado, run y publicación;
- define revisión inmutable;
- define componentes sin duplicar reglas;
- define fingerprints y reutilización;
- vincula planning runs;
- define stale y diff;
- trata legacy honestamente;
- define Evidence y UI;
- protege tareas y locks;
- divide implementación en checkpoints;
- no afirma que la revisión ya exista.

---

## 27. Regla final

> Un plan no es reproducible sólo porque guardemos sus barras.  
> Es reproducible cuando sabemos qué configuración, qué estado, qué motor y qué decisión produjeron esas barras.  
> El manifiesto no decide.  
> Demuestra qué gobernó la decisión.