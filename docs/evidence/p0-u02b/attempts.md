Intentos a conservar, sin contarlos como certificados finales:
1. Checkout inicial U01f, recuperación base exacta 6e6901a por fetch autorizado; sin cambios productivos previos a verificarla.
2. attempt1/2: guardados UI sin cambios -> 409 TECHNICAL_CHAIN_NO_CHANGES. Se sustituyen por edición real de orden interno y retirada/creación conjunta desde UI; el producto no cambia.
3. attempt3: ataque phase-order en variante de duración heterogénea no conseguía montar una permutación válida; error de harness. No cuenta como rechazo SQL.
4. attempt4: supporting usaba el codec HTTP como ScheduledTask y daba certificado INVALID; se convierte exclusivamente la selección visible a los IDs del witness auténtico. No cambia producto.
5. attempt5: el ataque phase-gap heterogéneo invadía la ventana de pausa antes del guard de fases. Se conserva diagnóstico; phase-gap/order materiales se prueban sobre las dos topologías originales; AB→AC usa otros ataques físicos.
6. native: tres positivos S1/S2, después fetch failed al hacer polling del imposible; sin respuesta final ni certificado de inviabilidad. Se cambia sólo transporte HTTP del harness a Connection: close, sin tocar deadlines, presupuestos ni búsqueda. Se captura causa en cualquier fallo posterior.
7. cold-a: montaje de Draft falsificado violaba FK de validación antes del RPC. Se corrige orden de actualizaciones dentro de transacción revertida; nunca se cuenta 23503 como rechazo físico/autenticidad.
8. build inicial en sandbox: tsx no pudo abrir IPC local. Build se repite con permiso de ejecución ya concedido.
