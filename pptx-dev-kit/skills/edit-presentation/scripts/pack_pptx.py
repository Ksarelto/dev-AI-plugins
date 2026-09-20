#!/usr/bin/env python3
"""Pack an unpacked OOXML tree into a .pptx. Writes via a temp file, then copies."""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path


def pack(unpacked: Path, out: Path) -> None:
    fd, tmp = tempfile.mkstemp(suffix=".pptx")
    os.close(fd)
    try:
        with zipfile.ZipFile(tmp, "w") as zf:
            files = [
                p
                for p in sorted(unpacked.rglob("*"))
                if p.is_file() and p.name != ".DS_Store"
            ]
            for path in files:
                arc = path.relative_to(unpacked).as_posix()
                compress = (
                    zipfile.ZIP_STORED
                    if arc == "[Content_Types].xml"
                    else zipfile.ZIP_DEFLATED
                )
                zf.write(path, arcname=arc, compress_type=compress)
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(tmp, out)
    finally:
        os.unlink(tmp)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("unpacked")
    parser.add_argument("output")
    args = parser.parse_args()
    unpacked = Path(args.unpacked)
    if not (unpacked / "[Content_Types].xml").is_file():
        print("ERROR: unpacked dir is missing [Content_Types].xml", file=sys.stderr)
        return 2
    out = Path(args.output)
    pack(unpacked, out)
    print(f"OK: packed {unpacked} -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
