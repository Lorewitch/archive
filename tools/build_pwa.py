#!/usr/bin/env python3
"""Build a GitHub Pages PWA worker with a content-based release identifier."""
from __future__ import annotations

import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import urlsplit
from check_source import assert_clean_text

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "src/pwa/service-worker.js"
OUTPUT = ROOT / "sw.js"


class PublicAssets(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.urls: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        candidate = values.get("src") if tag in {"script", "img"} else values.get("href") if tag == "link" else None
        if candidate and not urlsplit(candidate).scheme and not candidate.startswith(("/", "#")):
            self.urls.add(candidate)


def shell_paths() -> list[str]:
    parser = PublicAssets()
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert_clean_text(html, "index.html")
    parser.feed(html)
    paths = {"index.html", "manifest.webmanifest", "data/archive_summary.json", *parser.urls}
    paths.update(path.relative_to(ROOT).as_posix() for path in (ROOT / "assets/icons/ui").glob("*.webp"))
    paths.update(path.relative_to(ROOT).as_posix() for path in (ROOT / "data").glob("*_index.json") if not path.name.startswith("bot_"))
    paths.update(path.relative_to(ROOT).as_posix() for path in (ROOT / "data/indexes").rglob("*.json"))
    manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
    paths.update(icon["src"] for icon in manifest["icons"])
    for value in paths:
        path = ROOT / urlsplit(value).path
        if not path.is_file():
            raise RuntimeError(f"PWA shell asset is missing: {value}")
    # Manifest/preload references can differ only by ?v=; fetch each resource once.
    unique = {}
    for value in sorted(paths, key=lambda value: (bool(urlsplit(value).query), value)):
        unique[urlsplit(value).path] = value
    return sorted(unique.values())


def empty_catalogs() -> list[str]:
    # Explicit zero-count categories work offline without masking unknown routes.
    summary = json.loads((ROOT / "data/archive_summary.json").read_text(encoding="utf-8"))
    item_groups = (
        "weekly_bosses", "world_bosses", "common_enemies", "development_materials",
        "teyvat_resources", "serenitea_pot", "useful_items", "misc",
    )
    return [f"data/indexes/items/{group}.json" for group in item_groups
            if not summary.get("groups", {}).get("items", {}).get(group)
            and not (ROOT / f"data/indexes/items/{group}.json").exists()]


def release_id() -> str:
    files = [ROOT / "index.html", ROOT / "manifest.webmanifest", TEMPLATE]
    files.extend(path for path in (ROOT / "assets").rglob("*") if path.is_file())
    files.extend(path for path in (ROOT / "data").rglob("*.json") if not path.name.startswith("bot_"))
    digest = hashlib.sha256()
    for path in sorted(set(files)):
        digest.update(path.relative_to(ROOT).as_posix().encode("utf-8") + b"\0")
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()[:16]


def compiled_worker() -> str:
    template = TEMPLATE.read_text(encoding="utf-8")
    return (template.replace("__ARCHIVE_PWA_BUILD__", release_id())
            .replace("__ARCHIVE_PWA_SHELL__", json.dumps(shell_paths(), ensure_ascii=False, indent=2))
            .replace("__ARCHIVE_PWA_EMPTY_CATALOGS__", json.dumps(empty_catalogs(), ensure_ascii=False)))


def build() -> None:
    result = compiled_worker()
    OUTPUT.write_text(result, encoding="utf-8", newline="\n")
    print(f"Built sw.js: release {release_id()}, {len(shell_paths())} offline shell/catalog assets")


if __name__ == "__main__":
    build()
