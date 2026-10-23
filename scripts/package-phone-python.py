"""Copy a standalone local Python and only the phone clients' dependency closure.
No network, pip installation, model weights, user site or credentials are copied.
"""
import importlib.metadata as md
import json, pathlib, shutil, sys
from packaging.requirements import Requirement
from packaging.utils import canonicalize_name
target=pathlib.Path(sys.argv[1]).resolve()
if target.exists(): raise RuntimeError('Destination already exists')
base=pathlib.Path(sys.base_prefix)
target.mkdir(parents=True)
for f in base.iterdir():
    if f.is_file() and (f.suffix.lower() in ('.exe','.dll') or f.name=='LICENSE.txt'):
        shutil.copy2(f,target/f.name)
shutil.copytree(base/'DLLs',target/'DLLs',ignore=shutil.ignore_patterns('__pycache__'))
shutil.copytree(base/'Lib',target/'Lib',ignore=shutil.ignore_patterns('site-packages','__pycache__','test','tests','idlelib','tkinter','ensurepip'))
site=target/'Lib/site-packages';site.mkdir()
todo=['openai','httpx','python-dotenv','uiautomator2','hmdriver2','opencv-python-headless','Pillow']
seen={};copied=set()
while todo:
    name=canonicalize_name(todo.pop())
    if name in seen:continue
    dist=md.distribution(name);seen[name]=dist.version
    for raw in dist.requires or []:
        r=Requirement(raw)
        if r.marker is None or r.marker.evaluate({'extra':''}):todo.append(r.name)
    for entry in dist.files or []:
        rel=pathlib.PurePosixPath(str(entry))
        if '..' in rel.parts or '__pycache__' in rel.parts or rel.suffix=='.pyc':continue
        source=pathlib.Path(dist.locate_file(entry)).resolve()
        if not source.is_file():continue
        output=site.joinpath(*rel.parts)
        if output in copied:continue
        output.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,output);copied.add(output)
(target/'phone-packages.json').write_text(json.dumps(seen,indent=2),encoding='utf-8')
print(json.dumps({'python':sys.version.split()[0],'packages':seen,'files':len(copied)}))
