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
    "flower": ["цветок", "цветок жизни", "flower", "flower of life", "生之花"],
    "plume": ["перо", "перо смерти", "plume", "plume of death", "feather", "死之羽"],
    "sands": ["часы", "пески", "пески времени", "sands", "sands of eon", "timepiece", "时之沙"],
    "goblet": ["кубок", "кубок пространства", "goblet", "goblet of eonothem", "cup", "空之杯"],
    "circlet": ["корона", "корона разума", "circlet", "circlet of logos", "crown", "理之冠"],
}

ARTIFACT_PART_LABELS = {
    "flower": {"ru": "Цветок жизни", "en": "Flower of Life", "zh": "生之花"},
    "plume": {"ru": "Перо смерти", "en": "Plume of Death", "zh": "死之羽"},
    "sands": {"ru": "Пески времени", "en": "Sands of Eon", "zh": "时之沙"},
    "goblet": {"ru": "Кубок пространства", "en": "Goblet of Eonothem", "zh": "空之杯"},
    "circlet": {"ru": "Корона разума", "en": "Circlet of Logos", "zh": "理之冠"},
}

ITEM_GROUPS = {
    "weekly_bosses", "world_bosses", "common_enemies", "development_materials",
    "teyvat_resources", "food_potions", "useful_items", "misc",
}

DEVELOPMENT_MATERIAL_TYPES = {
    "talents": {"ru": "Таланты", "en": "Talents", "zh": "天赋"},
    "character_ascension": {"ru": "Возвышение персонажа", "en": "Character Ascension", "zh": "角色突破"},
    "weapon_ascension": {"ru": "Возвышение оружия", "en": "Weapon Ascension", "zh": "武器突破"},
}


ITEM_TYPE_DEFINITIONS = {
    "teyvat_resources": {
        "ore": {"ru": "Руда", "en": "Ore", "zh": "矿石"},
        "local_specialty": {"ru": "Диковинка", "en": "Local Specialty", "zh": "区域特产"},
        "plant": {"ru": "Растение", "en": "Plant", "zh": "植物"},
        "animal": {"ru": "Животное", "en": "Animal", "zh": "动物"},
    },
    "food_potions": {
        "food": {"ru": "Еда", "en": "Food", "zh": "食物"},
        "potion": {"ru": "Зелье", "en": "Potion", "zh": "药剂"},
    },
    "useful_items": {
        "tool": {"ru": "Инструмент", "en": "Tool", "zh": "道具"},
        "seelie": {"ru": "Фея", "en": "Seelie", "zh": "仙灵"},
        "equipment": {"ru": "Снаряжение", "en": "Equipment", "zh": "装备"},
    },
    "misc": {
        "misc": {"ru": "Прочее", "en": "Miscellaneous", "zh": "其他"},
    },
}

