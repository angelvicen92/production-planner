# Engine V3 Benchmarks — ID 004

Suite operativa reproducible para caracterizar el motor V3 antes de modificar su lógica funcional.

## Archivos

- `types.ts`: contrato de escenarios, resultados y métricas.
- `scenarios.ts`: escenarios críticos A-F con inputs pequeños compatibles con `generatePlanV3`.
- `metrics.ts`: funciones puras de métricas e invariantes hard.
- `runBenchmark.ts`: runner usado por `npm run benchmark:engine`.
- `scenarios.spec.ts`: tests de invariantes hard sin exigir micro-optimización.

## Ejecución

```bash
npm run benchmark:engine
npm run test:engine
```

El benchmark reporta riesgos conocidos con exit code 0 mientras no haya excepción técnica. Los tests sí fallan si se rompen invariantes hard como ejecución/locks, ventanas, solapes, recursos exclusivos, comida o dependencias modeladas.
