/** Isolate the profile predicate, never execute the modified profile or persist it. */
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';
import {fixedItinerantCompositionSupported} from '../../../server/itinerantComposition';
import {requiredPhaseCompositionSupported,technicalChainCombinationSupported} from '../../../server/technicalChainStructure';
import {jointCombinationSupported} from '../../../server/jointGroupStructure';
import {operationalMealsCombinationSupported} from '../../../server/operationalMealPolicy';
const input=JSON.parse(readFileSync(process.argv[2],'utf8'));const changed=structuredClone(input);changed.plannerNext.profile='STANDALONE_ONLY';
const inspect=(source:any)=>({fixed:fixedItinerantCompositionSupported(source),phases:requiredPhaseCompositionSupported(source),chain:technicalChainCombinationSupported(source),joint:jointCombinationSupported(source),meal:operationalMealsCombinationSupported(source)});
const before=inspect(input),predicateOnly=inspect(changed);assert.deepEqual(before,{fixed:false,phases:false,chain:false,joint:false,meal:false});assert.ok(Object.values(predicateOnly).every(Boolean));
writeFileSync(process.argv[3],JSON.stringify({predicateOnlyEvaluation:true,solverExecutedWithModifiedProfile:false,persisted:false,intervention:'Only plannerNext.profile in a clone; existing mainFlow and every task remain present. This is deliberately not a valid alternative day profile.',before,predicateOnly},null,2));
