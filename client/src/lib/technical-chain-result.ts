/** Explain only certified physical emptiness; truncation never proves infeasibility. */
export function technicalChainResultExplanation(evidence:any):string|null {
  if(!evidence)return null;
  const cause=evidence.standaloneDiagnostic?.firstStandaloneDeadEndCause;
  const certificate=evidence.technicalChainCertificate;
  const technical=cause?.workItemKind==="TECHNICAL_CHAIN"||certificate;
  if(!technical)return null;
  if(certificate?.status==="BUDGET_EXHAUSTED"||(evidence.reasonCodes??[]).some((c:string)=>/BUDGET|TIME_LIMIT/.test(c)))
    return "La búsqueda ha agotado su límite. No se ha certificado inviabilidad física de la cadena; REQUIRED sigue vigente.";
  const exactZero=(evidence.standaloneDiagnostic?.macroSelectionSteps??[]).some((s:any)=>s.candidates?.some((c:any)=>c.kind==="TECHNICAL_CHAIN"&&c.domainExact===true&&c.domainSize===0));
  return cause?.kind==="MACRO_ZERO_DOMAIN"&&exactZero
    ?"No existe un tramo continuo compatible con las ventanas de las operaciones y del equipo nominal común. La adyacencia y la continuidad REQUIRED impiden aceptar esperas o sustituir el equipo. Revisa las disponibilidades del día antes de solicitar otra propuesta.":null;
}
