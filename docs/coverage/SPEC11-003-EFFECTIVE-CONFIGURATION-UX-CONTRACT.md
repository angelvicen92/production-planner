# SPEC11-003 — Contrato UX de configuración efectiva, herencia y overrides

**Estado:** diseño de producto ejecutable  
**Clasificación:** Fast Merge documental  
**Fuente normativa:** SPEC-11 y auditoría SPEC11-001  
**Dependencia técnica futura:** SPEC11-002  
**Ámbito:** configuración general, snapshot diario, override de instancia, UI, API, trazabilidad y visualización operativa

---

## 1. Objetivo

Definir un patrón único de producto y UI para toda configuración operativa de OptiPlan.

El usuario debe poder comprender y editar, sin conocer la arquitectura interna:

- qué valor está usando realmente el día;
- de dónde procede;
- si está heredado o sobrescrito;
- qué entidad bloquea o coordina;
- si la regla es REQUIRED, PREFERRED u OFF;
- qué cambiará antes de guardar;
- si el cambio exige replanificar;
- qué versión de configuración utilizó una planificación.

Este contrato evita que cada capacidad futura añada controles aislados, defaults invisibles o formularios incompatibles.

---

## 2. Fuera de alcance

Esta unidad no implementa migraciones, RLS, endpoints, componentes React, motor, actualización manual de snapshots, integración productiva de Planner Next ni cambios en SPEC10-021.

Define el comportamiento que deberán respetar esas implementaciones.

---

## 3. Modelo mental obligatorio

La UI no presentará la configuración como un único valor editable.

```text
DEFAULT GENERAL
      ↓ copia explícita
SNAPSHOT DEL DÍA
      ↓ override explícito
INSTANCIA
      ↓ protección
LOCK / DECISIÓN HUMANA
```

La interfaz distinguirá siempre:

- valor heredado;
- override;
- valor efectivo;
- origen efectivo;
- estado de protección.

Un campo vacío nunca representará a la vez herencia, OFF, cero y ausencia.

---

## 4. Estados visibles

| Estado UI | Significado |
|---|---|
| `HEREDADO` | El valor procede del snapshot del día o de un nivel superior permitido. |
| `SOBRESCRITO` | Existe un override explícito en el nivel actual. |
| `DESACTIVADO` | La capacidad está explícitamente en OFF. |
| `PROTEGIDO` | Un lock, `in_progress`, `done` o decisión humana impide modificar su efecto. |
| `INCOMPLETO` | Falta un dato requerido. |
| `INCOMPATIBLE` | La combinación contradice otra configuración hard. |
| `LEGACY` | El valor fue reconstruido mediante compatibilidad histórica. |

`HEREDADO` y `DESACTIVADO` no son equivalentes.

---

## 5. Componentes UX reutilizables

### 5.1 EffectiveValueField

Debe mostrar:

- etiqueta;
- valor efectivo;
- unidad;
- badge de origen;
- severidad cuando proceda;
- control de override;
- acción `Restaurar heredado`;
- ayuda contextual;
- validación local;
- impacto resumido.

Ejemplo:

```text
Tiempo posterior: 5 min     [Heredado del día]
Severidad: REQUIRED
Bloquea: Espacio

[Usar valor diferente en esta tarea]
```

### 5.2 SourceBadge

Valores normalizados:

- General;
- Snapshot del día;
- Override de instancia;
- Legacy reconstruido;
- Decisión protegida.

Nunca se mostrará únicamente un icono sin texto accesible.

### 5.3 SeverityControl

Control único para:

```text
REQUIRED | PREFERRED | OFF
```

- REQUIRED: una solución que incumpla la regla es inválida.
- PREFERRED: puede incumplirse con penalización y explicación.
- OFF: no participa.

No se usará un checkbox para una capacidad de tres estados.

### 5.4 ConfigurationDiff

Antes de actualizar un snapshot o varias instancias mostrará:

- valor anterior y nuevo;
- origen anterior y nuevo;
- entidades afectadas;
- tareas pendientes afectadas;
- tareas `in_progress` o `done` no modificables;
- necesidad de replanificación;
- advertencias hard.

### 5.5 ConfigurationImpactSummary

Resumen no predictivo:

- `Aumentará la ocupación de 12 tareas`;
- `Afecta a 2 espacios`;
- `Puede exigir replanificación`;
- `No modifica 3 tareas protegidas`.

No prometerá una mejora antes de simularla.

---

## 6. Arquitectura de navegación

### 6.1 Configuración general

La página de ajustes evolucionará hacia secciones diferenciadas:

1. Programa y jornada.
2. Plantillas de tarea.
3. Platós y espacios.
4. Recursos.
5. Personal.
6. Optimización.
7. Registro de capacidades configurables.

### 6.2 Configuración del día

