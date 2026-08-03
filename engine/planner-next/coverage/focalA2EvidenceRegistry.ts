import type { FocalA2CapabilityId } from "./focalA2CapabilityCatalog";
import { FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS, type CapabilityEvidenceBinding } from "./focalA2CapabilityEvidenceBindings";
import { evaluateEvidenceAssertion, type AssertionResult, type EvidenceLayer } from "./focalA2EvidenceAssertions";
import { FOCAL_A2_REQUIREMENTS } from "./focalA2SourceManifest";

export type CoverageStatus="EVIDENCED_SUPPORTED"|"CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE"|"PARTIALLY_SUPPORTED"|"EXPLICITLY_UNSUPPORTED"|"CONTRACT_GAP"|"SOURCE_AMBIGUOUS"|"NOT_AUDITED"|"PRODUCT_PHASE_NOT_IMPLEMENTED";
export type BlockingLayer="SOURCE"|"DOMAIN"|"ENGINE_INPUT"|"PREFLIGHT"|"ADAPTER"|"PLANNER_CONTRACT"|"SEARCH"|"VALIDATION"|"EVIDENCE"|"PRODUCT"|"AUDIT"|"NONE";
export type LayerExecutionStatus="SUPPORTED"|"UNSUPPORTED"|"NOT_EXECUTED"|"NOT_APPLICABLE"|"FAILED";
export interface CapabilityEvidenceRecord {readonly capabilityId:FocalA2CapabilityId;readonly binding:CapabilityEvidenceBinding|null;readonly assertionResults:readonly AssertionResult[];readonly derivedCoverageStatus:CoverageStatus;readonly derivedBlockingLayer:BlockingLayer;readonly missingEvidence:readonly string[];readonly readOnly:true}
export interface CoverageDerivationInput {readonly requirement:"REQUIRED"|"NOT_REQUIRED"|"UNRESOLVED";readonly productPhase:boolean;readonly binding:CapabilityEvidenceBinding|null;readonly assertionResults:readonly AssertionResult[];readonly explicitUnsupportedCode?:string}
export function deriveCoverageStatus(e:CoverageDerivationInput):{status:CoverageStatus;blockingLayer:BlockingLayer}{
 if(e.productPhase)return{status:"PRODUCT_PHASE_NOT_IMPLEMENTED",blockingLayer:"PRODUCT"};
 if(!e.binding)return{status:"NOT_AUDITED",blockingLayer:"AUDIT"};
 if(e.requirement==="UNRESOLVED")return{status:"SOURCE_AMBIGUOUS",blockingLayer:"SOURCE"};
 if(e.explicitUnsupportedCode&&e.assertionResults.some(a=>a.status==="PASS"))return{status:"EXPLICITLY_UNSUPPORTED",blockingLayer:"PREFLIGHT"};
 if(e.assertionResults.length===0)return{status:"NOT_AUDITED",blockingLayer:"AUDIT"};
 if(e.assertionResults.some(a=>a.status!=="PASS"))return{status:"NOT_AUDITED",blockingLayer:"AUDIT"};
 const passed=new Set(e.assertionResults.filter(a=>a.status==="PASS").map(a=>a.layer));
 const path=e.binding.requiredLayers.every(layer=>passed.has(layer));
 const test=e.assertionResults.some(a=>a.kind==="TEST"&&a.status==="PASS");
 const benchmark=e.assertionResults.some(a=>(a.kind==="JSON"||a.kind==="PROBE")&&a.status==="PASS");
 const representative=e.assertionResults.some(a=>a.representativeBoundary===e.binding!.representativeBoundary&&a.status==="PASS");
 if(path&&test&&benchmark&&representative)return{status:"EVIDENCED_SUPPORTED",blockingLayer:"NONE"};
 if(path&&test)return{status:"CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE",blockingLayer:"EVIDENCE"};
 return{status:"NOT_AUDITED",blockingLayer:"AUDIT"};
}
export function evaluateCapabilityBinding(binding:CapabilityEvidenceBinding,probeEvidence:unknown):readonly AssertionResult[]{return[...binding.testAssertions,...binding.benchmarkAssertions,...binding.contractAssertions].map(a=>evaluateEvidenceAssertion(a,probeEvidence));}
export function buildEvidenceRegistry(probeEvidence:unknown):readonly CapabilityEvidenceRecord[]{const byId=new Map(FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS.map(b=>[b.capabilityId,b]));return FOCAL_A2_REQUIREMENTS.map(requirement=>{const binding=byId.get(requirement.capabilityId)??null;const assertionResults=binding?evaluateCapabilityBinding(binding,probeEvidence):[];const explicitUnsupportedCode=[134,135,136].includes(requirement.capabilityId)?"UNSUPPORTED_BREAK_SCOPE":undefined;const derived=deriveCoverageStatus({requirement:requirement.a2RequirementStatus,productPhase:requirement.productPhase,binding,assertionResults,explicitUnsupportedCode});return Object.freeze({capabilityId:requirement.capabilityId,binding,assertionResults,derivedCoverageStatus:derived.status,derivedBlockingLayer:derived.blockingLayer,missingEvidence:derived.status==="NOT_AUDITED"?["verified semantic assertion"]:[],readOnly:true as const});});}
export const requiredLayerNames:readonly EvidenceLayer[]=["SOURCE","DOMAIN","ENGINE_INPUT","PREFLIGHT","ADAPTER","PLANNER_CONTRACT","SEARCH","VALIDATION","EVIDENCE","PRODUCT","AUDIT"];
