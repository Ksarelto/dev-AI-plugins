"""OOXML helpers shared by unpack/pack/clone/delete/replace. Uses lxml, never xml.etree."""

from __future__ import annotations

import re
from pathlib import Path

from lxml import etree

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "ct": "http://schemas.openxmlformats.org/package/2006/content-types",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}

REL_SLIDE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
CT_SLIDE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"

PARSER = etree.XMLParser(remove_blank_text=False, huge_tree=True)


def parse(path: Path) -> etree._ElementTree:
    return etree.parse(str(path), PARSER)


def write(tree: etree._ElementTree, path: Path) -> None:
    tree.write(
        str(path),
        xml_declaration=True,
        encoding="UTF-8",
        standalone=True,
    )


def presentation_xml(root: Path) -> Path:
    return root / "ppt" / "presentation.xml"


def presentation_rels(root: Path) -> Path:
    return root / "ppt" / "_rels" / "presentation.xml.rels"


def content_types(root: Path) -> Path:
    return root / "[Content_Types].xml"


def slide_path(root: Path, name: str) -> Path:
    if not name.endswith(".xml"):
        name = f"{name}.xml"
    if not name.startswith("slide"):
        name = f"slide{name}"
    return root / "ppt" / "slides" / name


def rid_num(rid: str) -> int:
    match = re.search(r"(\d+)$", rid or "")
    return int(match.group(1)) if match else 0


def next_rid(rels_root) -> str:
    nums = [rid_num(el.get("Id", "")) for el in rels_root]
    return f"rId{max(nums, default=0) + 1}"


def slide_targets(root: Path) -> list[tuple[str, str, str]]:
    """Return (sldId, rId, target filename) in presentation order."""
    pres = parse(presentation_xml(root))
    rels = parse(presentation_rels(root))
    rel_map = {
        el.get("Id"): el.get("Target")
        for el in rels.getroot()
        if el.get("Type") == REL_SLIDE
    }
    ns = NS
    out = []
    for sld in pres.xpath("//p:sldIdLst/p:sldId", namespaces=ns):
        rid = sld.get(f"{{{NS['r']}}}id")
        target = rel_map.get(rid, "")
        filename = Path(target).name
        out.append((sld.get("id"), rid, filename))
    return out