COMMON_ENEMY_TYPE_ALIASES = {
    "hilichurl": "hilichurls",
    "hilichurls": "hilichurls",
    "hiliсhurls": "hilichurls",
    "elemental": "elementals",
    "elementals": "elementals",
    "slime": "elementals",
    "slimes": "elementals",
    "fatui": "fatui",
    "automaton": "automatons",
    "automatons": "automatons",
    "ruin_machine": "automatons",
    "ruin_machines": "automatons",
    "ruin_guard": "automatons",
    "ruin_guards": "automatons",
    "human": "human_factions",
    "humans": "human_factions",
    "human_faction": "human_factions",
    "human_factions": "human_factions",
    "other_human_factions": "human_factions",
    "abyss": "abyss",
    "abyss_order": "abyss",
    "beast": "mystical_beasts",
    "beasts": "mystical_beasts",
    "mystic_beasts": "mystical_beasts",
    "mystical_beast": "mystical_beasts",
    "mystical_beasts": "mystical_beasts",
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
    body_start: int | None = None

    for i, line in enumerate(lines):
        if body_start is None and line.startswith("## "):
            body_start = i
        match = META_RE.match(line)
        if match:
            meta[match.group(1).strip()] = match.group(2).strip()

    if body_start is None:
        body_start = len(lines)

    return meta, "\n".join(lines[body_start:])

def split_top_sections(body: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {}
    current: str | None = None

    for line in body.splitlines():
        stripped = line.strip()
        header = re.match(r"^##\s+(.+?)\s*$", stripped)
        if header:
            name = header.group(1).strip().upper()
            if name in LANG_HEADERS or name in {"NOTES", "INTERNAL"}:
                current = name
                sections.setdefault(current, [])
                if sections[current]:
                    sections[current].append("")
                continue
        if current:
            if META_RE.match(line) or stripped == "---":
                continue
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


def text_before_subsections(section_text: str) -> str:
    """Return the intro text before the first ### subsection.

    For enemy drop entries this intro is the boss/enemy description.
    The ### subsections remain material descriptions.
    """
    lines: list[str] = []
    for line in section_text.splitlines():
        if SUBHEADING_RE.match(line.strip()):
            break
        lines.append(line)
    return "\n".join(lines).strip()


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


def game_version_from_meta(meta: dict[str, str]) -> str:
    """Return the hidden Genshin release version used for default catalog sorting.

    Stored as a string because Genshin versions are semantic-ish values:
    5.10 must sort after 5.9, so the client parses it by numeric parts.
    Empty/unknown values are allowed and are sorted below real versions.
    """
    value = (meta.get("game_version") or meta.get("release_version") or "").strip()
    if not value:
        return ""
    value = value.replace(",", ".")
    if value.lower() in {"unknown", "неизвестно", "none", "null", "-", "—"}:
        return ""
    return value


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


def languages_from_enemy_entry(text_by_lang: dict[str, str], materials: list[dict[str, Any]]) -> list[str]:
    found: list[str] = []
    for lang in LANGS:
        has_description = bool(str(text_by_lang.get(lang, "")).strip())
        has_material_text = any(str(material.get("text", {}).get(lang, "")).strip() for material in materials)
        if has_description or has_material_text:
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
        "общий комментарий по сету",
        "кому посвящён",
        "кому посвящен",
        "связи с регионом/персонажами/событиями",
        "связи с регионом персонажами событиями",
        "заметка к цветку",
        "заметка к перу",
        "заметка к часам",
        "заметка к кубку",
        "заметка к короне",
        "заметки пока не заполнены",
        "здесь можно написать общий комментарий",
        "заметка к первому материалу",
        "заметка ко второму материалу",
        "заметка к третьему материалу",
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



def artifact_note_key_from_heading(title: str) -> str | None:
    lower = title.strip().lower()
    for key, hints in ARTIFACT_PART_HINTS.items():
        if any(hint.lower() in lower for hint in hints):
            return key
    return None


def parse_artifact_notes(notes_text: str) -> dict[str, Any]:
    """Parse ## NOTES for artifact sets.

    Supported structure:
    ### Общие заметки Лороведьмы
    text...

    ### Заметки по частям
    #### Цветок жизни
    text...
    #### Перо смерти
    text...
    """
    cleaned = notes_text.strip()
    if not cleaned or is_placeholder_note(cleaned):
        return {"general": "", "byPart": {}}

    general_lines: list[str] = []
    by_part: dict[str, str] = {}
    current_part: str | None = None
    current_lines: list[str] = []
    in_general_block = False

    def flush_part() -> None:
        nonlocal current_part, current_lines
        if current_part is None:
            return
        text = "\n".join(line.rstrip() for line in current_lines).strip()
        if text and not is_placeholder_note(text):
            by_part[current_part] = text
        current_part = None
        current_lines = []

    for raw_line in cleaned.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()

        heading = re.match(r"^#{3,6}\s+(.+?)\s*$", stripped)
        if heading:
            title = heading.group(1).strip()
            key = artifact_note_key_from_heading(title)
            if key:
                flush_part()
                current_part = key
                in_general_block = False
                continue

            flush_part()
            title_lower = title.lower()
            in_general_block = any(word in title_lower for word in ["общ", "general"])
            # Structural headings like "Заметки по частям" are not public text.
            continue

        if current_part is not None:
            current_lines.append(line)
        else:
            if stripped or in_general_block:
                general_lines.append(line)

    flush_part()

    general = "\n".join(line.rstrip() for line in general_lines).strip()
    if is_placeholder_note(general):
        general = ""

    return {"general": general, "byPart": by_part}


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
        "game_version": game_version_from_meta(meta),
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
    maps_by_lang: dict[str, dict[str, dict[str, str]]] = {lang: {} for lang in LANGS}

    for lang in LANGS:
        for index, block in enumerate(blocks_by_lang[lang]):
            key = artifact_part_key(block["title"], index)
            maps_by_lang[lang][key] = block

    keys = [key for key in ARTIFACT_PART_KEYS if any(key in maps_by_lang[lang] for lang in LANGS)]
    for lang in LANGS:
        for key in maps_by_lang[lang]:
            if key not in keys:
                keys.append(key)

    parts: list[dict[str, Any]] = []
    for key in keys:
        labels = ARTIFACT_PART_LABELS.get(key, {"ru": key, "en": key, "zh": key})
        part = {"key": key, "title": dict(labels), "text": {}}
        for lang in LANGS:
            block = maps_by_lang[lang].get(key)
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
        "game_version": game_version_from_meta(meta),
        "tags": tags_from_meta(meta),
        "languages": languages_from_text(text_by_lang=text_by_lang),
        "parts": parts,
        "text": text_by_lang,
        "notes": parse_artifact_notes(sections.get("NOTES", "")),
    }

def normalized_weapon_type(meta: dict[str, str]) -> str:
    value = (meta.get("weapon_type") or meta.get("type") or "").strip()
    return value if value in WEAPON_TYPES else value


def normalized_item_group(meta: dict[str, str]) -> str:
    value = (meta.get("item_group") or meta.get("group") or meta.get("subtype") or "misc").strip()
    return value if value in ITEM_GROUPS else "misc"


def normalized_material_type(meta: dict[str, str]) -> str:
    value = (meta.get("material_type") or meta.get("type") or "talents").strip()
    return value if value in DEVELOPMENT_MATERIAL_TYPES else "talents"


def material_type_title_from_meta(meta: dict[str, str]) -> dict[str, str]:
    key = normalized_material_type(meta)
    defaults = DEVELOPMENT_MATERIAL_TYPES.get(key, DEVELOPMENT_MATERIAL_TYPES["talents"])
    return {
        "ru": meta.get("material_type_ru") or defaults["ru"],
        "en": meta.get("material_type_en") or defaults["en"],
        "zh": meta.get("material_type_zh") or defaults["zh"],
    }


def normalized_generic_item_type(item_group: str, meta: dict[str, str]) -> str:
    definitions = ITEM_TYPE_DEFINITIONS.get(item_group, {})
    value = (meta.get("item_type") or meta.get("type") or "").strip()
    if value in definitions:
        return value
    return next(iter(definitions), "")


def generic_item_type_title_from_meta(item_group: str, meta: dict[str, str]) -> dict[str, str]:
    key = normalized_generic_item_type(item_group, meta)
    defaults = ITEM_TYPE_DEFINITIONS.get(item_group, {}).get(key, {"ru": "", "en": "", "zh": ""})
    return {
        "ru": meta.get("item_type_ru") or defaults.get("ru", ""),
        "en": meta.get("item_type_en") or defaults.get("en", ""),
        "zh": meta.get("item_type_zh") or defaults.get("zh", ""),
    }




def material_index_keys(meta: dict[str, str]) -> list[int]:
    indexes: set[int] = set()
    for key in meta:
        match = re.match(r"material_(\d+)_(?:id|ru|en|zh|icon)$", key)
        if match:
            indexes.add(int(match.group(1)))
    return sorted(indexes)


def normalize_material_key(value: str, fallback: str) -> str:
    value = value.strip().lower()
    if value:
        value = re.sub(r"[^a-z0-9_\-]+", "_", value).strip("_")
    return value or fallback


def comma_list_from_meta(meta: dict[str, str], key: str) -> list[str]:
    return [
        value.strip()
        for value in meta.get(key, "").split(",")
        if value.strip()
    ]


def typed_subsection_key(title: str, prefix: str) -> str | None:
    match = re.match(rf"^{re.escape(prefix)}\s*:\s*([a-zA-Z0-9_\-]+)\s*$", title.strip(), re.IGNORECASE)
    if not match:
        return None
    return normalize_material_key(match.group(1), match.group(1))


def material_title_match(title: str, material: dict[str, Any]) -> bool:
    title_clean = re.sub(r"\s+", " ", title.strip().lower())
    if not title_clean:
        return False
    candidates = [material.get("key", "")]
    candidates.extend(str(material.get("title", {}).get(lang, "")) for lang in LANGS)
    for candidate in candidates:
        candidate_clean = re.sub(r"\s+", " ", str(candidate).strip().lower())
        if candidate_clean and (candidate_clean == title_clean or candidate_clean in title_clean or title_clean in candidate_clean):
            return True
    return False


def parse_enemy_materials(meta: dict[str, str], sections: dict[str, str]) -> list[dict[str, Any]]:
    materials: list[dict[str, Any]] = []
    for number in material_index_keys(meta):
        fallback_key = f"material_{number}"
        key = normalize_material_key(meta.get(f"material_{number}_id", ""), fallback_key)
        materials.append({
            "key": key,
            "title": {
                "ru": meta.get(f"material_{number}_ru", ""),
                "en": meta.get(f"material_{number}_en", ""),
                "zh": meta.get(f"material_{number}_zh", ""),
            },
            "icon": meta.get(f"material_{number}_icon", "").strip(),
            "text": {"ru": "", "en": "", "zh": ""},
        })

    for label, lang in LANG_HEADERS.items():
        blocks = split_subsections(sections.get(label, ""))
        material_order = 0

        for block in blocks:
            typed_material_key = typed_subsection_key(block["title"], "material")
            typed_enemy_key = typed_subsection_key(block["title"], "enemy")

            if typed_enemy_key:
                continue

            target: dict[str, Any] | None = None

            if typed_material_key:
                for material in materials:
                    if material.get("key") == typed_material_key:
                        target = material
                        break
            else:
                for material in materials:
                    if material_title_match(block["title"], material):
                        target = material
                        break
                if target is None and material_order < len(materials):
                    target = materials[material_order]
                material_order += 1

            if target is not None:
                target["text"][lang] = block["text"]

    return materials


def item_entry_type(meta: dict[str, str]) -> str:
    value = (meta.get("entry_type") or "").strip()
    if value:
        return value

    legacy_value = (meta.get("item_type") or "").strip()
    if legacy_value in {"item", "enemy_drops", "material_set"}:
        return legacy_value

    return "item"


def build_enemy(path: Path) -> dict[str, Any]:
    meta, body = parse_meta_and_body(read_text(path))
    sections = split_top_sections(body)
    enemy_id = normalize_material_key(meta.get("id", ""), slug_from_path(path))
    text_by_lang = {lang: sections.get(label, "").strip() for label, lang in LANG_HEADERS.items()}

    return {
        "id": enemy_id,
        "category": "enemies",
        "enemy_group": meta.get("enemy_group", "").strip(),
        "enemy_type": meta.get("enemy_type", "").strip(),
        "icon": meta.get("icon", "").strip(),
        "title": title_from_meta(meta),
        "region": meta.get("region", ""),
        "game_version": game_version_from_meta(meta),
        "tags": tags_from_meta(meta),
        "languages": languages_from_text(text_by_lang=text_by_lang),
        "text": text_by_lang,
        "description": text_by_lang,
        "drops": [],
        "notes": parse_notes(sections.get("NOTES", "")),
    }


def build_generic(path: Path, category: str) -> dict[str, Any]:
    meta, body = parse_meta_and_body(read_text(path))
    sections = split_top_sections(body)
    entry_id = meta.get("id") or slug_from_path(path)

    entry_type = item_entry_type(meta) if category == "items" else "entry"
    is_material_group = category == "items" and entry_type in {"enemy_drops", "material_set"}
    materials = parse_enemy_materials(meta, sections) if is_material_group else []

    full_text_by_lang = {lang: sections.get(label, "").strip() for label, lang in LANG_HEADERS.items()}
    if is_material_group:
        text_by_lang = {lang: text_before_subsections(sections.get(label, "")) for label, lang in LANG_HEADERS.items()}
        languages = languages_from_enemy_entry(text_by_lang, materials)
    else:
        text_by_lang = full_text_by_lang
        languages = languages_from_text(text_by_lang=text_by_lang)

    entry: dict[str, Any] = {
        "id": entry_id,
        "category": category,
        "icon": meta.get("icon", "").strip(),
        "title": title_from_meta(meta),
        "region": meta.get("region", ""),
        "rarity": int_from_meta(meta, "rarity", None),
        "game_version": game_version_from_meta(meta),
        "tags": tags_from_meta(meta),
        "languages": languages,
        "text": text_by_lang,
        "description": text_by_lang,
        "notes": parse_notes(sections.get("NOTES", "")),
    }

    dropped_by = comma_list_from_meta(meta, "dropped_by")
    item_group = normalized_item_group(meta) if category == "items" else ""
    if category == "items" and item_group == "common_enemies" and dropped_by:
        entry["dropped_by"] = dropped_by
        entry["dropped_by_enemies"] = []
        entry["dropped_by_count"] = len(dropped_by)

    if category == "weapons":
        entry["weapon_type"] = normalized_weapon_type(meta)
        entry["type"] = entry["weapon_type"]
    if category == "items":
        entry["item_group"] = normalized_item_group(meta)
        entry["entry_type"] = entry_type

        if entry["item_group"] == "development_materials":
            entry["material_type"] = normalized_material_type(meta)
            entry["material_type_title"] = material_type_title_from_meta(meta)

        if entry["item_group"] in ITEM_TYPE_DEFINITIONS:
            entry["item_type"] = normalized_generic_item_type(entry["item_group"], meta)
            entry["item_type_title"] = generic_item_type_title_from_meta(entry["item_group"], meta)

        if materials:
            entry["materials"] = materials
            entry["material_count"] = len(materials)
            entry["languages"] = languages

    return entry


def iter_search_parts(value: Any):
    if value is None:
        return
    if isinstance(value, str):
        text = value.strip()
        if text:
            yield text
        return
    if isinstance(value, (int, float)):
        yield str(value)
        return
    if isinstance(value, dict):
        for item in value.values():
            yield from iter_search_parts(item)
        return
    if isinstance(value, (list, tuple, set)):
        for item in value:
            yield from iter_search_parts(item)
        return


def make_search_text(*values: Any) -> str:
    parts: list[str] = []
    seen: set[str] = set()
    for value in values:
        for part in iter_search_parts(value):
            normalized = re.sub(r"\s+", " ", part).strip().casefold()
            if normalized and normalized not in seen:
                seen.add(normalized)
                parts.append(normalized)
    return " ".join(parts)


def game_version_sort_value(value: Any) -> int:
    text = str(value or "").strip().replace(",", ".")
    if not text:
        return -1
    parts = re.findall(r"\d+", text)
    if not parts:
        return -1
    major = int(parts[0]) if len(parts) > 0 else 0
    minor = int(parts[1]) if len(parts) > 1 else 0
    patch = int(parts[2]) if len(parts) > 2 else 0
    return major * 1_000_000 + minor * 1_000 + patch


def region_filter_values(value: Any) -> list[str]:
    return [part.strip() for part in str(value or "").split(",") if part.strip()]


def normalize_common_enemy_type(value: Any) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")
    return COMMON_ENEMY_TYPE_ALIASES.get(key, key)


def common_enemy_type_keys_from_enemies(enemies: list[dict[str, Any]]) -> list[str]:
    keys = {
        normalize_common_enemy_type(enemy.get("enemy_group", ""))
        for enemy in enemies
        if normalize_common_enemy_type(enemy.get("enemy_group", ""))
    }
    return sorted(keys)


def item_filter_type(item: dict[str, Any]) -> str:
    if item.get("item_group") == "development_materials":
        return str(item.get("material_type") or "talents")
    if item.get("item_group") in ITEM_TYPE_DEFINITIONS:
        return str(item.get("item_type") or "")
    return ""


def index_runtime_fields(item: dict[str, Any], filter_type: Any = "") -> dict[str, Any]:
    return {
        "filter_regions": region_filter_values(item.get("region", "")),
        "filter_type": str(filter_type or ""),
        "sort_version": game_version_sort_value(item.get("game_version", "")),
    }



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
        "game_version": book.get("game_version", ""),
        "tags": book.get("tags", []),
        "languages": book.get("languages", LANGS),
        **index_runtime_fields(book, book.get("book_type") or book.get("subtype") or "book_series"),
        "search_text": make_search_text(
            book.get("title", {}),
            book.get("region", ""),
            book.get("subtype", ""),
            book.get("book_type", ""),
            book.get("game_version", ""),
            book.get("tags", []),
            [volume.get("title", {}) for volume in book.get("volumes", [])],
        ),
    }


