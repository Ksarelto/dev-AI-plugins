#!/usr/bin/env python3
"""Extract a .pptx zip into a directory. Does not modify the source file."""

from __future__ import annotations

import argparse
import sys
import zipfile
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pptx")
    parser.add_argument("dest")
    args = parser.parse_args()
    src = Path(args.pptx)
    dest = Path(args.dest)
    if not src.is_file():
        print(f"ERROR: not found: {src}", file=sys.stderr)
        return 2
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(src) as zf:
        zf.extractall(dest)
    print(f"OK: unpacked {src} -> {dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
