#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
LANGS = ("ru", "en", "zh")

PUBLIC_SECTIONS = ("books", "artifacts", "weapons", "items", "stories")

SECTION_META = {
    "books": {"emoji": "📖", "type_label": "Книга", "intent": "book"},
    "artifacts": {"emoji": "🏺", "type_label": "Артефакт", "intent": "artifact"},
    "weapons": {"emoji": "⚔️", "type_label": "Оружие", "intent": "weapon"},
    "items": {"emoji": "🎒", "type_label": "Предмет", "intent": "item"},
    "stories": {"emoji": "👤", "type_label": "История", "intent": "story"},
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

# Terms from tags/titles that are useful as filters on the site but too broad for
# “show me everything related to X” bot search.
GENERIC_RELATED_TERMS = {
    *GENERIC_WEAPON_TAGS,
    *ARTIFACT_SLOT_NAMES,
    "книга", "книги", "book", "books", "故事", "书籍",
    "артефакт", "артефакты", "сет артефактов", "artifact", "artifacts",
    "предмет", "предметы", "item", "items",
    "история", "истории", "story", "stories", "character_stories", "world_stories",
    "материал", "материалы", "material", "materials",
    "common", "rare", "epic", "legendary",
    "ru", "en", "zh", "electro", "geo", "anemo", "hydro", "pyro", "cryo", "dendro",
}

GENERIC_TRIGGER_WORDS = {
    "и", "а", "но", "или", "в", "во", "на", "о", "об", "от", "до", "из", "за", "по", "к", "ко", "с", "со", "у", "для",
    "the", "a", "an", "and", "of", "in", "on", "to", "for", "with",
    "том", "vol", "volume", "часть", "глава", "история", "stories",
}

RU_ENDINGS = sorted(
    [
        "иями", "ями", "ами", "ого", "ему", "ому", "ыми", "ими", "его", "ая", "яя", "ое", "ее", "ые", "ие",
        "ой", "ей", "ую", "юю", "ам", "ям", "ах", "ях", "ов", "ев", "ом", "ем", "ою", "ею",
        "а", "я", "ы", "и", "у", "ю", "е", "о",
    ],
    key=len,
    reverse=True,
)

SIGNATURE_TAG_PREFIXES = (
    "сигна:", "сигна=", "сигна ",
    "сигнатурка:", "сигнатурка=", "сигнатурка ",
    "signature:", "signature=", "signature ",
    "bis:", "bis=", "bis ",
)

SIGNATURE_INTENT_WORDS = ("сигна", "сигну", "сигнатурка", "сигнатурку", "сигнатурное оружие", "signature", "bis")
STORY_INTENT_WORDS = ("история", "историю", "лор", "биография", "story", "lore")
BOOK_INTENT_WORDS = ("книга", "книгу", "том", "book")
ARTIFACT_INTENT_WORDS = ("артефакт", "артефакты", "сет", "artifact")
ITEM_INTENT_WORDS = ("предмет", "материал", "материалы", "дроп", "item", "material")
WEAPON_INTENT_WORDS = ("оружие", "пушка", "меч", "лук", "копье", "копьё", "катализатор", "weapon")

TITLE_LABEL_RE = re.compile(
    r"^\s*\*\*\s*(?:Название|Name|名称)\s*[:：]\s*\*\*\s*(.+?)\s*$",
    re.IGNORECASE | re.MULTILINE,
)
WORD_RE = re.compile(r"[\wА-Яа-яЁё一-龥ぁ-んァ-ンー]+", re.UNICODE)


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


def text_tokens(text: str) -> list[str]:
    return WORD_RE.findall(normalize(text))


def loose_token(token: str) -> str:
    token = normalize(token)
    if not token:
        return token
    if re.search(r"[а-я]", token) and len(token) >= 5:
        for ending in RU_ENDINGS:
            if token.endswith(ending) and len(token) - len(ending) >= 4:
                return token[: -len(ending)]
    return token


def normalized_variants(text: str) -> list[str]:
    """Small lookup-friendly set: exact normalized phrase + loose single-token form.

    The bot can still do richer fuzzy matching, but these variants are enough for
    instant dictionary hits like “Флинса” → “флинс” when a query is tokenized.
    """
    norm = normalize(text)
    variants = [norm] if norm else []
    tokens = text_tokens(norm)
    if len(tokens) == 1:
        loose = loose_token(tokens[0])
        if loose and loose != norm:
            variants.append(loose)
    elif tokens:
        loose_phrase = " ".join(loose_token(token) or token for token in tokens)
        if loose_phrase and loose_phrase != norm:
            variants.append(loose_phrase)
    return unique_nonempty(variants)


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


def unique_by_norm(values: list[Any]) -> list[str]:
    return unique_nonempty(values)


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


def is_useful_related_term(value: str) -> bool:
    norm = normalize(value)
    if not norm:
        return False
    if norm in GENERIC_RELATED_TERMS or norm in GENERIC_TRIGGER_WORDS:
        return False
    if norm.isdigit():
        return False
    # Single latin/cyrillic words with 1-2 letters are usually noise; CJK names can be short.
    if len(norm) < 3 and not re.search(r"[一-龥]", norm):
        return False
    return True


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
        if not is_useful_related_term(tag):
            continue
        owners.append(str(tag).strip())
    return unique_nonempty(owners)


def ru_name_case_variants(name: str) -> list[str]:
    """Small practical variants for Russian character/entity names.

    This is intentionally conservative. It is not a full morphology engine; it
    only gives the bot ready phrases like “сигны Флинса” and “истории Флинса”
    without forcing Alter to guess cases at runtime.
    """
    name = str(name or "").strip()
    if not name:
        return []

    variants = [name]
    # Only auto-inflect the last token and only for Cyrillic-looking names.
    parts = name.split()
    last = parts[-1] if parts else name
    if not re.search(r"[А-Яа-яЁё]", last):
        return unique_nonempty(variants)

    lower = last.lower().replace("ё", "е")
    stem = last[:-1]
    genitive = ""
    instrumental = ""

    if lower.endswith(("а",)) and len(last) > 2:
        genitive = stem + "ы"
        instrumental = stem + "ой"
    elif lower.endswith(("я",)) and len(last) > 2:
        genitive = stem + "и"
        instrumental = stem + "ей"
    elif lower.endswith(("й", "ь")) and len(last) > 2:
        genitive = stem + "я"
        instrumental = stem + "ем"
    elif re.search(r"[бвгджзклмнпрстфхцчшщ]$", lower) and len(last) > 2:
        genitive = last + "а"
        instrumental = last + "ом"

    for form in (genitive, instrumental):
        if form and form != last:
            variants.append(" ".join([*parts[:-1], form]))

    return unique_nonempty(variants)


def signature_aliases_for_owner(owner: str) -> list[str]:
    owner = str(owner or "").strip()
    if not owner:
        return []

    aliases: list[str] = []
    for owner_form in ru_name_case_variants(owner):
        aliases.extend([
            f"сигна {owner_form}",
            f"сигну {owner_form}",
            f"сигны {owner_form}",
            f"сигне {owner_form}",
            f"сигнатурка {owner_form}",
            f"сигнатурку {owner_form}",
            f"сигнатурки {owner_form}",
            f"сигнатурке {owner_form}",
            f"сигнатурное оружие {owner_form}",
            f"сигнатурного оружия {owner_form}",
            f"описание сигны {owner_form}",
            f"описании сигны {owner_form}",
            f"signature {owner_form}",
            f"bis {owner_form}",
        ])
    return unique_nonempty(aliases)


def story_context_aliases_for_entity(entity: str) -> list[str]:
    entity = str(entity or "").strip()
    if not entity:
        return []

    aliases: list[str] = []
    for entity_form in ru_name_case_variants(entity):
        aliases.extend([
            f"история {entity_form}",
            f"истории {entity_form}",
            f"историю {entity_form}",
            f"история персонажа {entity_form}",
            f"истории персонажа {entity_form}",
            f"лор {entity_form}",
            f"лоре {entity_form}",
            f"биография {entity_form}",
            f"story {entity_form}",
            f"lore {entity_form}",
        ])
    return unique_nonempty(aliases)


def weapon_type_context_words(item: dict[str, Any]) -> list[str]:
    """Type-specific weapon words for contextual passive mentions.

    These are intentionally derived from the weapon's own tags, so phrases like
    “копьё Флинса” are generated only for polearms and not for every signature
    weapon in the index.
    """
    tags = {normalize(tag) for tag in tag_values(item.get("tags"))}
    words: list[str] = []

    def has_any(*needles: str) -> bool:
        normalized_needles = [normalize(needle) for needle in needles]
        return any(
            tag == needle or needle in tag.split()
            for tag in tags
            for needle in normalized_needles
        )

    if has_any("древковое", "древковый", "древковое оружие", "копье", "копьё", "polearm", "长柄武器"):
        words.extend(["копье", "копьё", "копья", "копью", "копьем", "копьём", "древковое оружие", "древкового оружия"])
    if has_any("меч", "одноручное", "одноручный", "одноручный меч", "sword", "single handed sword", "one handed sword", "单手剑"):
        words.extend(["меч", "меча", "мечу", "одноручный меч", "одноручного меча"])
    if has_any("двуручное", "двуручный", "двуручный меч", "клеймор", "claymore", "two handed sword", "双手剑"):
        words.extend(["двуруч", "двуручник", "двуручный меч", "двуручного меча", "клеймор", "клеймора"])
    if has_any("лук", "bow", "弓"):
        words.extend(["лук", "лука", "луку"])
    if has_any("катализатор", "catalyst", "法器"):
        words.extend(["катализатор", "катализатора", "катализатору"])

    return unique_nonempty(words)


def weapon_context_aliases_for_owner(owner: str, item: dict[str, Any]) -> list[str]:
    """Contextual phrases such as “копьё Флинса” / “оружие Флинса”."""
    owner = str(owner or "").strip()
    if not owner:
        return []

    aliases: list[str] = []
    base_words = ["оружие", "оружия", "пушка", "пушки"]
    for owner_form in ru_name_case_variants(owner):
        for weapon_word in unique_nonempty([*base_words, *weapon_type_context_words(item)]):
            aliases.append(f"{weapon_word} {owner_form}")
            aliases.append(f"описание {weapon_word} {owner_form}")
            aliases.append(f"описании {weapon_word} {owner_form}")
    return unique_nonempty(aliases)


def signature_owner_names(item: dict[str, Any]) -> list[str]:
    tags = tag_values(item.get("tags"))
    return unique_nonempty(explicit_signature_owners(tags) + implicit_weapon_signature_owners(tags))


def weapon_signature_aliases(item: dict[str, Any]) -> list[str]:
    aliases: list[str] = []
    for owner in signature_owner_names(item):
        aliases.extend(signature_aliases_for_owner(owner))
        aliases.extend(weapon_context_aliases_for_owner(owner, item))
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
        for key in (
            "item_group", "story_group", "category_type", "search_text", "filter_regions",
            "filter_type", "sort_version", "weapon_type", "type", "rarity", "game_version",
        ):
            if key not in merged and key in index_item:
                merged[key] = index_item[key]
        return merged
    return index_item


def collect_text_blob(value: Any, *, include_keys: bool = False) -> str:
    """Flatten generated detail JSON into a scan-only string.

    The text is used while building related_terms and is not written to the bot
    index, so the bot receives compact relations without full archive texts.
    """
    parts: list[str] = []
    if isinstance(value, dict):
        for key, nested in value.items():
            if include_keys:
                parts.append(str(key))
            parts.append(collect_text_blob(nested, include_keys=include_keys))
    elif isinstance(value, list):
        for nested in value:
            parts.append(collect_text_blob(nested, include_keys=include_keys))
    elif isinstance(value, str):
        parts.append(value)
    elif value is not None and not isinstance(value, (int, float, bool)):
        parts.append(str(value))
    return "\n".join(part for part in parts if part)


def contains_entity_term(blob_norm: str, blob_tokens_loose: set[str], term: str) -> bool:
    norm = normalize(term)
    if not norm:
        return False
    # CJK text does not use spaces; direct substring is useful there.
    if re.search(r"[一-龥]", norm):
        return norm in blob_norm
    tokens = text_tokens(norm)
    if not tokens:
        return False
    if len(tokens) == 1:
        return (loose_token(tokens[0]) or tokens[0]) in blob_tokens_loose
    return f" {norm} " in f" {blob_norm} "


def add_lookup(lookup: dict[str, list[str]], term: str, key: str) -> None:
    for norm in normalized_variants(term):
        if not norm:
            continue
        bucket = lookup.setdefault(norm, [])
        if key not in bucket:
            bucket.append(key)


def passive_phrase_variants(name: str) -> list[str]:
    """Build conservative passive triggers from a title/alias.

    Full names are always included. For long titles we also add a short 2-word
    prefix, so “Маленькая ведьма и вечное пламя” can be mentioned as
    “маленькая ведьма”. Single-word prefixes are never generated.
    """
    norm = normalize(name)
    if not norm:
        return []

    variants = [norm]
    tokens = text_tokens(norm)
    if len(tokens) >= 4:
        prefix2 = tokens[:2]
        if (
            sum(len(t) for t in prefix2) >= 9
            and prefix2[0] not in GENERIC_TRIGGER_WORDS
            and prefix2[-1] not in GENERIC_TRIGGER_WORDS
        ):
            variants.append(" ".join(prefix2))

    return unique_nonempty(variants)


def intent_aliases_for(section: str, item: dict[str, Any], related_terms: list[str], signature_owners: list[str]) -> dict[str, list[str]]:
    titles = title_values(item.get("title")) or [primary_title(item)]
    aliases: dict[str, list[str]] = defaultdict(list)

    if section == "weapons":
        for owner in signature_owners:
            aliases["signature"].extend(signature_aliases_for_owner(owner))
        for title in titles:
            for word in WEAPON_INTENT_WORDS:
                aliases["weapon"].append(f"{word} {title}")
    elif section == "stories":
        for term in unique_nonempty([*titles, *related_terms]):
            for word in STORY_INTENT_WORDS:
                aliases["story"].append(f"{word} {term}")
    elif section == "books":
        for title in titles:
            for word in BOOK_INTENT_WORDS:
                aliases["book"].append(f"{word} {title}")
    elif section == "artifacts":
        for title in titles:
            for word in ARTIFACT_INTENT_WORDS:
                aliases["artifact"].append(f"{word} {title}")
    elif section == "items":
        for title in titles:
            for word in ITEM_INTENT_WORDS:
                aliases["item"].append(f"{word} {title}")

    return {key: unique_nonempty(value) for key, value in aliases.items() if unique_nonempty(value)}


def entry_priority(section: str, item: dict[str, Any]) -> int:
    if section == "stories" and str(item.get("story_group") or item.get("category_type") or "") == "character_stories":
        return 95
    if section == "weapons":
        return 88
    if section == "artifacts":
        return 78
    if section == "books":
        return 72
    if section == "items":
        return 68
    return 50


def relation_source_priority(source: str) -> int:
    return {
        "self_title": 100,
        "signature_owner": 96,
        "tag": 82,
        "text_mention": 60,
    }.get(source, 50)


def build_raw_records() -> tuple[list[dict[str, Any]], dict[str, int]]:
    records: list[dict[str, Any]] = []
    source_counts: dict[str, int] = {}

    for section in PUBLIC_SECTIONS:
        index = read_json(DATA_DIR / f"{section}_index.json", [])
        if not isinstance(index, list):
            index = []
        source_counts[section] = len(index)
        for index_item in index:
            if not isinstance(index_item, dict):
                continue
            item_id = str(index_item.get("id") or "").strip()
            if not item_id:
                continue
            item = load_detail_or_index(section, index_item)
            records.append({
                "key": f"{section}:{item_id}",
                "section": section,
                "id": item_id,
                "item": item,
            })

    return records, source_counts


def collect_entity_terms(records: list[dict[str, Any]]) -> dict[str, str]:
    """Known entity names that can create related search links.

    Character story titles are the main entity source. Non-generic tags are also
    included because custom tags often name owners/characters/factions.
    """
    by_norm: dict[str, str] = {}

    for record in records:
        section = record["section"]
        item = record["item"]
        candidates: list[str] = []
        if section == "stories" and str(item.get("story_group") or item.get("category_type") or "") == "character_stories":
            candidates.extend(title_values(item.get("title")))
            candidates.extend(title_values(item.get("aliases")))
        # Do not use every archive tag as a global text-scan entity: tags like
        # “gold”, “freedom” or “justice” occur in many English texts and create
        # noisy “related” clouds. Character names and weapon signature owners are
        # the safe high-value entities. Original tags still stay on their own
        # entries as active-search terms.
        if section == "weapons":
            candidates.extend(signature_owner_names(item))

        for term in unique_nonempty(candidates):
            if not is_useful_related_term(term):
                continue
            norm = normalize(term)
            # Prefer the shortest readable canonical for the same normalized key.
            old = by_norm.get(norm)
            if old is None or len(term) < len(old):
                by_norm[norm] = term

    return by_norm


def related_terms_for_record(record: dict[str, Any], entity_terms: dict[str, str]) -> tuple[list[str], list[dict[str, Any]]]:
    section = record["section"]
    item = record["item"]
    relations: dict[str, dict[str, Any]] = {}

    def add_relation(term: str, source: str) -> None:
        if not is_useful_related_term(term):
            return
        norm = normalize(term)
        if not norm:
            return
        old = relations.get(norm)
        priority = relation_source_priority(source)
        if old is None:
            relations[norm] = {"term": term, "normalized": norm, "sources": [source], "weight": priority}
        else:
            if source not in old["sources"]:
                old["sources"].append(source)
            old["weight"] = max(old["weight"], priority)

    # The page itself is always related to its own titles.
    for value in title_values(item.get("title")):
        add_relation(value, "self_title")
    for value in title_values(item.get("aliases")):
        add_relation(value, "self_title")

    # Tags are active-search relations, not passive mentions.
    for tag in tag_values(item.get("tags")):
        add_relation(tag, "tag")

    # Weapon signature owners are explicit high-value relations.
    signature_owners = signature_owner_names(item) if section == "weapons" else []
    for owner in signature_owners:
        add_relation(owner, "signature_owner")

    # Scan generated detail text for known entity names. We do this at build time
    # so Alter can later answer “/архив Флинс” by dictionary lookup, without
    # walking through full texts at runtime.
    blob_norm = normalize(collect_text_blob(item))
    blob_tokens_loose = {loose_token(token) or token for token in text_tokens(blob_norm)}
    for term in entity_terms.values():
        if contains_entity_term(blob_norm, blob_tokens_loose, term):
            add_relation(term, "text_mention")

    ordered = sorted(relations.values(), key=lambda rel: (-rel["weight"], rel["normalized"]))
    terms = [rel["term"] for rel in ordered]
    return unique_nonempty(terms), ordered


def build_entry(record: dict[str, Any], entity_terms: dict[str, str]) -> dict[str, Any] | None:
    section = record["section"]
    item_id = record["id"]
    item = record["item"]
    if not item_id:
        return None

    meta = SECTION_META[section]
    title = primary_title(item)
    route = route_for(section, item)
    names = entry_names(section, item)
    if not names:
        names = [title]

    source_tags = tag_values(item.get("tags"))
    signature_owners = signature_owner_names(item) if section == "weapons" else []
    signature_aliases = weapon_signature_aliases(item) if section == "weapons" else []
    related_terms, _related_matches = related_terms_for_record(record, entity_terms)

    # Current Alter reads `tags` as active-search-only terms and never uses them
    # for passive auto-links. Therefore `tags` intentionally includes compact
    # related terms so “/архив Флинс” can surface all relevant cards after a
    # bot-side update, while ordinary chat remains quiet.
    active_tags = unique_nonempty([*source_tags, *related_terms])
    contextual_passive_aliases: list[str] = []
    if section == "weapons":
        contextual_passive_aliases.extend(signature_aliases)
    elif section == "stories":
        # Do not make the bare character name a passive trigger. Instead, expose
        # context phrases such as “истории Флинса” / “лор Флинса”.
        for entity in unique_nonempty(title_values(item.get("title")) + title_values(item.get("aliases"))):
            contextual_passive_aliases.extend(story_context_aliases_for_entity(entity))

    aliases = unique_nonempty(title_values(item.get("aliases")) + signature_aliases)
    passive_aliases = unique_nonempty(contextual_passive_aliases)

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
        "priority": entry_priority(section, item),
        "names": names,
        "aliases": aliases,
        "source_tags": source_tags,
        "tags": active_tags,
        "related_terms": related_terms,
        "signature_owners": signature_owners,
        "signature_aliases": signature_aliases,
        "passive_aliases": passive_aliases,
    }