def index_artifact(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item["id"],
        "category": "artifacts",
        "icon": item.get("icon", ""),
        "title": item.get("title", {}),
        "region": item.get("region", ""),
        "piece_count": item.get("piece_count", 5),
        "game_version": item.get("game_version", ""),
        "tags": item.get("tags", []),
        "languages": item.get("languages", LANGS),
        **index_runtime_fields(item),
        "search_text": make_search_text(
            item.get("title", {}),
            item.get("region", ""),
            item.get("game_version", ""),
            item.get("tags", []),
            [part.get("title", {}) for part in item.get("parts", [])],
        ),
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
        "game_version": item.get("game_version", ""),
        "tags": item.get("tags", []),
        "languages": item.get("languages", LANGS),
        **index_runtime_fields(item, str(item.get("rarity") or "")),
        "search_text": make_search_text(
            item.get("title", {}),
            item.get("weapon_type", ""),
            item.get("type", ""),
            item.get("rarity", ""),
            item.get("game_version", ""),
            item.get("tags", []),
        ),
    }


def index_enemy(enemy: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": enemy["id"],
        "category": "enemies",
        "enemy_group": enemy.get("enemy_group", ""),
        "enemy_type": enemy.get("enemy_type", ""),
        "icon": enemy.get("icon", ""),
        "title": enemy.get("title", {}),
        "region": enemy.get("region", ""),
        "game_version": enemy.get("game_version", ""),
        "tags": enemy.get("tags", []),
        "languages": enemy.get("languages", LANGS),
        "drop_count": len(enemy.get("drops", [])),
        "enemy_type_keys": [normalize_common_enemy_type(enemy.get("enemy_group", ""))] if normalize_common_enemy_type(enemy.get("enemy_group", "")) else [],
        **index_runtime_fields(enemy, normalize_common_enemy_type(enemy.get("enemy_group", ""))),
        "search_text": make_search_text(
            enemy.get("title", {}),
            enemy.get("enemy_group", ""),
            enemy.get("enemy_type", ""),
            enemy.get("region", ""),
            enemy.get("game_version", ""),
            enemy.get("tags", []),
            enemy.get("description", {}),
            [drop.get("title", {}) for drop in enemy.get("drops", [])],
        ),
    }


