"""Restore development inputs from the compact published data; original Excel not needed for builds."""
from pathlib import Path
import gzip,json,shutil
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'source/public/data';OUT.mkdir(parents=True,exist_ok=True)
for f in (ROOT/'data').glob('*'):
 if f.is_file() and not (OUT/f.name).exists():shutil.copy2(f,OUT/f.name)
for name in ['dashboard_obj3','validation','migration_indicators','municipios_geo','rgi_geo']:
 dest=OUT/f'{name}.json';src=OUT/f'{name}.json.gz'
 if not dest.exists() and src.exists():dest.write_bytes(gzip.decompress(src.read_bytes()))
manifest=OUT/'migration_profiles.json'
if manifest.exists():
 for year,spec in json.loads(manifest.read_text()).items():
  dest=OUT/f'migration_profile_{year}.json.gz'
  if dest.exists():continue
  rows=[]
  for part in spec['files']:rows.extend(json.loads(gzip.decompress((OUT/part).read_bytes())))
  assert len(rows)==spec['rows']
  dest.write_bytes(gzip.compress(json.dumps({'columns':spec['columns'],'rows':rows},ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
print('Local development data ready.')