def build_lookup_maps(entries: list[dict[str, Any]]) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Compact runtime shortcuts for future Alter code.

    We intentionally do not serialize a full exact/alias lookup for every title:
    current Alter can still read the entries list, while future Alter can use
    these two small maps for the expensive cases.
    """
    related_lookup: dict[str, list[str]] = {}
    signature_lookup: dict[str, list[str]] = {}

    for entry in entries:
        key = str(entry["key"])
        for value in entry.get("related_terms") or []:
            add_lookup(related_lookup, value, key)
        for value in entry.get("signature_owners") or []:
            add_lookup(signature_lookup, value, key)

    return dict(sorted(related_lookup.items())), dict(sorted(signature_lookup.items()))


def should_use_name_as_passive_phrase(entry: dict[str, Any], phrase: str) -> bool:
    """Whether a page name/title is safe as a passive chat trigger.

    We deliberately skip one-word character story names here: “Флинс” alone is
    useful for active /архив search, but too broad for auto-linking in casual
    chat. Context phrases for stories live in passive_aliases instead, e.g.
    “истории Флинса”.
    """
    norm = normalize(phrase)
    tokens = text_tokens(norm)
    section = str(entry.get("section") or "")
    if section == "stories" and len(tokens) <= 1 and not re.search(r"[一-龥]", norm):
        return False
    return True


def build_mention_phrases(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Prebuilt safe passive phrases for a future lighter middleware.

    The rules are intentionally different from active /архив search:
    - bare related terms like “Флинс” are active-only;
    - contextual phrases like “истории Флинса” and “сигны Флинса” are passive;
    - full multi-word page names are passive, because they are specific enough.
    """
    phrases: dict[tuple[str, str], dict[str, Any]] = {}
    for entry in entries:
        key = str(entry["key"])
        phrase_sources = (
            ("name", entry.get("names") or [], False),
            ("passive_alias", entry.get("passive_aliases") or [], True),
        )
        for source, values, exact_only in phrase_sources:
            for original in values:
                if source == "name" and not should_use_name_as_passive_phrase(entry, str(original or "")):
                    continue
                for phrase in passive_phrase_variants(original):
                    if len(phrase) < 4:
                        continue
                    phrases[(phrase, key)] = {
                        "phrase": phrase,
                        "key": key,
                        "source": source,
                        "original": original,
                        "priority": int(entry.get("priority") or 50),
                        "exact_only": exact_only,
                    }

    return sorted(phrases.values(), key=lambda item: (-len(item["phrase"]), -item["priority"], item["phrase"], item["key"]))


