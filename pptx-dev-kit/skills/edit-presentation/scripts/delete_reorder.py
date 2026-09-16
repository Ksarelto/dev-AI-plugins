#!/usr/bin/env python3
"""Delete slides or reorder sldIdLst, then drop orphaned slide parts."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ooxml_util import (
    NS,
    REL_SLIDE,
    content_types,
    parse,
    presentation_rels,
    presentation_xml,
    slide_targets,
    write,
)


def _rels_map(root: Path):
    rels = parse(presentation_rels(root))
    return rels, {
        el.get("Id"): el
        for el in rels.getroot()
        if el.get("Type") == REL_SLIDE
    }


def delete_slides(root: Path, names: list[str]) -> None:
    wanted = {Path(n).name for n in names}
    pres = parse(presentation_xml(root))
    lst = pres.xpath("//p:sldIdLst", namespaces=NS)[0]
    rels, by_id = _rels_map(root)
    ct = parse(content_types(root))
    order = slide_targets(root)
    for _sid, rid, filename in order:
        if filename not in wanted:
            continue
        for el in list(lst):
            if el.get(f"{{{NS['r']}}}id") == rid:
                lst.remove(el)
        rel_el = by_id.get(rid)
        if rel_el is not None:
            rels.getroot().remove(rel_el)
        for ov in list(ct.getroot()):
            if ov.get("PartName") == f"/ppt/slides/{filename}":
                ct.getroot().remove(ov)
        slide = root / "ppt" / "slides" / filename
        rels_file = root / "ppt" / "slides" / "_rels" / f"{filename}.rels"
        if slide.exists():
            slide.unlink()
        if rels_file.exists():
            rels_file.unlink()
    write(pres, presentation_xml(root))
    write(rels, presentation_rels(root))
    write(ct, content_types(root))


def reorder(root: Path, names: list[str]) -> None:
    wanted = [Path(n).name for n in names]
    current = [filename for _sid, _rid, filename in slide_targets(root)]
    if sorted(wanted) != sorted(current):
        raise ValueError(
            f"--order must be a permutation of existing slides\n"
            f"  have: {current}\n  got:  {wanted}"
        )
    pres = parse(presentation_xml(root))
    lst = pres.xpath("//p:sldIdLst", namespaces=NS)[0]
    rels, by_id = _rels_map(root)
    filename_to_el = {}
    for el in list(lst):
        rid = el.get(f"{{{NS['r']}}}id")
        rel_el = by_id.get(rid)
        target = Path(rel_el.get("Target")).name if rel_el is not None else ""
        filename_to_el[target] = el
        lst.remove(el)
    for name in wanted:
        lst.append(filename_to_el[name])
    write(pres, presentation_xml(root))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("unpacked")
    parser.add_argument(
        "--delete",
        action="append",
        default=[],
        help="slideN.xml to delete (repeatable)",
    )
    parser.add_argument(
        "--order",
        default=None,
        help="comma-separated slideN.xml in the new order (must list every remaining slide)",
    )
    args = parser.parse_args()
    root = Path(args.unpacked)
    try:
        if args.delete:
            delete_slides(root, args.delete)
            print(f"OK: deleted {args.delete}")
        if args.order:
            reorder(root, [part.strip() for part in args.order.split(",") if part.strip()])
            print(f"OK: reordered")
        if not args.delete and not args.order:
            print("ERROR: pass --delete and/or --order", file=sys.stderr)
            return 2
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    remaining = [f for _s, _r, f in slide_targets(root)]
    print("slides:", ", ".join(remaining))
    return 0


if __name__ == "__main__":
    sys.exit(main())
