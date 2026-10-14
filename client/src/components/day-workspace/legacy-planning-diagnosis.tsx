import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function V4StrategicDiagnosis({
  result,
  isLoading,
  error,
  state = "idle",
}: {
  result: any;
  isLoading: boolean;
  error: unknown;
  state?: "idle" | "loading" | "pending_diagnostics" | "success" | "error";
}) {
  const diagnostics = result?.diagnostics ?? null;
  const analysis = diagnostics?.strategicAnalysis ?? null;
  const guidedOrdering = diagnostics?.guidedOrdering ?? null;
  const mainFlowImprovement = diagnostics?.mainFlowImprovement ?? null;
  const candidateRunner = diagnostics?.candidateRunner ?? null;
  const sequenceSearch =
    diagnostics?.mainFlowSequenceSearch ??
    candidateRunner?.mainFlowSequenceSearch ??
    null;
  const postOptimizer = diagnostics?.postOptimizer ?? null;
  const blockRepacker = diagnostics?.blockRepacker ?? null;
  const executiveSummary = diagnostics?.executiveSummary ?? null;
  const finalAcceptance = diagnostics?.finalAcceptance ?? null;
  const performance = diagnostics?.performance ?? null;
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  const score = (value: unknown) =>
    Number.isFinite(Number(value)) ? `${Math.round(Number(value))}/100` : "—";
  const riskVariant =
    analysis?.riskScore === "CRITICAL" || analysis?.riskScore === "HIGH"
      ? "destructive"
      : analysis?.riskScore === "MEDIUM"
        ? "secondary"
        : "outline";

  if (isLoading || state === "loading" || state === "pending_diagnostics") {
    return (
      <p className="text-muted-foreground">
        {state === "loading"
          ? "Generando planificación V4/ORC..."
          : "Planificación generada, esperando diagnóstico..."}
      </p>
    );
  }
  if (error || state === "error") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error V4</AlertTitle>
        <AlertDescription>No se pudo cargar la diagnosis V4.</AlertDescription>
      </Alert>
    );
  }
  if (!diagnostics) {
    return (
      <p className="text-muted-foreground">
        Todavía no existe planificación V4 para este plan.
      </p>
    );
  }
  if (!analysis) {
    return (
      <p className="text-muted-foreground">
        La diagnosis V4 no contiene análisis estratégico todavía.
      </p>
    );
  }

  const mainFlow = analysis?.mainFlow ?? null;
  const continuousSpaces = list(analysis?.continuousSpaces);
  const criticalTalents = list(analysis?.criticalTalents);
  const criticalResources = list(analysis?.criticalResources);
  const criticalSpaces = list(analysis?.criticalSpaces);
  const mainFlowSequence = list(analysis?.mainFlowSequence);
  const costOfDelayRanking = list(analysis?.costOfDelayRanking);
  const priorityBuckets = list(guidedOrdering?.priorityBuckets);
  const topOrderedTasks = list(guidedOrdering?.topOrderedTasks);
  const improvementMoves = list(mainFlowImprovement?.moves);
  const improvementSkippedReasons = list(mainFlowImprovement?.skippedReasons);
  const candidateDiagnostics = list(candidateRunner?.candidates);
  const sequenceVariants = list(sequenceSearch?.variants);
  const mainFlowFirst =
    candidateDiagnostics.find(
      (candidate: any) =>
        candidate?.strategyId === "strategy_v4_main_flow_first",
    )?.mainFlowFirstScheduler ??
    diagnostics?.mainFlowFirstScheduler ??
    null;
  const productionWave =
    candidateDiagnostics.find(
      (candidate: any) =>
        candidate?.strategyId === "strategy_v4_production_wave",
    )?.productionWaveScheduler ??
    diagnostics?.productionWaveScheduler ??
    null;
  const mainFlowFirstBlockers = list(mainFlowFirst?.blockers);
  const productionWaveBlockers = list(productionWave?.blockers);
  const productionWaveWarnings = list(productionWave?.warnings);
  const postOptimizerWarnings = list(postOptimizer?.warnings);
  const postOptimizerPasses = list(postOptimizer?.passes);
  const blockRepackerWarnings = list(blockRepacker?.warnings);
  const blockRepackerMoves = list(blockRepacker?.acceptedMoves);

  const renderCritical = (items: any[], empty: string) =>
    items.length ? (
      <ul className="space-y-1">
        {items.map((item: any) => (
          <li key={`${item?.id}-${item?.name}`} className="rounded border p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {String(item?.name ?? item?.id ?? "—")}
              </span>
              <Badge variant="outline">{score(item?.pressureScore)}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {Number(item?.taskCount ?? 0)} tareas ·{" "}
              {Number(item?.totalDurationMinutes ?? 0)} min
            </div>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-muted-foreground">{empty}</p>
    );

  const renderReasons = (item: any) =>
    list(item?.reasons).slice(0, 3).map(String).join(" · ") || "—";

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-3">
        <div>
          <span className="font-medium">Estado:</span>{" "}
          {String(result?.status ?? diagnostics?.status ?? "—")}
        </div>
        <div>
          <span className="font-medium">Motor:</span>{" "}
          {String(diagnostics?.engineVersion ?? "v4")}
        </div>
        <div>
          <span className="font-medium">Timestamp:</span>{" "}
          {String(diagnostics?.generatedAt ?? result?.createdAt ?? "—")}
        </div>
        <div>
          <span className="font-medium">Tareas planificadas:</span>{" "}
          {Number(diagnostics?.plannedTasks ?? 0)}
        </div>
        <div>
          <span className="font-medium">Tareas no planificadas:</span>{" "}
          {Number(diagnostics?.unplannedTasks ?? 0)}
        </div>
        <div>
          <span className="font-medium">Risk Score:</span>{" "}
          <Badge variant={riskVariant as any}>
            {String(analysis?.riskScore ?? "—")}
          </Badge>
        </div>
        <div className="md:col-span-3 text-amber-700">
          {String(
            diagnostics?.warning ??
              "La lógica V4 real aún no está implementada.",
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="rounded-lg border p-3">
          <h3 className="font-medium">Executive Summary</h3>
          {executiveSummary ? (
            <div className="mt-2 space-y-2 text-sm">
              <div>
                <span className="font-medium">Verdict:</span>{" "}
                {String(executiveSummary?.verdict ?? "—")}
              </div>
              <div>
                <span className="font-medium">Headline:</span>{" "}
                {String(executiveSummary?.headline ?? "—")}
              </div>
              <div>
                <span className="font-medium">Selected strategy:</span>{" "}
                {String(executiveSummary?.selectedStrategy ?? "—")}
              </div>
              <div>
                <span className="font-medium">Fallback:</span>{" "}
                {finalAcceptance?.fallbackToV3Baseline ? "sí" : "no"}
              </div>
              <div>
                <span className="font-medium">Wins:</span>{" "}
                {list(executiveSummary?.wins).map(String).join(" · ") || "—"}
              </div>
              <div>
                <span className="font-medium">Losses:</span>{" "}
                {list(executiveSummary?.losses).map(String).join(" · ") || "—"}
              </div>
              <div>
                <span className="font-medium">Risks:</span>{" "}
                {list(executiveSummary?.risks).map(String).join(" · ") || "—"}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Sin resumen ejecutivo V4.
            </p>
          )}
        </section>
        <section className="rounded-lg border p-3">
          <h3 className="font-medium">Final Acceptance</h3>
          {finalAcceptance ? (
            <div className="mt-2 space-y-2 text-sm">
              <div>
                <span className="font-medium">Aceptado:</span>{" "}
                {finalAcceptance?.accepted ? "sí" : "no"}
              </div>
              <div>
                <span className="font-medium">Fallback V3:</span>{" "}
                {finalAcceptance?.fallbackToV3Baseline ? "sí" : "no"}
              </div>
              <div>
                <span className="font-medium">Razón:</span>{" "}
                {String(finalAcceptance?.reason ?? "—")}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Sin final acceptance gate.
            </p>
          )}
        </section>
        <section className="rounded-lg border p-3">
          <h3 className="font-medium">Performance</h3>
          {performance ? (
            <div className="mt-2 space-y-2 text-sm">
              <div>
                <span className="font-medium">Runtime:</span>{" "}
                {Number(performance?.runtimeMs ?? 0)} ms
              </div>
              <div>
                <span className="font-medium">Estrategias:</span>{" "}
                {Number(performance?.strategiesEvaluated ?? 0)}
              </div>
              <div>
                <span className="font-medium">Perfil:</span>{" "}
                {String(performance?.profile ?? "—")}
              </div>
              <div>
                <span className="font-medium">Budget exceeded:</span>{" "}
                {performance?.budgetExceeded ? "sí" : "no"}
              </div>
              <div>
                <span className="font-medium">Omitidas:</span>{" "}
                {list(performance?.skippedStrategies).map(String).join(" · ") ||
                  "—"}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Sin métricas de performance.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-lg border p-3">
          <h3 className="font-medium">Main Flow</h3>
          {mainFlow ? (
            <p className="text-sm">
              {String(mainFlow?.name ?? "—")} · prioridad{" "}
              {String(mainFlow?.priority ?? "—")} · id{" "}
              {String(mainFlow?.id ?? "—")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay flujo principal configurado.
            </p>
          )}
        </section>
        <section className="rounded-lg border p-3">
          <h3 className="font-medium">Continuous Spaces</h3>
          {continuousSpaces.length ? (
            <ul className="text-sm">
              {continuousSpaces.map((space: any) => (
                <li key={space?.id}>
                  {String(space?.name ?? space?.id)} ·{" "}
                  {Number(space?.totalLoadMinutes ?? 0)} min · ocupación{" "}
                  {score(space?.estimatedOccupancy)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay espacios continuos detectados.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-lg border p-3">
          <h3 className="mb-2 font-medium">Main Flow Sequence</h3>
          {mainFlowSequence.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2">#</th>
                    <th className="py-1 pr-2">Talent</th>
                    <th className="py-1 pr-2">Score</th>
                    <th className="py-1">Motivos principales</th>
                  </tr>
                </thead>
                <tbody>
                  {mainFlowSequence.map((item: any, index: number) => (
                    <tr
                      key={`${item?.talentId}-${index}`}
                      className="border-t align-top"
                    >
                      <td className="py-2 pr-2">{index + 1}</td>
                      <td className="py-2 pr-2 font-medium">
                        {String(item?.talentName ?? item?.talentId ?? "—")}
                      </td>
                      <td className="py-2 pr-2">
                        <Badge variant="outline">{score(item?.score)}</Badge>
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {renderReasons(item)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay talentos candidatos para atravesar el flujo principal.
            </p>
          )}
        </section>
        <section className="rounded-lg border p-3">
          <h3 className="mb-2 font-medium">Cost Of Delay Ranking</h3>
          {costOfDelayRanking.length ? (
            <ul className="space-y-2">
              {costOfDelayRanking.map((item: any, index: number) => (
                <li
                  key={`${item?.talentId}-${index}`}
                  className="rounded border p-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {index + 1}.{" "}
                      {String(item?.talentName ?? item?.talentId ?? "—")}
                    </span>
                    <Badge
                      variant={
                        Number(item?.costOfDelay ?? 0) >= 75
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {score(item?.costOfDelay)}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {renderReasons(item)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sin ranking de coste de demora.
            </p>
          )}
        </section>
      </div>

      <section className="rounded-lg border p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Main Flow Sequence Search</h3>
          <Badge variant={sequenceSearch?.applied ? "default" : "outline"}>
            {sequenceSearch?.applied ? "Aplicado" : "No aplicado"}
          </Badge>
        </div>
        {sequenceSearch ? (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <span className="font-medium">Variantes generadas:</span>{" "}
                {Number(
                  sequenceSearch?.variantCount ?? sequenceVariants.length ?? 0,
                )}
              </div>
              <div>
                <span className="font-medium">Variante seleccionada:</span>{" "}
                {String(sequenceSearch?.selectedVariantId ?? "—")}
              </div>
            </div>
            {sequenceVariants.length ? (
              <div className="grid gap-2 md:grid-cols-2">
                {sequenceVariants.map((variant: any) => (
                  <div
                    key={String(variant?.id ?? variant?.label)}
                    className="rounded border p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {String(variant?.label ?? variant?.id ?? "—")}
                      </span>
                      <Badge variant="outline">
                        {Number(variant?.talentCount ?? 0)} talentos
                      </Badge>
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {list(variant?.topTalents)
                        .slice(0, 5)
                        .map((talent: any, index: number) => (
                          <li
                            key={`${variant?.id}-${talent?.talentId}-${index}`}
                          >
                            #{index + 1} Talent{" "}
                            {String(talent?.talentId ?? "—")} ·{" "}
                            {score(talent?.score)} · {renderReasons(talent)}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay variantes de secuencia para mostrar.
              </p>
            )}
            {list(sequenceSearch?.warnings).length ? (
              <div className="text-xs text-amber-700">
                {list(sequenceSearch?.warnings).map(String).join(" · ")}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            La diagnosis V4 todavía no contiene búsqueda de secuencias.
          </p>
        )}
      </section>

      <section className="rounded-lg border p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Candidate Strategies</h3>
          <Badge variant={candidateRunner?.applied ? "default" : "outline"}>
            {candidateRunner?.applied ? "Aplicado" : "Sin datos"}
          </Badge>
        </div>
        {candidateRunner ? (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <span className="font-medium">Estrategia ganadora:</span>{" "}
                {String(
                  candidateRunner?.bestStrategyId ??
                    diagnostics?.bestStrategyId ??
                    "—",
                )}
              </div>
              <div>
                <span className="font-medium">Candidatos evaluados:</span>{" "}
                {Number(
                  candidateRunner?.candidateCount ??
                    candidateDiagnostics.length ??
                    0,
                )}
              </div>
            </div>
            {candidateDiagnostics.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2">Estrategia</th>
                      <th className="py-1 pr-2">Quality</th>
                      <th className="py-1 pr-2">Sequence variant</th>
                      <th className="py-1 pr-2">Gaps flujo</th>
                      <th className="py-1 pr-2">Makespan</th>
                      <th className="py-1 pr-2">No planificadas</th>
                      <th className="py-1">Seleccionada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidateDiagnostics.map(
                      (candidate: any, index: number) => (
                        <tr
                          key={`${candidate?.strategyId ?? "strategy"}-${index}`}
                          className="border-t align-top"
                        >
                          <td className="py-2 pr-2 font-medium">
                            {String(candidate?.strategyId ?? "—")}
                          </td>
                          <td className="py-2 pr-2">
                            <Badge variant="outline">
                              {score(candidate?.qualityScore)}
                            </Badge>
                          </td>
                          <td className="py-2 pr-2">
                            {String(candidate?.sequenceVariantId ?? "—")}
                          </td>
                          <td className="py-2 pr-2">
                            {Number(candidate?.mainFlowGapMinutes ?? 0)} min
                          </td>
                          <td className="py-2 pr-2">
                            {String(candidate?.makespan ?? "—")}
                          </td>
                          <td className="py-2 pr-2">
                            {Number(candidate?.unplannedTasks ?? 0)}
                          </td>
                          <td className="py-2">
                            {candidate?.selected ? (
                              <Badge>Ganadora</Badge>
                            ) : (
                              <Badge variant="outline">No</Badge>
                            )}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay candidatos de estrategia para mostrar.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            La diagnosis V4 todavía no contiene candidate runner.
          </p>
        )}
      </section>

      <section className="rounded-lg border p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Post Optimizer</h3>
          <Badge variant={postOptimizer?.applied ? "default" : "outline"}>
            {postOptimizer?.applied ? "Aplicado" : "No aplicado"}
          </Badge>
        </div>
        {postOptimizer ? (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 md:grid-cols-3">
              <div>
                <span className="font-medium">Makespan antes:</span>{" "}
                {String(postOptimizer?.makespanBefore ?? "—")}
              </div>
              <div>
                <span className="font-medium">Makespan después:</span>{" "}
                {String(
                  postOptimizer?.makespanAfter ??
                    postOptimizer?.makespanBefore ??
                    "—",
                )}
              </div>
              <div>
                <span className="font-medium">Movimientos:</span>{" "}
                {Number(postOptimizer?.movesAccepted ?? 0)} aceptados /{" "}
                {Number(postOptimizer?.movesRejected ?? 0)} rechazados
              </div>
              <div>
                <span className="font-medium">Gaps flujo antes:</span>{" "}
                {Number(postOptimizer?.mainFlowGapMinutesBefore ?? 0)} min
              </div>
              <div>
                <span className="font-medium">Gaps flujo después:</span>{" "}
                {Number(
                  postOptimizer?.mainFlowGapMinutesAfter ??
                    postOptimizer?.mainFlowGapMinutesBefore ??
                    0,
                )}{" "}
                min
              </div>
              <div>
                <span className="font-medium">Permanencia total:</span>{" "}
                {Number(postOptimizer?.totalTalentStayBefore ?? 0)} →{" "}
                {Number(
                  postOptimizer?.totalTalentStayAfter ??
                    postOptimizer?.totalTalentStayBefore ??
                    0,
                )}{" "}
                min
              </div>
            </div>
            {postOptimizerPasses.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2">Pass</th>
                      <th className="py-1 pr-2">Aceptados</th>
                      <th className="py-1">Rechazados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postOptimizerPasses.map((pass: any, index: number) => (
                      <tr
                        key={`${pass?.name ?? "pass"}-${index}`}
                        className="border-t"
                      >
                        <td className="py-2 pr-2 font-medium">
                          {String(pass?.name ?? "—")}
                        </td>
                        <td className="py-2 pr-2">
                          {Number(pass?.accepted ?? 0)}
                        </td>
                        <td className="py-2">{Number(pass?.rejected ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground">Sin passes registrados.</p>
            )}
            <div>
              <div className="font-medium">Warnings</div>
              {postOptimizerWarnings.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-amber-700">
                  {postOptimizerWarnings.map((warning: any, index: number) => (
                    <li key={`${String(warning)}-${index}`}>
                      {String(warning)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Sin warnings.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            La diagnosis V4 todavía no contiene post optimizer.
          </p>
        )}
      </section>

      <section className="rounded-lg border p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Strategic Block Repacker</h3>
          <Badge variant={blockRepacker?.applied ? "default" : "outline"}>
            {blockRepacker?.applied ? "Aplicado" : "Omitido"}
          </Badge>
        </div>
        {blockRepacker ? (
          <div className="space-y-3 text-sm">
            {blockRepacker?.skippedReason ? (
              <p className="text-muted-foreground">
                {String(blockRepacker.skippedReason)}
              </p>
            ) : null}
            <div className="grid gap-2 md:grid-cols-3">
              <div>
                <span className="font-medium">Bloques:</span>{" "}
                {Number(blockRepacker?.blocksDetected ?? 0)} detectados /{" "}
                {Number(blockRepacker?.blocksEvaluated ?? 0)} evaluados
              </div>
              <div>
                <span className="font-medium">Movimientos:</span>{" "}
                {Number(blockRepacker?.movesAccepted ?? 0)} aceptados /{" "}
                {Number(blockRepacker?.movesRejected ?? 0)} rechazados
              </div>
              <div>
                <span className="font-medium">Makespan:</span>{" "}
                {String(blockRepacker?.makespanBefore ?? "—")} →{" "}
                {String(
                  blockRepacker?.makespanAfter ??
                    blockRepacker?.makespanBefore ??
                    "—",
                )}
              </div>
              <div>
                <span className="font-medium">Gaps flujo:</span>{" "}
                {Number(blockRepacker?.mainFlowGapMinutesBefore ?? 0)} →{" "}
                {Number(
                  blockRepacker?.mainFlowGapMinutesAfter ??
                    blockRepacker?.mainFlowGapMinutesBefore ??
                    0,
                )}{" "}
                min
              </div>
              <div>
                <span className="font-medium">Permanencia total:</span>{" "}
                {Number(blockRepacker?.totalTalentStayBefore ?? 0)} →{" "}
                {Number(
                  blockRepacker?.totalTalentStayAfter ??
                    blockRepacker?.totalTalentStayBefore ??
                    0,
                )}{" "}
                min
              </div>
            </div>
            {blockRepackerMoves.length ? (
              <div>
                <div className="font-medium">Top movimientos aceptados</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {blockRepackerMoves
                    .slice(0, 5)
                    .map((move: any, index: number) => (
                      <li key={`${move?.blockType ?? "block"}-${index}`}>
                        {String(move?.blockType ?? "—")} ·{" "}
                        {String(move?.from ?? "—")} → {String(move?.to ?? "—")}{" "}
                        · tareas {list(move?.taskIds).join(", ") || "—"}
                      </li>
                    ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sin movimientos aceptados.
              </p>
            )}
            <div>
              <div className="font-medium">Warnings</div>
              {blockRepackerWarnings.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-amber-700">
                  {blockRepackerWarnings.map((warning: any, index: number) => (
                    <li key={`${String(warning)}-${index}`}>
                      {String(warning)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Sin warnings.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            La diagnosis V4 todavía no contiene strategic block repacker.
          </p>
        )}
      </section>

      <section className="rounded-lg border p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Production Wave</h3>
          <Badge
            variant={
              productionWave?.applied
                ? "default"
                : productionWave?.fallbackUsed
                  ? "secondary"
                  : productionWave?.infeasible
                    ? "destructive"
                    : "outline"
            }
          >
            {productionWave?.applied
              ? "Aplicada"
              : productionWave?.fallbackUsed
                ? "Fallback"
                : productionWave?.infeasible
                  ? "Descartada"
                  : "Sin datos"}
          </Badge>
        </div>
        {productionWave ? (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 md:grid-cols-3">
              <div>
                <span className="font-medium">Espacio principal:</span>{" "}
                {String(productionWave?.mainFlowSpaceId ?? mainFlow?.id ?? "—")}
              </div>
              <div>
                <span className="font-medium">Inicio / fin wave:</span>{" "}
                {String(productionWave?.waveStart ?? "—")} /{" "}
                {String(productionWave?.waveEnd ?? "—")}
              </div>
              <div>
                <span className="font-medium">Flujo principal:</span>{" "}
                {Number(productionWave?.mainFlowTasksPlaced ?? 0)}
              </div>
              <div>
                <span className="font-medium">Prerequisitos:</span>{" "}
                {Number(productionWave?.prerequisitesPlaced ?? 0)}
              </div>
              <div>
                <span className="font-medium">Dependientes compactados:</span>{" "}
                {Number(productionWave?.dependentTasksPlaced ?? 0)}
              </div>
              <div>
                <span className="font-medium">
                  Locks internos estratégicos:
                </span>{" "}
                {Number(productionWave?.strategicInternalLocks ?? 0)}
              </div>
              <div>
                <span className="font-medium">Huecos flujo principal:</span>{" "}
                {Number(productionWave?.mainFlowGapMinutes ?? 0)} min
              </div>
              <div>
                <span className="font-medium">Validación recursos:</span>{" "}
                {productionWave?.resourceAwareValidation ? "Sí" : "No"}
              </div>
            </div>
            <p className="text-muted-foreground">
              {String(productionWave?.reason ?? "Sin detalle registrado.")}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <h4 className="font-medium">Blockers</h4>
                {productionWaveBlockers.length ? (
                  <ul className="mt-2 space-y-2">
                    {productionWaveBlockers
                      .slice(0, 6)
                      .map((blocker: any, index: number) => (
                        <li
                          key={`${blocker?.taskId ?? "blocker"}-${index}`}
                          className="rounded border p-2"
                        >
                          <span className="font-medium">
                            Tarea {String(blocker?.taskId ?? "—")}:
                          </span>{" "}
                          {String(blocker?.reason ?? "Blocker sin motivo")}
                          {blocker?.details ? (
                            <div className="text-xs text-muted-foreground">
                              {String(blocker?.details)}
                            </div>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-muted-foreground">
                    Sin blockers principales.
                  </p>
                )}
              </div>
              <div>
                <h4 className="font-medium">Warnings</h4>
                {productionWaveWarnings.length ? (
                  <ul className="mt-2 space-y-2">
                    {productionWaveWarnings
                      .slice(0, 6)
                      .map((warning: any, index: number) => (
                        <li
                          key={`production-wave-warning-${index}`}
                          className="rounded border p-2 text-amber-700"
                        >
                          {String(warning)}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-muted-foreground">Sin warnings.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            La diagnosis V4 todavía no contiene datos de Production Wave.
          </p>
        )}
      </section>

      <section className="rounded-lg border p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Main Flow First Scheduler</h3>
          <Badge
            variant={
              mainFlowFirst?.applied
                ? "default"
                : mainFlowFirst?.fallbackUsed
                  ? "secondary"
                  : "outline"
            }
          >
            {mainFlowFirst?.applied
              ? "Aplicado"
              : mainFlowFirst?.fallbackUsed
                ? "Fallback"
                : "Sin datos"}
          </Badge>
        </div>
        {mainFlowFirst ? (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 md:grid-cols-3">
              <div>
                <span className="font-medium">Espacio principal:</span>{" "}
                {String(mainFlowFirst?.mainFlowSpaceId ?? mainFlow?.id ?? "—")}
              </div>
              <div>
                <span className="font-medium">Tareas flujo colocadas:</span>{" "}
                {Number(mainFlowFirst?.scheduledMainFlowTasks ?? 0)}
              </div>
              <div>
                <span className="font-medium">Tareas flujo sin colocar:</span>{" "}
                {Number(mainFlowFirst?.unscheduledMainFlowTasks ?? 0)}
              </div>
              <div>
                <span className="font-medium">Prerequisitos colocados:</span>{" "}
                {Number(mainFlowFirst?.placedPrerequisites ?? 0)}
              </div>
              <div>
                <span className="font-medium">Inicio / fin:</span>{" "}
                {String(mainFlowFirst?.blockStart ?? "—")} /{" "}
                {String(mainFlowFirst?.blockEnd ?? "—")}
              </div>
              <div>
                <span className="font-medium">Huecos internos:</span>{" "}
                {Number(mainFlowFirst?.internalGapMinutes ?? 0)} min
              </div>
            </div>
            <p className="text-muted-foreground">
              {String(mainFlowFirst?.reason ?? "Sin detalle registrado.")}
            </p>
            {mainFlowFirstBlockers.length ? (
              <ul className="grid gap-2 md:grid-cols-2">
                {mainFlowFirstBlockers
                  .slice(0, 6)
                  .map((blocker: any, index: number) => (
                    <li
                      key={`${blocker?.taskId ?? "blocker"}-${index}`}
                      className="rounded border p-2"
                    >
                      <span className="font-medium">
                        Tarea {String(blocker?.taskId ?? "—")}:
                      </span>{" "}
                      {String(blocker?.reason ?? "Blocker sin motivo")}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Sin blockers principales.</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            La diagnosis V4 todavía no contiene datos del Main Flow First
            Scheduler.
          </p>
        )}
      </section>

      <section className="rounded-lg border p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Guided Ordering</h3>
          <Badge variant={guidedOrdering?.applied ? "default" : "outline"}>
            {guidedOrdering?.applied ? "Aplicado" : "No aplicado"}
          </Badge>
        </div>
        {guidedOrdering ? (
          <div className="space-y-2 text-sm">
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <span className="font-medium">Tareas reordenadas:</span>{" "}
                {Number(guidedOrdering?.reorderedTaskCount ?? 0)}
              </div>
              <div>
                <span className="font-medium">Top tareas:</span>{" "}
                {topOrderedTasks.length
                  ? topOrderedTasks.slice(0, 10).map(String).join(", ")
                  : "—"}
              </div>
            </div>
            <p className="text-muted-foreground">
              {String(guidedOrdering?.reason ?? "Sin motivo registrado.")}
            </p>
            {priorityBuckets.length ? (
              <ul className="grid gap-2 md:grid-cols-2">
                {priorityBuckets.map((bucket: any, index: number) => (
                  <li
                    key={`${bucket?.name ?? "bucket"}-${index}`}
                    className="rounded border p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {String(bucket?.name ?? "Prioridad")}
                      </span>
                      <Badge variant="outline">
                        {Number(bucket?.taskCount ?? 0)} tareas
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {String(bucket?.reason ?? "—")}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay buckets de prioridad para mostrar.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            La diagnosis V4 todavía no contiene guided ordering.
          </p>
        )}
      </section>

      <section className="rounded-lg border p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Main Flow Improvement</h3>
          <Badge variant={mainFlowImprovement?.applied ? "default" : "outline"}>
            {mainFlowImprovement?.applied ? "Aplicado" : "No aplicado"}
          </Badge>
        </div>
        {mainFlowImprovement ? (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 md:grid-cols-4">
              <div>
                <span className="font-medium">Gaps antes:</span>{" "}
                {Number(mainFlowImprovement?.gapsBefore ?? 0)}
              </div>
              <div>
                <span className="font-medium">Gaps después:</span>{" "}
                {Number(
                  mainFlowImprovement?.gapsAfter ??
                    mainFlowImprovement?.gapsBefore ??
                    0,
                )}
              </div>
              <div>
                <span className="font-medium">Min antes:</span>{" "}
                {Number(mainFlowImprovement?.gapMinutesBefore ?? 0)}
              </div>
              <div>
                <span className="font-medium">Min después:</span>{" "}
                {Number(
                  mainFlowImprovement?.gapMinutesAfter ??
                    mainFlowImprovement?.gapMinutesBefore ??
                    0,
                )}
              </div>
            </div>
            {!mainFlowImprovement?.applied ? (
              <p className="text-muted-foreground">
                {String(
                  mainFlowImprovement?.reason ??
                    "No se encontró mejora segura.",
                )}
              </p>
            ) : null}
            <div>
              <div className="font-medium">Movimientos realizados</div>
              {improvementMoves.length ? (
                <ul className="mt-1 space-y-1">
                  {improvementMoves.map((move: any, index: number) => (
                    <li
                      key={`${move?.taskId ?? "move"}-${index}`}
                      className="rounded border p-2 text-xs"
                    >
                      Tarea {String(move?.taskId ?? "—")} →{" "}
                      {String(move?.toStart ?? "—")}-
                      {String(move?.toEnd ?? "—")} (gap{" "}
                      {String(move?.coveredGapStart ?? "—")}-
                      {String(move?.coveredGapEnd ?? "—")})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Sin movimientos aplicados.
                </p>
              )}
            </div>
            <div>
              <div className="font-medium">Motivos de descarte</div>
              {improvementSkippedReasons.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {improvementSkippedReasons
                    .slice(0, 8)
                    .map((reason: any, index: number) => (
                      <li key={`${String(reason)}-${index}`}>
                        {String(reason)}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Sin descartes registrados.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            La diagnosis V4 todavía no contiene main flow improvement.
          </p>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <section className="rounded-lg border p-3">
          <h3 className="mb-2 font-medium">Critical Talents</h3>
          {renderCritical(criticalTalents, "Sin talentos críticos detectados.")}
        </section>
        <section className="rounded-lg border p-3">
          <h3 className="mb-2 font-medium">Critical Resources</h3>
          {renderCritical(
            criticalResources,
            "Sin recursos críticos detectados.",
          )}
        </section>
        <section className="rounded-lg border p-3">
          <h3 className="mb-2 font-medium">Critical Spaces</h3>
          {renderCritical(criticalSpaces, "Sin espacios críticos detectados.")}
        </section>
      </div>
    </div>
  );
}
