# OPTIPLAN — ADDENDUM OFICIAL AL PROTOCOLO MAESTRO

## Autonomía de ejecución y jerarquía ChatGPT → Codex → intervención humana

**Versión:** 1.0  
**Fecha:** 8 de agosto de 2026  
**Estado:** Documento fuente oficial de método de trabajo  
**Ámbito:** ChatGPT, GitHub, Codex, Replit/Shell, PR, validación y continuidad entre chats

## 1. Propósito y autoridad

Este addendum complementa el `Protocolo Maestro de Continuidad, Iteración y Control de Rumbo de OptiPlan v1.4` y su sección 8.3.

Su objetivo es reducir trabajo delegado, consumo de créditos de Codex y carga operativa del usuario sin relajar viabilidad, restricciones hard, determinismo, Evidence, benchmarks ni merge gate.

Cuando una formulación anterior pueda interpretarse como que `GitHub + Codex` es el modo de ejecución por defecto, este addendum prevalece en materia de **quién ejecuta el trabajo**.

> **Regla rectora:** ChatGPT desarrolla directamente todo lo que pueda realizar y controlar con seguridad. Codex se utiliza únicamente cuando aporta una capacidad de edición, ejecución o validación que ChatGPT no posee. La intervención humana queda reservada para aquello que no pueda resolver ninguno de los dos.

No se delega por costumbre. Se delega por necesidad técnica demostrada.

Se conservan íntegramente las reglas de v1.4 sobre prompts por delta, lectura dirigida, `AGENTS.md` breve, presupuesto de conversación, selección proporcional de modelo, validación escalonada, Evidence, benchmarks, simplicidad y control de rumbo.

## 2. Jerarquía obligatoria de ejecución

Para cada siguiente paso lógico se aplica, en este orden:

### Nivel 1 — ChatGPT ejecuta directamente

ChatGPT debe continuar por sí mismo siempre que sus herramientas permitan realizar el trabajo con seguridad y verificabilidad suficientes.

Incluye, cuando sea posible:

- revisar fuentes, GitHub, código, PR, patches, CI y Evidence;
- decidir arquitectura, estrategia y delta;
- crear ramas, editar archivos de código o documentación y crear commits;
- abrir o actualizar PR, comentarios y revisiones;
- realizar cambios técnicos que pueda verificar suficientemente con GitHub/CI;
- cerrar PR incorrectos, hacer merge cuando el gate exigible esté demostrado y verificar `main`;
- continuar inmediatamente con la siguiente unidad lógica.

Que un cambio sea técnico o toque TypeScript no constituye por sí mismo motivo para usar Codex.

Antes de delegar ChatGPT debe responder internamente:

> **¿Puedo implementar yo este delta y comprobar suficientemente que es correcto con mis herramientas?**

Si la respuesta es sí, debe hacerlo directamente y no pedir permiso.

### Nivel 2 — Codex sólo por capacidad necesaria

Codex se utiliza únicamente cuando exista una limitación material de ChatGPT para completar o validar el delta.

Ejemplos legítimos:

- edición multiarchivo cuya corrección depende de compilación o ejecución local no disponible para ChatGPT;
- tests focales, benchmark, build o regeneración de Evidence que GitHub Actions no ejecuta;
- cambios de motor, contratos, DB o integración que necesiten un runner local antes del merge;
- tooling local o edición interdependiente que no pueda realizarse con seguridad mediante las herramientas disponibles.

No son motivos válidos: “normalmente usamos Codex”, crear un PR, editar README, revisar CI, decidir la arquitectura o investigar algo que ChatGPT ya puede resolver.

Cuando Codex sea necesario:

1. ChatGPT investiga y decide antes el cambio exacto.
2. Codex recibe sólo una unidad lógica y el delta ejecutable.
3. El prompt usa lectura dirigida y no repite contexto permanente.
4. Codex actúa como ejecutor, no como responsable de reabrir la estrategia salvo dependencia local imprevista.
5. La validación durante implementación es focal; el merge gate completo queda para el head candidato.
6. ChatGPT recupera el control al terminar, revisa directamente el PR/Evidence/CI y continúa.

### Nivel 3 — Intervención humana como último recurso

El usuario interviene únicamente cuando exista una dependencia real que no pueda resolver ChatGPT ni, cuando proceda, Codex.

Ejemplos legítimos:

- ejecutar comandos en Replit o un entorno real inaccesible;
- ejecutar una migración/consulta en la instancia real de Supabase sin acceso equivalente;
- validar manualmente una pantalla o comportamiento físico;
- aportar una decisión de producción no definida en las fuentes;
- devolver un JSON/log generado sólo en el entorno real.

El usuario no actúa como mensajero entre ChatGPT, GitHub y Codex. No se le pide descargar ZIP, copiar diffs, crear PR, revisar CI o hacer merge si ChatGPT puede hacerlo.

Cuando Shell/Replit sea imprescindible, se solicitan sólo órdenes breves y seguras para desbloquear la siguiente decisión.

## 3. Continuidad autónoma

ChatGPT no debe detener el trabajo después de completar una acción si el siguiente paso lógico también puede realizarlo por sí mismo.

Flujo esperado:

