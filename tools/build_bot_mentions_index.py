#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
LANGS = ("ru", "en", "zh")

PUBLIC_SECTIONS = ("books", "artifacts", "weapons", "items", "stories")

SECTION_META = {
    "books": {"emoji": "📖", "type_label": "Книга"},
    "artifacts": {"emoji": "🏺", "type_label": "Артефакт"},
    "weapons": {"emoji": "⚔️", "type_label": "Оружие"},
    "items": {"emoji": "🎒", "type_label": "Предмет"},
    "stories": {"emoji": "👤", "type_label": "История"},
}

# Generic artifact slot names are deliberately excluded from mention names.
# “Цветок жизни” / “Flower of Life” appears in many sets and would make the bot noisy.
ARTIFACT_SLOT_NAMES = {
    "цветок жизни", "flower of life", "生之花",
    "перо смерти", "plume of death", "死之羽",
    "пески времени", "sands of eon", "时之沙",
    "кубок пространства", "goblet of eonothem", "空之杯",
    "корона разума", "circlet of logos", "理之冠",
}


GENERIC_WEAPON_TAGS = {
    # generic category/type tags; they should not create “сигна X” aliases
    "оружие", "weapon", "weapons", "武器",
    "меч", "одноручное", "одноручный", "одноручный меч", "sword", "single handed sword", "one handed sword", "单手剑",
    "двуручное", "двуручный", "двуручный меч", "клеймор", "claymore", "two handed sword", "双手剑",
    "древковое", "древковый", "древковое оружие", "копье", "копьё", "polearm", "长柄武器",
    "лук", "bow", "弓",
    "катализатор", "catalyst", "法器",
    "5", "4", "3", "2", "1",
    # broad regions/factions that are not signature owners
    "мондштадт", "монд", "mondstadt",
    "ли юэ", "лиюэ", "liyue", "li yue",
    "инадзума", "inazuma",
    "сумеру", "sumeru",
    "фонтейн", "fontaine",
    "натлан", "natlan",
    "снежная", "snezhnaya",
    "каэнриах", "кхаенриах", "khaenri'ah", "khaenriah",
    "фатуй", "фатуи", "fatui",
}

SIGNATURE_TAG_PREFIXES = (
    "сигна:", "сигна=", "сигна ",
    "сигнатурка:", "сигнатурка=", "сигнатурка ",
    "signature:", "signature=", "signature ",
    "bis:", "bis=", "bis ",
)

TITLE_LABEL_RE = re.compile(
    r"^\s*\*\*\s*(?:Название|Name|名称)\s*[:：]\s*\*\*\s*(.+?)\s*$",
    re.IGNORECASE | re.MULTILINE,
)


def read_json(path: Path, fallback: Any = None) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")


