#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INDEX = ROOT / "index.html"
CACHE_RE = re.compile(r"(assets/(?:css/archive\.css|js/archive\.js)\?v=)([A-Za-z0-9_.-]+)")


def next_version_from(text: str) -> str:
    versions = [match.group(2) for match in CACHE_RE.finditer(text)]
    numeric_versions = [int(value) for value in versions if value.isdigit()]
    if numeric_versions:
        return str(max(numeric_versions) + 1)
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")


def bump_index(index_path: Path, version: str | None = None) -> str:
    index_path = index_path.resolve()
    text = index_path.read_text(encoding="utf-8")
    new_version = version or next_version_from(text)

    if not CACHE_RE.search(text):
        raise SystemExit(f"Cache version markers were not found in {index_path}")

    updated = CACHE_RE.sub(lambda match: f"{match.group(1)}{new_version}", text)
    if updated != text:
        index_path.write_text(updated, encoding="utf-8", newline="\n")

    return new_version


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Update cache-busting ?v=... markers for archive CSS and JS in index.html."
    )
    parser.add_argument(
        "--index",
        type=Path,
        default=DEFAULT_INDEX,
        help="Path to index.html. Defaults to repository index.html.",
    )
    parser.add_argument(
        "--version",
        help="Explicit cache version. If omitted, the highest numeric version is incremented.",
    )
    args = parser.parse_args()

    new_version = bump_index(args.index, args.version)
    print(f"Cache version: {new_version}")


if __name__ == "__main__":
    main()
