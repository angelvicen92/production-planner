# G. Propuesta de Configuración premium

Propuesta de producto, sin implementar navegación ni pantallas. Autoridad: Fuente 04 §§20.3–20.11 y 20.17. Reutiliza Day Setup, editores de entidad, contratos de snapshots/revisiones y capacidades Next existentes; no añade un framework de reglas.

## Organización y roles

| Área | Qué muestra | Quién consulta / edita | Explicación operativa |
|---|---|---|---|
| Configuración del día | Readiness, excepciones, horario/comidas, participantes/tareas, espacios/recursos/unidades, transporte y coordinación pertinente | Producción/admin edita día; perfiles operativos consultan lo necesario en su ámbito; viewer sólo lectura | «Este día parte de la configuración habitual. Revisa lo que ha cambiado hoy.» |
| Catálogo general | Horario habitual, plantillas/dependencias, lugares, recursos/composiciones, transporte y operaciones reutilizables | Lectura según permisos; administración o rol autorizado expresamente edita general | «Se aplicará a los días nuevos. Los días existentes conservan su configuración.» |
| Planificación avanzada | Preferencias que realmente gobiernan Next, concentración/continuidad, bloques, severidades y tiempo por propuesta | Producción autorizada/admin; ocultar por defecto a operación diaria | «Estas preferencias influyen en la propuesta sin relajar restricciones obligatorias.» |
| Diagnóstico y administración | Compatibilidad, presupuestos internos, fingerprint/revisión, cobertura/roles y detalles de origen | Perfiles técnicos autorizados, no sustituye la vista operativa | «Detalles para comprobar el origen y reproducir una propuesta.» |
| Operación/Control Room | Reloj, avisos consumidos, visibilidad y presentación | Ajustes globales sólo rol autorizado; preferencia de vista personal cuando corresponda | «Estos avisos ayudan a supervisar la jornada; no cambian las reglas de planificación.» |

La autorización final debe validarse en la API real, incluida `/api/ta/:id`; no se considera resuelta por esconder un botón. Antes de habilitar nuevas ediciones, cerrar la unidad U03 de roles. No usar esta propuesta como autorización para ampliar permisos en P1.

## Configuración del día: trabajo por excepción

Cabecera con jornada, revisión, preparación y número de excepciones. Priorizar «Falta configurar», «Incompatible» y «Modificado para hoy». Los valores heredados correctos se ven en resumen y se expanden para inspección; no se exige confirmar uno por uno para crear una jornada.

Cada valor operacional presenta, cuando aplique:

- valor y unidad;
- alcance (día, entidad u operación);
- origen: «Heredado», «Modificado para hoy», «Propio de esta tarea» o «Histórico sin origen certificado»;
- valor heredado y diferencia;
- efecto y severidad con lenguaje humano;
- revisión/última modificación en detalle;
- impacto sobre propuesta pendiente y necesidad de revalidar.

Acciones concretas: **Modificar sólo para hoy**, **Restaurar valor heredado**, **Actualizar herencia** con comparación previa, y **Ver origen**. Restaurar recupera baseline del día; no equivale a copiar el general actual. Actualizar herencia conserva overrides activos y explicita adopción de históricos. Si una categoría no tiene escritura lossless, se presenta para consulta con el gap concreto; no se ofrece una actualización parcial silenciosa.

Antes de guardar, mostrar un resumen de cambios y qué exige revalidación. No mover tareas automáticamente ni cambiar etapas aceptadas. Una propuesta anterior queda marcada desactualizada cuando cambia su autoridad; la nueva revisión no falsea la validación histórica de un Stage. El detalle técnico de revisión puede estar colapsado.

## Catálogo activo limpio

Lista inicial sólo de entidades aptas para crear nuevos días cuando exista contrato de activo/archivo. Filtros accesibles: «Habitual», «Demostración A2», «Histórico/Archivado», «Todo». No inferir estas categorías por prefijos de nombre en lógica productiva: la futura procedencia/estado se expresa como dato aprobado.

Una fila contiene nombre operativo, tipo/lugar, uso y estado. El panel de detalle separa «Configuración habitual» de «Días que la conservan». El archivo no borra identidades, snapshots, JSON ni Stages. La recuperación es explícita y no reasigna tareas. Duplicados nominales se muestran en comparación con diferencias operativas; no hay botón «fusionar por nombre».

Alta de plantilla: arreglar primero el payload incompatible. Formulario breve para nombre/duración/ubicación/autocreación; requisitos, dependencias y coordinación en secciones pertinentes. Sólo ofrecer opciones que atraviesen snapshot/input/motor o explicar que son informativas. Los estilos visuales se agrupan separados de reglas.

## Recursos y unidades itinerantes

Recursos físicos, composiciones y responsables aparecen relacionados con su significado, sin presentarlos como la misma entidad. En la ficha de unidad:

1. nombre/código e identidad reutilizable;
2. cámaras/sonidos y otros miembros existentes;
3. recursos compartidos con otras composiciones y resumen de exclusividad;
4. disponibilidad explícita y ventana efectiva del día;
5. desplazamiento y pausas aplicables;
6. responsables de producción/editorial en apartado separado;
7. tareas/operaciones que admiten o exigen esa composición.

