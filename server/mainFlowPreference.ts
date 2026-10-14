import type { EngineInput } from '../engine/types';
import { mainFlowPreferenceSchema, mainFlowPreferenceFromRow, type MainFlowPreference } from '../shared/mainFlowPreference';
import { mainFlowPreferenceGeometry } from './assistedScopeResolver';
export { mainFlowPreferenceGeometry } from './assistedScopeResolver';

export function withMainFlowPreference(input:EngineInput,value:MainFlowPreference):EngineInput {
  const preference=mainFlowPreferenceSchema.parse(value);
  if(!input.plannerNext){
    if(preference.blockCountPolicy.mode==='SOFT_PREFER_N')throw Object.assign(new Error('El día no tiene un flujo principal Next configurado.'),{status:422});
    return input;
  }
  const {preference:old,...mainFlow}=input.plannerNext.mainFlow;
  return {...input,plannerNext:{...input.plannerNext,mainFlow:{...mainFlow,
    ...(preference.blockCountPolicy.mode==='SOFT_PREFER_N'?{preference}:{})}}};
}
export function applyEffectiveMainFlowPreference(input:EngineInput,row:Record<string,any>):EngineInput {
  const preference=mainFlowPreferenceFromRow(row);
  // Preserve the historical AUTO input byte for byte when no preference exists.
  return !input.plannerNext||preference.blockCountPolicy.mode==='AUTO_MIN_FEASIBLE'?input:withMainFlowPreference(input,preference);
}
export function validateMainFlowPreference(input:EngineInput,value:MainFlowPreference) {
  const parsed=mainFlowPreferenceSchema.parse(value);if(parsed.blockCountPolicy.mode==='AUTO_MIN_FEASIBLE')return;
  const geometry=mainFlowPreferenceGeometry(withMainFlowPreference(input,{...parsed,mealSplitPreference:{mode:'OFF'}}));
  if(!geometry.available||!geometry.counts.includes(parsed.blockCountPolicy.count))
    throw Object.assign(new Error('Número de bloques no representable con la geometría y límites efectivos del flujo principal.'),{status:422});
  if(parsed.mealSplitPreference.mode==='PREFERRED'&&parsed.mealSplitPreference.beforeMealBlocks===0&&!geometry.zeroBeforeRepresentable)
    throw Object.assign(new Error('El contrato de comida de este flujo requiere trabajo anterior al descanso; no representa un reparto con cero bloques antes.'),{status:422});
  if(parsed.mealSplitPreference.mode==='PREFERRED'&&!geometry.mealApplicable)
    throw Object.assign(new Error('No existe una comida aplicable al flujo principal para este reparto.'),{status:422});
}