Cada plan tendrá una vista separada `Configuración del día` con:

- versión efectiva;
- fecha de snapshot;
- diferencias frente al catálogo general;
- plantillas disponibles y utilizadas;
- reglas de espacio;
- recursos y disponibilidades;
- configuración diaria del optimizador;
- historial de actualizaciones explícitas.

### 6.3 Editor de instancia

El editor de tarea mostrará overrides permitidos junto al valor heredado. El usuario no deberá navegar a ajustes generales para entender el comportamiento efectivo.

---

## 7. Editor de plantilla de tarea

Se organizará en:

- identidad y presentación;
- duración y ocupación;
- ubicación;
- participantes;
- recursos;
- dependencias;
- clasificación operativa;
- setup;
- coordinación;
- autocreación.

Los datos visuales no se mezclarán con restricciones hard.

### 7.1 Duración productiva

Debe aclarar que no incluye holds, setup ni transiciones.

### 7.2 Tiempo posterior configurable

Editor futuro de `TaskTemporalHoldPolicy`:

```text
Tiempo posterior
  Estado: REQUIRED / PREFERRED / OFF
  Duración: __ minutos
  Bloquear:
    [ ] Espacio
    [ ] Participante
    [ ] Recursos efectivos de la tarea
    [ ] Recursos concretos adicionales
```

Validaciones:

- duración entera no negativa;
- duración cero normalizada de forma explícita;
- duración positiva exige al menos una entidad ocupada;
- recursos mediante IDs;
- sin duplicados;
- ayuda que explique la adyacencia inmediata.

### 7.3 Dependencias

La UI impedirá autodependencia, ciclos detectables, duplicados, referencias eliminadas y contradicción entre bandera y lista.

### 7.4 Clasificación operativa

El editor futuro deberá usar un contrato tipado:

```text
MAIN | VOCAL | AUXILIARY | TECHNICAL
```

Nunca se inferirá por nombre.

---

## 8. Snapshot del día

Por cada plantilla mostrará:

- nombre histórico;
- origen;
- versión;
- fingerprint derivado;
- fecha de snapshot;
- diferencia respecto al catálogo general;
- número de instancias;
- estado `sin cambios`, `catálogo actualizado`, `legacy` u `override`.

### 8.1 Actualización manual futura

Flujo:

1. Seleccionar capacidades.
2. Cargar catálogo general actual.
3. Generar diff.
4. Detectar incompatibilidades.
5. Mostrar tareas afectadas.
6. Excluir `done` e `in_progress`.
7. Simular impacto cuando exista soporte.
8. Confirmar expresamente.
9. Crear nueva versión.
10. Registrar autor, timestamp y motivo.

No existirá `Sincronizar todo` sin comparación.

### 8.2 Plantilla nueva después de crear el plan

La UI advertirá que se incorporará al día, mostrará el valor que se copiará y creará un snapshot explícito con origen `Añadido desde default`.

---

## 9. Editor de tarea diaria

La cabecera mostrará la plantilla diaria, versión y fecha de herencia.

Cada propiedad editable tendrá:

```text
[ ] Usar valor diferente en esta tarea
```

Al activarlo aparecerá el editor y la acción para restaurar.

Campos iniciales:

- duración;
- cámaras;
- ubicación;
- participante;
- comentarios.

Campos futuros:

- hold posterior;
- recursos efectivos;
- dependencias de instancia;
- clasificación o coordinación cuando el dominio lo permita.

Para `in_progress` o `done`, los campos operativos quedan en sólo lectura y conservan la configuración utilizada. Los locks bloquearán únicamente los campos correspondientes.

---

## 10. Coordinación entre espacios

Se configurará desde el espacio o una sección específica del día.

```text
Coordinación temporal
  Estado: REQUIRED / PREFERRED / OFF
  Modo: Alinear inicios
  Espacio coordinado: [selector por ID]
  Tolerancia: __ min
  Emparejamiento: Ordinal dinámico
  Activa mientras: ambos espacios tengan trabajo elegible
  Elegibilidad: [configuración estructurada]
```

La UI rechazará:

- mismo espacio;
- política inversa duplicada;
- circularidad incompatible;
- tolerancia negativa;
- REQUIRED sin elegibilidad;
- referencias inexistentes;
- tareas fuera del espacio declarado;
- combinaciones hard no soportadas.

REQUIRED y PREFERRED se explicarán mediante consecuencias, no sólo colores.

---

## 11. Visualización en el planning

Los holds y preparaciones aparecerán como intervalos propios vinculados a su tarea origen.

Se distinguirán de:

- tarea productiva;
- comida;
- lock;
- setup;
- transición;
- espera sin ocupación.

El detalle mostrará tipo, tarea origen, política, inicio, fin, entidades ocupadas, severidad y origen de configuración.

