import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { mainFlowVocalScenario } from "../scenarios/mainFlowVocalScenario";
import { formatMinute } from "../time";
const result=planMainFlowAndFeeders(mainFlowVocalScenario());
const metrics={...result.metrics,mainFlowStart:formatMinute(result.metrics.mainFlowStart),mainFlowEnd:formatMinute(result.metrics.mainFlowEnd)};
process.stdout.write(`${JSON.stringify(metrics,null,2)}\n`);
