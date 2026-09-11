import { runA3Mini } from "./a3MiniOrchestrationScenario";

const global = runA3Mini("GLOBAL_SELECTOR");
const structural = runA3Mini("STRUCTURAL");
const hypothesisDemonstrated = global.status === "BUDGET_EXHAUSTED"
  && global.trace[1]?.kind === "TECHNICAL_CHAIN"
  && global.trace[1]?.firstImpossibleFutureAuthority === "scarce-unit-capacity"
  && structural.status === "COMPLETE" && structural.hardValid;

process.stdout.write(`${JSON.stringify({ benchmark: "A3-MINI", branchBudget: 1, hypothesisDemonstrated,
  globalSelector: global, knownStructuralSequence: structural }, null, 2)}\n`);
if (!hypothesisDemonstrated) process.exitCode = 1;
