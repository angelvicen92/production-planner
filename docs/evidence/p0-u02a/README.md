# P0-U02a — primera integración Main/Vocal × macro REQUIRED itinerante

Auditoría sobre **main `bd6628d127624ba367f408422906b3da36150626`**, rama `codex/p0-u02a-main-vocal-integrated-day-audit`. Sólo Evidence y harness diagnóstico; cero cambios productivos, SQL, migraciones, permisos, presupuestos o timeouts.

**Resultado:** la jornada real contiene **24 obligaciones**: Main/Vocal 6 + macro U01f 17 + técnica independiente 1. La pausa se guarda desde UI. Conjunta y fases se rechazan explícitamente tanto por HTTP como por SQL, en ambos órdenes de PUT. En memoria, conservando el Main real y todas las autoridades físicas, el motor produce las 24 obligaciones, una propuesta parcial y continuación protegida; el witness global y una reparación de supporting son válidos. **No existe Stage integrado aceptado.**

| Recorrido ejecutado en esta auditoría | Resultado |
| --- | --- |
| Control U00a, UI real | 4/4 y 9/9; dos Stages aceptados |
| Control U01f, stack independiente | Ocho perfiles positivos, 16 Stages SQL nuevos; imposible sin propuesta a 4.278 ramas |
| Jornada integrada, autoría UI/API | 24 tareas reales; S0, pausa y snapshots auténticos; conjunta/fases HTTP 422 y SQL P0001 |
| Contrafactual integrado | 24/24, 127 ramas; parcial 1 y continuación 23, witness global 24 |
| Segundo día, PUT inverso | Mismos guards; memoria 24/24, 160 ramas; parcial 1 y continuación 23 |
| Control imposible integrado | Configuración físicamente imposible; en memoria agota 10.000 ramas. No se convierte agotamiento en certificado de inviabilidad |

## Formulación causal

**Comportamiento X**: dos familias certificadas por separado no pueden guardarse juntas en una jornada nueva Main/Vocal con unidad física fija, conjunta, fases REQUIRED y pausa.

**Está causado por Y**: `requiredPhaseCompositionSupported` exige `plannerNext.profile === STANDALONE_ONLY`; `fixedItinerantCompositionSupported` vuelve a exigirlo para cualquier consumidor itinerante, incluso disjunto de la conjunta. Esas decisiones se reutilizan en conjunta, pausa, vista y reconstrucción. Los validadores SQL 122/124 conservan exclusiones equivalentes del escenario Main.

**Y produce Z**: producción puede crear todas las tareas y sus recursos pero no declarar la macro operativa íntegra ni llevarla conjuntamente a Stage. Cambiar el orden de guardado no lo resuelve.

**El delta W cambiará ese comportamiento**: una única integración funcional acotada Main/Vocal × fases REQUIRED con unidades específicas fijas y transición explícita cero, reutilizando los productores, resolución física, writer/replay, solver y validadores existentes. Incluye alinear los guards de TypeScript y SQL y demostrar materialización hasta continuación; retirar sólo el primer guard no constituye la implementación.

**Esperamos observar M**: la misma jornada creada por producto, sin overlay de EngineInput, guarda sus autoridades en ambos órdenes, reconstruye/replay sin pérdida y acepta S1 parcial y S2 completo en SQL, con witness global de las 24 obligaciones, supporting reparable, recursos exactos y negativos materiales. Otra topología y repetición fría deben certificar generalidad acotada. Hasta entonces, el cruce sigue `UNSUPPORTED_EXPLICIT`; SQL integrado, `NOT_TESTED`.

W está fundamentado para esta intersección por propuestas físicas y consumidores runtime válidos; **su suficiencia productiva completa aún requiere la comprobación M de Draft/SQL/replay después de alinear las admisiones**. Esta auditoría no parchea funciones ni SQL para dar ese resultado por probado.

## Lectura de la entrega

- [Jornada real, obligaciones y recorrido UI/API](integrated-day.md).
- [Primer rechazo auténtico y orden de guardado](first-rejection.md).
- [Call path y autoridades](causal-path.md).
- [Contrafactual físico, supporting, controles negativos y límites](counterfactual.md).
- [Inventario A2 actualizado: UI/API/EngineInput/motor/Stage/composición](a2-ui-matrix.md).
- [Comparación U00a/U01d/U01f/U02a, composición y complejidad](comparison-and-complexity.md).
- [Una sola unidad funcional siguiente y aceptación](next-delta.md).
- [Reproducción, validación y fallos del harness](validation.md); [verificación independiente](verification.json).

`native/`, `control-main/` y `control-phases/` contienen recibos auténticos comprimidos; `memory/` conserva únicamente investigación offline. Cada manifiesto enumera y verifica los recibos. Los logs privados, credenciales y traces de navegador no se publican. La comprobación U01f contra sus recibos históricos cuenta 32 Stages entre ambos conjuntos, **16 nuevos** en esta ejecución.

El A2 importado 266/266 permanece como Evidence histórica de regresión de U01f; no se ha ejecutado A2 Full ni suite global en este diagnóstico sin cambios runtime. No demuestra autoría A2 desde UI. Sin Supabase real, Replit, datos históricos remotos ni merge.
