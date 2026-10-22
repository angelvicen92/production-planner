export const bootstrapAdditionReasons = {
 REBOOTSTRAP_ACCEPTED_STAGE: 'Ya existe una etapa aceptada posterior a S0. Esta actualización sólo está disponible antes de aceptar la primera etapa.',
 REBOOTSTRAP_DIRTY_DRAFT: 'El borrador difiere del Stage 0. Revisa o restaura sus cambios antes de incorporar tareas.',
 REBOOTSTRAP_PENDING_PROPOSAL: 'Hay una propuesta activa o pendiente. Termina o descarta la propuesta antes de incorporar tareas.',
 REBOOTSTRAP_PROTECTED_DAY: 'La jornada tiene ejecución o bloqueos protegidos. No se puede sustituir su sesión.',
 REBOOTSTRAP_BASELINE_UNAVAILABLE: 'Esta sesión antigua no conserva la referencia completa necesaria para comprobar las altas. Se conserva su histórico y no puede actualizarse con esta operación.',
 REBOOTSTRAP_AUTHORITY_CHANGED: 'Han cambiado otras reglas o autoridades de la jornada. Esta operación sólo admite nuevas tareas y sus participantes nuevos.',
 REBOOTSTRAP_TASK_CHANGED_OR_REMOVED: 'Se han modificado o eliminado tareas existentes. Esta operación sólo admite altas.',
 REBOOTSTRAP_PARTICIPANT_CHANGED_OR_REMOVED: 'Se han modificado o eliminado participantes existentes. Revisa la configuración de la jornada.',
 REBOOTSTRAP_NO_ADDITIONS: 'No hay tareas nuevas que incorporar.',
 REBOOTSTRAP_STALE_SOURCES: 'Las tareas o su configuración han cambiado. Revisa de nuevo las diferencias antes de confirmar.',
} as const;
export type BootstrapAdditionReason = keyof typeof bootstrapAdditionReasons;
export interface BootstrapAdditionsPreview {
 allowed: boolean;
 reason: BootstrapAdditionReason | 'UNSUPPORTED_ENGINE_INPUT' | null;
 addedTaskIds: number[];
 pendingProposalIds?: number[];
 expectedSessionId: number;
 expectedBaseStageId: number;
 expectedDraftFingerprint: string;
 expectedConfigRevisionId: number;
 sourceToken: string;
}
