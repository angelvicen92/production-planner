/** Artifact consistency checks, not a substitute for product end-to-end tests. */
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const root='docs/audit/configuration-p1',load=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ui=load(`${root}/generated/ui-controls.json`),actions=load(`${root}/generated/actions.json`),catalog=load(`${root}/generated/catalog.json`),characterization=load(`${root}/generated/characterization.json`);
assert.equal(ui.counts.controls,ui.controls.length);assert.equal(ui.counts.actions,actions.actions.length);assert.equal(ui.counts.files,Object.keys(ui.sourceHashes).length);
const classes=new Set(['PRODUCTIVO','PARCIAL','LEGACY','INFORMATIVO','SIN EFECTO DEMOSTRADO','INCOMPATIBLE','FALTANTE']);
for(const r of [...ui.controls,...actions.actions]){assert.ok(classes.has(r.classification),r.id);assert.equal(Object.keys(r.trace).length,16,r.id);assert.ok(fs.existsSync(r.file),r.file);assert.ok(r.line<=fs.readFileSync(r.file,'utf8').split('\n').length);}
for(const p of ui.profiles)for(const test of p.tests)assert.ok(fs.existsSync(test),test);
for(const [file,digest]of Object.entries(ui.sourceHashes))assert.equal(hash(file),digest,`Source drift: ${file}`);
for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.md'))){const text=fs.readFileSync(`${root}/${file}`,'utf8');for(const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){const target=m[1].split('#')[0];if(target&&!target.includes('://'))assert.ok(fs.existsSync(path.resolve(root,target)),`${file}: missing ${target}`);}}
assert.equal(characterization.networkCalls,0);assert.equal(characterization.writesToApplication,0);assert.equal(characterization.registry.capabilities.length,27);
assert.equal(characterization.templateApiCharacterization.createAccepted,false);assert.equal(characterization.templateApiCharacterization.marginPatchAccepted,false);
assert.equal(catalog.observation.writes,0);assert.equal(catalog.deletionCertified,false);assert.ok(catalog.entities.every(e=>e.deleteAuthorized===false));
for(const p of catalog.plans.filter(p=>[27001,27002].includes(p.id))){assert.equal(p.dailyTaskCount,266);assert.equal(p.nextTaskOperationCount,266);}
assert.equal(catalog.entities.filter(e=>e.table==='task_templates').length,catalog.observation.counts.task_templates);
const taskPlans=new Map();for(const e of catalog.edges.filter(e=>e.from.startsWith('daily_tasks:')&&e.to.startsWith('plans:')))taskPlans.set(Number(e.from.split(':')[1]),Number(e.to.split(':')[1]));
for(const e of catalog.entities.filter(e=>e.table==='task_templates'))for(const tid of e.linkedDailyTaskIds)assert.ok(e.planIds.includes(taskPlans.get(tid)),`${e.id}/${tid} plan provenance`);
assert.ok(catalog.unresolvedTypedReferences.every(e=>['resource_items:15','resource_items:16'].includes(e.to)));
const sql=fs.readFileSync('script/audit/configurationCatalogP1.sql','utf8').replace(/--[^\n]*/g,'');assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|CALL)\b/i);
const reader=fs.readFileSync('script/audit/read_configuration_catalog_p1.py','utf8');assert.match(reader,/method='GET'/);assert.doesNotMatch(reader,/select=\*/);
const official=fs.readdirSync('docs/source/official').filter(f=>/^0[0-7]_.*\.md$/.test(f)).sort().map(f=>({path:`docs/source/official/${f}`,sha256:hash(`docs/source/official/${f}`)}));
const result={contract:'CONFIGURATION-P1-ARTIFACT-VERIFICATION-V1',status:'PASS',controls:ui.controls.length,actions:actions.actions.length,sourceFiles:ui.counts.files,traceDimensions:16,catalogEntities:catalog.entities.length,catalogEdges:catalog.edges.length,nominalDuplicateGroups:catalog.nominalDuplicates.length,unresolvedTypedReferences:catalog.unresolvedTypedReferences.length,registryCapabilities:27,officialSources:official,limitations:['SQL RLS certification pending','Browser mutating journeys not executed','Historical JSON references outside allowlist not certified','Existing product tests reported separately in 08-verification.md']};
fs.writeFileSync(`${root}/generated/artifact-verification.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,officialSources:official.length}));
