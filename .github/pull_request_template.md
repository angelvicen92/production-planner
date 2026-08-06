## Objetivo único

<!-- Describe una sola unidad lógica y el resultado operativo esperado. -->

## Clasificación

- [ ] Fast Merge
- [ ] DB Safe Merge

### Relación con configuración

- [ ] `CONFIG_NEUTRAL`
- [ ] `CONFIG_AWARE`
- [ ] `CONFIG_DEFINING`
- [ ] `CONFIG_DEBT_REDUCTION`

**Justificación:**

## Fuente oficial y rumbo

- Documentos/SPEC aplicables:
- Objetivo actual protegido:
- Evidencia o benchmark usado para decidir este cambio:
- Por qué es el siguiente paso de mayor valor y menor riesgo:

## Capability IDs

<!-- Obligatorio salvo CONFIG_NEUTRAL justificado. -->

- `CAPABILITY_ID`:
- Propietario:
- Unidad:
- Severidad: `REQUIRED | PREFERRED | OFF | N/A`

## Matriz de configuración efectiva

| Capa | Implementada | N/A | Detalle / archivo |
|---|---:|---:|---|
| Configuración general | [ ] | [ ] | |
| Snapshot diario | [ ] | [ ] | |
| Override | [ ] | [ ] | |
| Semántica de ausencia | [ ] | [ ] | |
| Compatibilidad legacy | [ ] | [ ] | |
| API tipada | [ ] | [ ] | |
| UI: valor/origen/diff | [ ] | [ ] | |
| EngineInput | [ ] | [ ] | |
| Preflight | [ ] | [ ] | |
| Motor / scoring | [ ] | [ ] | |
| Future Feasibility | [ ] | [ ] | |
| Validación canónica | [ ] | [ ] | |
| Publicación | [ ] | [ ] | |
| Fingerprint | [ ] | [ ] | |
| Evidence | [ ] | [ ] | |
| Replanificación | [ ] | [ ] | |
| Tests | [ ] | [ ] | |

**Estado de la capacidad:** `COMPLETE | PARTIAL_WIP | DOCUMENTED_ONLY | NOT_APPLICABLE`

**Blocker que permanece, si aplica:**

## Constantes y hardcodes

- [ ] No se añaden comparaciones por nombres, labels, abreviaturas o textos visibles.
- [ ] No se añaden IDs productivos conocidos.
- [ ] No se añaden duraciones, tolerancias, capacidades o pesos operativos sin autoridad configurable.
- [ ] No se añade semántica dentro de JSON opaco.
- [ ] No se relee configuración global para reinterpretar días existentes.
- [ ] Errores de entradas hard no degradan a `{}`, `[]`, `null` o defaults silenciosos.

### Constantes nuevas

| Valor | Clasificación | Autoridad / justificación |
|---|---|---|
| | `INVARIANTE_TECNICO | REGLA_OFICIAL | DEFAULT_CONFIGURADO | PARAMETRO_ALGORITMICO | FIXTURE | TEXTO_UI` | |

## Viabilidad y protección

- [ ] La producción sigue siendo viable o el cambio mantiene un blocker explícito.
- [ ] `done` e `in_progress` permanecen inmutables.
- [ ] Los locks permanecen obligatorios.
- [ ] Sólo se replantea trabajo `pending` o `interrupted` cuando aplica.
- [ ] No se publica un plan parcial.
- [ ] El motor propone y el humano conserva la decisión final.

## Severidad

- [ ] `REQUIRED` participa en hard validity.
- [ ] `PREFERRED` participa únicamente en scoring explicable.
- [ ] `OFF` elimina la obligación o preferencia según contrato.
- [ ] No existe degradación silenciosa entre severidades.
- [ ] N/A — el cambio no introduce ni transforma severidad.

## Datos, DB y RLS

- [ ] Migración idempotente y secuencia verificada.
- [ ] Constraints coherentes con el contrato.
- [ ] RLS y permisos revisados.
- [ ] Snapshot independiente del catálogo global.
- [ ] Escritura atómica o compensación comprobada.
- [ ] Legacy identificado, no inventado.
- [ ] N/A — no hay cambios de persistencia.

## Motor, validación y Evidence

- [ ] EngineInput recibe la realidad efectiva completa.
- [ ] El adaptador es puro, determinista y reversible.
- [ ] Preflight rechaza representaciones parciales.
- [ ] Búsqueda y validación comparten semántica hard.
- [ ] Toda exploración consume el presupuesto oficial.
- [ ] Fingerprint incluye todos los datos semánticos nuevos.
- [ ] Evidence corresponde exactamente al resultado publicado.
- [ ] N/A — cambio sin impacto de motor.

## Validación ejecutada

<!-- No marques comandos no ejecutados. Incluye conteos y resultados reales. -->

- [ ] Tests focales
- [ ] TypeScript
- [ ] `git diff --check`
- [ ] Suite completa
- [ ] Build
- [ ] Checker de migraciones
- [ ] Validación RLS/SQL
- [ ] Benchmarks aplicables
- [ ] Evidence reproducible
- [ ] Focal A2 protegido
- [ ] CI alojada verde

```text
Comandos y resultados:
```

## Determinismo y regresión

- [ ] Misma entrada produce mismo resultado y Evidence.
- [ ] Invertir arrays que representan conjuntos no cambia semántica.
- [ ] Los inputs permanecen inmutables.
- [ ] Ausencia del nuevo campo conserva comportamiento histórico o se documenta la migración.
- [ ] No se modifica SPEC10-021 salvo que sea el objetivo único declarado.

## Archivos y alcance

**Archivos modificados:**

**Qué NO se ha modificado:**

**Riesgos o límites restantes:**

## README y registro

- [ ] README actualizado por ID con resultados reales.
- [ ] Registro de configurabilidad actualizado.
- [ ] Deuda eliminada sólo con Evidence.
- [ ] N/A — checkpoint documental sin activación.

## Checklist final

- [ ] Diff completo revisado contra `main`.
- [ ] Working tree limpio.
- [ ] Sin credenciales ni archivos locales.
- [ ] Sin refactors cosméticos ajenos.
- [ ] Un único objetivo lógico.
- [ ] No abrir merge hasta superar el gate correspondiente.