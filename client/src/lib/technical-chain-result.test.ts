import assert from 'node:assert/strict';
import test from 'node:test';
import {technicalChainResultExplanation as explain} from './technical-chain-result';
const empty={reasonCodes:[],standaloneDiagnostic:{firstStandaloneDeadEndCause:{kind:'MACRO_ZERO_DOMAIN',workItemKind:'TECHNICAL_CHAIN'},macroSelectionSteps:[{candidates:[{kind:'TECHNICAL_CHAIN',domainExact:true,domainSize:0}]}]}};
test('only exact zero domain explains physical impossibility; budget and time remain inconclusive',()=>{
 assert.match(explain(empty)!,/No existe un tramo continuo/);
 for(const reason of ['BUDGET_EXHAUSTED','TIME_LIMIT'])assert.match(explain({...empty,reasonCodes:[reason]})!,/No se ha certificado inviabilidad/);
 assert.equal(explain({...empty,standaloneDiagnostic:{...empty.standaloneDiagnostic,macroSelectionSteps:[]}}),null);
 assert.equal(explain({}),null);
});