```text
analizar → decidir → ejecutar → verificar → mergear si corresponde → verificar main → decidir siguiente unidad → seguir
```

La respuesta al usuario no es un punto de sincronización obligatorio.

ChatGPT sólo se detiene ante un bloqueo real: decisión de dominio no definida, validación de entorno inaccesible, necesidad material de Codex, intervención humana imprescindible o riesgo que impida actuar con seguridad.

No debe preguntar “¿quieres que haga X?” cuando X sea el siguiente paso lógico, esté dentro del alcance y pueda realizarlo de forma segura.

## 4. Gate obligatorio antes de usar Codex

Antes de emitir un prompt para Codex deben cumplirse todos estos puntos:

- [ ] problema y objetivo demostrados;
- [ ] fuentes, GitHub y Evidence aplicables revisados;
- [ ] cambio exacto decidido por ChatGPT;
- [ ] ChatGPT ha comprobado explícitamente que no puede completar o validar el delta con suficiente seguridad;
- [ ] la capacidad ausente está identificada: runner, tests, benchmark, build, edición local u otra concreta;
- [ ] una sola unidad lógica;
- [ ] prompt por delta con lectura dirigida;
- [ ] validación inicial focal;
- [ ] merge gate reservado al head candidato.

Si falla el cuarto punto, no se usa Codex: ChatGPT ejecuta el trabajo.

## 5. Gate obligatorio antes de pedir intervención al usuario

Antes de pedir una acción al usuario:

- [ ] ChatGPT no puede realizarla;
- [ ] Codex no puede resolverla o no es el medio adecuado;
- [ ] depende realmente del entorno o de una decisión humana;
- [ ] se solicita únicamente la intervención mínima;
- [ ] tras recibirla, ChatGPT recuperará el control y seguirá autónomamente.

## 6. Eficiencia de créditos

Esta jerarquía refuerza la sección 8.3. El ahorro se obtiene mediante cuatro mecanismos acumulativos:

1. no invocar Codex para trabajo que ChatGPT puede hacer;
2. cuando sea necesario, enviar sólo el delta ya decidido;
3. mantener lectura dirigida y conversaciones cortas;
4. ejecutar validaciones caras sólo cuando la fase lo justifica.

La métrica rectora sigue siendo **créditos de Codex por cambio aceptado**, nunca créditos por turno ni número de PR.

La optimización no puede reducir viabilidad, restricciones hard, determinismo, Evidence, benchmarks ni validación previa al merge.

## 7. Contrato de arranque de un chat nuevo

En cada chat nuevo, después de reconstruir el estado real, ChatGPT debe aplicar automáticamente esta jerarquía.

No debe asumir que el siguiente paso es generar un prompt para Codex. Debe asumir:

> **Mi obligación es avanzar yo mismo todo lo posible. Sólo delego cuando una limitación concreta de mis herramientas lo exige.**

Secuencia:

1. revisar Protocolo Maestro vigente y este addendum;
2. revisar fuentes oficiales relevantes;
3. reconstruir `main`, PR, últimas iteraciones y Evidence;
4. determinar el siguiente paso de mayor valor y menor riesgo;
5. intentar ejecutarlo directamente;
6. recurrir a Codex sólo si supera el gate de delegación;
7. recurrir al usuario sólo si supera el gate de intervención humana.

## 8. Persistencia en las distintas capas

Para no depender de la memoria de una conversación, la regla debe existir coherentemente en:

1. fuentes del proyecto: Protocolo Maestro + este addendum;
2. instrucciones del proyecto ChatGPT;
3. repositorio: gobierno de eficiencia de Codex;
4. Codex: `AGENTS.md`, que asume estrategia y alcance ya decididos y ejecuta sólo el delta recibido.

Si una capa sugiere que Codex es el ejecutor por defecto sin pasar primero el gate de autonomía de ChatGPT, debe corregirse.

## 9. Texto mínimo obligatorio para las instrucciones del proyecto

> **Aplica siempre el Protocolo Maestro de Continuidad, Iteración y Control de Rumbo de OptiPlan y su Addendum de Autonomía. La jerarquía obligatoria de ejecución es ChatGPT → Codex → intervención humana. ChatGPT debe desarrollar directamente y sin pedir permiso todo lo que pueda realizar y verificar con sus herramientas, incluyendo trabajo técnico cuando sea seguro. Codex sólo se utiliza cuando una limitación concreta de edición, ejecución o validación impide a ChatGPT completar el delta; recibe únicamente el delta ejecutable ya decidido, con lectura dirigida y validación escalonada. El usuario sólo interviene cuando ni ChatGPT ni Codex pueden resolver una dependencia de entorno o cuando falta una decisión humana de dominio. Tras cada acción, ChatGPT continúa autónomamente hasta encontrar un bloqueo real. La optimización nunca relaja viabilidad, restricciones hard, determinismo, Evidence, benchmarks ni merge gate.**

## 10. Regla final

> **Si ChatGPT puede hacerlo, lo hace. Si ChatGPT no puede pero Codex sí, delega sólo el delta. Si ninguno puede, pide al usuario únicamente la intervención mínima. Después recupera el control y continúa.**

Ésta es la dinámica operativa oficial de OptiPlan.
