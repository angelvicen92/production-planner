import { createClient } from '@supabase/supabase-js';
const required=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'];
if(required.some(k=>!process.env[k])){console.log(JSON.stringify({status:'BLOCKED',reason:'MISSING_RUNTIME_VARIABLES'}));process.exit(1);}
const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const tables=['plans','daily_tasks','plan_optimizer_snapshots','plan_task_template_snapshots','plan_config_revisions','assisted_planning_sessions','assisted_planning_stages','planning_stage_validations','planning_accepted_exceptions'];
const checks=await Promise.all(tables.map(async table=>{const {error}=await admin.from(table).select('id').limit(0);return {table,readable:!error,errorCode:error?.code??null};}));
const rpcNames=['assisted_bootstrap_session','assisted_record_proposal_clean_validation','assisted_accept_stage','assisted_apply_proposal'];
let exposedRpcs:unknown='OPENAPI_READ_FAILED';
try{const response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/`,{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY!,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,Accept:'application/openapi+json'}});if(response.ok){const schema=await response.json();exposedRpcs=rpcNames.map(name=>({name,exposed:Boolean(schema.paths?.[`/rpc/${name}`])}));}}catch{}
console.log(JSON.stringify({exposedRpcs,mode:'READ_ONLY_ZERO_ROWS',checks,authenticatedUserFlow:'NOT_TESTED',rpcTransactions:'NOT_TESTED',stagingIdentity:'NOT_CONFIRMED',writes:0},null,2));
