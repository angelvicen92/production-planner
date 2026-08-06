# SPEC11-009 — Criticidad de fuentes y semántica de fallo de EngineInput

**Estado:** contrato documental de frontera de integración  
**Clasificación futura de implementación:** DB Safe Merge  
**Baseline auditado:** `main@873803296db243026e267eb6f371f31ed2f9d388`  
**Depende de:** SPEC11-001, SPEC11-006 y SPEC11-008  
**Archivos machine-readable:**

- `docs/coverage/engine-input-source-criticality.schema.json`;
- `docs/coverage/engine-input-source-criticality.json`.

---

## 1. Objetivo

Definir qué debe ocurrir cuando falla cada fuente utilizada para construir `EngineInput`.

La regla central es:

> Un error de carga no define la semántica de ausencia.

La aplicación deberá distinguir:

- entrada hard;
- entrada hard sólo cuando es referenciada;
- señal opcional;
- compatibilidad legacy;
- dato diagnóstico;
- lectura global prohibida;
- entrada requerida futura todavía no implementada.

---

## 2. Problema actual

`buildEngineInput` contiene un helper genérico equivalente a:

```ts
safe(fn, fallback)
```

La función captura cualquier error y devuelve el fallback recibido.

El helper no conoce:

- la severidad del dato;
- si la colección vacía es un resultado válido;
- si el plan es legacy;
- si el dato está referenciado;
- si la pérdida elimina una restricción;
- si debe publicarse warning;
- si el motor puede continuar.

Por tanto, la política de fallo queda dispersa en cada llamada y, en varios casos, transforma una excepción en ausencia neutral.

---

## 3. Taxonomía

### 3.1 REQUIRED_INPUT

La fuente forma parte de la realidad mínima necesaria para planificar.

Ante:

- error de almacenamiento;
- contrato inválido;
- duplicado contradictorio;
- referencia rota;
- versión desconocida;

la construcción se detiene.

No se devuelve un `EngineInput` parcial.

Ejemplos:

- plan;
- tareas;
- locks;
- participantes;
- snapshots espaciales;
- inventario de recursos;
- asignaciones de recursos;
- requisitos de tipos.

### 3.2 CONDITIONAL_REQUIRED_INPUT

La fuente sólo es hard si otra parte del input la referencia.

Ejemplos:

- componentes de recursos compuestos;
- asignación de coach cuando una tarea exige coach;
- pausas cuando existen obligaciones persistidas.

Proceso:

1. identificar referencias;
2. cargar o validar la fuente;
3. abortar si falta un miembro referenciado;
4. permitir ausencia sólo cuando no existe referencia.

### 3.3 OPTIONAL_SIGNAL

La fuente sólo modifica calidad, orientación o diagnóstico.

Puede continuar con neutralidad si:

- publica warning;
- no cambia hard validity;
- no afirma que el dato estaba presente;
- el fingerprint registra la ausencia de la señal cuando sea relevante;
- no se utiliza como prueba de inviabilidad.

Los bundles actuales pertenecen a esta clase.

### 3.4 LEGACY_COMPATIBILITY

La fuente o fallback sólo existe para planes anteriores al contrato actual.

Debe distinguir:

```text
fila ausente legítimamente
        ≠
consulta fallida
```

La compatibilidad deberá publicar:

- source `LEGACY`;
- reason code;
- valor reconstruido;
- limitación;
- fingerprint efectivo.

No se activará ante cualquier excepción.

### 3.5 DIAGNOSTIC_ONLY

La pérdida no cambia el plan ni la calidad seleccionada.

Puede continuar con warning diagnóstico.

No debe reutilizarse posteriormente como entrada operativa sin reclasificarla.

### 3.6 FORBIDDEN_GLOBAL_READ

La fuente global puede utilizarse al:

- crear un plan;
- inicializar explícitamente un snapshot;
- comparar una actualización solicitada.

No puede utilizarse para interpretar o planificar un día existente.

Actualmente:

- `getTaskTemplates()`;
- `getOptimizerSettings()`;

pertenecen a esta clase dentro de `buildEngineInput`.

### 3.7 FUTURE_REQUIRED_INPUT

La fuente todavía no existe, pero el contrato ya decide que será hard cuando se implemente.

Ejemplos:

- snapshots de plantillas por plan;
- snapshot diario del optimizador.

Su registro no activa una capacidad inexistente.

---

## 4. Políticas de fallo

### ABORT_BUILD

- no devuelve `EngineInput`;
- publica error tipado;
- conserva causa;
- no ejecuta motor;
- no publica planificación previa como nueva;
- no degrada a fallback.

### ABORT_IF_REFERENCED

- permite ausencia cuando no existe obligación;
- aborta si una tarea, recurso o política referencia la entidad;
- identifica todos los IDs afectados;
- no elimina sólo los miembros conflictivos.

