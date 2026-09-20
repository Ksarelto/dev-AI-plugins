#!/usr/bin/env python3
"""Print presentation order → ppt/slides/slideN.xml part names."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ooxml_util import slide_targets


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("unpacked")
    args = parser.parse_args()
    root = Path(args.unpacked)
    try:
        rows = slide_targets(root)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    for i, (_sid, rid, filename) in enumerate(rows, 1):
        print(f"{i}\t{filename}\t{rid}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
