import {pathToFileURL} from "node:url";
import {serializeAudit} from "../coverage/focalA2CapabilityAudit";
export function runPlannerNextFocalA2CapabilityCoverageAudit(){const json=serializeAudit();process.stdout.write(json);return JSON.parse(json)}
if(import.meta.url===pathToFileURL(process.argv[1]??"").href)runPlannerNextFocalA2CapabilityCoverageAudit();
