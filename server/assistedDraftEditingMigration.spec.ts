import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const sql=await readFile(new URL("../supabase/migrations/081_assisted_draft_editing.sql",import.meta.url),"utf8");
test("081 stores canonical TS fingerprints and moves F0 to F1 to F0 to F1 without hashing jsonb",()=>{
  assert.match(sql,/'beforeFingerprint',s\.draft_fingerprint,'afterFingerprint',p_fingerprint/);
  assert.match(sql,/p_redo THEN 'afterFingerprint' ELSE 'beforeFingerprint'/);
  assert.match(sql,/p_redo THEN 'beforeFingerprint' ELSE 'afterFingerprint'/);
  assert.doesNotMatch(sql,/digest\(convert_to\(next_snapshot::text/);
});
test("081 fails closed on corrupt ledger and locks manual validation provenance",()=>{
  for(const token of ["CORRUPT_EDIT_LEDGER","beforeFingerprint","afterFingerprint","FOR UPDATE","editKind","MANUAL"])assert.match(sql,new RegExp(token));
});
