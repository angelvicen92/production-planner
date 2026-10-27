import assert from 'node:assert/strict';
export function windowDelta(source:string){
 const replace=(a:string,b:string)=>{assert.equal(source.split(a).length,2);source=source.replace(a,b);};
 replace('...pattern.flatMap((blockKey, position) => mains.filter((main) => main.blockKey === blockKey).map((main) => {','...pattern.flatMap((blockKey, position) => mains.filter((main) => main.blockKey === blockKey).flatMap((main) => {');
 replace('return earliestMainStart + main.duration + (pattern.length - position - 1) * duration;',`const operation=(problem.anchoredAccompaniments??[]).find(c=>c.anchorTaskId===main.id);
            const totalBefore=(operation?.beforeTaskIds??[]).reduce((sum,id)=>sum+(problem.tasks.find(t=>t.id===id)?.duration??0),0);
            const unitStarts=operation&&main.allowedItinerantUnitIds?.length?(problem.itinerantUnits??[])
              .filter(unit=>main.allowedItinerantUnitIds!.includes(unit.id)).flatMap(unit=>[
                ...unit.availability.map(w=>w.start),
                ...(unit.resourceIds??[]).flatMap(id=>problem.resources.find(r=>r.id===id)?.availability.map(w=>w.start)??[]),
              ]).map(start=>Math.max(earliestMainStart,start+totalBefore)):[];
            return [earliestMainStart,...unitStarts].map(start=>start + main.duration + (pattern.length - position - 1) * duration);`);
 return source;
}
