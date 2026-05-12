#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = ROOT / "content"
DATA_DIR = ROOT / "data"

LANGS = ["ru", "en", "zh"]
LANG_HEADERS = {"RU": "ru", "EN": "en", "ZH": "zh"}
META_RE = re.compile(r"^#\s*([a-zA-Z0-9_]+)\s*:\s*(.*)$")
SUBHEADING_RE = re.compile(r"^###\s+(.+?)\s*$")

CN_NUMS = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
    "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
    "十一": 11, "十二": 12, "十三": 13, "十四": 14, "十五": 15,
    "十六": 16, "十七": 17, "十八": 18, "十九": 19, "二十": 20,
}

ARTIFACT_PART_KEYS = ["flower", "plume", "sands", "goblet", "circlet"]
ARTIFACT_PART_HINTS = {
    "flower": ["цветок", "flower", "生之花"],
    "plume": ["перо", "plume", "feather", "死之羽"],
    "sands": ["часы", "пески", "sands", "timepiece", "时之沙"],
    "goblet": ["кубок", "goblet", "cup", "空之杯"],
    "circlet": ["корона", "circlet", "crown", "理之冠"],
}

ITEM_GROUPS = {
    "weekly_bosses", "world_bosses", "common_enemies", "talent_leveling",
    "weapon_materials", "teyvat_resources", "food_potions", "useful_items", "misc",
}
WEAPON_TYPES = {"sword", "claymore", "bow", "catalyst", "polearm"}
BOOK_SUBTYPES = {"book_series", "notes"}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def clean_json_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    for file in path.glob("*.json"):
        file.unlink()


def slug_from_path(path: Path) -> str:
    return re.sub(r"[^a-zA-Z0-9_\-]+", "_", path.stem.strip().lower()).strip("_")


def parse_meta_and_body(text: str) -> tuple[dict[str, str], str]:
    meta: dict[str, str] = {}
    lines = text.splitlines()
    body_start = 0

    for i, line in enumerate(lines):
        if line.startswith("## "):
            body_start = i
            break
        match = META_RE.match(line)
        if match:
            meta[match.group(1).strip()] = match.group(2).strip()
    else:
        body_start = len(lines)

    return meta, "\n".join(lines[body_start:])


