import { Input } from "@/components/ui/input";

export function TransportPolicyFields({value,onChange,disabled=false,sources={}}:{
  value:Record<string,number|null|undefined>;
  onChange:(patch:Record<string,number|null>)=>void;
  disabled?:boolean;
  sources?:Record<string,string>;
}) {
  return <div className="grid gap-4 md:grid-cols-2">
    {([['arrival','IN'],['departure','OUT']] as const).map(([direction,label])=><fieldset key={direction} disabled={disabled} className="space-y-3 rounded-md border p-3">
      <legend className="px-1 font-medium">{label}</legend>
      {([
        ['MinimumGroupSize','Mínimo participantes HARD',1],
        ['GroupingTarget','Tamaño objetivo preferido',0],
        ['MaximumGroupSize','Máximo participantes HARD',1],
        ['MinGapMinutes','Separación mínima entre inicios (min)',0],
      ] as const).map(([suffix,title,min])=>{
        const field=`${direction}${suffix}`;
        return <label key={field} className="block space-y-1 text-sm">
          <span>{title} {label}</span>
          <Input aria-label={`${title} ${label}`} type="number" step={1} min={min}
            value={value[field]??''}
            placeholder={suffix==='MaximumGroupSize'?`Capacidad de vehículo: ${value.vanCapacity??'—'}`:suffix==='MinimumGroupSize'?'1 (compatibilidad histórica)':''}
            onChange={event=>onChange({[field]:event.target.value===''?null:Number(event.target.value)})}/>
          {sources[field]?<span className="block text-xs text-muted-foreground">{sources[field]}</span>:null}
        </label>;
      })}
    </fieldset>)}
    <p className="text-xs text-muted-foreground md:col-span-2">Mínimo y máximo son límites HARD independientes por dirección. El objetivo es una preferencia: un residual legal puede ser menor. 0 significa objetivo no especificado (compatibilidad: IN 3, OUT 1); fuera de los límites se prefieren los tamaños legales más cercanos. La separación se mide entre inicios, sin imponer una parrilla fija.</p>
  </div>;
}