def validation_report(
    entries: list[dict[str, Any]],
    related_lookup: dict[str, list[str]],
    signature_lookup: dict[str, list[str]],
    mention_phrases: list[dict[str, Any]],
) -> dict[str, Any]:
    section_counts = Counter(entry["section"] for entry in entries)
    signature_entry_count = sum(1 for entry in entries if entry.get("signature_aliases"))
    signature_alias_count = sum(len(entry.get("signature_aliases") or []) for entry in entries)
    related_count = sum(len(entry.get("related_terms") or []) for entry in entries)
    broken_entries = [entry["key"] for entry in entries if not entry.get("route") or not entry.get("primary_title")]

    noisy_related = {
        term: keys[:10]
        for term, keys in related_lookup.items()
        if len(keys) >= 25 and len(term) < 12
    }

    return {
        "section_counts": dict(sorted(section_counts.items())),
        "signature_entries": signature_entry_count,
        "signature_aliases": signature_alias_count,
        "related_terms": related_count,
        "related_lookup_terms": len(related_lookup),
        "signature_lookup_terms": len(signature_lookup),
        "mention_phrases": len(mention_phrases),
        "noisy_related_terms": len(noisy_related),
        "noisy_related_samples": list(sorted(noisy_related.keys()))[:10],
        "broken_entries": broken_entries,
    }


