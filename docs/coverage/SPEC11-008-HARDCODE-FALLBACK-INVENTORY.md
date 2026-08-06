# SPEC11-008 — Inventario de hardcodes, inferencias nominales y fallbacks

**Estado:** auditoría focal verificable  
**Clasificación:** Fast Merge documental  
**Baseline auditado:** `main@873803296db243026e267eb6f371f31ed2f9d388`  
**Ámbito principal:** `engine/buildInput.ts`, `server/storage.ts`, `client/src/pages/settings.tsx` y contratos relacionados  
**Archivos machine-readable:**

- `docs/coverage/hardcode-fallback-inventory.schema.json`;
- `docs/coverage/hardcode-fallback-inventory.json`.

---

## 1. Objetivo

Identificar y clasificar decisiones operativas que actualmente dependen de:

- catálogos globales releídos durante la jornada;
- fallos de carga convertidos en datos vacíos;
- nombres visibles;
- defaults literales sin origen;
- aliases legacy dispersos;
- JSON opaco;
- parámetros algorítmicos no clasificados.

La auditoría no busca eliminar todos los literales.

Busca distinguir:

```text
invariante técnico legítimo
        ≠
regla universal oficial
        ≠
default operativo configurable
        ≠
compatibilidad legacy
        ≠
fallback inseguro
```

---

## 2. Hallazgo ejecutivo

El mayor riesgo no son los cinco minutos de Totales ni un número aislado.

El mayor riesgo es que `buildEngineInput` puede construir una realidad distinta de la persistida mediante dos mecanismos:

1. relectura de configuración global mutable;
2. sustitución de errores de entradas hard por `{}`, `[]`, `null` o defaults.

Esto puede producir un plan que compile, termine y parezca hard-valid bajo un input incompleto que no representa el día real.

La auditoría identifica:

- 10 entradas P0;
- 10 entradas P1;
- 7 entradas P2;
- 3 entradas P3 o aceptadas;
- 30 entradas totales.

Dos entradas se registran como aceptadas para impedir una política indiscriminada contra cualquier fallback o constante.

---

## 3. Prioridades

### P0 — Puede falsear viabilidad o reproducibilidad

Incluye:

- relectura global de plantillas;
- relectura global del optimizador;
- asignaciones o requisitos hard degradados a objetos vacíos;
- inventario de recursos degradado a lista vacía;
- zona arbitraria por nombre o primer elemento;
- duración productiva inventada;
- creación de tareas desde plantilla global mutable.

Un P0 no debe resolverse con warnings solamente.

Necesita contrato, snapshot o error hard.

### P1 — Semántica nominal, JSON opaco o compatibilidad peligrosa

Incluye:

- `transporte`;
- `Comer`;
- nombres de plantillas IN/OUT;
- detección de coach por texto;
- bloques manuales de 15 minutos;
- pausas de 75 minutos;
- capacidad espacial por aliases;
- `rulesJson`;
- `resourceRequirements` amplio;
- adapters camel/snake dispersos.

### P2 — Defaults de calidad y límites sin trazabilidad común

Incluye:

- cadena mínima 4;
- máximo de cambios 4;
- comida de espacio 75;
- prioridad 1;
- rangos de clamps;
- profundidad máxima de jerarquía.

No necesariamente invalidan un plan, pero pueden cambiar qué solución gana.

### P3 — Aceptado o informativo

Incluye:

- fallback neutral de bundles con warning mientras sea señal soft;
- invariantes técnicos universales;
- metadata visual cuya política debe decidirse, no asumirse operativa.

---

## 4. Relecturas globales críticas

### HCF-001 — Plantillas

`buildEngineInput` llama a `getTaskTemplates()` en cada ejecución.

La plantilla global se utiliza para reconstruir:

- duración;
- dependencias;
- requisitos;
- equipo itinerante;
- ubicación;
- identidad de transporte;
- información explicativa.

Consecuencia:

> Un día no es reproducible si el catálogo cambia.

Resolución:

```text
PLAN_TASK_TEMPLATE_SNAPSHOT
```

No existe una corrección segura más pequeña que mantenga todas esas semánticas.

### HCF-002 — Optimizador

`buildEngineInput` llama a `getOptimizerSettings()` en cada ejecución.

La lectura determina:

- prioridades;
- mantener ocupado;
- finalizar temprano;
- agrupación;
- transporte;
- límites;
- pesos.

Resolución:

```text
OPTIMIZER_DAILY_SNAPSHOT
```

No debe mezclarse con SPEC11-002; será una unidad posterior.

### HCF-026 — Creación de tareas

`createDailyTask` consulta `task_templates` para heredar ubicación y colores.

La ubicación es operativa y debe proceder del snapshot del plan.

