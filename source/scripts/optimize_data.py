"""Lossless gzip and profile partitioning for GitHub browser uploads."""
from pathlib import Path
import gzip,json,sys
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/('source/public/data' if '--public' in sys.argv else 'build-output/data')
keep='--keep-raw' in sys.argv
output_files=[]
def packed(obj):return gzip.compress(json.dumps(obj,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode(),compresslevel=9,mtime=0)
for name in ['dashboard_obj3','validation','migration_indicators','municipios_geo','rgi_geo']:
 p=OUT/f'{name}.json';raw=p.read_bytes() if p.exists() else gzip.decompress((OUT/f'{name}.json.gz').read_bytes())
 obj=json.loads(raw);target=OUT/f'{name}.json.gz';target.write_bytes(packed(obj));output_files.append(target.name)
 assert json.loads(gzip.decompress(target.read_bytes()))==obj
 if p.exists() and not keep:p.unlink()
manifest={}
old=json.loads((OUT/'migration_profiles.json').read_text()) if (OUT/'migration_profiles.json').exists() else {}
for year in ['2010','2022']:
 p=OUT/f'migration_profile_{year}.json.gz'
 if p.exists():obj=json.loads(gzip.decompress(p.read_bytes()))
 else:
  spec=old[year];rows=[]
  for file in spec['files']:rows.extend(json.loads(gzip.decompress((OUT/file).read_bytes())))
  obj={'columns':spec['columns'],'rows':rows}
 files=[];reconstructed=[]
 for i,start in enumerate(range(0,len(obj['rows']),5000),1):
  name=f'migration_{year}_part_{i:02}.json.gz';part=obj['rows'][start:start+5000]
  (OUT/name).write_bytes(packed(part));files.append(name);output_files.append(name)
  reconstructed.extend(json.loads(gzip.decompress((OUT/name).read_bytes())))
 assert reconstructed==obj['rows']
 manifest[year]={'columns':obj['columns'],'files':files,'rows':len(obj['rows'])}
 if p.exists() and not keep:p.unlink()
(OUT/'migration_profiles.json').write_text(json.dumps(manifest,separators=(',',':')))
output_files.append('migration_profiles.json')
(OUT/'data-files.json').write_text(json.dumps(output_files))
# This source topology is not requested by the application; local SHP and GeoJSON are preserved.
topo=OUT/'municipios_ibge_topo.json'
if topo.exists() and not keep:topo.unlink()
assert max((OUT/name).stat().st_size for name in output_files)<2*1024*1024
print('Optimized data:',sum((OUT/name).stat().st_size for name in output_files),'bytes; partitioning preserves all values.')
