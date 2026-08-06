# SPEC11-007 — Registro versionado de capacidades configurables

**Estado:** registro inicial documental y machine-readable  
**Clasificación:** Fast Merge documental  
**Depende de:** SPEC11-001 y SPEC11-006  
**Archivos autoritativos:**

- `docs/coverage/configurability-registry.schema.json`;
- `docs/coverage/configurability-registry.json`.

---

## 1. Objetivo

Mantener un inventario único, versionado y revisable de las capacidades operativas configurables de OptiPlan.

El registro permite responder sin reconstruir todo el historial:

- qué capacidades existen;
- cuáles están activas en producto;
- cuáles sólo están demostradas en Planner Next;
- cuáles son WIP;
- cuáles son inseguras;
- qué capa falta;
- qué blocker permanece;
- qué riesgo de hardcode existe;
- qué fuentes justifican el estado.

No sustituye a las SPEC ni a Evidence.

Resume el estado verificable y enlaza sus autoridades.

---

## 2. Autoridad

El orden de autoridad es:

```text
fuentes oficiales
        > Evidence reproducible
        > código y tests del head auditado
        > registro de configurabilidad
        > descripción de PR
```

Si el registro contradice una fuente o Evidence, debe corregirse el registro.

No se cambia la realidad del producto editando únicamente el estado del registro.

---

## 3. Snapshot de auditoría

Cada versión conserva:

- `registryVersion`;
- `auditedMainSha`;
- `auditedAt`;
- fuentes utilizadas;
- lista de capacidades.

El SHA evita mezclar afirmaciones de distintos estados del repositorio.

Cuando `main` avance, no es obligatorio actualizar el SHA por cambios neutrales.

Sí deberá actualizarse cuando cambie:

- una capacidad registrada;
- una capa;
- un blocker;
- una activación productiva;
- un fingerprint protegido;
- una Evidence relevante;
- una fuente normativa.

---

## 4. Estado global

### COMPLETE

La capacidad recorre todas sus capas materiales y está respaldada por validación y Evidence.

### PARTIAL

Existe una parte sustancial, pero falta una capa material.

### WIP

Existe trabajo aislado todavía no integrable o no activable.

### DOCUMENTED_ONLY

Existe contrato documental, no implementación productiva.

### ABSENT

No existe la capacidad en la capa o en producto.

### UNSAFE

Existe un comportamiento productivo que puede reinterpretar, perder o inventar configuración.

### N_A

La capa no corresponde a esa capacidad.

---

## 5. Productive

`productive: true` significa que la aplicación real consume actualmente alguna forma de esa capacidad.

No significa que esté completa.

Una capacidad puede ser productiva y `UNSAFE`.

`productive: false` significa que:

- está aislada en fixtures;
- está en shadow/WIP;
- está documentada;
- o no está conectada a la ruta de producto.

---

## 6. Capas

El registro exige estado para:

- dominio;
- configuración general;
- snapshot diario;
- override de instancia;
- API;
- UI;
- `buildInput`;
- `EngineInput`;
- preflight;
- Planner Next;
- búsqueda o scoring;
- validación;
- publicación;
- fingerprint;
- Evidence.

Una capa `COMPLETE` no convierte el conjunto en `COMPLETE`.

---

## 7. Riesgo de hardcode

### NONE

No existe riesgo material conocido.

### LOW

La capacidad es estructurada, pero quedan detalles de trazabilidad o producto.

### MEDIUM

Faltan snapshots, contratos productivos o integración que podrían inducir excepciones.

### HIGH

Existen lecturas globales tardías, formatos amplios, defaults duplicados o pérdidas materiales.

### CRITICAL

La capacidad puede cambiar silenciosamente días existentes, eliminar restricciones hard o activar una semántica falsa.

El riesgo no sustituye al estado.

---

## 8. Reglas de actualización

Todo PR que cambie una capacidad registrada deberá:

1. actualizar las capas afectadas;
2. actualizar blockers;
3. actualizar `productive` si cambia activación;
4. actualizar `hardcodeRisk` si existe Evidence;
5. añadir o corregir `sourceRefs`;
6. actualizar SHA y fecha cuando corresponda;
7. no marcar `COMPLETE` sólo porque pasen tests focales;
8. no eliminar un blocker antes de que desaparezca en producto o en la ruta declarada.