def index_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item["id"],
        "category": "items",
        "icon": item.get("icon", ""),
        "title": item.get("title", {}),
        "region": item.get("region", ""),
        "game_version": item.get("game_version", ""),
        "item_group": item.get("item_group", "misc"),
        "entry_type": item.get("entry_type", "item"),
        "item_type": item.get("item_type", ""),
        "item_type_title": item.get("item_type_title", {}),
        "material_type": item.get("material_type", ""),
        "material_type_title": item.get("material_type_title", {}),
        "materials": [
            {
                "key": material.get("key", ""),
                "title": material.get("title", {}),
                "icon": material.get("icon", ""),
            }
            for material in item.get("materials", [])
        ],
        "material_count": item.get("material_count", len(item.get("materials", []))),
        "dropped_by": item.get("dropped_by", []),
        "dropped_by_enemies": [
            {
                "id": enemy.get("id", ""),
                "title": enemy.get("title", {}),
                "icon": enemy.get("icon", ""),
                "enemy_group": enemy.get("enemy_group", ""),
            }
            for enemy in item.get("dropped_by_enemies", [])
        ],
        "dropped_by_count": item.get("dropped_by_count", len(item.get("dropped_by_enemies", []))),
        "tags": item.get("tags", []),
        "languages": item.get("languages", LANGS),
        "enemy_type_keys": common_enemy_type_keys_from_enemies(item.get("dropped_by_enemies", [])),
        **index_runtime_fields(item, item_filter_type(item)),
        "search_text": make_search_text(
            item.get("title", {}),
            item.get("region", ""),
            item.get("game_version", ""),
            item.get("item_group", ""),
            item.get("entry_type", ""),
            item.get("material_type", ""),
            item.get("material_type_title", {}),
            item.get("item_type", ""),
            item.get("item_type_title", {}),
            item.get("tags", []),
            item.get("description", {}),
            item.get("dropped_by", []),
            [enemy.get("title", {}) for enemy in item.get("dropped_by_enemies", [])],
            [material.get("key", "") for material in item.get("materials", [])],
            [material.get("title", {}) for material in item.get("materials", [])],
            [material.get("text", {}) for material in item.get("materials", [])],
        ),
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
    for md_file in sorted(source_dir.rglob("*.md")):
        entry = builder(md_file)
        entries.append(entry)
        write_json(detail_dir / f"{entry['id']}.json", entry)

    index = [indexer(entry) for entry in entries]
    write_json(DATA_DIR / f"{name}_index.json", index)
    return entries


