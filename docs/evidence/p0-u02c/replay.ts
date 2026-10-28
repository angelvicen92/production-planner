/** Fresh memory replay from real product receipts, without storage/network imports. */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {memoryAudit} from './memory';
for(const key of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','DATABASE_URL'])delete process.env[key];
const [source,label,output]=process.argv.slice(2);mkdirSync(output,{recursive:true});
const load=(n:string)=>JSON.parse(readFileSync(`${source}/${label}-${n}.json`,'utf8'));
const original=load('original-24'),actual=load('actual-input'),attempts=load('authoring');
const authorities=Object.fromEntries(attempts.map((a:any)=>[a.kind,a.payload]));
await memoryAudit({original,actual,authorities,competitorId:original.tasks.find((t:any)=>t.templateName.endsWith('rival A')).id,save:(name,value)=>writeFileSync(`${output}/${label}-${name}.json`,JSON.stringify(value,null,2))});
