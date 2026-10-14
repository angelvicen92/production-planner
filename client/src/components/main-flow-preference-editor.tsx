import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { mainFlowPreferenceSchema, type MainFlowPreference } from '@shared/mainFlowPreference';

export function MainFlowPreferenceEditor({value,counts,mealApplicable,zeroBeforeRepresentable=true,disabled,onSave,saving=false}:{
 value:MainFlowPreference;counts?:readonly number[];mealApplicable:boolean;zeroBeforeRepresentable?:boolean;disabled?:boolean;
 onSave:(value:MainFlowPreference)=>void;saving?:boolean;
}) {
 const [soft,setSoft]=useState(value.blockCountPolicy.mode==='SOFT_PREFER_N');
 const [count,setCount]=useState(value.blockCountPolicy.mode==='SOFT_PREFER_N'?value.blockCountPolicy.count:counts?.[0]??1);
 const [split,setSplit]=useState(value.mealSplitPreference.mode==='PREFERRED');
 const [before,setBefore]=useState(value.mealSplitPreference.mode==='PREFERRED'?value.mealSplitPreference.beforeMealBlocks:0);
 useEffect(()=>{setSoft(value.blockCountPolicy.mode==='SOFT_PREFER_N');if(value.blockCountPolicy.mode==='SOFT_PREFER_N')setCount(value.blockCountPolicy.count);
  setSplit(value.mealSplitPreference.mode==='PREFERRED');if(value.mealSplitPreference.mode==='PREFERRED')setBefore(value.mealSplitPreference.beforeMealBlocks);},[value]);
 const candidate={blockCountPolicy:soft?{mode:'SOFT_PREFER_N',count}:{mode:'AUTO_MIN_FEASIBLE'},
  mealSplitPreference:soft&&split?{mode:'PREFERRED',beforeMealBlocks:before,afterMealBlocks:count-before}:{mode:'OFF'}};
 const parsed=mainFlowPreferenceSchema.safeParse(candidate),invalid=!parsed.success||(soft&&counts&&!counts.includes(count))||(soft&&split&&(!mealApplicable||(!zeroBeforeRepresentable&&before===0)));
 return <fieldset disabled={disabled||saving} className="space-y-2" data-testid="main-flow-preference-editor">
  <legend className="font-medium">Estructura preferida del flujo principal</legend>
  <label className="block text-sm">Modo <select aria-label="Modo de bloques" value={soft?'SOFT':'AUTO'} onChange={e=>setSoft(e.target.value==='SOFT')} className="ml-2 border rounded p-1"><option value="AUTO">AUTO · mínimo viable</option><option value="SOFT">Preferir número de bloques</option></select></label>
  {soft?<><label className="block text-sm">Número de bloques {counts?<select aria-label="Número preferido de bloques" value={count} onChange={e=>{const n=Number(e.target.value);setCount(n);setBefore(Math.min(before,n));}} className="ml-2 border rounded p-1">{!counts.includes(count)?<option value={count}>{count} · no representable</option>:null}{counts.map(n=><option key={n} value={n}>{n}</option>)}</select>:<input aria-label="Número preferido de bloques" type="number" min={1} value={count} onChange={e=>{const n=Number(e.target.value);setCount(n);setBefore(Math.min(before,n));}} className="w-20 ml-2 border rounded p-1"/>}</label>
   <label className="flex gap-2 text-sm"><input aria-label="Preferir distribución de bloques antes y después de la comida" type="checkbox" disabled={!mealApplicable&&!split} checked={split} onChange={e=>setSplit(e.target.checked)}/>Preferir distribución de bloques antes y después de la comida</label>
   {!mealApplicable?<p className="text-sm">No hay una comida aplicable al flujo principal. El reparto no puede hacerse efectivo.</p>:null}
   {split?<p className="text-sm"><label>Antes de comer <input aria-label="Bloques antes de comer" type="number" min={zeroBeforeRepresentable?0:1} max={count} value={before} onChange={e=>setBefore(Number(e.target.value))} className="w-20 ml-2 border rounded p-1"/></label><span className="ml-2">Después de comer: {count-before}</span></p>:null}</>:null}
  <p data-testid="main-flow-preference-summary" className="text-sm">{soft?`Preferir ${count} bloques${split?`, ${before} antes y ${count-before} después de la comida efectiva`:''}. Se permiten alternativas completas con la desviación explicada.`:'AUTO: buscar el número mínimo viable de bloques.'}</p>
  <Button size="sm" disabled={disabled||saving||invalid} onClick={()=>{if(parsed.success)onSave(parsed.data);}}>Guardar estructura preferida</Button>
 </fieldset>;
}
