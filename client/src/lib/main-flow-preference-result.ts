import type { MainFlowPreferenceResultEvidence } from '../../../shared/mainFlowPreference';
export function mainFlowPreferenceResultMessage(e:MainFlowPreferenceResultEvidence):string {
 const requested=e.mealSplitRequested;
 if(e.achieved===null)return 'No se obtuvo una propuesta completa dentro del tiempo/presupuesto disponible. La inviabilidad no está demostrada.';
 const head=`Solicitados ${e.requested} bloques${requested?`, distribución${e.mealSplitPreferenceAchieved?'':' preferida'} ${requested.beforeMealBlocks}+${requested.afterMealBlocks}`:''}. Conseguido: ${e.achieved} bloques`;
 if(!e.targetAchieved)return `${head}. Se ha utilizado una alternativa completa. ${e.hardCertificate?'La geometría aceptada o protegida del flujo principal prevalece sobre la preferencia.':'No está demostrada la inviabilidad del número solicitado.'}`;
 if(!requested)return `${head}.`;
 const d=e.mealSplitAchieved;
 const achieved=d?.blocksBeforeMeal!=null&&d.blocksAfterMeal!=null?`, distribución ${d.blocksBeforeMeal}+${d.blocksAfterMeal}${d.blockSpansMeal?' y un bloque que abarca el descanso':''}`:', sin comida materializada aplicable';
 return `${head}${achieved}.${e.mealSplitPreferenceAchieved?'':` No se encontró una propuesta completa ${requested.beforeMealBlocks}+${requested.afterMealBlocks} dentro de los límites de búsqueda. La inviabilidad no está demostrada.`}`;
}
