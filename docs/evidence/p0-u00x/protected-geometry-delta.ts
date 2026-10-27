import assert from 'node:assert/strict';
export function protectedGeometryDelta(source:string){
 const from='      for (const candidateEnd of candidateEnds) {';
 assert.equal(source.split(from).length,2);
 source=source.replace(from,`      const nativeProtectedMains=!timeline&&problem.nativeAnchoredAccompanimentsVersion===2
        ?protectedPlacements.filter(p=>problem.tasks.find(t=>t.id===p.id)?.kind==='main'):[];
      // Preserve both outer boundaries and every alignment around an accepted
      // Main. Pending work can occupy both sides of the same protected slot.
      if(nativeProtectedMains.length)candidateEnds=[...new Set([...candidateEnds,...nativeProtectedMains.flatMap(p=>
        Array.from({length:pattern.length+1},(_,after)=>p.end+after*duration))])];
      const geometries=candidateEnds.flatMap(candidateEnd=>{
        const base={candidateEnd,nativeSlots:null as number[]|null};
        if(!nativeProtectedMains.length)return [base];
        const count=pattern.length+nativeProtectedMains.length;
        const all=Array.from({length:count},(_,index)=>candidateEnd-count*duration+index*duration);
        if(!nativeProtectedMains.every(p=>p.end-p.start===duration&&all.includes(p.start)))return [base];
        const pending=all.filter(start=>!nativeProtectedMains.some(p=>p.start===start));
        return pending.length===pattern.length?[base,{candidateEnd,nativeSlots:pending}]:[base];
      });
      for (const {candidateEnd,nativeSlots} of geometries) {`);
 const slots='const slots = timeline?.slots ?? pattern.map((_, index) => candidateEnd - pattern.length * duration + index * duration);';
 assert.equal(source.split(slots).length,2);source=source.replace(slots,'const slots = nativeSlots ?? timeline?.slots ?? pattern.map((_, index) => candidateEnd - pattern.length * duration + index * duration);');
 const key='timeline?.key ?? `END:${candidateEnd}`';assert.equal(source.split(key).length,2);
 return source.replace(key,'timeline?.key ?? `END:${candidateEnd}${nativeSlots?"|PROTECTED_SLOTS:"+nativeSlots.join(","):""}`');
}
