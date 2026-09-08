import json
import os
import shutil
import sys
import tarfile
from pathlib import Path, PurePosixPath


def install(archive_name: str, destination_name: str, max_bytes: int) -> dict:
    archive = Path(archive_name).resolve()
    destination = Path(destination_name).resolve()
    temporary = destination.with_name(destination.name + ".installing")
    if destination.exists():
        raise RuntimeError("Translation pack is already installed")
    shutil.rmtree(temporary, ignore_errors=True)
    temporary.mkdir(parents=True)

    try:
        with tarfile.open(archive, "r:gz") as bundle:
            members = bundle.getmembers()
            total = 0
            for member in members:
                path = PurePosixPath(member.name)
                if path.is_absolute() or ".." in path.parts:
                    raise RuntimeError(f"Unsafe archive path: {member.name}")
                if member.issym() or member.islnk() or member.isdev():
                    raise RuntimeError(f"Unsupported archive entry: {member.name}")
                if member.isfile():
                    total += member.size
                    if total > max_bytes:
                        raise RuntimeError("Expanded pack exceeds the size limit")

            for member in members:
                target = temporary.joinpath(*PurePosixPath(member.name).parts)
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                if not member.isfile():
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                source = bundle.extractfile(member)
                if source is None:
                    raise RuntimeError(f"Could not read archive entry: {member.name}")
                with source, target.open("wb") as output:
                    shutil.copyfileobj(source, output)

        if not (temporary / "manifest.json").is_file() or not (temporary / "runner.py").is_file():
            raise RuntimeError("Translation pack is missing its manifest or runner")
        os.replace(temporary, destination)
        return {"ok": True, "destination": str(destination), "expandedBytes": total}
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise


if __name__ == "__main__":
    try:
        if len(sys.argv) != 4:
            raise RuntimeError("Usage: install_pack.py ARCHIVE DESTINATION MAX_BYTES")
        print(json.dumps(install(sys.argv[1], sys.argv[2], int(sys.argv[3]))))
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
