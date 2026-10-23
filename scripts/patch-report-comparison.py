"""Copy one selected slide and its notes from an Artifact Tool export.
Other package entries retain identical bytes, including every other slide.
"""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import json,argparse,hashlib
parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--generated',required=True);parser.add_argument('--target',required=True);parser.add_argument('--slide',type=int,default=3);args=parser.parse_args()
source,generated,target=map(Path,(args.source,args.generated,args.target))
if target.resolve() in (source.resolve(),generated.resolve()):raise ValueError('Output must be a separate file')
if args.slide<1:raise ValueError('Slide number must be positive')
allowed={f'ppt/slides/slide{args.slide}.xml',f'ppt/notesSlides/notesSlide{args.slide}.xml'}
with ZipFile(source) as z:original={n:z.read(n) for n in z.namelist()};infos=z.infolist()
with ZipFile(generated) as z:replacement={n:z.read(n) for n in allowed}
target.parent.mkdir(parents=True,exist_ok=True)
with ZipFile(target,'w',ZIP_DEFLATED) as z:
    for info in infos:z.writestr(info,replacement.get(info.filename,original[info.filename]))
with ZipFile(target) as z:
    assert set(z.namelist())==set(original)
    changed=[n for n in original if original[n]!=z.read(n)]
    assert set(changed)==allowed,changed
report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'changed_parts':changed,'all_other_parts_identical':True,'source_overwritten':False}
(target.parent/'scope-check.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
