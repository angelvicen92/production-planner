import { build,createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { copyFileSync,mkdirSync,existsSync,readFileSync } from 'node:fs';
import { reviewA2Draft } from './reviewA2Draft';
const directory=resolve(process.argv[2]??'work/a2-demo');
if(!existsSync(`${directory}/bundle.json`))throw Error('Record A2 first: npm run demo:a2:record');
const publicDir=resolve(directory,'public');mkdirSync(publicDir,{recursive:true});
for(const name of ['bundle.json','summary.json'])copyFileSync(`${directory}/${name}`,`${publicDir}/${name}`);
const bundle=JSON.parse(readFileSync(`${directory}/bundle.json`,'utf8'));
const reviewPlugin={name:'local-recorded-review',enforce:'pre' as const,transform(code:string,id:string){if(id.split('?')[0]!.endsWith('/client/src/index.css'))return code.replace(/^@import.*fonts\.googleapis.*;$/gm,'');},configureServer(server:any){server.middlewares.use((req:any,res:any,next:any)=>{
 if(req.url==='/api/replay/capabilities'&&req.method==='GET'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({localReview:true}));return;}
 if(req.url!=='/api/replay/validate'||req.method!=='POST'){next();return;}
 let body='';req.on('data',(chunk:any)=>{body+=chunk;if(body.length>32_768)req.destroy();});req.on('end',()=>{
  res.setHeader('Content-Type','application/json');try{res.end(JSON.stringify(reviewA2Draft(bundle.sourceProblem,bundle.finalWitness,JSON.parse(body).edits)));}
  catch(e){res.statusCode=422;res.end(JSON.stringify({feasible:false,message:e instanceof Error?e.message:'INVALID_EDITS'}));}
 });
 });}};
const config={configFile:false as const,root:resolve('script/demo'),publicDir,plugins:[react(),reviewPlugin],
 resolve:{alias:{'@/hooks/use-production-clock':resolve('script/demo/replayClock.ts'),'@/lib/api':resolve('script/demo/clockApi.ts'),'@':resolve('client/src'),'@shared':resolve('shared')}},
 build:{outDir:resolve(directory,'site'),emptyOutDir:true},server:{host:'127.0.0.1',port:4173,strictPort:true,fs:{allow:[resolve('.')]}}};
if(process.argv.includes('--build'))await build(config);
else {const server=await createServer(config);await server.listen();server.printUrls();}
