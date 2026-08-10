#!/usr/bin/env python3
"""Collect release versions and quest relationships for the lore corpus.

The game IDs in the quest infoboxes are used as the primary join key.  Title
matching is only a fallback and is reported separately so ambiguous matches do
not silently create links.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
API_URL = "https://genshin-impact.fandom.com/api.php"
DEFAULT_CACHE = ROOT / "tmp" / "quest-metadata-cache"
DEFAULT_LORE_DIR = ROOT / "data" / "stories"
DEFAULT_OUTPUT = ROOT / "tmp" / "quest-metadata.json"

RELEASE_CATEGORY_NAMES = {
    **{
        f"{major}.{minor}": f"{major}.{minor}"
        for major, last_minor in ((1, 6), (2, 8), (3, 8), (4, 8), (5, 8))
        for minor in range(last_minor + 1)
    },
    **{
        f"6.{minor}": f"Luna {roman}"
        for minor, roman in enumerate(("I", "II", "III", "IV", "V", "VI", "VII", "VIII"))
    },
}

LUNA_VERSION_MAP = {
    "luna i": "6.0",
    "luna ii": "6.1",
    "luna iii": "6.2",
    "luna iv": "6.3",
    "luna v": "6.4",
    "luna vi": "6.5",
    "luna vii": "6.6",
    "luna viii": "6.7",
}

# Entries without a usable public infobox.  These are either technical event
# chapters or hidden one-step quests; each value was checked against its event,
# neighboring released quest IDs, or the page change history.
VERIFIED_VERSION_OVERRIDES = {
    **{f"quest_eq_{value}": "1.3" for value in range(10001, 10006)},
    "quest_eq_40016": "1.6",
    "quest_eq_40095": "3.2",
    "quest_eq_41121": "1.2",
    **{f"quest_eq_{value}": "1.2" for value in range(41141, 41161)},
    "quest_wq_10160": "4.2",
    "quest_wq_10244": "5.8",
    "quest_wq_70675": "3.7",
    "quest_wq_71653": "1.5",
    "quest_wq_73044": "3.0",
    "quest_wq_73046": "3.0",
    "quest_wq_76076": "6.0",
    "quest_wq_76087": "6.0",
    "quest_wq_76678": "6.1",
    "quest_wq_79056": "4.8",
    "quest_wq_79081": "4.8",
}


def write_json(path: Path, value: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(
        value,
        ensure_ascii=False,
        indent=None if compact else 2,
        separators=(",", ":") if compact else None,
    )
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(text, encoding="utf-8", newline="\n")
    temporary.replace(path)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def api_json(params: dict[str, str], *, attempts: int = 5) -> Any:
    encoded = urllib.parse.urlencode(params).encode("utf-8")
    request = urllib.request.Request(
        API_URL,
        data=encoded,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "LoreArchiveMetadata/1.0",
        },
    )
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(min(10, 1.5 * (attempt + 1)))
    raise RuntimeError(f"MediaWiki API error: {last_error}")


def batched(values: list[str], size: int) -> Iterable[list[str]]:
    for index in range(0, len(values), size):
        yield values[index:index + size]


def normalize_title(value: Any) -> str:
    text = str(value or "").replace("_", " ")
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = text.replace("’", "'").replace("‘", "'")
    text = re.sub(r"\s*\((?:quest|event quest|story quest)\)\s*$", "", text, flags=re.I)
    text = re.sub(r"\s*\(part\s+\d+\)\s*$", "", text, flags=re.I)
    text = re.sub(r"[^a-z0-9]+", " ", text.casefold())
    return " ".join(text.split())


def version_key(value: str) -> tuple[int, int, int]:
    parts = [int(part) for part in re.findall(r"\d+", value)]
    return tuple((parts + [0, 0, 0])[:3])


def normalize_version(value: str) -> str:
    prepared = " ".join(str(value or "").strip().casefold().split())
    if prepared in LUNA_VERSION_MAP:
        return LUNA_VERSION_MAP[prepared]
    match = re.search(r"\d+(?:\.\d+){1,2}", prepared)
    return match.group(0) if match else str(value or "").strip()


def fetch_quest_titles(cache_dir: Path, *, refresh: bool = False) -> list[str]:
    cache_path = cache_dir / "quest_titles.json"
    if cache_path.is_file() and not refresh:
        return [str(value) for value in read_json(cache_path)]

    titles: list[str] = []
    continuation = ""
    while True:
        params = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": "Category:Quests",
            "cmnamespace": "0",
            "cmlimit": "500",
            "format": "json",
            "formatversion": "2",
        }
        if continuation:
            params["cmcontinue"] = continuation
        payload = api_json(params)
        titles.extend(
            str(member.get("title") or "")
            for member in payload.get("query", {}).get("categorymembers", [])
            if member.get("title")
        )
        continuation = str(payload.get("continue", {}).get("cmcontinue") or "")
        if not continuation:
            break
    titles = sorted(set(titles), key=str.casefold)
    write_json(cache_path, titles, compact=True)
    return titles


def fetch_release_versions(cache_dir: Path, *, refresh: bool = False) -> dict[str, list[str]]:
    """Return page-title -> versions without MediaWiki's per-query category cap."""
    cache_path = cache_dir / "release_versions.json"
    if cache_path.is_file() and not refresh:
        value = read_json(cache_path)
        return {str(title): [str(version) for version in versions] for title, versions in value.items()}

    versions_by_title: dict[str, set[str]] = defaultdict(set)
    for version, category_suffix in RELEASE_CATEGORY_NAMES.items():
        continuation = ""
        while True:
            params = {
                "action": "query",
                "list": "categorymembers",
                "cmtitle": f"Category:Released in Version {category_suffix}",
                "cmnamespace": "0",
                "cmlimit": "500",
                "format": "json",
                "formatversion": "2",
            }
            if continuation:
                params["cmcontinue"] = continuation
            payload = api_json(params)
            for member in payload.get("query", {}).get("categorymembers", []):
                title = str(member.get("title") or "")
                if title:
                    versions_by_title[title].add(version)
            continuation = str(payload.get("continue", {}).get("cmcontinue") or "")
            if not continuation:
                break
        print(f"Категория версии: {version}")

    output = {
        title: sorted(versions, key=version_key)
        for title, versions in sorted(versions_by_title.items(), key=lambda item: item[0].casefold())
    }
    write_json(cache_path, output, compact=True)
    return output