Los colores son metadata; la arquitectura deberá decidir si se congelan o permanecen globales.

No deben tratarse como si ambas cosas tuvieran la misma severidad.

---

## 5. Fallbacks de entradas hard

### Problema del helper genérico

El helper:

```ts
safe(fn, fallback)
```

no sabe si la fuente es:

- REQUIRED_INPUT;
- OPTIONAL_SIGNAL;
- LEGACY_COMPATIBILITY;
- DIAGNOSTIC_ONLY.

Por tanto, una misma forma de catch se utiliza para semánticas distintas.

### Fuentes que no pueden degradarse a neutral

- asignaciones de recursos por zona;
- asignaciones por espacio;
- requisitos de tipos por zona;
- requisitos de tipos por espacio;
- inventario real del plan;
- componentes de un recurso compuesto cuando participa en una obligación.

Un error no significa “no configurado”.

### Fuente soft aceptada

Los bundles de recursos:

- devuelven `rows=[]`;
- publican warning;
- continúan con scoring neutral.

Esto es aceptable únicamente mientras los bundles no representen una obligación REQUIRED.

La clasificación deberá cambiar automáticamente cuando cambie el dominio.

---

## 6. Inferencias nominales

### Transporte

Se localizó:

```text
space.name == transporte
```

como fallback de ubicación.

También se resuelven plantillas de llegada y salida por nombres configurados.

La configuración no deja de ser nominal porque el nombre se almacene en `optimizer_settings`.

La identidad sigue siendo texto mutable.

### Zona otros

Se localizó:

```text
zone.name == otros
        o
primera zona disponible
```

La segunda alternativa es especialmente peligrosa: transforma una referencia espacial ausente en una ubicación arbitraria.

Debe sustituirse por:

- relación estructurada de zona no localizada; o
- error hard de configuración incompleta.

### Comida

Se localizó el fallback:

```text
Comer
```

El nombre sólo debe servir para presentación.

La identidad de comida debe utilizar ID o rol tipado.

### Vocal coach

La UI busca primero `vocal_coach`, pero si no lo encuentra acepta cualquier código o nombre que contenga `coach`.

Esta compatibilidad puede seleccionar un tipo distinto.

La UI deberá mostrar error de configuración en lugar de inferir semántica.

---

## 7. Defaults no trazados

### 30 minutos

Una tarea sin duración válida se convierte en una tarea de 30 minutos.

Esto es inseguro porque la ausencia de duración no es una decisión válida del usuario.

El futuro resolvedor será:

```text
override de instancia
        > snapshot de plantilla
        > error
```

No:

```text
... > literal 30
```

### 15 minutos

Un bloque manual con intervalo inválido recibe 15 minutos.

Debe exigirse:

- intervalo completo; o
- duración explícita.

Una compatibilidad legacy debe publicar warning y origen, nunca parecer un valor normal.

### 75 minutos

Se utiliza como fallback en pausas y en comida de espacio.

Puede coincidir con defaults de DB, pero continúa siendo duplicación si `buildInput` no conserva la autoridad.

### Defaults de calidad

Se observaron:

- cadena mínima 4;
- máximo de cambios 4;
- prioridad 1;
- pesos y niveles 0;
- rangos 0..10;
- límites 1..50;
- comida 0..240;
- recorrido máximo de 30 ancestros.

Cada valor debe clasificarse como:

- constraint oficial;
- default persistido;
- parámetro algorítmico versionado;
- guard defensivo sin efecto semántico.

No se migrarán todos a DB de forma automática.

---

## 8. Capacidad espacial

La capacidad se busca mediante:

- `capacity`;
- `max_concurrency`;
- `maxConcurrency`;
- `concurrency`.

Si no aparece, se presume capacidad 1 y espacio exclusivo.

La compatibilidad defensiva es comprensible, pero no reproducible.

La evolución correcta requiere:

1. un campo autoritativo;
2. snapshot diario;
3. source legacy cuando proceda;
4. preflight de duplicados o formas contradictorias;
5. eliminación gradual de aliases.

No debe corregirse cambiando el default a otro número.

---

## 9. JSON opaco

### rulesJson

La clave:

```text
itinerantTeamAllowedIds
```

se interpreta directamente desde `rulesJson`, aceptando camel y snake.

SPEC11-002 ya decide que sólo esta semántica conocida se normalizará en el contrato V1.

No se introducirán nuevas capacidades dentro del mismo JSON.

### resourceRequirements

La configuración se manipula como objeto amplio en UI, persistencia y proyección.

Los riesgos son:

- claves desconocidas;
- formas legacy;
- cantidades inválidas;
- distintos normalizadores;
- pérdida silenciosa;
- falta de versión;
- falta de snapshot.

La solución no es añadir más `if` defensivos.

