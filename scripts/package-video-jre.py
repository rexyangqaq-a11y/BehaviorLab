"""Extract a checksum-verified official JRE ZIP without links or escaping paths."""
import hashlib, json, stat, sys
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

archive, destination = Path(sys.argv[1]), Path(sys.argv[2]).resolve()
expected = '238d74ec4ec9422d416fa98805ba375eecd8bc8f971bd0c61a21051a4fe42db8'
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
    raise ValueError('Official JRE archive checksum differs')
if destination.exists():
    raise ValueError('JRE destination must not exist')
files, seen = {}, set()
with ZipFile(archive) as bundle:
    for item in bundle.infolist():
        name = PurePosixPath(item.filename)
        if '\\' in item.filename or name.is_absolute() or '..' in name.parts or not name.parts or name.parts[0] != 'jdk-21.0.8+9-jre':
            raise ValueError('Unexpected JRE archive path')
        if stat.S_ISLNK(item.external_attr >> 16):
            raise ValueError('JRE archive link rejected')
        relative = PurePosixPath(*name.parts[1:])
        if item.is_dir():
            continue
        if not relative.parts or any(':' in part for part in relative.parts):
            raise ValueError('Invalid JRE filename')
        key = str(relative).casefold()
        if key in seen:
            raise ValueError('Duplicate JRE filename')
        seen.add(key)
        output = destination.joinpath(*relative.parts).resolve()
        if destination not in output.parents:
            raise ValueError('JRE path escapes destination')
        data = bundle.read(item)
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open('xb') as stream:
            stream.write(data)
        files[str(relative)] = hashlib.sha256(data).hexdigest()
print(json.dumps(files, sort_keys=True))
