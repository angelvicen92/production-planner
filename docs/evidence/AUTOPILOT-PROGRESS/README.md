# Progreso de Completar automáticamente

Validación local: 17 de octubre de 2026.

## Causa y cambio

El workspace mostraba directamente el mensaje del controlador y enumeraba las
obligaciones del ámbito con su contexto completo. La jerarquía visual dejaba el
progreso global subordinado al detalle de ejecución.

`projectAutopilotProgress` proyecta el contrato existente a una vista de negocio.
El componente presenta barra global, tareas confirmadas/total, porcentaje,
restantes, última etapa aceptada, ámbito y tipos de tarea. Los mensajes originales,
el selector, el resultado y su Evidence permanecen en «Ver detalle técnico»,
colapsado inicialmente. El historial de etapas existente sigue disponible.

El porcentaje usa exclusivamente `completed / total` del controlador, actualizado
tras verificar la aceptación persistida. No usa el borrador vivo ni estima el
avance de una propuesta. El porcentaje visible se redondea a una decimal, con
tope de 99,9 mientras quedan tareas. No se han modificado controlador, servidor,
contratos, motor, aceptación, validación ni selección de ámbitos.

Los ámbitos se etiquetan por espacios del catálogo y las tareas del selector;
los tipos se agrupan por el nombre configurado de su plantilla. No hay heurísticas
por nombre ni constantes de A2. Las listas extensas se resumen con sus recuentos;
las relaciones ausentes tienen etiquetas de reserva. Mientras se selecciona un
nuevo ámbito se identifica el anterior como último ámbito procesado.

## Archivos de implementación

- `client/src/lib/assisted-autopilot-progress.ts`: proyección UX.
- `client/src/components/planning/assisted-autopilot-progress.tsx`: presentación.
- `client/src/components/planning/assisted-planning-workspace.tsx`: integración.
- `client/src/lib/assisted-autopilot-progress.test.ts`: pruebas unitarias.
- `client/src/components/planning/assisted-autopilot-progress.test.tsx`: render real.

## Tests

Ejecutados con `node --import tsx <archivo>`; **56 casos pasan**:

- `client/src/lib/assisted-autopilot-progress.test.ts`: 7.
- `client/src/components/planning/assisted-autopilot-progress.test.tsx`: 2.
- `client/src/components/planning/assisted-planning-workspace.test.ts`: 10.
- `shared/assistedAutopilot.test.ts`: 37.

Cobertura: progreso confirmado, ámbitos, relaciones ausentes, desglose
configurable y determinista, listas extensas, todas las fases, parada solicitada,
finalización, validación, ausencia de propuesta, diagnóstico colapsado y barra
accesible. Los tests existentes cubren orden de operaciones, parada/reanudación,
protecciones, concurrencia, autorización, validación y errores de polling.

TypeScript de cliente y shared: **PASS**, mediante configuración temporal que
extiende `tsconfig.json`, incluye `client/src/**/*` y `shared/**/*`, excluye tests
(`**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`) y desactiva incremental.
`git diff --check`: **PASS**.

`npm run check`: **bloqueado por dependencias del entorno**. Falta
`@electric-sql/pglite`, ya declarada en package.json. Los errores aparecen en
`server/assistedManualSnapshotFidelity.spec.ts`, `assistedRestart.spec.ts`,
`liveExecution.spec.ts` y `planningHeaderNotesSql.spec.ts`; las referencias sin
resolver provocan también errores de tipos implícitos en `assistedRestart.spec.ts`.
No se modificaron dependencias ni se afirma que el chequeo global pase.

## Comprobación visual y de interacción

Se montó el componente React real y su proyector en una página local temporal,
con CSS del proyecto y estados simulados; se inspeccionaron las capturas y se
comprobaron las interacciones en Chromium mediante Playwright:

1. Generación con 47/266: 17,7%, Plató 7, desglose por plantilla y detalle oculto.
2. Abrir/cerrar detalle técnico con clic: mensaje y JSON accesibles.
3. Pasar por aplicación, validación y aceptación: el porcentaje sigue en 47/266.
4. Recibir un checkpoint confirmado con 50/266: la barra avanza.
5. Detener, fallar por validación o ausencia de propuesta, finalizar: mensaje de
   negocio y último ámbito conservados; éxito alcanza 100%.
6. Viewport 375 × 812: sin desbordamiento horizontal; acordeón operable con Enter.
7. Sin errores de React ni de navegador.

Capturas: [escritorio](autopilot-progreso.png) y [móvil](autopilot-movil.png).
Resultado automatizado: [validacion-navegador.json](validacion-navegador.json).
Las capturas corresponden al componente aislado, con datos de prueba; no son una
nueva ejecución de la jornada A2 real ni una prueba integral con servidor.

## Límites

- El progreso es por tareas confirmadas, no por tiempo estimado restante.
- Los tipos dependen de las plantillas configuradas; no se deduce una taxonomía
  adicional de producción.
- Los errores no reconocidos reciben una explicación de revisión general; el
  diagnóstico original permanece accesible en el acordeón.
- Quedan pendientes el chequeo global con la dependencia disponible y un ensayo
  integral sobre una jornada real. La validación no escribió en datos remotos.
