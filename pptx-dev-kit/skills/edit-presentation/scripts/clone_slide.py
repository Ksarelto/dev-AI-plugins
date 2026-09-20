#!/usr/bin/env python3
"""Duplicate a slide with Content_Types, presentation rels, and sldIdLst bookkeeping."""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lxml import etree

from ooxml_util import (
    CT_SLIDE,
    NS,
    REL_SLIDE,
    content_types,
    next_rid,
    parse,
    presentation_rels,
    presentation_xml,
    slide_path,
    write,
)


def clone(root: Path, source_name: str, after_name: str | None) -> str:
    source = slide_path(root, source_name)
    if not source.is_file():
        raise FileNotFoundError(source)
    existing = [p.name for p in (root / "ppt" / "slides").glob("slide*.xml")]
    nums = []
    for name in existing:
        digits = "".join(ch for ch in name if ch.isdigit())
        if digits:
            nums.append(int(digits))
    new_n = max(nums, default=0) + 1
    new_name = f"slide{new_n}.xml"
    dest = root / "ppt" / "slides" / new_name
    shutil.copy2(source, dest)
    rels_src = root / "ppt" / "slides" / "_rels" / f"{source.name}.rels"
    rels_dest_dir = root / "ppt" / "slides" / "_rels"
    rels_dest_dir.mkdir(parents=True, exist_ok=True)
    if rels_src.is_file():
        shutil.copy2(rels_src, rels_dest_dir / f"{new_name}.rels")

    ct = parse(content_types(root))
    override = etree.SubElement(ct.getroot(), f"{{{NS['ct']}}}Override")
    override.set("PartName", f"/ppt/slides/{new_name}")
    override.set("ContentType", CT_SLIDE)
    write(ct, content_types(root))

    rels = parse(presentation_rels(root))
    rid = next_rid(rels.getroot())
    rel = etree.SubElement(rels.getroot(), f"{{{NS['pr']}}}Relationship")
    rel.set("Id", rid)
    rel.set("Type", REL_SLIDE)
    rel.set("Target", f"slides/{new_name}")
    write(rels, presentation_rels(root))

    pres = parse(presentation_xml(root))
    lst = pres.xpath("//p:sldIdLst", namespaces=NS)[0]
    ids = [int(el.get("id")) for el in lst if el.get("id") and el.get("id").isdigit()]
    new_id = str(max(ids, default=255) + 1)
    sld = etree.Element(f"{{{NS['p']}}}sldId")
    sld.set("id", new_id)
    sld.set(f"{{{NS['r']}}}id", rid)

    if after_name:
        after_file = Path(after_name).name
        after_el = None
        rels_map = {
            el.get("Id"): Path(el.get("Target", "")).name
            for el in parse(presentation_rels(root)).getroot()
            if el.get("Type") == REL_SLIDE
        }
        for el in lst:
            if rels_map.get(el.get(f"{{{NS['r']}}}id")) == after_file:
                after_el = el
                break
        if after_el is not None:
            after_el.addnext(sld)
        else:
            lst.append(sld)
    else:
        lst.append(sld)
    write(pres, presentation_xml(root))
    return new_name


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("unpacked")
    parser.add_argument("--from", dest="source", required=True, help="slideN.xml to copy")
    parser.add_argument("--after", dest="after", default=None, help="insert after this slideN.xml")
    args = parser.parse_args()
    root = Path(args.unpacked)
    try:
        created = clone(root, args.source, args.after)
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(f"OK: created ppt/slides/{created} from {args.source}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
