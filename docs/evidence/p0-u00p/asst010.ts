/** Capture the historical benchmark failure directly, avoiding nested test-runner reporters. */
import {writeFileSync} from 'node:fs';
process.env.SUPABASE_URL='http://127.0.0.1:1';
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-evidence';process.env.SUPABASE_ANON_KEY='isolated-evidence';
const {runA2Assist7Evidence}=await import('../../../server/benchmarks/runA2Assist7Evidence');
const start=performance.now();let receipt:unknown;
try{receipt={status:'PASS',report:await runA2Assist7Evidence()};}
catch(e:any){receipt={status:'FAIL',code:e.code,message:e.message,actual:e.actual,expected:e.expected,operator:e.operator,stack:e.stack};}
writeFileSync(process.argv[2],JSON.stringify({node:process.version,seconds:(performance.now()-start)/1000,remoteWrites:0,...receipt as object},null,2));
