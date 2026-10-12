"""Publish the compiled Vite output into the package root; remove stale hashed assets."""
from pathlib import Path
import shutil,json
ROOT=Path(__file__).resolve().parents[2];BUILD=ROOT/'build-output'
assert (BUILD/'index.html').is_file(), 'Run npm run build first'
for name in ['assets','data']:
 target=ROOT/name
 if target.exists():shutil.rmtree(target)
 if name=='data':
  target.mkdir(parents=True,exist_ok=True)
  for file in json.loads((BUILD/name/'data-files.json').read_text())+['data-files.json']:shutil.copy2(BUILD/name/file,target/file)
 else:shutil.copytree(BUILD/name,target)
shutil.copy2(BUILD/'index.html',ROOT/'index.html')
(ROOT/'.nojekyll').touch()
print('Compiled index.html, assets/ and data/ updated at package root.')
