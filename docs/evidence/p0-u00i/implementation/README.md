# P0-U00i — corte vertical productivo

Candidato de continuación de #1187 sobre `bb47936`, base `e79f8ee`. El alcance autorizado es ordinary auxiliary sin agrupación en STANDALONE_ONLY, un grupo anyOf y cantidad 1. El catálogo de restricciones y los resultados completos se cerrarán con los gates del candidato.

El recurso se elige dentro de `Positions.variants`; cada variante se materializa antes del dominio y canPlaceTask. MRV, coste, ledger y backtracking existentes conservan su autoridad. No se añade una heurística de afinidad ni un selector paralelo.

La proyección productora existente construye un testigo conjunto de las obligaciones pendientes con la misma búsqueda y presupuesto. Solo la proyección del scope llega a propuesta/Draft/Stage; los recursos de los testigos futuros permanecen sin asignar en SQL. La identidad aceptada se reconstruye desde assignedResourceIds diarios y se protege sin crear locks.

El certificado se revalida contra los contratos canónicos al validar y aceptar. La migración 110 añade una guardia invoker a la inserción de validaciones; no reemplaza RPCs ni concede permisos. Exige pertenencia al dominio, recursos fijos, testigo futuro completo, disponibilidad y ausencia de solape/transición física imposible. La omisión con hashes recalculados fue aceptada y revertida antes de 110; después se rechaza.

La edición manual de un Draft con anyOf requiere regresar al flujo de propuesta para certificar el futuro físico; devuelve un diagnóstico explícito. Main, Vocal, joint, cadenas, macros/setup, selección de coaches, grupos múltiples, quantity>1, byType, requiresAuxiliar/Presenter y capacidad compartida continúan fuera de esta capacidad.

Gates en preparación; no declarar READY hasta completarlos y comprobar CI del head final. Sin escrituras productivas, cambios de demo, despliegue ni merge.
