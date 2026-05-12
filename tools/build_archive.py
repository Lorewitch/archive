#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOOKS_DIR = ROOT / "content" / "books"
DATA_DIR = ROOT / "data"
BOOK_DATA_DIR = DATA_DIR / "books"

LANGS = ["ru", "en", "zh"]
LANG_HEADERS = {"RU": "ru", "EN": "en", "ZH": "zh"}
CN_NUMS = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
    "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
    "十一": 11, "十二": 12, "十三": 13, "十四": 14, "十五": 15,
    "十六": 16, "十七": 17, "十八": 18, "十九": 19, "二十": 20,
}


def parse_meta(text: str) -> tuple[dict, str]:
    meta: dict[str, str] = {}
    lines = text.splitlines()
    body_start = 0
    for i, line in enumerate(lines):
        if line.startswith("## "):
            body_start = i
            break
        match = re.match(r"^#\s*([a-zA-Z0-9_]+)\s*:\s*(.*)$", line)
        if match:
            meta[match.group(1).strip()] = match.group(2).strip()
    return meta, "\n".join(lines[body_start:])


def split_sections(body: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for line in body.splitlines():
        header = re.match(r"^##\s+([A-Z]+)\s*$", line.strip())
        if header and header.group(1) in LANG_HEADERS or (header and header.group(1) in {"NOTES", "INTERNAL"}):
            current = header.group(1)
            sections[current] = []
            continue
        if current:
            sections[current].append(line)
    return {key: "\n".join(value).strip() for key, value in sections.items()}


def volume_number(title: str, fallback: int) -> int:
    title = title.strip()
    digit = re.search(r"(\d+)", title)
    if digit:
        return int(digit.group(1))
    cn = re.search(r"卷\s*([一二三四五六七八九十]{1,3})", title)
    if cn:
        return CN_NUMS.get(cn.group(1), fallback)
    return fallback


def split_volumes(section_text: str, lang: str) -> dict[int, dict]:
    result: dict[int, dict] = {}
    current_title: str | None = None
    current_lines: list[str] = []
    order = 0

    def flush():
        nonlocal order, current_title, current_lines
        if current_title is None:
            return
        order += 1
        number = volume_number(current_title, order)
        result[number] = {
            "title": current_title.strip(),
            "text": "\n".join(current_lines).strip(),
        }

    for line in section_text.splitlines():
        match = re.match(r"^###\s+(.+?)\s*$", line.strip())
        if match:
            flush()
            current_title = match.group(1).strip()
            current_lines = []
        else:
            if current_title is not None:
                current_lines.append(line)
    flush()
    return result


def parse_notes(notes_text: str) -> dict:
    # Минимально сохраняем заметки как общий блок. При желании позже разделим по томам.
    cleaned = notes_text.strip()
    if not cleaned or "сюда можно писать" in cleaned.lower():
        return {"general": "", "byVolume": {}}
    return {"general": cleaned, "byVolume": {}}


def build_book(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    meta, body = parse_meta(text)
    sections = split_sections(body)
    book_id = meta.get("id") or path.stem.lower().replace(" ", "_")
    title = {
        "ru": meta.get("title_ru", ""),
        "en": meta.get("title_en", ""),
        "zh": meta.get("title_zh", ""),
    }

    per_lang = {lang: split_volumes(sections.get(label, ""), lang)
                for label, lang in LANG_HEADERS.items()}
    all_numbers = sorted({n for volumes in per_lang.values() for n in volumes.keys()})
    volumes = []
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
            }
        })

    languages = [lang for lang in LANGS if any(v["text"].get(lang) for v in volumes)]
    tags = [tag.strip() for tag in meta.get("tags", "").split(",") if tag.strip()]

    return {
        "id": book_id,
        "category": meta.get("category", "books"),
        "title": title,
        "region": meta.get("region", ""),
        "volume_count": int(meta.get("volume_count") or len(volumes) or 1),
        "tags": tags,
        "languages": languages,
        "volumes": volumes,
        "notes": parse_notes(sections.get("NOTES", "")),
        "public_credit": "Оригинальный игровой текст: Genshin Impact",
        "rights_note": "Genshin Impact и оригинальные материалы принадлежат HoYoverse / COGNOSPHERE / miHoYo. Заметки и разборы — Лороведьме.",
    }


def build() -> None:
    BOOK_DATA_DIR.mkdir(parents=True, exist_ok=True)
    books = []
    for md_file in sorted(BOOKS_DIR.glob("*.md")):
        book = build_book(md_file)
        books.append(book)
        (BOOK_DATA_DIR / f"{book['id']}.json").write_text(
            json.dumps(book, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    index = []
    for book in books:
        index.append({
            "id": book["id"],
            "category": book["category"],
            "title": book["title"],
            "region": book["region"],
            "volume_count": book["volume_count"],
            "tags": book["tags"],
            "languages": book["languages"],
        })

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "books_index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Built {len(books)} book(s).")


if __name__ == "__main__":
    build()
