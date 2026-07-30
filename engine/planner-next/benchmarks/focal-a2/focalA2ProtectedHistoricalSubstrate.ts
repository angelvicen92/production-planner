import crypto from "node:crypto";
export const canonicalHistoricalValue=(value:any):any=>Array.isArray(value)?value.map(canonicalHistoricalValue):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).filter(key=>key!=="runtimeMs").sort().map(key=>[key,canonicalHistoricalValue(value[key])])):value;
export const historicalDigest=(value:any)=>crypto.createHash("sha256").update(JSON.stringify(canonicalHistoricalValue(value))).digest("hex");
export function inspectProtectedHistoricalSubstrate(artifact:any,manifest:any){
 const scenarios=Object.fromEntries(Object.keys(manifest.scenarioDigests).map(id=>[id,artifact.scenarios?.[id]]));
 const evidence=artifact.historicalEvidence??artifact.historicalSubstrate?.historicalEvidence??{};
 const scenarioMismatches=Object.entries(manifest.scenarioDigests).filter(([id,sha])=>historicalDigest(scenarios[id])!==sha).map(([id])=>id);
 const evidenceMismatches=Object.entries(manifest.historicalEvidenceDigests??{}).filter(([id,sha])=>historicalDigest(evidence[id])!==sha).map(([id])=>id);
 return {scenarios,evidence,scenarioMismatches,evidenceMismatches,passed:scenarioMismatches.length===0&&evidenceMismatches.length===0};
}
