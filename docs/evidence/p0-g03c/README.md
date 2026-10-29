# P0-G03c — diagnóstico de conjunta × fases × comidas flexibles

Base autorizada `1683233131913df451dc97986c084c442f3aa87e`; rama `codex/p0-g03c-joint-phases-flexible-meals`. **DIAGNOSTIC_ONLY. La composición nueva no queda habilitada ni certificada hasta SQL.** Código productivo, guards, migraciones 001–128, fuentes oficiales y buscador permanecen iguales a la base.

El probe focal demuestra viabilidad en memoria de una conjunta real dentro de tres fases REQUIRED con tres comidas individuales pendientes. El certificado existente devuelve `WITNESS`, `consumed=0`. La ampliación lógica de G03b también tiene un witness de **46 tareas productivas + 19 comidas**, con ocho obligaciones visibles que representan siete operaciones físicas, incluida C06+C10. Esto no es un Stage ni una configuración conjunta persistida.

La autoría nativa crea **65 obligaciones y las tres fases** con IDs nuevos. Conserva el primer rechazo conocido: conjunta deshabilitada y `assert_daily_joint_groups` rechazando en una transacción READ ONLY. La comprobación adicional encuentra una barrera material para el gate de Fuente 06 §5.1: **EVA debe estar disponible desde las 16:00; los editores nativos de catálogo y Recursos del día no exponen su ventana horaria.** Sus filas SQL y EngineInput conservan `null/null`. No se introduce esa ventana mediante API/SQL ni se sustituye por una hora humana, un lock o una restricción de otra entidad.

Por esa falta de autoría y de aceptación auténtica de la intersección, se retira el ensayo local de admisión/129 y se entrega diagnóstico. No se presenta como mejora una relajación de guards. La física es viable en el perfil probado; no hay Evidence de inviabilidad ni agotamiento.

- [Gate causal, call path completo y siguiente delta verificable](causal-gate.md).
- [Matriz de composición y negativos](composition-matrix.md).
- [Reproducción, resultados y límites de validación](validation.md).
- `native/`, `repeat/`: recibos públicos de dos bases nuevas y capturas de la UI.
- `probe/`, `probe-repeat/`: perfil pequeño, negativos y continuación en memoria.
- `macro/`, `macro-repeat/`: contrafactuales sobre los inputs reales de las bases nuevas; no escriben Draft, runs ni Stages.

No acredita la macro A2 completa, la autoría nueva 266/266 ni S1/S2 de las tres capacidades. Las regresiones históricas se informan aparte. Sin merge ni despliegue ni escrituras en Supabase remoto.