Es un contrato discriminado versionado con una única autoridad.

---

## 10. Aliases y adapters

Aceptar camelCase y snake_case en los límites de persistencia es una necesidad de compatibilidad.

El problema aparece cuando:

- la lógica de dominio repite la decisión;
- varios archivos normalizan de forma distinta;
- la ausencia de ambos nombres cae a default;
- no se sabe qué versión produjo el dato.

La regla futura será:

```text
fila DB / API legacy
        ↓ adapter único
contrato canónico
        ↓
dominio y motor
```

No:

```text
cada función prueba todos los aliases
```

---

## 11. Relación con el registro de configurabilidad

Cada entrada declara uno o más `capabilityIds`.

Esto permite que un PR que resuelva una deuda actualice simultáneamente:

- la entrada HCF;
- el estado de la capacidad;
- el blocker;
- la Evidence;
- el riesgo residual.

No se eliminará una entrada del inventario.

Se marcará `RESOLVED` y se conservará para regresión histórica.

---

## 12. Orden de resolución

### Unidad 1 — Snapshot efectivo de plantillas

Resuelve o reduce:

- HCF-001;
- HCF-015;
- HCF-024;
- HCF-025;
- HCF-026;
- HCF-027;
- parte de HCF-029.

Es la mayor reducción de riesgo por una sola unidad lógica.

### Unidad 2 — Clasificación de inputs hard y señales soft

Resuelve:

- HCF-003 a HCF-009.

Debe realizarse después de conocer qué datos efectivos son autoritativos.

### Unidad 3 — Identidades nominales

Resuelve:

- HCF-010 a HCF-014.

Requiere IDs/roles persistidos y snapshots.

### Unidad 4 — Snapshot del optimizador

Resuelve:

- HCF-002;
- HCF-013;
- HCF-018 a HCF-023.

No debe preceder al snapshot de plantillas porque utiliza identidades de plantilla.

### Unidad 5 — Consolidación legacy

Resuelve gradualmente:

- HCF-021;
- HCF-029.

Sólo tras medir datos existentes y compatibilidad.

---

## 13. Qué no hacer

- no reemplazar un nombre hardcodeado por otro;
- no mover un literal de TypeScript a otro archivo sin trazabilidad;
- no crear una tabla universal de settings;
- no almacenar nuevas reglas en `rulesJson`;
- no convertir todo fallback en error sin distinguir señales soft;
- no convertir todo literal en columna DB;
- no cambiar defaults históricos sin migración;
- no marcar una deuda resuelta porque exista un campo nuevo;
- no eliminar aliases antes de auditar datos reales;
- no activar Planner Next para ocultar deuda de `buildInput`;
- no mezclar la corrección con SPEC10-021.

---

## 14. Criterios de cierre por entrada

Una entrada sólo puede pasar a `RESOLVED` cuando:

1. existe autoridad única;
2. existe semántica de ausencia;
3. existe compatibilidad legacy;
4. existe test negativo;
5. existe determinismo e invariancia aplicables;
6. el error hard no desaparece;
7. el fingerprint refleja el valor efectivo;
8. Evidence publica origen e impacto;
9. la ruta productiva utiliza el contrato nuevo;
10. no queda la ruta antigua activa en paralelo sin justificación.

Para `ACCEPTED_WITH_EVIDENCE` debe documentarse por qué el fallback o constante es legítimo.

---

## 15. Checker futuro

El futuro checker podrá señalar, no decidir:

- `get*Settings()` global dentro de `buildInput`;
- comparaciones de nombres en rutas de dominio;
- `catch` seguido de `{}`, `[]` o `null`;
- literales temporales nuevos;
- nuevos aliases;
- nuevas claves de JSON;
- campos sin capability ID.

Cada regla admitirá excepciones versionadas mediante IDs del inventario.

No se introducirán comentarios tipo `ignore` sin razón y owner.

---

## 16. Criterios de aceptación de SPEC11-008

SPEC11-008 queda completa cuando:

- el inventario tiene IDs estables;
- separa P0, P1, P2 y P3;
- distingue hard input de señal soft;
- identifica relecturas globales;
- identifica inferencias nominales;
- identifica defaults y aliases;
- identifica JSON opaco;
- enlaza capacidades;
- define resolución y orden;
- conserva excepciones legítimas;
- no modifica código productivo;
- no afirma que la deuda esté resuelta.

---

## 17. Decisión final

> El problema no es que exista un número en el código.  
> El problema es que el código pueda decidir la producción sin saber de dónde salió ese número.  
> El problema no es que exista un fallback.  
> El problema es que un fallo hard pueda parecer ausencia configurada.  
> El problema no es que exista compatibilidad.  
> El problema es que la compatibilidad se convierta en la autoridad silenciosa.