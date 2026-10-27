import assert from 'node:assert/strict';
export function geometryDelta(source:string){
 const from='return [withoutLeadIn, withoutLeadIn + prerequisiteLeadIn];';
 assert.equal(source.split(from).length,3);
 return source.replaceAll(from,`// A native anchored cohort may have a later coach release than the day.
            // Keep the existing load events and translate them by each authentic
            // release. These are alternatives, never a new hard lower bound.
            const releases=problem.nativeAnchoredAccompanimentsVersion===2
              ?problem.coaches.filter(coach=>selected.some(({main})=>main.coachId===coach.id))
                .flatMap(coach=>coach.availability.map(window=>window.start)):[];
            return [...new Set([problem.day.start,...releases])].flatMap(start=>[
              withoutLeadIn+Math.max(0,start-problem.day.start),
              withoutLeadIn+Math.max(0,start-problem.day.start)+prerequisiteLeadIn,
            ]);`);
}
