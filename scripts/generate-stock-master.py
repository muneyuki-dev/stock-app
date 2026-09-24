#!/usr/bin/env python3
"""Convert JPX's monthly listed securities workbook into a runtime JSON master."""

from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
COMMON_STOCK_MARKETS = {"プライム（内国株式）", "スタンダード（内国株式）", "グロース（内国株式）"}


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return ["".join(node.text or "" for node in item.findall(".//x:t", NS)) for item in root.findall("x:si", NS)]


def cell_value(cell: ET.Element, strings: list[str]) -> str:
    node = cell.find("x:v", NS)
    if node is None or node.text is None:
        return ""
    return strings[int(node.text)] if cell.get("t") == "s" else node.text


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: generate-stock-master.py INPUT.xlsx OUTPUT.json")
    source, destination = map(Path, sys.argv[1:])
    with zipfile.ZipFile(source) as archive:
        strings = shared_strings(archive)
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))

    rows: list[dict[str, object]] = []
    headers: list[str] = []
    for row in sheet.findall(".//x:sheetData/x:row", NS):
        values = [cell_value(cell, strings) for cell in row.findall("x:c", NS)]
        if not headers:
            headers = values
            continue
        record = dict(zip(headers, values))
        market = str(record.get("市場・商品区分", ""))
        code = str(record.get("コード", "")).strip()
        if market not in COMMON_STOCK_MARKETS or not re.fullmatch(r"[0-9A-Z]{4}", code):
            continue
        rows.append({
            "code": code,
            "ticker": f"{code}.T",
            "name": str(record.get("銘柄名", "")).strip(),
            "market": market.replace("（内国株式）", ""),
            "active": True,
        })

    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps({"sourceDate": "2026-08-31", "stocks": rows}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} common stocks to {destination}")


if __name__ == "__main__":
    main()