Las tareas coordinadas podrán mostrar ID de política, ordinal real, espacio pareja, desviación y cumplimiento. No se dibujará una única tarea cruzando dos espacios.

Las ocupaciones derivadas tendrán menor jerarquía visual, pero no podrán ocultarse al analizar conflictos reales de espacio.

---

## 12. Contrato API de presentación

El servidor resolverá la precedencia. El cliente no combinará aliases, JSON o niveles para decidir semántica.

Forma conceptual:

```ts
interface EffectiveConfigurationValue<T> {
  capabilityId: string;
  effectiveValue: T;
  inheritedValue: T | null;
  overrideValue: T | null;
  source: "GENERAL" | "DAY_SNAPSHOT" | "INSTANCE_OVERRIDE" | "LEGACY" | "PROTECTED";
  severity?: "REQUIRED" | "PREFERRED" | "OFF";
  contractVersion: number;
  updatedAt: string;
  updatedBy?: string | null;
  isProtected: boolean;
  protectionReason?: string;
  warnings: EffectiveConfigurationWarning[];
}
```

---

## 13. Guardado, atomicidad y concurrencia

Una capacidad se guardará de forma atómica. Un fallo no podrá dejar duración sin severidad, coordinación sin segundo espacio, override sin valor o snapshot parcial.

Las mutaciones usarán versión o timestamp esperado. Si la configuración cambió desde que se abrió el formulario, se rechazará la actualización ciega y se mostrará un nuevo diff.

Los borradores locales no se presentarán como valor efectivo hasta confirmación del servidor.

---

## 14. Permisos y auditoría

Se diferenciarán permisos para:

- lectura;
- configuración general;
- configuración del día;
- override de instancia;
- locks;
- actualización de snapshots.

Cada cambio conservará usuario, timestamp, nivel, valor anterior, valor nuevo, motivo y versión resultante.

---

## 15. Errores y advertencias

Errores hard:

- contrato incompleto;
- referencia inexistente;
- versión desconocida;
- contradicción REQUIRED;
- snapshot ausente para una instancia persistida;
- valor fuera de rango;
- conflicto con tarea protegida.

Advertencias:

- cambio que exige replanificación;
- PREFERRED difícil de cumplir;
- snapshot legacy;
- catálogo general más reciente;
- muchas instancias afectadas.

Los mensajes indicarán capacidad, entidad, valor actual, condición esperada y acción posible.

---

## 16. Accesibilidad y consistencia

- Labels asociados.
- Estados comprensibles sin depender del color.
- Navegación por teclado.
- Mensajes vinculados al campo.
- Unidades visibles.
- Selectores con búsqueda.
- Confirmaciones con consecuencias concretas.
- Terminología consistente en español.
- No usar `prompt()` nativo para crear entidades operativas.

---

## 17. Implementación futura por fases

### Fase A — Primitivas de presentación

- `SourceBadge`;
- `SeverityControl`;
- `EffectiveValueField`;
- `ConfigurationDiff`.

Sólo cuando exista una API efectiva real; no se crearán componentes desconectados con mocks permanentes.

### Fase B — Snapshot de tarea

Tras SPEC11-002:

- catálogo diario en sólo lectura;
- origen y fingerprint;
- editor de tarea mostrando heredado y override.

### Fase C — Hold posterior

Después de persistencia y motor:

- editor general;
- snapshot diario;
- override;
- planning;
- Evidence.

### Fase D — Coordinación

- REQUIRED;
- visualización;
- después PREFERRED y scoring.

No se implementarán varias fases a la vez.

---

## 18. Pruebas de aceptación futuras

- Cambios generales no alteran el día.
- El origen efectivo se muestra correctamente.
- Restaurar heredado elimina el override.
- Cero no se confunde con ausencia.
- `done` e `in_progress` no cambian.
- Locks bloquean sólo su ámbito.
- El diff no escribe antes de confirmar.
- Se detecta conflicto concurrente.
- OFF no publica ocupaciones.
- El planning diferencia trabajo y ocupación.
- Coordinación usa IDs explícitos y ordinal dinámico.
- null/undefined no activan reglas.
- El cliente no reconstruye semántica legacy.

---

## 19. Criterios de cierre

SPEC11-003 queda completa cuando define un patrón único de herencia y override, cubre plantilla/día/instancia/espacio/planning, diferencia REQUIRED/PREFERRED/OFF, mantiene el servidor como autoridad, protege tareas ejecutadas y no mezcla implementación de DB o motor.

---

## 20. Siguiente paso sin ejecución de código

Mientras SPEC11-002 permanezca pausada, el siguiente trabajo documental de mayor valor es definir el contrato productivo completo de `TaskTemporalHoldPolicy`: persistencia general, snapshot, override, EngineInput, materialización, validación, Evidence, compatibilidad y replanificación.