def extract_template(text: str, template_name: str) -> str:
    start = text.casefold().find("{{" + template_name.casefold())
    if start < 0:
        return ""
    depth = 0
    index = start
    while index < len(text) - 1:
        token = text[index:index + 2]
        if token == "{{":
            depth += 1
            index += 2
            continue
        if token == "}}":
            depth -= 1
            index += 2
            if depth == 0:
                return text[start:index]
            continue
        index += 1
    return text[start:]


def template_fields(template: str) -> dict[str, str]:
    fields: dict[str, list[str]] = {}
    current = ""
    for line in template.splitlines()[1:]:
        match = re.match(r"^\s*\|\s*([A-Za-z0-9_]+)\s*=\s*(.*)$", line)
        if match:
            current = match.group(1)
            fields[current] = [match.group(2).strip()]
        elif current:
            fields[current].append(line.strip())
    return {key: "\n".join(value).strip() for key, value in fields.items()}


def clean_wiki_value(value: str) -> str:
    text = re.sub(r"<!--.*?-->", "", str(value or ""), flags=re.S)
    text = re.sub(r"<ref\b[^>]*>.*?</ref>|<ref\b[^>]*/>", "", text, flags=re.I | re.S)
    text = re.sub(r"\[\[([^]|#]+)(?:#[^]|]+)?(?:\|([^]]+))?\]\]", lambda match: match.group(2) or match.group(1), text)
    text = re.sub(r"\{\{[^{}]*\}\}", "", text)
    text = text.replace("'''", "").replace("''", "")
    return " ".join(text.split()).strip()


def relation_titles(value: str) -> list[str]:
    text = re.sub(r"<!--.*?-->", "", str(value or ""), flags=re.S)
    link_targets = [match.group(1).strip() for match in re.finditer(r"\[\[([^]|#]+)", text) if match.group(1).strip()]
    if link_targets:
        return list(dict.fromkeys(link_targets))
    text = re.sub(r"<br\s*/?>", ";", text, flags=re.I)
    output: list[str] = []
    for value_part in re.split(r"[;\n]+", text):
        prepared = clean_wiki_value(value_part)
        if prepared and prepared.casefold() not in {"n/a", "none", "—", "-"}:
            output.append(prepared)
    return list(dict.fromkeys(output))