El editor de tarea permite «Sin unidad», «Una de las unidades permitidas» y «Unidad obligatoria». No pide introducir IDs técnicos para completar el día. Sólo se muestran opciones cuya identidad diaria esté reconciliada. Un caso propio de la jornada se identifica como tal y no se convierte automáticamente en default global. La propuesta detallada y sus pruebas están en 03-itinerant-teams.md.

## Reglas, bloques y comidas

| Configuración | Presentación propuesta | Lo que debe dejar claro |
|---|---|---|
| Horario | Inicio/fin habitual o excepción diaria | Jornada limita disponibilidad, no es un horario sugerido para cada tarea |
| Comidas | Pausa global explícita o ventana por ámbito con duración | Ventana no significa parada simultánea de toda la producción |
| Flujo principal | Espacio operativo y continuidad, con geometría vigente | Es distinto del slider de prioridad de zona legacy |
| Número de bloques | AUTO «Menor número viable» o «Preferir N» | Preferente no obliga a N ni degrada una regla REQUIRED |
| Reparto de bloques | Activación contextual con antes/después y suma visible | Sólo con SOFT y comida aplicable; la comida no crea bloques |
| Concentración | OFF / Preferente / Obligatoria en recurso aplicable | Ausencia OFF; pausas autorizadas no son huecos no deseados |
| Setups | Familias, orden explícito o elegido por motor, preparación y reentrada soportada | No sustituirlo por «agrupar actividad» neutralizado |
| Coordinación | Operación anclada/conjunta, rondas o cadena según contrato existente | Identidad y continuidad explícitas; orden observado humano no impone precedencia |

Los estados REQUIRED y los invariantes físicos se muestran como obligaciones que un generador debe respetar. La aceptación humana de una desviación va por AcceptedException concreta; no por un slider para permitir infracciones globales.

## Qué retirar, mantener o deshabilitar

| Elemento actual | Decisión propuesta, no aplicada |
|---|---|
| Pesos legacy de optimización general | Retirar de operación Assisted; si se mantiene soporte V3/V4, ubicar en sección legacy identificada con motor/ámbito |
| Agrupación por actividad y zonas asociadas | No ofrecer como influyente en Next explícito. Remitir a setup/coordination cuando tenga editor productivo |
| Input diario CONTESTANT_TOTAL_SPAN | Inhabilitar/retirar hasta soporte demostrado; guardar un peso ignorado no es una mejora |
| «Roturas permitidas nivel 10» | Retirar; ni consumidor actual ni permiso para relajar restricciones hard |
| BASIC sliders de main zone | Corregir transformación en una unidad futura o restringir a modo realmente soportado; probar interacción real |
| Márgenes de plantilla | Mantener concepto; reparar alta/UI/schema/storage/round-trip antes de presentarlo funcional |
| Aviso multiselección «motor no restringe por subconjunto» | Reescribir tras certificar mapping global/diario; el adapter sí representa alternativas explícitas |
| Idle/activar idle/activar próxima en Control Room | Inhabilitar hasta consumidor probado; evitar controles que sólo persisten |
| Umbral próxima actual | Explicar alcance real de aviso de ubicación pendiente; no prometer todos los avisos próximos |
| Horario/comida/transición/bloques versionados | Conservar y completar explicación de origen/diff/revalidación |
| Configuración incompleta/experimental | Consulta con diagnóstico explícito; no convertir benchmark en capacidad de producto |
| Versiones de contrato, hardValid, done/in_progress, locks | Detalle/invariante; no preferencias arbitrarias |

## Avanzado técnico con control humano comprensible

Antes de pedir una propuesta: esfuerzo/tiempo permitido con default general, excepción del día y ajuste de esa petición, una vez implementado el contrato de Fuente 04. Mostrar resultado «Límite de tiempo alcanzado», «Presupuesto de búsqueda agotado», «Sin solución viable demostrada» o «Sin propuesta» con su causa; no traducir todos a inviabilidad. Registrar presupuesto lógico resuelto para replay.

Best-K, backtracks, patrones y expansiones quedan en diagnóstico autorizado. Un control de tiempo no debe esconder una traducción no versionada a límites internos. Grid sólo muestra valores representables para el despliegue. Ningún cambio de tiempo/esfuerzo relaja disponibilidad, exclusividad o estado protegido.

## Calidad de interacción y accesibilidad

Etiquetas operativas, unidad siempre visible, controles con nombre accesible, ayuda de herencia vinculada y errores junto al campo. No usar sólo color para activo/override/severidad. Orden y foco de teclado estables al expandir categorías. Estados guardando/guardado/error sin perder borrador. Valores 0, vacío y heredado se distinguen visual y semánticamente. Confirmación sólo ante efecto material como restaurar/actualizar herencia, con resumen concreto de lo que cambia.

Criterio de aceptación UX: producción puede crear un día normal, revisar preparación y cambiar sólo dos excepciones sin conocer IDs, snapshots ni el solver. Puede explicar qué regla gobierna una tarea, qué miembros físicos consume una unidad y por qué una propuesta necesita revalidación. Un rol de consulta nunca ve una acción que el backend le permita indebidamente por un alias.