def write_collection_data(name: str, entries: list[dict[str, Any]], indexer) -> None:
    detail_dir = DATA_DIR / name
    detail_dir.mkdir(parents=True, exist_ok=True)
    clean_json_dir(detail_dir)

    for entry in entries:
        write_json(detail_dir / f"{entry['id']}.json", entry)

    write_json(DATA_DIR / f"{name}_index.json", [indexer(entry) for entry in entries])


def brief_enemy(enemy: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": enemy.get("id", ""),
        "title": enemy.get("title", {}),
        "icon": enemy.get("icon", ""),
        "enemy_group": enemy.get("enemy_group", ""),
        "region": enemy.get("region", ""),
        "game_version": enemy.get("game_version", ""),
        "languages": enemy.get("languages", LANGS),
        "text": enemy.get("text", {}),
        "description": enemy.get("description", {}),
        "drops": enemy.get("drops", []),
    }


def brief_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item.get("id", ""),
        "title": item.get("title", {}),
        "icon": item.get("icon", ""),
        "item_group": item.get("item_group", ""),
        "entry_type": item.get("entry_type", ""),
        "game_version": item.get("game_version", ""),
        "materials": [
            {
                "key": material.get("key", ""),
                "title": material.get("title", {}),
                "icon": material.get("icon", ""),
            }
            for material in item.get("materials", [])
        ],
        "material_count": item.get("material_count", len(item.get("materials", []))),
    }


