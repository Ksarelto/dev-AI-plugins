#!/usr/bin/env python3
"""Replace text inside existing <a:t> runs so paragraph formatting survives."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ooxml_util import NS, parse, slide_path, write

XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"


def replace_in_slide(path: Path, old: str, new: str) -> int:
    tree = parse(path)
    count = 0
    for node in tree.xpath("//a:t", namespaces=NS):
        text = node.text or ""
        if old not in text:
            continue
        updated = text.replace(old, new)
        node.text = updated
        if updated[:1].isspace() or updated[-1:].isspace():
            node.set(XML_SPACE, "preserve")
        count += 1
    if count:
        write(tree, path)
    return count


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("unpacked")
    parser.add_argument(
        "--slide",
        required=True,
        help="OOXML part: slideN.xml or N (the part number, not the 1-based position). "
        "Run list_slides.py to map presentation order → part name.",
    )
    parser.add_argument("--old", required=True)
    parser.add_argument("--new", required=True)
    args = parser.parse_args()
    root = Path(args.unpacked)
    name = args.slide if str(args.slide).endswith(".xml") else f"slide{args.slide}.xml"
    path = slide_path(root, name)
    if not path.is_file():
        print(f"ERROR: {path} not found", file=sys.stderr)
        return 2
    n = replace_in_slide(path, args.old, args.new)
    if n == 0:
        print(f"ERROR: {args.old!r} not found in {path.name}", file=sys.stderr)
        return 1
    print(f"OK: replaced {n} run(s) in {path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