def record_from_page(page: dict[str, Any]) -> dict[str, Any] | None:
    if page.get("missing"):
        return None
    title = str(page.get("title") or "")
    revision = (page.get("revisions") or [{}])[0]
    content = revision.get("slots", {}).get("main", {}).get("content", "")
    fields = template_fields(extract_template(content, "Quest Infobox"))
    if not fields:
        return None
    categories = [str(item.get("title") or "") for item in page.get("categories", [])]
    released = []
    for category in categories:
        match = re.match(r"Category:Released in Version (.+)$", category, flags=re.I)
        if match:
            released.append(normalize_version(match.group(1)))
    ids = sorted({int(value) for value in re.findall(r"(?<!\d)\d{3,6}(?!\d)", fields.get("id", ""))})
    chapter = clean_wiki_value(fields.get("chapter", ""))
    event_name = clean_wiki_value(fields.get("event_name", "") or fields.get("event", ""))
    category_keys = {category.casefold() for category in categories}
    event_category = "category:event quests" in category_keys
    valid_event_name = bool(re.search(r"[A-Za-z0-9\u4e00-\u9fff]", event_name))
    is_event_quest = valid_event_name or event_category
    category_series = []
    for category in categories:
        match = re.match(r"Category:(.+?) Chapter Quests$", category, flags=re.I)
        if match:
            category_series.append(match.group(1).strip())
    return {
        "title": title,
        "ids": ids,
        "versions": sorted(set(filter(None, released)), key=version_key),
        "previous_titles": relation_titles(fields.get("prev", "")),
        "next_titles": relation_titles(fields.get("next", "")),
        "chapter": chapter,
        "event": event_name,
        "event_category": event_category,
        "is_event_quest": is_event_quest,
        "series": list(dict.fromkeys(filter(None, [event_name, chapter, *category_series]))),
    }


def fetch_page_records(titles: list[str], cache_dir: Path, *, refresh: bool = False) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for position, title_batch in enumerate(batched(titles, 35), start=1):
        fingerprint = hashlib.sha1("\n".join(title_batch).encode("utf-8")).hexdigest()[:12]
        cache_path = cache_dir / "pages" / f"{position:04d}_{fingerprint}.json"
        if cache_path.is_file() and not refresh:
            records.extend(read_json(cache_path))
            continue
        payload = api_json({
            "action": "query",
            "prop": "revisions|categories",
            "titles": "|".join(title_batch),
            "rvprop": "content",
            "rvslots": "main",
            "rvsection": "0",
            "cllimit": "max",
            "redirects": "1",
            "format": "json",
            "formatversion": "2",
        })
        batch_records = [record for page in payload.get("query", {}).get("pages", []) if (record := record_from_page(page))]
        write_json(cache_path, batch_records, compact=True)
        records.extend(batch_records)
        print(f"Метаданные wiki: {min(position * 35, len(titles))}/{len(titles)}")
    return records


def load_lore_entries(lore_dir: Path) -> list[dict[str, Any]]:
    entries = []
    for path in sorted(lore_dir.glob("quest_*.json")):
        value = read_json(path)
        if isinstance(value, dict) and value.get("id"):
            entries.append(value)
    return entries


def resolve_record_title(
    title: str,
    records_by_title: dict[str, dict[str, Any]],
    records_by_normalized_title: dict[str, list[dict[str, Any]]],
) -> dict[str, Any] | None:
    direct = records_by_title.get(title.casefold())
    if direct:
        return direct
    candidates = records_by_normalized_title.get(normalize_title(title), [])
    return candidates[0] if len(candidates) == 1 else None


class DisjointSet:
    def __init__(self, values: Iterable[str]):
        self.parent = {value: value for value in values}

    def find(self, value: str) -> str:
        parent = self.parent[value]
        if parent != value:
            self.parent[value] = self.find(parent)
        return self.parent[value]

    def union(self, left: str, right: str) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root != right_root:
            self.parent[right_root] = left_root


