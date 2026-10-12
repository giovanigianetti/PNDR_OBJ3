import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {merge} from 'topojson-client';
const base=new URL('../public/data/',import.meta.url);
const data=JSON.parse(fs.readFileSync(new URL('dashboard_obj3.json',base)));
const topology=JSON.parse(gunzipSync(fs.readFileSync(new URL('../data/municipios_ibge_topo.json.gz',import.meta.url))));
const objects=Object.values(topology.objects)[0].geometries;
const byCode=new Map(objects.map(g=>[String(g.properties.codarea),g]));
const groups=new Map();for(const m of data.municipalities){const g=groups.get(m.rgiCode)||{name:m.rgi,geometries:[]};const shape=byCode.get(m.code);if(!shape)throw Error(m.code);g.geometries.push(shape);groups.set(m.rgiCode,g);}
const features=[...groups].map(([code,g])=>({type:'Feature',properties:{code,name:g.name},geometry:merge(topology,g.geometries)}));
if(features.length!==508)throw Error('Expected 508 RGI');
fs.writeFileSync(new URL('rgi_geo.json',base),JSON.stringify({type:'FeatureCollection',features}));
console.log('508 RGI reconstruídas a partir da malha municipal local.');