---

## 9. Reglas de alta

Una nueva capacidad deberá añadirse cuando aparezca por primera vez en cualquiera de estas formas:

- requisito oficial;
- contrato documental aprobado;
- campo persistido;
- campo EngineInput;
- reason code;
- capacidad de motor;
- validador;
- publicación;
- UI operativa.

No se esperará a que esté terminada.

Registrar pronto evita que una mitad implementada se confunda con capacidad completa.

---

## 10. Reglas de baja

Una capacidad no se elimina porque deje de usarse.

Opciones:

- marcar `OFF` como semántica de ausencia;
- mantenerla como legacy;
- registrar sustitución;
- documentar migración;
- conservar source refs.

Sólo podrá retirarse cuando:

- no exista dato persistido relevante;
- no exista compatibilidad necesaria;
- no exista ruta productiva;
- no exista Evidence protegida;
- la fuente oficial autorice la retirada.

---

## 11. Registro inicial

La primera versión contiene veinte capacidades.

### Completas

- disponibilidad temporal de espacios;
- disponibilidad temporal de recursos.

### Productivas parciales

- jornada;
- disponibilidad de participantes.

### Productivas inseguras

- duración efectiva de tarea;
- dependencias efectivas;
- requisitos efectivos de recursos;
- snapshot del optimizador.

### Motor demostrado pero no productivo completo

- operaciones conjuntas;
- setup explícito;
- setup flexible;
- operaciones ancladas;
- transición direccional de coach.

### WIP

- rondas sincronizadas REQUIRED;
- gate de configurabilidad.

### Documentadas

- snapshot efectivo de plantillas;
- hold posterior;
- coordinación PREFERRED entre espacios;
- UX de origen y override.

### Ausente

- configuración productiva completa de Planner Next.

---

## 12. Decisión de prioridad

El registro confirma que el primer cambio de código de mayor valor continúa siendo:

```text
PLAN_TASK_TEMPLATE_SNAPSHOT
```

Motivo:

- desbloquea duración, dependencias y requisitos reproducibles;
- evita reinterpretación silenciosa;
- crea base para holds y coordinación;
- reduce varios riesgos críticos a la vez;
- no exige todavía modificar búsqueda exacta.

La implementación continúa pausada mientras no exista una vía fiable de edición y ejecución completa de tests.

No se sustituye por una implementación parcial remota.

---

## 13. Validación futura automática

Una unidad posterior podrá añadir un checker que valide:

- JSON contra schema;
- IDs únicos;
- orden canónico;
- sourceRefs no vacíos;
- `COMPLETE` sin blockers;
- `UNSAFE` con blocker;
- capacidades productivas sin capas críticas `ABSENT` salvo deuda explícita;
- SHA de 40 caracteres;
- fechas válidas;
- actualización obligatoria desde PR template.

El checker no decidirá si una afirmación es verdadera.

Sólo verificará consistencia estructural.

La verdad material seguirá requiriendo revisión de código, tests y Evidence.

---

## 14. Qué no hacer

- no generar estados desde nombres de archivos;
- no contar tests como prueba suficiente de producto;
- no ocultar WIP como PARTIAL productivo;
- no marcar COMPLETE con blockers;
- no borrar deuda sin Evidence;
- no actualizar el SHA sin revisar las capacidades afectadas;
- no utilizar el registro como feature flag;
- no cargar el registro dentro del motor;
- no convertirlo en tabla universal de reglas.

---

## 15. Criterios de aceptación

SPEC11-007 queda aceptada cuando:

- existe schema versionado;
- existe inventario inicial;
- cada capacidad tiene estado por capa;
- cada capacidad declara ausencia;
- cada capacidad declara riesgo;
- cada capacidad declara blockers y fuentes;
- se distingue productivo de demostrado;
- se identifica el siguiente cambio estructural;
- el registro puede actualizarse en futuros PR;
- la deuda deja de depender de memoria conversacional.

---

## 16. Regla final

> Las SPEC definen lo que debe existir.  
> La Evidence demuestra lo que funciona.  
> El registro declara qué parte está realmente conectada.  
> Ninguna de las tres puede sustituir a las otras.