def split_top_sections(body: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {}
    current: str | None = None

    for line in body.splitlines():
        header = re.match(r"^##\s+(.+?)\s*$", line.strip())
        if header:
            name = header.group(1).strip().upper()
            if name in LANG_HEADERS or name in {"NOTES", "INTERNAL"}:
                current = name
                sections[current] = []
                continue
        if current:
            sections[current].append(line)

    return {key: "\n".join(value).strip() for key, value in sections.items()}


def split_subsections(section_text: str) -> list[dict[str, str]]:
    blocks: list[dict[str, str]] = []
    current_title: str | None = None
    current_lines: list[str] = []

    def flush() -> None:
        nonlocal current_title, current_lines
        if current_title is None:
            return
        blocks.append({"title": current_title.strip(), "text": "\n".join(current_lines).strip()})

    for line in section_text.splitlines():
        match = SUBHEADING_RE.match(line.strip())
        if match:
            flush()
            current_title = match.group(1).strip()
            current_lines = []
        else:
            if current_title is not None:
                current_lines.append(line)

    flush()
    return blocks


def volume_number(title: str, fallback: int) -> int:
    digit = re.search(r"(\d+)", title)
    if digit:
        return int(digit.group(1))
    cn = re.search(r"卷\s*([一二三四五六七八九十]{1,3})", title)
    if cn:
        return CN_NUMS.get(cn.group(1), fallback)
    return fallback


def split_volumes(section_text: str) -> dict[int, dict[str, str]]:
    result: dict[int, dict[str, str]] = {}
    for order, block in enumerate(split_subsections(section_text), start=1):
        number = volume_number(block["title"], order)
        result[number] = block
    return result


def tags_from_meta(meta: dict[str, str]) -> list[str]:
    return [tag.strip() for tag in meta.get("tags", "").split(",") if tag.strip()]


def int_from_meta(meta: dict[str, str], key: str, fallback: int | None = None) -> int | None:
    value = meta.get(key, "").strip()
    if not value:
        return fallback
    try:
        return int(value)
    except ValueError:
        return fallback


def title_from_meta(meta: dict[str, str]) -> dict[str, str]:
    return {
        "ru": meta.get("title_ru", ""),
        "en": meta.get("title_en", ""),
        "zh": meta.get("title_zh", ""),
    }


def languages_from_text(text_by_lang: dict[str, str] | None = None, volumes: list[dict[str, Any]] | None = None) -> list[str]:
    found: list[str] = []
    for lang in LANGS:
        has_text = False
        if text_by_lang and str(text_by_lang.get(lang, "")).strip():
            has_text = True
        if volumes and any(str(volume.get("text", {}).get(lang, "")).strip() for volume in volumes):
            has_text = True
        if has_text:
            found.append(lang)
    return found or LANGS


def is_placeholder_note(text: str) -> bool:
    cleaned = re.sub(r"\s+", " ", text.strip().lower())
    if not cleaned:
        return True
    placeholder_markers = [
        "сюда можно писать",
        "общий комментарий по всей",
        "связи с персонажами",
        "подозрительные формулировки",
        "заметка к первому тому",
        "заметка ко второму тому",
        "заметка к третьему тому",
        "заметки пока не заполнены",
    ]
    return any(marker in cleaned for marker in placeholder_markers)


def strip_markdown_heading(line: str) -> str:
    return re.sub(r"^#{1,6}\s*", "", line).strip()


def parse_notes(notes_text: str) -> dict[str, Any]:
    """Parse ## NOTES into public notes.

    Supported structure:
    ### Общие заметки Лороведьмы
    text...

    ### Заметки по томам
    #### Том 1
    text...
    #### Том 2
    text...

    Placeholder text from templates is ignored.
    """
    cleaned = notes_text.strip()
    if not cleaned or is_placeholder_note(cleaned):
        return {"general": "", "byVolume": {}}

    general_lines: list[str] = []
    by_volume: dict[str, str] = {}
    current_volume: str | None = None
    current_lines: list[str] = []
    in_general_block = False

    def flush_volume() -> None:
        nonlocal current_volume, current_lines
        if current_volume is None:
            return
        text = "\n".join(line.rstrip() for line in current_lines).strip()
        if text and not is_placeholder_note(text):
            by_volume[current_volume] = text
        current_volume = None
        current_lines = []

    for raw_line in cleaned.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()

        vol_heading = re.match(r"^#{3,6}\s*(?:Том|Vol\.?|卷)\s*([0-9一二三四五六七八九十]{1,3})", stripped, re.IGNORECASE)
        if vol_heading:
            flush_volume()
            value = vol_heading.group(1)
            current_volume = str(CN_NUMS.get(value, int(value) if value.isdigit() else value))
            in_general_block = False
            continue

        heading = re.match(r"^#{3,6}\s+(.+?)\s*$", stripped)
        if heading:
            flush_volume()
            title = heading.group(1).strip().lower()
            in_general_block = any(word in title for word in ["общ", "general"])
            # Headings like "Заметки по томам" are structural and not public text.
            continue

        if current_volume is not None:
            current_lines.append(line)
        else:
            # Keep text outside structural headings as general notes.
            # If a general block heading was present, collect its body too.
            if stripped or in_general_block:
                general_lines.append(line)

    flush_volume()

    general = "\n".join(line.rstrip() for line in general_lines).strip()
    if is_placeholder_note(general):
        general = ""

    return {"general": general, "byVolume": by_volume}


def normalized_book_subtype(meta: dict[str, str]) -> str:
    value = (meta.get("subtype") or meta.get("book_type") or "book_series").strip()
    return value if value in BOOK_SUBTYPES else "book_series"


def build_book(path: Path) -> dict[str, Any]:
    meta, body = parse_meta_and_body(read_text(path))
    sections = split_top_sections(body)
    book_id = meta.get("id") or slug_from_path(path)

    per_lang = {lang: split_volumes(sections.get(label, "")) for label, lang in LANG_HEADERS.items()}
    all_numbers = sorted({number for volumes in per_lang.values() for number in volumes.keys()})

    # If this is a one-page note without ### blocks, treat the whole language section as volume 1.
    if not all_numbers and any(sections.get(label, "").strip() for label in LANG_HEADERS):
        all_numbers = [1]
        for label, lang in LANG_HEADERS.items():
            text = sections.get(label, "").strip()
            if text:
                per_lang[lang][1] = {"title": {"ru": "Текст", "en": "Text", "zh": "文本"}.get(lang, "Текст"), "text": text}

    volumes: list[dict[str, Any]] = []
    for number in all_numbers:
        volumes.append({
            "number": number,
            "title": {
                "ru": per_lang["ru"].get(number, {}).get("title") or f"Том {number}",
                "en": per_lang["en"].get(number, {}).get("title") or f"Vol. {number}",
                "zh": per_lang["zh"].get(number, {}).get("title") or f"卷{number}",
            },
            "text": {
                "ru": per_lang["ru"].get(number, {}).get("text", ""),
                "en": per_lang["en"].get(number, {}).get("text", ""),
                "zh": per_lang["zh"].get(number, {}).get("text", ""),
            },
        })

    subtype = normalized_book_subtype(meta)
    return {
        "id": book_id,
        "category": "books",
        "subtype": subtype,
        "book_type": subtype,
        "icon": meta.get("icon", "").strip(),
        "title": title_from_meta(meta),
        "region": meta.get("region", ""),
        "volume_count": int_from_meta(meta, "volume_count", len(volumes) or 1),
        "tags": tags_from_meta(meta),
        "languages": languages_from_text(volumes=volumes),
        "volumes": volumes,
        "notes": parse_notes(sections.get("NOTES", "")),
        "public_credit": "Оригинальный игровой текст: Genshin Impact",
        "rights_note": "Genshin Impact и оригинальные материалы принадлежат HoYoverse / COGNOSPHERE / miHoYo. Заметки и разборы — Лороведьме.",
    }


def artifact_part_key(title: str, fallback_index: int) -> str:
    lower = title.lower()
    for key, hints in ARTIFACT_PART_HINTS.items():
        if any(hint.lower() in lower for hint in hints):
            return key
    if 0 <= fallback_index < len(ARTIFACT_PART_KEYS):
        return ARTIFACT_PART_KEYS[fallback_index]
    return f"part_{fallback_index + 1}"


def build_artifact(path: Path) -> dict[str, Any]:
    meta, body = parse_meta_and_body(read_text(path))
    sections = split_top_sections(body)
    artifact_id = meta.get("id") or slug_from_path(path)

    blocks_by_lang = {lang: split_subsections(sections.get(label, "")) for label, lang in LANG_HEADERS.items()}
    keys: list[str] = []
    for blocks in blocks_by_lang.values():
        for index, block in enumerate(blocks):
            key = artifact_part_key(block["title"], index)
            if key not in keys:
                keys.append(key)

    parts: list[dict[str, Any]] = []
    for index, key in enumerate(keys):
        part = {"key": key, "title": {}, "text": {}}
        for lang in LANGS:
            block = blocks_by_lang[lang][index] if index < len(blocks_by_lang[lang]) else None
            part["title"][lang] = block["title"] if block else ""
            part["text"][lang] = block["text"] if block else ""
        parts.append(part)

    text_by_lang = {lang: sections.get(label, "").strip() for label, lang in LANG_HEADERS.items()}
    if parts:
        text_by_lang = {
            lang: "\n\n".join(
                f"{part['title'].get(lang) or part['key']}\n{part['text'].get(lang, '')}".strip()
                for part in parts if part["text"].get(lang)
            )
            for lang in LANGS
        }

    return {
        "id": artifact_id,
        "category": "artifacts",
        "icon": meta.get("icon", "").strip(),
        "title": title_from_meta(meta),
        "region": meta.get("region", ""),
        "piece_count": int_from_meta(meta, "piece_count", len(parts) or 5),
        "tags": tags_from_meta(meta),
        "languages": languages_from_text(text_by_lang=text_by_lang),
        "parts": parts,
        "text": text_by_lang,
        "notes": parse_notes(sections.get("NOTES", "")),
    }


def normalized_weapon_type(meta: dict[str, str]) -> str:
    value = (meta.get("weapon_type") or meta.get("type") or "").strip()
    return value if value in WEAPON_TYPES else value


def normalized_item_group(meta: dict[str, str]) -> str:
    value = (meta.get("item_group") or meta.get("group") or meta.get("subtype") or "misc").strip()
    return value if value in ITEM_GROUPS else "misc"


def build_generic(path: Path, category: str) -> dict[str, Any]:
    meta, body = parse_meta_and_body(read_text(path))
    sections = split_top_sections(body)
    entry_id = meta.get("id") or slug_from_path(path)
    text_by_lang = {lang: sections.get(label, "").strip() for label, lang in LANG_HEADERS.items()}

    entry: dict[str, Any] = {
        "id": entry_id,
        "category": category,
        "icon": meta.get("icon", "").strip(),
        "title": title_from_meta(meta),
        "region": meta.get("region", ""),
        "rarity": int_from_meta(meta, "rarity", None),
        "tags": tags_from_meta(meta),
        "languages": languages_from_text(text_by_lang=text_by_lang),
        "text": text_by_lang,
        "description": text_by_lang,
        "notes": parse_notes(sections.get("NOTES", "")),
    }

    if category == "weapons":
        entry["weapon_type"] = normalized_weapon_type(meta)
        entry["type"] = entry["weapon_type"]
    if category == "items":
        entry["item_group"] = normalized_item_group(meta)

    return entry


def index_book(book: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": book["id"],
        "category": "books",
        "subtype": book.get("subtype", "book_series"),
        "book_type": book.get("book_type", "book_series"),
        "icon": book.get("icon", ""),
        "title": book.get("title", {}),
        "region": book.get("region", ""),
        "volume_count": book.get("volume_count", 1),
        "tags": book.get("tags", []),
        "languages": book.get("languages", LANGS),
    }


def index_artifact(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item["id"],
        "category": "artifacts",
        "icon": item.get("icon", ""),
        "title": item.get("title", {}),
        "region": item.get("region", ""),
        "piece_count": item.get("piece_count", 5),
        "tags": item.get("tags", []),
        "languages": item.get("languages", LANGS),
    }


def index_weapon(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item["id"],
        "category": "weapons",
        "icon": item.get("icon", ""),
        "title": item.get("title", {}),
        "weapon_type": item.get("weapon_type", ""),
        "type": item.get("weapon_type", ""),
        "rarity": item.get("rarity"),
        "tags": item.get("tags", []),
        "languages": item.get("languages", LANGS),
    }


def index_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item["id"],
        "category": "items",
        "icon": item.get("icon", ""),
        "title": item.get("title", {}),
        "region": item.get("region", ""),
        "item_group": item.get("item_group", "misc"),
        "tags": item.get("tags", []),
        "languages": item.get("languages", LANGS),
    }


def build_collection(
    name: str,
    builder,
    indexer,
) -> list[dict[str, Any]]:
    source_dir = CONTENT_DIR / name
    detail_dir = DATA_DIR / name
    source_dir.mkdir(parents=True, exist_ok=True)
    clean_json_dir(detail_dir)

    entries: list[dict[str, Any]] = []
    for md_file in sorted(source_dir.glob("*.md")):
        entry = builder(md_file)
        entries.append(entry)
        write_json(detail_dir / f"{entry['id']}.json", entry)

    index = [indexer(entry) for entry in entries]
    write_json(DATA_DIR / f"{name}_index.json", index)
    return entries


def build() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    books = build_collection("books", build_book, index_book)
    artifacts = build_collection("artifacts", build_artifact, index_artifact)
    weapons = build_collection("weapons", lambda path: build_generic(path, "weapons"), index_weapon)
    items = build_collection("items", lambda path: build_generic(path, "items"), index_item)

    summary = {
        "books": len(books),
        "artifacts": len(artifacts),
        "weapons": len(weapons),
        "items": len(items),
    }
    write_json(DATA_DIR / "archive_summary.json", summary)
    print("Built archive data:", summary)


if __name__ == "__main__":
    build()