def normalize(text: str) -> str:
    text = str(text or "").lower().replace("ё", "е")
    text = re.sub(r"[«»“”„'\"`´]", " ", text)
    text = re.sub(r"[^\w\s\-А-Яа-яЁё一-龥ぁ-んァ-ンー]", " ", text, flags=re.UNICODE)
    text = re.sub(r"[_\-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def split_title_variants(value: str) -> list[str]:
    value = str(value or "").strip()
    if not value:
        return []
    result = [value]
    # Item indexes often store material chains as “A / B / C”.
    for sep in (" / ", " /", "/ ", "/", " | ", "|"):
        if sep in value:
            result.extend(part.strip() for part in value.split(sep) if part.strip())
    return result


def unique_nonempty(values: list[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw in values:
        value = str(raw or "").strip()
        if not value:
            continue
        key = normalize(value)
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def title_values(value: Any) -> list[str]:
    values: list[str] = []
    if isinstance(value, dict):
        for lang in LANGS:
            values.extend(title_values(value.get(lang)))
        for key, nested in value.items():
            if key not in LANGS:
                values.extend(title_values(nested))
    elif isinstance(value, list):
        for item in value:
            values.extend(title_values(item))
    elif isinstance(value, str):
        values.extend(split_title_variants(value))
    return unique_nonempty(values)


def primary_title(item: dict[str, Any]) -> str:
    title = item.get("title")
    if isinstance(title, dict):
        for lang in LANGS:
            value = str(title.get(lang) or "").strip()
            if value:
                return value
        for value in title.values():
            if isinstance(value, str) and value.strip():
                return value.strip()
    if isinstance(title, str) and title.strip():
        return title.strip()
    return str(item.get("id") or "Без названия")


def route_for(section: str, item: dict[str, Any]) -> str:
    item_id = str(item.get("id") or "").strip()
    if section == "items":
        group = str(item.get("item_group") or "misc").strip() or "misc"
        return f"#/items/{group}/{item_id}"
    if section == "stories":
        group = str(item.get("story_group") or item.get("category_type") or "world_stories").strip() or "world_stories"
        return f"#/stories/{group}/{item_id}"
    return f"#/{section}/{item_id}"


def composite_volume_names(item: dict[str, Any]) -> list[str]:
    title = item.get("title") if isinstance(item.get("title"), dict) else {}
    values: list[str] = []
    for volume in item.get("volumes") or []:
        if not isinstance(volume, dict):
            continue
        volume_title = volume.get("title") if isinstance(volume.get("title"), dict) else {}
        for lang in LANGS:
            base = str(title.get(lang) or "").strip()
            vol = str(volume_title.get(lang) or "").strip()
            if base and vol:
                # “Том 1” alone is too generic; “Сердце родника Том 1” is useful.
                values.append(f"{base} {vol}")
        if not isinstance(title, dict) or not isinstance(volume_title, dict):
            for base in title_values(item.get("title")):
                for vol in title_values(volume.get("title")):
                    values.append(f"{base} {vol}")
    return values


def extract_artifact_part_names(item: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for part in item.get("parts") or []:
        if not isinstance(part, dict):
            continue
        for text in (part.get("text") or {}).values() if isinstance(part.get("text"), dict) else []:
            match = TITLE_LABEL_RE.search(str(text or ""))
            if match:
                names.extend(split_title_variants(match.group(1)))
        # Keep explicit non-generic custom part titles if the data ever starts storing them in title.
        for value in title_values(part.get("title")):
            if normalize(value) not in ARTIFACT_SLOT_NAMES:
                names.append(value)
    return names


def tag_values(value: Any) -> list[str]:
    """Extract flat tag strings from current/future tag shapes."""
    values: list[str] = []
    if isinstance(value, dict):
        for nested in value.values():
            values.extend(tag_values(nested))
    elif isinstance(value, list):
        for item in value:
            values.extend(tag_values(item))
    elif isinstance(value, str):
        values.append(value)
    return unique_nonempty(values)


def explicit_signature_owners(tags: list[str]) -> list[str]:
    owners: list[str] = []
    for tag in tags:
        normalized = normalize(tag)
        raw = str(tag or "").strip()
        for prefix in SIGNATURE_TAG_PREFIXES:
            if normalized.startswith(normalize(prefix)):
                owner = raw[len(prefix):].strip(" :：=-—–")
                if owner:
                    owners.append(owner)
                break
    return unique_nonempty(owners)


def implicit_weapon_signature_owners(tags: list[str]) -> list[str]:
    """Treat non-generic weapon tags as signature owners.

    This makes a weapon tag like “Николь” generate safe aliases like
    “сигна Николь”, but it never turns the bare tag “Николь” into a passive
    trigger for the weapon.
    """
    owners: list[str] = []
    for tag in tags:
        normalized = normalize(tag)
        if not normalized:
            continue
        if normalized in GENERIC_WEAPON_TAGS:
            continue
        if any(normalized.startswith(normalize(prefix)) for prefix in SIGNATURE_TAG_PREFIXES):
            continue
        # Skip tags that are too broad or too short to be useful as owner names.
        if len(normalized) < 3:
            continue
        owners.append(str(tag).strip())
    return unique_nonempty(owners)


def signature_aliases_for_owner(owner: str) -> list[str]:
    owner = str(owner or "").strip()
    if not owner:
        return []
    return unique_nonempty([
        f"сигна {owner}",
        f"сигну {owner}",
        f"сигнатурка {owner}",
        f"сигнатурку {owner}",
        f"сигнатурное оружие {owner}",
        f"signature {owner}",
        f"bis {owner}",
    ])


def weapon_signature_aliases(item: dict[str, Any]) -> list[str]:
    tags = tag_values(item.get("tags"))
    owners = unique_nonempty(explicit_signature_owners(tags) + implicit_weapon_signature_owners(tags))
    aliases: list[str] = []
    for owner in owners:
        aliases.extend(signature_aliases_for_owner(owner))
    return unique_nonempty(aliases)


def item_material_names(item: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for material in item.get("materials") or []:
        if isinstance(material, dict):
            names.extend(title_values(material.get("title")))
    return names


def entry_names(section: str, item: dict[str, Any]) -> list[str]:
    names: list[str] = []
    names.extend(title_values(item.get("title")))
    names.extend(title_values(item.get("aliases")))

    if section == "books":
        names.extend(composite_volume_names(item))
    elif section == "artifacts":
        names.extend(extract_artifact_part_names(item))
    elif section == "items":
        names.extend(item_material_names(item))
    elif section == "weapons":
        # Safe tag-derived aliases, e.g. weapon tag “Николь” → “сигна Николь”.
        # Bare tags are not added as names to avoid noisy passive triggers.
        names.extend(weapon_signature_aliases(item))

    return unique_nonempty(names)


def load_detail_or_index(section: str, index_item: dict[str, Any]) -> dict[str, Any]:
    item_id = str(index_item.get("id") or "").strip()
    detail = read_json(DATA_DIR / section / f"{item_id}.json", None) if item_id else None
    if isinstance(detail, dict):
        # Preserve index-only runtime fields that may be absent in details.
        merged = dict(detail)
        for key in ("item_group", "story_group", "category_type"):
            if key not in merged and key in index_item:
                merged[key] = index_item[key]
        return merged
    return index_item


def build_entry(section: str, index_item: dict[str, Any]) -> dict[str, Any] | None:
    item_id = str(index_item.get("id") or "").strip()
    if not item_id:
        return None
    item = load_detail_or_index(section, index_item)
    meta = SECTION_META[section]
    title = primary_title(item)
    route = route_for(section, item)
    names = entry_names(section, item)
    if not names:
        names = [title]

    tags = tag_values(item.get("tags"))
    signature_aliases = weapon_signature_aliases(item) if section == "weapons" else []
    aliases = unique_nonempty(title_values(item.get("aliases")) + signature_aliases)

    return {
        "key": f"{section}:{item_id}",
        "section": section,
        "id": item_id,
        "type_label": meta["type_label"],
        "emoji": meta["emoji"],
        "title": item.get("title") or title,
        "primary_title": title,
        "route": route,
        "button_text": f"{meta['emoji']} {title}",
        "names": names,
        "aliases": aliases,
        "tags": tags,
        "signature_aliases": signature_aliases,
        "passive_aliases": signature_aliases,
    }


def build_bot_mentions_index() -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    source_counts: dict[str, int] = {}

    for section in PUBLIC_SECTIONS:
        index = read_json(DATA_DIR / f"{section}_index.json", [])
        if not isinstance(index, list):
            index = []
        source_counts[section] = len(index)
        for item in index:
            if not isinstance(item, dict):
                continue
            entry = build_entry(section, item)
            if entry is not None:
                entries.append(entry)

    entries.sort(key=lambda entry: (entry["section"], str(entry.get("primary_title") or "").casefold(), entry["id"]))
    digest_source = json.dumps(entries, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(digest_source.encode("utf-8")).hexdigest()[:12]

    return {
        "schema_version": 1,
        "version": f"bot_mentions:{digest}",
        "generated_by": "tools/build_bot_mentions_index.py",
        "description": "Compact mention index for Alter Lunna Telegram bot. Contains names and routes only; no full archive texts.",
        "public_sections": list(PUBLIC_SECTIONS),
        "source_counts": source_counts,
        "entry_count": len(entries),
        "entries": entries,
    }


def main() -> int:
    index = build_bot_mentions_index()
    write_json(DATA_DIR / "bot_mentions_index.json", index)
    counts = ", ".join(f"{key}: {value}" for key, value in index["source_counts"].items())
    print(f"Built bot mention index: {index['entry_count']} entries ({counts}), version {index['version']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
