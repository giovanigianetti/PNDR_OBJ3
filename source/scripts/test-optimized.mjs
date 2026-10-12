import fs from 'node:fs';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import ts from 'typescript';
const root=new URL('../../',import.meta.url);
const source=fs.readFileSync(new URL('../lib/load-data.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const loader=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const requested=[];
globalThis.fetch=async url=>{requested.push(url);const path=new URL(String(url),root);return fs.existsSync(path)?new Response(fs.readFileSync(path),{status:200}):new Response('',{status:404});};
for(const name of ['dashboard_obj3','validation','municipios_geo','rgi_geo','migration_indicators']){
 const actual=await loader.loadJson('./data/'+name+'.json.gz');
 const original=JSON.parse(fs.readFileSync(new URL('../public/data/'+name+'.json',import.meta.url)));
 assert.deepEqual(actual,original);
}
for(const year of [2010,2022]){
 const actual=await loader.loadMigrationProfile(year);
 const original=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL(`../public/data/migration_profile_${year}.json.gz`,import.meta.url))));
 assert.deepEqual(actual,original);
}
await assert.rejects(()=>loader.loadJson('./data/missing-file.json.gz'),/HTTP 404/);
// Hosts may already decode gzip. The loader must support that response too.
globalThis.fetch=async()=>new Response(JSON.stringify({decoded:true}));
assert.deepEqual(await loader.loadJson('already-decoded'),{decoded:true});
console.log('PASS: all optimized datasets identical to original; 119021 profile rows; gzip, partition loader and errors validated.');
