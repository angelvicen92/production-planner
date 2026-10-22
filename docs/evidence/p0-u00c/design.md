# U00c — revisión previa de contratos

Base: 3bec719512ed4c30543460cb590c074c093bef91.

077 admite ACTIVE/CLOSED/ABANDONED e impone exclusividad parcial por plan. Las FK de Stage, revisión y run son locales a sesión/plan; cerrar una sesión no borra sus hijos. Los Stages son inmutables salvo archival inicial. 086 bootstrap adquiere advisory lock (78004, plan), comprueba snapshot diario e inserta revisión/sesión/S0 atómicamente; reutilizarlo evita otra implementación del bootstrap. 091 sólo mueve el Draft al S0 antiguo: no incorpora identidades.

Alternativas: mutar S0 violaría historia; ampliar Draft mantendría una base/revisión incompatibles; cerrar y bootstrap en llamadas separadas permitiría éxito parcial. Se elige una RPC que comprueba CAS y frontera S0 y realiza cierre + bootstrap en la misma transacción, conservando el Stage anterior literalmente.

La referencia histórica de 086 no guarda template_id, contestant_id ni todas las autoridades crudas. Se necesita una captura adicional privada al bootstrap para demostrar adición pura; no se puede reconstruir retrospectivamente. Las sesiones anteriores sin esta captura se rechazan, sin backfill inventado. Las capturas nuevas se guardan en una tabla sin permisos cliente, con FK a sesión y sin UPDATE/DELETE de servicio. Se comparan filas previas completas (salvo timestamps de auditoría), se permiten sólo tareas y participantes nuevos asociados a esas tareas; el resto de fuentes debe coincidir. Los locks SHARE de las fuentes cubren inserciones fantasma y cambios entre previsualización y commit. Son breves pero abarcan tablas: se documenta su coste y frontera conservadora.

El servidor construye input/identidad/replay/snapshot entre dos lecturas del token de fuentes. La RPC vuelve a comprobarlo bajo locks. Un trigger serializa alta de runs con la sesión y rechaza runs de sesión cerrada, CAS obsoleto y tareas ajenas al Draft. No se altera búsqueda, budgets ni validadores.

Los locks de fuentes y el lock de sesión de sustitución usan NOWAIT: una edición activa provoca conflicto reintentable y nunca espera en orden inverso a aceptación/configuración. El advisory lock existente serializa bootstrap/rebootstrap. El índice parcial sigue siendo la última barrera de exclusividad.
