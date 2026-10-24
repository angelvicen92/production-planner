# P0-U00i — selección nominal física en ordinary standalone

La continuación del mismo PR #1187 implementa el corte aprobado tras la auditoría de ChatGPT: `STANDALONE_ONLY`, auxiliares ordinary no agrupadas, un único grupo `anyOf`, cantidad 1 e identidades físicas exclusivas inequívocas. Main/Vocal, estructuras, grupos múltiples y modalidades no certificadas conservan rechazo explícito.

La [implementación y sus gates](implementation/README.md) documentan la búsqueda, el certificado físico conjunto, el round-trip a Stage y la migración 110. READY depende de los gates funcionales, regresiones y CI del head final; no se deduce del diagnóstico anterior.

El [diagnóstico original](README.diagnostic.md), sus recibos y la auditoría causal sobre `e79f8ee` se conservan como historia. Su afirmación de producto sin cambios corresponde exclusivamente a `bb47936`. El verificador histórico contrasta las fuentes contra aquella base Git, no contra el producto de esta continuación. No se reetiquetan resultados históricos como nuevas ejecuciones.

Sin segundo solver, equipos ficticios, cambios de budgets/timeouts, demo, datos productivos, despliegue ni merge.