### CONTINUE_WITH_WARNING

- utiliza identidad neutral definida;
- publica warning estructurado;
- no afecta hard validity;
- conserva Evidence de señal ausente;
- no se confunde con dato vacío cargado correctamente.

### CONTINUE_WITH_MARKED_LEGACY

- sólo tras demostrar ausencia de snapshot o versión histórica;
- nunca ante timeout, RLS, error de red o SQL;
- publica origen y reconstrucción;
- permite migración posterior explícita.

### NOT_ALLOWED

La llamada no debe existir en esa fase.

El gate deberá detectarla.

### N_A_UNTIL_IMPLEMENTED

La fuente se registra como diseño futuro.

No implica que una ruta actual deba llamarla ni que la capacidad esté soportada.

---

## 5. Clasificación actual

El registro inicial contiene 25 fuentes o subfuentes.

### REQUIRED_INPUT

- detalles completos del plan;
- participantes;
- asignaciones de recursos por zona;
- asignaciones por espacio;
- requisitos de tipo por zona;
- requisitos de tipo por espacio;
- inventario de recursos del plan;
- snapshots diarios de zonas;
- snapshots diarios de espacios;
- plan;
- tareas;
- locks.

### CONDITIONAL_REQUIRED_INPUT

- componentes de recursos compuestos;
- pausas;
- asignación de coach.

### OPTIONAL_SIGNAL

- bundles;
- componentes de bundle;
- afinidades de bundle.

### LEGACY_COMPATIBILITY

- cámaras del plan sin snapshot;
- catálogos globales de espacios y zonas mientras propiedades no temporales sigan sin snapshot.

### FORBIDDEN_GLOBAL_READ

- task templates durante planificación;
- optimizer settings durante planificación.

### FUTURE_REQUIRED_INPUT

- snapshot de plantillas por plan;
- snapshot del optimizador por plan.

---

## 6. Distinción entre vacío y fallo

Una colección vacía puede ser válida.

Ejemplos:

- plan sin locks;
- plan sin pausas;
- plan sin bundles;
- tarea sin dependencias;
- espacio sin asignaciones adicionales.

Pero sólo si la consulta:

- terminó correctamente;
- devolvió contrato válido;
- corresponde al plan solicitado;
- no omitió páginas;
- no fue rechazada por RLS;
- no perdió relaciones requeridas.

Por tanto, las APIs internas deberán devolver resultados discriminados o lanzar errores tipados.

No se utilizará el mismo valor para:

```text
SUCCESS_EMPTY
```

y

```text
LOAD_FAILED
```

---

## 7. Errores tipados

Cada fuente hard tendrá un reason code estable.

Estructura objetivo:

```ts
interface EngineInputSourceIssue {
  readonly sourceId: string;
  readonly reasonCode: string;
  readonly planId: number;
  readonly severity: "ERROR" | "WARNING";
  readonly phase: "LOAD" | "NORMALIZE" | "RESOLVE" | "VALIDATE";
  readonly entityIds: readonly string[];
  readonly message: string;
  readonly causeClass?: string;
}
```

No se publicarán:

- credenciales;
- SQL completo;
- stack interno al cliente;
- datos personales innecesarios.

Los logs server-side conservarán la causa técnica.

---

## 8. Envelope de construcción

La futura frontera podrá devolver:

```ts
type BuildEngineInputResult =
  | {
      readonly status: "SUPPORTED";
      readonly input: EngineInput;
      readonly warnings: readonly EngineInputSourceIssue[];
      readonly sourceFingerprint: string;
    }
  | {
      readonly status: "UNSUPPORTED";
      readonly input: null;
      readonly issues: readonly EngineInputSourceIssue[];
      readonly sourceFingerprint: string;
    };
```

Alternativamente puede mantener excepciones internas, siempre que la ruta pública produzca un envelope equivalente.

Requisitos:

- resultado atómico;
- warnings separados de errors;
- fingerprint incluso en unsupported cuando sea seguro;
- orden canónico;
- output frozen;
- input original inmutable.

---

## 9. Fingerprint de fuentes

El fingerprint deberá representar:

- fuentes esperadas;
- fuentes cargadas;
- versiones;
- fuentes legacy;
- señales opcionales ausentes;
- errores tipados sin incluir texto volátil;
- IDs y valores semánticos efectivos.

No incluirá:

- timestamps de consulta;
- mensajes de excepción variables;
- orden de llegada;
- stack traces;
- latencia.

Dos ejecuciones contra el mismo snapshot deberán producir el mismo fingerprint aunque cambie el orden de las filas.

---

## 10. Concurrencia

La carga paralela sólo es segura cuando:

- todas las fuentes pertenecen al mismo snapshot lógico;
- no se actualiza el plan durante la lectura;
- se conserva versión o fingerprint común;
- una fuente no se relee después de resolver otra.

