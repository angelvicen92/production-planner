const ruleNames:Record<string,string>={
 TRANSPORT_GROUPING_VIOLATION:'agrupación de entradas y salidas',ROUND_PREPARATION_VIOLATION:'preparaciones de rondas',
 ROUND_SYNCHRONIZATION_VIOLATION:'sincronización de rondas',SECONDARY_CONTINUITY_VIOLATION:'continuidad operativa',
 SETUP_PREPARATION_VIOLATION:'preparaciones de espacio',SETUP_POLICY_VIOLATION:'configuración de espacios',
 PARTICIPANT_MEAL_VIOLATION:'comidas de participantes',OPERATIONAL_MEAL_VIOLATION:'comidas operativas',
 RESOURCE_MEAL_VIOLATION:'comidas de recursos',SPACE_MEAL_VIOLATION:'comidas de espacios',BLOCK_VIOLATION:'bloques de trabajo',
 TECHNICAL_OPERATION_VIOLATION:'operaciones técnicas',TECHNICAL_CHAIN_VIOLATION:'cadenas técnicas',
 ANCHORED_ACCOMPANIMENT_VIOLATION:'acompañamientos y adyacencias',
 SNAPSHOT_OCCUPATION_UNREPRESENTABLE:'ocupaciones y preparaciones del borrador',
 VALIDATION_IDENTITY_UNREPRESENTABLE:'identidad de las entidades afectadas',
};

export function assistedValidationErrorMessage(error:any):string|null{
 const code=String(error?.code??error?.message??'');
 if(code==='HARD_ADMIN_AUTHORIZATION_REQUIRED')return 'Este borrador necesita autorización administrativa para aceptar conflictos críticos nuevos. Producción puede seguir editando y validando.';
 if(code==='ASSISTED_ACCEPT_FORBIDDEN')return 'Tu rol vigente no permite aceptar esta etapa. Solicita la revisión de una persona autorizada.';
 if(code==='ASSISTED_DELTA_VALIDATION_UNSUPPORTED'){
  const diagnostics=error?.payload?.validationDiagnostics??error?.validationDiagnostics;
  const codes:unknown[]=Array.isArray(diagnostics?.reasonCodes)?diagnostics.reasonCodes:[];
  const families=[...new Set(codes.map(value=>ruleNames[String(value).split(':')[0]]??'una regla de la configuración vigente'))];
  return `No se puede certificar este borrador: falta capacidad de validación para ${families.join(', ')||'la configuración o las entidades del borrador'}. No se puede aceptar como etapa. Revisa la configuración o solicita un diagnóstico.`;
 }
 if(code==='ASSISTED_VALIDATION_FAILED')return 'La validación ha fallado y no ha certificado el borrador. Vuelve a intentarlo; si persiste, solicita un diagnóstico.';
 if(code==='STALE_VALIDATION')return 'La validación ha quedado obsoleta. Revisa el borrador actual y vuelve a validarlo antes de aceptar.';
 if(code==='VALIDATION_NOT_ACCEPTABLE')return 'El reporte no permite aceptar este borrador. Revisa su completitud y las decisiones protegidas.';
 return null;
}

export function transportViolationExplanation(violation:any):string|null{
 if(violation.ruleCode!=='TRANSPORT_GROUPING_VIOLATION')return null;
 const d=violation.details?.dimensions??{},direction=d.direction==='arrival'?'IN':'OUT';
 if(d.kind==='GROUP_SIZE')return `${direction}: grupo de ${d.actualGroupSize} participantes; ${d.actualGroupSize>d.maximumGroupSize?`máximo permitido ${d.maximumGroupSize}`:`mínimo requerido ${d.minimumGroupSize}`}.`;
 if(d.kind==='GROUP_GAP')return `${direction}: hay ${d.actualGapMinutes} minutos entre inicios de grupos; mínimo requerido ${d.minGapMinutes}.`;
 if(d.kind==='PARTICIPANT_BOUNDARY')return direction==='IN'?'La entrada debe terminar antes de las demás obligaciones del participante, incluida su comida.':'La salida debe empezar después de las demás obligaciones del participante, incluida su comida.';
 if(d.kind==='TASK_COVERAGE')return `${direction}: faltan tareas de transporte o existen tareas duplicadas.`;
 if(d.kind==='PARTICIPANT_IDENTITY')return `${direction}: cada tarea de transporte debe identificar un participante distinto.`;
 return 'La agrupación de entradas o salidas incumple la configuración vigente.';
}