def build_metadata(
    entries: list[dict[str, Any]],
    records: list[dict[str, Any]],
    release_versions: dict[str, list[str]],
) -> dict[str, Any]:
    chain_by_main_id: dict[int, str] = {}
    entry_by_id = {str(entry["id"]): entry for entry in entries}
    for entry in entries:
        for part in entry.get("parts") or []:
            try:
                chain_by_main_id[int(part.get("source_id"))] = str(entry["id"])
            except (TypeError, ValueError):
                continue

    records_by_main_id: dict[int, list[dict[str, Any]]] = defaultdict(list)
    records_by_title = {str(record["title"]).casefold(): record for record in records}
    records_by_normalized_title: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        record["versions"] = sorted(
            set(record.get("versions", [])) | set(release_versions.get(str(record.get("title") or ""), [])),
            key=version_key,
        )
        for main_id in record.get("ids", []):
            records_by_main_id[int(main_id)].append(record)
        records_by_normalized_title[normalize_title(record.get("title"))].append(record)

    matched_records: dict[str, list[dict[str, Any]]] = defaultdict(list)
    match_kind: dict[str, str] = {}
    for entry in entries:
        entry_id = str(entry["id"])
        for part in entry.get("parts") or []:
            try:
                main_id = int(part.get("source_id"))
            except (TypeError, ValueError):
                continue
            matched_records[entry_id].extend(records_by_main_id.get(main_id, []))
        if matched_records[entry_id]:
            match_kind[entry_id] = "game_id"
            continue
        title_candidates = [entry.get("title", {}).get("en", "")]
        title_candidates.extend(part.get("title", {}).get("en", "") for part in entry.get("parts") or [])
        title_records: list[dict[str, Any]] = []
        for title in title_candidates:
            candidates = records_by_normalized_title.get(normalize_title(title), [])
            if len(candidates) == 1:
                title_records.extend(candidates)
        if title_records:
            matched_records[entry_id].extend(title_records)
            match_kind[entry_id] = "unique_title"

        # Some technical/event records have no usable infobox ID.  Their page
        # title can still be dated exactly through the release category.
        if not matched_records[entry_id]:
            candidates = [entry.get("title", {}).get("en", "")]
            candidates.extend(part.get("title", {}).get("en", "") for part in entry.get("parts") or [])
            normalized_candidates = {normalize_title(value) for value in candidates if normalize_title(value)}
            release_titles = [
                title
                for title in release_versions
                if normalize_title(title) in normalized_candidates
            ]
            if len(release_titles) == 1:
                title = release_titles[0]
                matched_records[entry_id].append({
                    "title": title,
                    "ids": [],
                    "versions": release_versions[title],
                    "previous_titles": [],
                    "next_titles": [],
                    "series": [],
                })
                match_kind[entry_id] = "release_title"

    for entry_id, values in matched_records.items():
        matched_records[entry_id] = list({record["title"]: record for record in values}.values())

    chain_by_page_title: dict[str, str] = {}
    for main_id, page_records in records_by_main_id.items():
        chain_id = chain_by_main_id.get(main_id)
        if chain_id:
            for record in page_records:
                chain_by_page_title[str(record["title"]).casefold()] = chain_id

    def relation_chain(title: str) -> str:
        record = resolve_record_title(title, records_by_title, records_by_normalized_title)
        if not record:
            return ""
        direct = chain_by_page_title.get(str(record["title"]).casefold(), "")
        if direct:
            return direct
        candidates = {chain_by_main_id.get(int(main_id), "") for main_id in record.get("ids", [])}
        candidates.discard("")
        return next(iter(candidates)) if len(candidates) == 1 else ""

    previous: dict[str, set[str]] = defaultdict(set)
    following: dict[str, set[str]] = defaultdict(set)
    series_members: dict[str, set[str]] = defaultdict(set)
    series_labels: dict[str, str] = {}
    versions_by_chain: dict[str, set[str]] = defaultdict(set)

    for entry_id, page_records in matched_records.items():
        for record in page_records:
            versions_by_chain[entry_id].update(record.get("versions", []))
            for label in record.get("series", []):
                key = normalize_title(label)
                if key:
                    series_members[key].add(entry_id)
                    series_labels.setdefault(key, label)
            for title in record.get("previous_titles", []):
                target = relation_chain(title)
                if target and target != entry_id:
                    previous[entry_id].add(target)
                    following[target].add(entry_id)
            for title in record.get("next_titles", []):
                target = relation_chain(title)
                if target and target != entry_id:
                    following[entry_id].add(target)
                    previous[target].add(entry_id)

    ids = sorted(entry_by_id)
    connected = DisjointSet(ids)
    # A quest chain is defined only by explicit Previous Quest / Next Quest
    # links on the wiki.  Series and category labels are descriptive metadata
    # and must never pull additional quests into the chain.
    for entry_id in ids:
        for target in previous[entry_id] | following[entry_id]:
            connected.union(entry_id, target)

    components: dict[str, list[str]] = defaultdict(list)
    for entry_id in ids:
        components[connected.find(entry_id)].append(entry_id)

    def entry_sort_key(entry_id: str) -> tuple[Any, ...]:
        entry = entry_by_id[entry_id]
        versions = sorted(versions_by_chain[entry_id], key=version_key)
        return (
            version_key(versions[0]) if versions else (999, 999, 999),
            int(entry.get("source_id") or 10**9),
            entry_id,
        )

    ordered_components: dict[str, list[str]] = {}
    for root, members in components.items():
        member_set = set(members)
        remaining_predecessors = {
            member: set(previous[member]) & member_set
            for member in members
        }
        ready = sorted((member for member in members if not remaining_predecessors[member]), key=entry_sort_key)
        ordered: list[str] = []
        while ready:
            current = ready.pop(0)
            if current in ordered:
                continue
            ordered.append(current)
            for target in sorted(following[current] & member_set, key=entry_sort_key):
                remaining_predecessors[target].discard(current)
                if not remaining_predecessors[target] and target not in ordered and target not in ready:
                    ready.append(target)
                    ready.sort(key=entry_sort_key)
        ordered.extend(sorted((member for member in members if member not in ordered), key=entry_sort_key))
        ordered_components[root] = ordered

    output: dict[str, Any] = {}

    def is_direct_event_record(record: dict[str, Any]) -> bool:
        event_name = str(record.get("event") or "").strip()
        valid_event_name = bool(re.search(r"[A-Za-z0-9\u4e00-\u9fff]", event_name))
        if "event_category" in record:
            return valid_event_name or bool(record.get("event_category"))
        # Backward compatibility for cached records created before the
        # category flag was stored separately.  A true flag with an empty
        # event field can only have come from Category:Event Quests.
        return valid_event_name or (bool(record.get("is_event_quest")) and not event_name)

    for entry_id in ids:
        root = connected.find(entry_id)
        chain = ordered_components[root]
        versions = sorted(versions_by_chain[entry_id], key=version_key)
        labels = sorted(
            {
                series_labels[key]
                for key, members in series_members.items()
                if entry_id in members and len(members) > 1
            },
            key=str.casefold,
        )
        output[entry_id] = {
            "game_version": versions[0] if versions else VERIFIED_VERSION_OVERRIDES.get(entry_id, ""),
            "release_versions": versions or ([VERIFIED_VERSION_OVERRIDES[entry_id]] if entry_id in VERIFIED_VERSION_OVERRIDES else []),
            "previous_quests": sorted(previous[entry_id], key=entry_sort_key),
            "next_quests": sorted(following[entry_id], key=entry_sort_key),
            "related_quests": [value for value in chain if value != entry_id],
            "quest_chain": chain,
            "quest_series": labels,
            "story_group": (
                "event_chronicles"
                if any(is_direct_event_record(record) for record in matched_records.get(entry_id, []))
                else str(entry_by_id[entry_id].get("story_group") or "")
            ),
            "metadata_match": match_kind.get(entry_id, "unmatched"),
            "version_source": "wiki_release_category" if versions else ("verified_override" if entry_id in VERIFIED_VERSION_OVERRIDES else ""),
            "matched_pages": sorted((record["title"] for record in matched_records.get(entry_id, [])), key=str.casefold),
        }

    missing_versions = sorted(entry_id for entry_id, item in output.items() if not item["game_version"])
    title_matches = sorted(entry_id for entry_id, item in output.items() if item["metadata_match"] == "unique_title")
    release_title_matches = sorted(entry_id for entry_id, item in output.items() if item["metadata_match"] == "release_title")
    unmatched = sorted(entry_id for entry_id, item in output.items() if item["metadata_match"] == "unmatched")
    return {
        "entries": output,
        "report": {
            "entry_count": len(entries),
            "wiki_page_count": len(records),
            "versioned_count": len(entries) - len(missing_versions),
            "missing_version_count": len(missing_versions),
            "missing_versions": missing_versions,
            "title_match_count": len(title_matches),
            "title_matches": title_matches,
            "release_title_match_count": len(release_title_matches),
            "release_title_matches": release_title_matches,
            "unmatched_count": len(unmatched),
            "unmatched": unmatched,
            "connected_count": sum(1 for item in output.values() if len(item["quest_chain"]) > 1),
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect quest versions and relationship graph")
    parser.add_argument("--lore-dir", type=Path, default=DEFAULT_LORE_DIR)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--refresh", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    titles = fetch_quest_titles(args.cache, refresh=args.refresh)
    print("Страниц заданий:", len(titles))
    records = fetch_page_records(titles, args.cache, refresh=args.refresh)
    release_versions = fetch_release_versions(args.cache, refresh=args.refresh)
    entries = load_lore_entries(args.lore_dir)
    result = build_metadata(entries, records, release_versions)
    write_json(args.output, result)
    print(json.dumps(result["report"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
