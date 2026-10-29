# Gate causal — Fuente 07 §4.4

## X / Y / Z / W / M

**X.** En una jornada nueva con los 19 participantes y Sodexo individual de 40 minutos dentro de 13:00–16:30, la sección «Cadena técnica» muestra «Combinación no soportada» y deshabilita «Crear cadena técnica». No permite declarar ni la primera fase de Reality C+EVA. No se inventa un HTTP 422 de UI: el navegador no envía el guardado porque el botón ya está deshabilitado.

**Y.** `server/technicalChainStructure.ts::requiredPhaseCompositionSupported` exige globalmente `input.mealMode === "global_hard_break"`. `technicalChainCombinationSupported` delega en esa función también cuando todavía no hay cadena. `server/effectiveConfigurationView.ts` publica `technicalChains.supported=false` y `phasesSupported=false`. `client/src/components/technical-chain-editor.tsx` incorpora `!value.supported` a `disabled`. No inspecciona si las comidas individuales son físicamente compatibles con las tareas elegidas: rechaza el modo entero.

**Z.** No se pueden autorar conjuntamente las 19 obligaciones Sodexo y las fases REQUIRED Reality C/EVA→Alfombra, que abarcan **8 obligaciones / 7 operaciones físicas**: tres Reality, dos Alfombra con EVA, la conjunta C06+C10 (dos obligaciones) y C16 (una). Totales Post conjunto son otras dos obligaciones y quedan fuera de la continuidad de Alfombra. Este guard impide la configuración conjunta del día; no significa que las 266 obligaciones carezcan de editor individual ni que las 266 sean irresolubles.

**W.** Siguiente delta acotado: admitir y certificar **fases REQUIRED nativas + comidas individuales flexibles pendientes**, conservando Main/Vocal y unidades específicas ya certificadas. Reutilizar el productor/adapter de comidas, el futuro global y los validadores/certificados existentes. Debe cubrir admisión TypeScript y SQL, propuesta, Draft, revalidación, Stage y continuación; quitar sólo el booleano de la UI o sustituir el modo de comida no resuelve el contrato. No ampliar A/B, rondas, setup ni transporte en ese delta sin evidencia adicional de una misma causa material. La primera ganancia medible es una intersección productiva nueva con las 19 comidas conservadas y la fase A de tres obligaciones; no se promete +266 ni cierre de toda la macro A2.

**M.** Repetir el mismo recorrido con IDs nuevos: guardar fases desde UI conservando `flexible_meal_window`, 19 Sodexo de 40 minutos y su capacidad. Obtener una propuesta parcial con witness global de todas las comidas pendientes, aplicar a Draft, validar y aceptar S1 SQL; continuar a S2 sin mover S1 y releer desde conexión fría. Probar pérdida individual y colectiva de último hueco, capacidad, conflictos físicos, locks/ejecución, CAS/revisión, autenticidad y permisos. Mantener G01/G02/U02d y al menos otra topología no A2. No declarar la combinación PRODUCTIVE_COMPOSED antes de ese Stage SQL.

## Primera frontera y controles focales

La captura `native/first-hard-frontier.png`, la respuesta `native/effective-configuration.json`, el EngineInput real y las filas SQL documentan el mismo estado. `native/counterfactuals.json` ejecuta `validateDailyTechnicalChains` sobre copias del input y sobre una declaración por fases de las tres operaciones de la fase A:

1. Input real: `UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION`, status 422.
2. Cambiar **únicamente** `mealMode` a `global_hard_break`: el guard devuelve true y la misma declaración pasa la validación de miembros. Las dos entradas permanecen inmutables.

El segundo caso sólo aísla la condición: no se persiste, no se planifica y no es equivalente al canon. Sustituir comidas escalonadas por una pausa global falsearía A2. Los Stages continúan en cero.

La llamada READ ONLY a `public.assert_daily_technical_chains(plan_id, policy)` reproduce el rechazo SQL sobre el modo real. `native/sql-authority.json` contiene el cuerpo efectivo tras todas las migraciones: se evita inferir la conducta actual sólo del texto histórico de 122. La exclusión de `meal_mode` se introdujo allí y sigue vigente después de las ampliaciones 123–127.

## Call path material

```text
Controles generales de comida + plantilla Sodexo + crear día/participantes/tareas
  → snapshots diarios auténticos
  → buildEngineInput
  → applyNewDayPlannerConfiguration (rol meal_break_placeholder y mealTaskTemplateId)
  → buildEffectiveConfigurationView
  → technicalChainCombinationSupported
  → requiredPhaseCompositionSupported
      mealMode !== global_hard_break → false
  → technicalChains.supported=false / phasesSupported=false
  → TechnicalChainEditor.disabled → Crear cadena técnica deshabilitado
```

La frontera de guardado reutiliza `validateDailyTechnicalChains` → `withDailyTechnicalChains` → `technicalChainCombinationSupported` → el mismo guard, antes de validar miembros y antes de búsqueda. `jointCombinationSupported` repite la condición global de comida; por ello una futura ampliación de la macro completa debe tratar también esa admisión y su SQL, como la misma intersección causal. El primer gate M acotado sigue siendo la fase A de tres operaciones. SQL `assert_daily_technical_chains` conserva la exclusión. No se alcanza una pérdida del adapter ni un rechazo del solver para la cadena nativa porque no llega a persistirse.

## Clasificación y alcance de la causa

`NATIVE_CONFIGURATION_REJECTED / CONSERVATIVE_COMPOSITION_GUARD`. Ambos productores existen: comidas flexibles y fases. Los datos básicos creados y las comidas persisten; la declaración de fases no se produce porque el editor se bloquea. No se demuestra pérdida silenciosa de esos datos ni incompatibilidad física real. El coste y la suficiencia del delta funcional deben medirse con los gates M; esta entrega sólo demuestra dónde se corta el producto.

`engineInputAdapter` ya contiene proyecciones de `technicalChains` y `participantMeals`; `executeAssistedPlanning` incorpora comidas analíticas futuras y `certifyDailyTechnicalChain` recibe el canal de comidas al validar su witness. Esto justifica reutilizar autoridades existentes, **no** afirmar que la combinación funciona por saltarse la admisión. No se ejecuta una búsqueda contrafactual nueva ni se introducen heurísticas o presupuestos.
