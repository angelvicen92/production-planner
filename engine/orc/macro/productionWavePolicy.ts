export const PRODUCTION_WAVE_POLICY_VERSION = "PRODUCTION_WAVE_POLICY_V1" as const;
export type ProductionWavePolicySource = "optimizerConfig" | "planConfig" | "defaultProfile";
export type ProductionWavePolicy = {
  version: typeof PRODUCTION_WAVE_POLICY_VERSION; source: ProductionWavePolicySource; readOnly: true;
  mainFlow: { targetKind: "zone"|"space"|"flow"; targetId: number|string|null; maxVisibleIdleMinutes: number; allowedMainFlowBlocks: number; allowTwoBlocksAroundMeal: boolean; maxMainFlowBlockCount: number; minMainFlowBlockMinutes: number; };
  coachBlocks: { preferredMainFlowCoachBlocks: number; maxCoachSwitchesPerDay: number; maxCoachSwitchesBeforeMeal: number; maxCoachSwitchesAfterMeal: number; coachBlockBalanceWeight: number; };
  meal: { allowFlexibleMealWindowProductiveWork: boolean; treatFlexibleMealAsHardStop: boolean; mealWindowCanSplitMainFlow: boolean; };
  release: { enabled: boolean; maxLastTaskToDepartureWaitMinutes: number; };
  runtime: { macroPlannerCandidateBudget: number; macroPlannerSimulationBudget: number; maxDependencyBundleSize: number; maxBundleSearchDepth: number; maxExecutionTimeMsSoft: number; };
  scoring: { mainFlowVisibleIdleWeight: number; criticalResourceIdleWeight: number; talentWaitWeight: number; makespanWeight: number; stabilityWeight: number; dependencyRiskPenalty: number; partialMainFlowGapReductionMinMinutes: number; partialMainFlowGapReductionAllowed: boolean; };
};
export type ProductionWavePolicyDiagnostics = { version: typeof PRODUCTION_WAVE_POLICY_VERSION; source: ProductionWavePolicySource; values: ProductionWavePolicy; warnings: string[]; defaultedFields: string[]; configuredFields: string[]; readOnly: true };
const DEFAULT_POLICY: ProductionWavePolicy = {
  version: PRODUCTION_WAVE_POLICY_VERSION, source: "defaultProfile", readOnly: true,
  mainFlow: { targetKind: "flow", targetId: null, maxVisibleIdleMinutes: 10, allowedMainFlowBlocks: 2, allowTwoBlocksAroundMeal: true, maxMainFlowBlockCount: 2, minMainFlowBlockMinutes: 30 },
  coachBlocks: { preferredMainFlowCoachBlocks: 2, maxCoachSwitchesPerDay: 4, maxCoachSwitchesBeforeMeal: 2, maxCoachSwitchesAfterMeal: 2, coachBlockBalanceWeight: 1 },
  meal: { allowFlexibleMealWindowProductiveWork: true, treatFlexibleMealAsHardStop: false, mealWindowCanSplitMainFlow: true },
  release: { enabled: false, maxLastTaskToDepartureWaitMinutes: 60 },
  runtime: { macroPlannerCandidateBudget: 6, macroPlannerSimulationBudget: 12, maxDependencyBundleSize: 12, maxBundleSearchDepth: 2, maxExecutionTimeMsSoft: 60000 },
  scoring: { mainFlowVisibleIdleWeight: 10, criticalResourceIdleWeight: 3, talentWaitWeight: 2, makespanWeight: 2, stabilityWeight: 1, dependencyRiskPenalty: 5, partialMainFlowGapReductionMinMinutes: 15, partialMainFlowGapReductionAllowed: true },
};
const flat = (o:any,p=""): string[] => Object.entries(o).flatMap(([k,v]) => v && typeof v === "object" && !Array.isArray(v) ? flat(v, p?`${p}.${k}`:k) : [p?`${p}.${k}`:k]);
const get = (o:any,path:string) => path.split(".").reduce((c,k)=>c?.[k],o);
const set = (o:any,path:string,v:any) => { const ks=path.split("."); const last=ks.pop()!; const t=ks.reduce((c,k)=>c[k]??={},o); t[last]=v; };
const legacy: Record<string,string[]> = {
  "mainFlow.allowedMainFlowBlocks":["mainFlow.allowedMainFlowBlocks","allowedMainFlowBlocks"],
  "mainFlow.allowTwoBlocksAroundMeal":["mainFlow.allowTwoBlocksAroundMeal","allowTwoBlocksAroundMeal"],
  "mainFlow.maxVisibleIdleMinutes":["mainFlow.maxVisibleIdleMinutes","maxVisibleIdleMinutes"],
  "coachBlocks.preferredMainFlowCoachBlocks":["coachBlocks.preferredMainFlowCoachBlocks","mainZonePreferredCoachBlocks"],
  "coachBlocks.maxCoachSwitchesPerDay":["coachBlocks.maxCoachSwitchesPerDay","mainZoneMaxCoachSwitchesPerDay"],
  "coachBlocks.maxCoachSwitchesBeforeMeal":["coachBlocks.maxCoachSwitchesBeforeMeal","mainZoneMaxCoachSwitchesBeforeMeal"],
  "coachBlocks.maxCoachSwitchesAfterMeal":["coachBlocks.maxCoachSwitchesAfterMeal","mainZoneMaxCoachSwitchesAfterMeal"],
  "coachBlocks.coachBlockBalanceWeight":["coachBlocks.coachBlockBalanceWeight","mainZoneCoachBlockBalanceWeight"],
  "meal.allowFlexibleMealWindowProductiveWork":["meal.allowFlexibleMealWindowProductiveWork","allowFlexibleMealWindowProductiveWork"],
  "release.maxLastTaskToDepartureWaitMinutes":["release.maxLastTaskToDepartureWaitMinutes","maxLastTaskToDepartureWaitMinutes","maxReleaseSlackMinutes"],
  "runtime.macroPlannerCandidateBudget":["runtime.macroPlannerCandidateBudget","macroPlannerCandidateBudget"],
  "runtime.macroPlannerSimulationBudget":["runtime.macroPlannerSimulationBudget","macroPlannerSimulationBudget"],
};
export function resolveProductionWavePolicy(input:any = {}, options:any = {}): ProductionWavePolicyDiagnostics {
  const roots = [{src:"optimizerConfig" as const, obj: input?.constraints?.optimizer ?? input?.optimizer ?? options?.optimizerConfig}, {src:"planConfig" as const, obj: input?.planningSettings ?? input?.operationalPolicy ?? options?.planConfig}];
  const values: ProductionWavePolicy = JSON.parse(JSON.stringify(DEFAULT_POLICY));
  const configuredFields:string[]=[];
  for (const path of flat(DEFAULT_POLICY).filter(p=>!['version','source','readOnly'].includes(p))) for (const root of roots) {
    const candidates = legacy[path] ?? [path]; const found = candidates.map(p=>get(root.obj,p)).find(v=>v!==undefined&&v!==null);
    if (found !== undefined && found !== null) { set(values,path,found); configuredFields.push(path); if (values.source === "defaultProfile") values.source = root.src; break; }
  }
  const defaultedFields = flat(DEFAULT_POLICY).filter(p=>!['version','source','readOnly'].includes(p) && !configuredFields.includes(p));
  return { version: PRODUCTION_WAVE_POLICY_VERSION, source: values.source, values, warnings: [], defaultedFields, configuredFields: configuredFields.sort(), readOnly: true };
}
