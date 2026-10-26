/** Existing product journeys execute unchanged against the just-upgraded DB. */
import assert from 'node:assert/strict';
import {verifyDataApiActors} from '../../../script/demo/dataApiGrantsGate';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
export async function journey(options:any){
 assert.equal(options.db.host,'127.0.0.1');
 const historical=async()=>{
  const result:Record<string,unknown>={};
  const tables=(await options.db.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='plan_id' ORDER BY table_name")).rows;
  for(const {table_name:t} of tables)result[t]=(await options.db.query(`SELECT to_jsonb(t) row FROM public."${t}" t WHERE plan_id IN (26999,27001) ORDER BY to_jsonb(t)::text`)).rows;
  result.plans=(await options.db.query('SELECT to_jsonb(p) row FROM plans p WHERE id IN (26999,27001) ORDER BY id')).rows;
  return result;
 };
 const before=await historical();
 if(process.env.U00T_MODE==='required'){
  await verifyDataApiActors({...options,planId:27001});
  options.pass('seven Data API actors on upgraded historical plan');
 }
 const mode=process.env.U00T_MODE;
 let result:any;
 if(mode==='legacy-read')result=await (await import('./legacy-read')).legacyRead(options);
 else if(mode==='required')result=await (await import('../p0-u00s/journey')).journey(options);
 else if(mode==='prefix')result=await (await import('../p0-u00r/journey')).journey(options);
 else if(mode==='rounds')result=await (await import('../p0-u00p/journey')).journey(options);
 else if(mode==='additions')result=await (await import('../p0-u00n/journey')).journey(options);
 else {assert.equal(mode,'newday');result=await (await import('../../../script/demo/smokeNewDayJourney')).runNewDayJourney(options);}
 const after=await historical();
 const differences=Object.keys(before).filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k]));
 writeFileSync(options.directory+'/historical-delta.json.gz',gzipSync(JSON.stringify({changedTables:differences,before:Object.fromEntries(differences.map(k=>[k,before[k]])),after:Object.fromEntries(differences.map(k=>[k,after[k]]))})));
 assert.deepEqual(after,before,'historical plans after native product journey');
 const hash=(v:any)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 writeFileSync(options.directory+'/historical-after-native.json',JSON.stringify({status:'PASS',mode,beforeSha256:hash(before),afterSha256:hash(after),tables:Object.keys(before)},null,2));
 options.pass('both pre-104 plans remain literal after native journey');
 return result;
}
