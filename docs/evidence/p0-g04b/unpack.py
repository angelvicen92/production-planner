"""Materialize public receipt archives for independent, read-only verification."""
import gzip, json, pathlib, sys
archive, output = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)
for name, value in json.loads(gzip.decompress(archive.read_bytes())).items():
    path = pathlib.PurePosixPath(name)
    assert not path.is_absolute() and '..' not in path.parts
    target = output/path; target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')