def build_bot_mentions_index() -> dict[str, Any]:
    records, source_counts = build_raw_records()
    entity_terms = collect_entity_terms(records)

    entries = [build_entry(record, entity_terms) for record in records]
    entries = [entry for entry in entries if entry is not None]
    entries.sort(key=lambda entry: (entry["section"], str(entry.get("primary_title") or "").casefold(), entry["id"]))

    related_lookup, signature_lookup = build_lookup_maps(entries)
    mention_phrases = build_mention_phrases(entries)
    report = validation_report(entries, related_lookup, signature_lookup, mention_phrases)

    digest_payload = {
        "entries": entries,
        "related_lookup": related_lookup,
        "signature_lookup": signature_lookup,
    }
    digest_source = json.dumps(digest_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(digest_source.encode("utf-8")).hexdigest()[:12]

    return {
        "schema_version": 2,
        "version": f"bot_mentions:{digest}",
        "generated_by": "tools/build_bot_mentions_index.py",
        "description": (
            "Compact search/mention index for Alter Lunna Telegram bot. "
            "Contains display data, contextual passive phrases, active-search relations and small prebuilt lookups; no full archive texts."
        ),
        "public_sections": list(PUBLIC_SECTIONS),
        "source_counts": source_counts,
        "entry_count": len(entries),
        "entries": entries,
        "related_lookup": related_lookup,
        "signature_lookup": signature_lookup,
        "mention_phrases": mention_phrases,
        "report": report,
    }


def main() -> int:
    index = build_bot_mentions_index()
    if index["entry_count"] == 0:
        counts = ", ".join(f"{key}: {value}" for key, value in index["source_counts"].items())
        raise RuntimeError(
            "Bot mention index is empty; existing data/bot_mentions_index.json was not overwritten "
            f"({counts}). Run tools/build_archive.py with a complete content/ tree first."
        )
    write_json(DATA_DIR / "bot_mentions_index.json", index)
    counts = ", ".join(f"{key}: {value}" for key, value in index["source_counts"].items())
    report = index["report"]
    print(f"Built bot mention index: {index['entry_count']} entries ({counts}), version {index['version']}")
    print(
        "Bot mention report: "
        f"signature_aliases={report['signature_aliases']}, "
        f"related_terms={report['related_terms']}, "
        f"related_lookup_terms={report['related_lookup_terms']}, "
        f"signature_lookup_terms={report['signature_lookup_terms']}, "
        f"mention_phrases={report['mention_phrases']}, "
        f"noisy_related_terms={report['noisy_related_terms']}, "
        f"broken_entries={len(report['broken_entries'])}"
    )
    if report["broken_entries"]:
        raise RuntimeError(f"Broken bot index entries: {report['broken_entries'][:20]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())