def build_items(enemies: list[dict[str, Any]]) -> list[dict[str, Any]]:
    source_dir = CONTENT_DIR / "items"
    source_dir.mkdir(parents=True, exist_ok=True)

    items = [build_generic(md_file, "items") for md_file in sorted(source_dir.rglob("*.md"))]
    enemies_by_id = {enemy.get("id"): enemy for enemy in enemies if enemy.get("id")}

    enemy_to_items: dict[str, list[dict[str, Any]]] = {enemy_id: [] for enemy_id in enemies_by_id}

    for item in items:
        if item.get("item_group") != "common_enemies":
            continue

        for enemy_id in item.get("dropped_by", []):
            if enemy_id in enemies_by_id:
                enemy_to_items.setdefault(enemy_id, []).append(brief_item(item))

    for enemy in enemies:
        enemy["drops"] = enemy_to_items.get(enemy.get("id"), [])

    for item in items:
        if item.get("item_group") != "common_enemies":
            item.pop("dropped_by", None)
            item.pop("dropped_by_enemies", None)
            item.pop("dropped_by_count", None)
            continue

        enemies_for_item: list[dict[str, Any]] = []
        for enemy_id in item.get("dropped_by", []):
            enemy = enemies_by_id.get(enemy_id)
            if enemy:
                enemies_for_item.append(brief_enemy(enemy))
        if enemies_for_item:
            item["dropped_by_enemies"] = enemies_for_item
            item["dropped_by_count"] = len(enemies_for_item)

    write_collection_data("items", items, index_item)
    return items


def build() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    books = build_collection("books", build_book, index_book)
    artifacts = build_collection("artifacts", build_artifact, index_artifact)
    weapons = build_collection("weapons", lambda path: build_generic(path, "weapons"), index_weapon)
    enemy_source_dir = CONTENT_DIR / "enemies" / "common_enemies"
    enemy_source_dir.mkdir(parents=True, exist_ok=True)
    enemies = [build_enemy(md_file) for md_file in sorted(enemy_source_dir.rglob("*.md"))]

    items = build_items(enemies)

    # Hidden enemy reference is intentionally limited to common_enemies.
    # Output stays in data/enemies/<enemy_id>.json for simple client-side lookup.
    write_collection_data("enemies", enemies, index_enemy)

    summary = {
        "books": len(books),
        "artifacts": len(artifacts),
        "weapons": len(weapons),
        "items": len(items),
        "enemies": len(enemies),
    }
    write_json(DATA_DIR / "archive_summary.json", summary)
    print("Built archive data:", summary)


if __name__ == "__main__":
    build()
