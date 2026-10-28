# Validación y reproducción

Todos los datos se crean en stacks locales descartables con PostgreSQL/Auth/PostgREST/Chromium reales. El runner elimina las credenciales Supabase heredadas y fija host local; los logs privados no se publican. Ejecutar los stacks en secuencia.

```sh
npm run check
npm run build
npx --no-install tsc -p docs/evidence/p0-g01/tsconfig.json
node --import tsx --test client/src/lib/template-resource-requirements.test.ts server/taskTemplateContract.spec.ts server/taskTemplateSnapshot.spec.ts server/atomicTaskTemplate.spec.ts server/apiAuthorization.spec.ts engine/planner-next/integration/concreteResourceRequirements.spec.ts server/composedAnchoredRequired.spec.ts server/fixedItinerantPhaseComposition.spec.ts server/requiredPhaseComposition.spec.ts
node --import tsx docs/evidence/p0-g01/run.ts work/g01-ui
node --import tsx docs/evidence/p0-g01/run.ts work/g01-api --api-baseline
python3 docs/evidence/p0-u02d/verify.py work/g01-ui/native work/g01-ui-verification.json
python3 docs/evidence/p0-u02d/verify.py work/g01-api/native work/g01-api-verification.json
python3 docs/evidence/p0-g01/compare.py work/g01-ui/native work/g01-api/native work/g01-comparison.json
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u02d/baselines.ts p0-u00x work/g01-u00x
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u02d/baselines.ts p0-u02b work/g01-u02b
python3 docs/evidence/p0-g01/verify-controls.py work/g01-u00x work/g01-u02b work/g01-control-verification
```

Los tests de recursos existentes cubren identidad ausente/ambigua, cantidad inválida, indisponibilidad y capacidad auxiliar no representable. Los nuevos tests prueban conservación literal, alias legacy, duplicados, identificaciones inequívocas, estado inactivo y catálogo cambiado antes de guardar. No se endurece ni relaja el contrato público permisivo de almacenamiento: estos negativos se rechazan por la UI y por los consumidores productivos ya existentes, en sus fronteras respectivas.

La jornada U02d mantiene todos sus ataques SQL, con hashes físicos recalculados cuando procede, certificados, protección, rollback/redo y conexión fría. AB→AC sigue agotando 10.000 ramas sin Stage. El nuevo workflow `p0-g01-template-resources.yml` reproduce las dos vías y su comparación.

Primer intento: el archivo de fuentes no copiaba el hook nuevo de U02d; la aserción `authored.length > 0` rechazó la ejecución al terminar los controles API. No se cuenta como prueba de UI. El runner se corrigió para copiar/verificar también ese archivo, sin cambiar ninguna assertion ni fixture del control. El primer TypeScript detectó un `Set<unknown>` inferido en el código existente, corregido como `Set<number>`; el sandbox inicial de tests requería red habilitada para los sockets de tsx. Los intentos fallidos quedan separados de las certificaciones finales.

Otros ajustes del harness, sin cambio productivo: tras un 409 la recarga es asíncrona; la prueba espera ahora el mismo elemento retirado antes de comprobar su ausencia. Settings ya está protegido por `allowedRoles={["admin"]}` en `App.tsx`: la prueba de viewer comprueba la redirección a Dashboard y la ausencia del editor, además de los 403 de API para PRODUCTION/AUX/VIEWER, en vez de intentar abrir una pestaña que ese rol no puede ver. Las expectativas y fixtures productivos de U02d no se modifican.

Las lecturas SQL de plantilla incluyen la fila operativa completa (`operational_snapshot`), además de las identidades y requisitos. Al capturar se excluyen únicamente `created_at`/`updated_at`, porque las bases independientes se ejecutan en momentos distintos. Se comparan todos los demás campos, incluidos IDs, contrato, roles, dependencias, recursos, continuidad y márgenes, sin remapeos. EngineInput y los resultados U02d se comparan completos bajo el verificador histórico.

## Gates locales finales

| Gate | Resultado |
| --- | --- |
| TypeScript y tipos del harness | PASS |
| Tests focales UI/contrato/API/recursos | 36/36 PASS |
| Tests de composición U02d/U01f/U01b | 14/14 PASS |
| Build y secuencia de migraciones intacta | PASS |
| Chromium CRUD, coach, dimensiones ocultas, stale y permisos | PASS |
| Integrado con recursos guardados por UI | 26 plantillas, cuatro perfiles; 8 Stages SQL nuevos |
| Control API en otra base fría | 8 Stages SQL nuevos; comparación literal PASS |
| Snapshots de plantilla | 148 filas operativas iguales entre UI/API |
| Verificador físico independiente U02d | PASS en ambas bases, certificados/protección/relectura SQL |
| U00x aislado | 3 Stages nuevos; 6 replays fríos frente a evidencia histórica, física SQL exacta |
| U02b aislado | 6 Stages nuevos frente a 6 históricos; snapshots/fingerprints/física exactos |
| Vinculación de fuentes | Cuatro ejecuciones coinciden con el checkout, sin delta durante la ejecución |

`ui/`, `api/`, `control-u00x/` y `control-u02b/` contienen sólo recibos públicos comprimidos, manifiestos de hash y vinculación de fuentes. Los contadores principales son 16 Stages nuevos entre UI/API; el verificador U02b totaliza 12 al sumar 6 nuevos y 6 históricos, no 12 nuevos. Los intentos previos de desarrollo se documentan en `attempts.json` y no se suman a esta certificación.

La CI del head remoto se consulta en los checks del PR; los logs anteriores acreditan el gate local y no sustituyen ese estado vivo. A2 histórico no se volvió a ejecutar localmente porque no se modifica una dependencia material del motor/snapshot/SQL. Los workflows heredados mantienen sus gates automáticos habituales.
