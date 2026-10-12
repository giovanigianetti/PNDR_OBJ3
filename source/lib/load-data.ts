import type {ProfileData} from './migration';

/** Local gzip files; also tolerates a host that already decoded the response. */
export async function loadJson<T = any>(url:string):Promise<T>{
 const response=await fetch(url);
 if(!response.ok)throw new Error(`Arquivo indisponível: ${url} (HTTP ${response.status})`);
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes[0]===0x1f&&bytes[1]===0x8b){
  const decoded=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(decoded).json();
 }
 return JSON.parse(new TextDecoder().decode(bytes));
}
type ProfileManifest=Record<string,{columns:string[];files:string[];rows:number}>;
let manifestPromise:Promise<ProfileManifest>|null=null;
export async function loadMigrationProfile(year:number):Promise<ProfileData>{
 const manifest=await (manifestPromise??=loadJson<ProfileManifest>('./data/migration_profiles.json').catch(e=>{manifestPromise=null;throw e;}));
 const spec=manifest[String(year)];if(!spec)throw new Error(`Perfil ${year} ausente do manifesto`);
 const rows:ProfileData['rows']=[];
 // Limit parallel downloads while retaining deterministic row order.
 for(let start=0;start<spec.files.length;start+=4){
  const parts=await Promise.all(spec.files.slice(start,start+4).map(file=>loadJson<ProfileData['rows']>(`./data/${file}`)));
  for(const part of parts)rows.push(...part);
 }
 if(rows.length!==spec.rows)throw new Error(`Perfil ${year} incompleto: ${rows.length}/${spec.rows}`);
 return {columns:spec.columns,rows};
}