La futura configuración efectiva deberá incorporar una versión de día.

Si una mutación cambia la versión durante la construcción:

- abortar;
- reintentar de forma explícita y acotada; o
- devolver conflicto.

No mezclar filas de dos versiones.

---

## 11. RLS y autorización

Un error RLS no es una lista vacía.

Las rutas deben:

1. autorizar el plan;
2. cargar mediante autoridad server-side;
3. distinguir entidad inexistente de no accesible según contrato de seguridad;
4. no propagar detalles sensibles;
5. no continuar con menos restricciones.

La ausencia por RLS siempre detiene una fuente hard.

---

## 12. Compatibilidad legacy

Un plan se considera legacy sólo mediante una condición estructurada.

Ejemplos válidos:

- no existe ninguna fila de snapshot porque el plan es anterior a la migración;
- existe `contractVersion` antigua reconocida;
- existe `source=legacy_backfill`.

No son pruebas de legacy:

- error de red;
- timeout;
- excepción SQL;
- error de parsing;
- array vacío después de catch;
- propiedad `undefined` en un objeto parcialmente cargado.

---

## 13. Cambio de criticidad

La criticidad pertenece a la semántica, no al loader.

Una fuente OPTIONAL_SIGNAL deberá convertirse en REQUIRED_INPUT si una evolución utiliza sus datos para:

- hard validity;
- capacidad;
- disponibilidad;
- asignación obligatoria;
- publicación contractual;
- decisión protegida.

El mismo PR deberá actualizar:

- registro de criticidad;
- inventario HCF;
- capability registry;
- preflight;
- tests;
- Evidence.

---

## 14. Orden futuro de implementación

### Checkpoint 1 — Tipos y helpers

- enums de criticidad;
- issue tipado;
- loaders hard/soft;
- tests puros;
- sin cambiar todavía todas las llamadas.

### Checkpoint 2 — Recursos

Migrar:

- inventario;
- asignaciones;
- requisitos;
- componentes.

Añadir pruebas de fallo y ausencia válida.

### Checkpoint 3 — Configuración diaria

Tras SPEC11-002:

- snapshots de plantilla;
- eliminar `getTaskTemplates()`;
- fingerprint de fuente.

### Checkpoint 4 — Optimizador

Tras snapshot diario del optimizador:

- eliminar `getOptimizerSettings()`;
- versionar política.

### Checkpoint 5 — Envelope y publicación

- resultado atómico;
- diagnostics;
- UI de error;
- Evidence productiva.

No mezclar todos los checkpoints en un único PR.

---

## 15. Tests obligatorios

### Loaders hard

- éxito con datos;
- éxito vacío válido;
- excepción;
- contrato inválido;
- RLS;
- timeout simulado;
- determinismo;
- inmutabilidad.

### Conditional hard

- no referenciado y ausente;
- referenciado y presente;
- referenciado y ausente;
- referencia parcial;
- múltiples afectados.

### Soft

- éxito;
- fallo con warning;
- neutralidad de hard validity;
- Evidence de señal ausente;
- orden invariante.

### Legacy

- snapshot presente;
- ausencia estructurada;
- error no confundido con legacy;
- source y fingerprint.

### Global reads

- test que falla si `buildEngineInput` llama a catálogo global después de implementar snapshots;
- no llamada en planes existentes;
- inicialización explícita permitida fuera de planificación.

### Regresión

- done e in_progress intactas;
- locks intactos;
- Focal A2 protegido;
- bundles continúan siendo soft;
- ausencia válida no produce falso error.

---

## 16. Qué no hacer

- no eliminar `safe` y dejar catches equivalentes dispersos;
- no convertir todas las fuentes en hard;
- no mantener todas como soft;
- no usar `null` para error y ausencia;
- no clasificar por nombre del método;
- no publicar un input parcial;
- no silenciar RLS;
- no inventar legacy;
- no envolver un error hard como warning;
- no hacer fallback entre motores para ocultar input incompleto;
- no cambiar SPEC10-021 en esta unidad.

---

## 17. Criterios de aceptación

SPEC11-009 queda documentalmente completa cuando:

- toda fuente auditada tiene ID;
- toda fuente tiene criticidad;
- toda fuente tiene política de fallo;
- vacío y error quedan separados;
- conditional required queda definido;
- legacy queda definido estructuralmente;
- lecturas globales prohibidas quedan registradas;
- señales soft conservan warning;
- se definen errores y fingerprint;
- se define orden de implementación;
- no se modifica código productivo;
- no se afirma que `buildInput` ya sea seguro.

---

## 18. Regla final

> Una producción sin recursos no es igual que un error al cargar recursos.  
> Un día sin locks no es igual que un error al cargar locks.  
> Una señal soft ausente puede degradarse.  
> Una obligación hard ausente debe detener el plan.  
> La diferencia debe existir en el tipo, en el preflight y en la Evidence.