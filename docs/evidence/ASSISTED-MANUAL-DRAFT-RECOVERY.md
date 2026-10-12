# Reviewed recovery of plan 27001 Draft from S10 (Stage 13)

Prepared only. **Do not run against Supabase from Codex.** The actual application
is reserved for later ChatGPT review, with a fresh preflight, independently saved
backup and verification. This is not a migration or a way to accept S11.

The offline generator is `script/demo/prepareA2DraftPreparationRecovery.ts`.
It accepts one JSON export with camelCase fields:

- `session`: id, planId, activeStageId, draftBaseStageId, currentConfigRevisionId,
  draftSnapshotJson, draftFingerprint, draftScopeJson;
- `stage`: id, sessionId, planId, ordinal, snapshotJson, snapshotFingerprint;
- `acceptedExceptionCount` (must be zero for plan 27001).

1. Stop concurrent editors and capture a fresh read-only export of the ACTIVE
   session and base Stage. Capture separate full backups of the session, S10,
   accepted `daily_tasks`, validations and exceptions; retain their checksums and
   restore instructions outside the database. Audit the enabled immutable-Stage
   trigger/function against 077 and confirm the exact effective config remains
   current. No stale export or merely matching element counts is sufficient.
2. Run offline:
   `node --import tsx script/demo/prepareA2DraftPreparationRecovery.ts export.json work/a2-draft-recovery`.
   It creates a restricted backup export, repair manifest and SQL with a final
   `ROLLBACK`. It opens no network connection.
3. Review the exact diff and the full SQL. The generator requires plan 27001,
   Stage 13/ordinal 10, matching session/base/config and fingerprints, all 266
   placed obligations, 8 meals and exact 17+1 base preparations. The Draft must
   lack both preparation arrays and differ only by task 10048 changing
   18:55–19:00 to 19:00–19:05. Blocks, IDs, assignments and every other field must
   match. A single manual edit with matching forward/inverse task and before/
   after fingerprints, no block changes and no redo branch is required. Any
   broader history needs a separate diagnosis; this tool refuses it.
4. After explicit review, the operator supplies session settings
   `optiplan.a2_draft_recovery_approved = 'yes'` and
   `optiplan.a2_draft_recovery_backup_sha256 = <manifest backupSha256>`.
   First rehearse the generated rollback transaction. It locks the session,
   checks the exact exported snapshot/scope/fingerprint and immutable base,
   rejects any current exceptions and restores only the two missing arrays from
   the reviewed base. It checks the resulting exact snapshot and fingerprint
   before returning them. Keep the default rollback until the final application
   is independently authorized.
5. For an authorized real application, review changing the final rollback to
   commit. Re-read independently through SQL and the application. Verify 266/8/
   17/1, unchanged task 10048 at 19:00–19:05, repaired TS fingerprint, null stale
   validation pointer, byte-equivalent Stage S10, accepted daily tasks, exceptions,
   history and other sessions. Revalidate without accepting a new Stage.

The restored preparations remove omission artifacts; they do not make OUT C04
valid past 19:00. The canonical replay also finds a new departure packet separated
by 5 minutes when 20 are required. Its unstructured transport reason must still
block acceptance, pending a separately reviewed identity solution.

The existing audit/Undo ledger's `afterFingerprint` belongs to the truncated
snapshot. The recovery deliberately leaves it unchanged to respect the history
constraint. **Do not promise that legacy Undo becomes usable:** it fails closed
with `CORRUPT_EDIT_LEDGER` after repair. Correcting that historical fingerprint
requires separate authorization. A new reset can restore S10 exactly and new
edits use the preserved complete snapshot, but navigating back into the original
corrupted ledger remains blocked. Do not hide that condition or rewrite history
as part of this procedure.
