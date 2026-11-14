"""Protect the complete three-language corpus while serving only requested text."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


class ReaderIntegrityTests(unittest.TestCase):
    def test_lazy_story_payloads_preserve_every_part_and_voice_line(self):
        referenced = set()
        for path in (ROOT / "data/stories").glob("*.json"):
            full = load(path)
            manifest_path = ROOT / "data/readers/stories" / path.name
            manifest = load(manifest_path)
            referenced.add(manifest_path)
            self.assertNotIn("text", manifest)
            self.assertNotIn("description", manifest)
            for kind, field in [("stories", "parts"), ("replicas", "replicas")]:
                expected = full.get(field) or []
                self.assertEqual([p["title"] for p in manifest.get(field, [])], [p["title"] for p in expected], full["id"])
                self.assertTrue(all("text" not in p for p in manifest.get(field, [])))
                if not expected:
                    continue
                for lang in ["ru", "en", "zh"]:
                    chunk_path = ROOT / manifest["reader_chunks"][kind][lang]
                    referenced.add(chunk_path)
                    chunk = load(chunk_path)
                    self.assertEqual(chunk["id"], full["id"])
                    self.assertEqual([p["text"] for p in chunk["parts"]], [p["text"].get(lang, "") for p in expected], (full["id"], field, lang))
        self.assertEqual(set((ROOT / "data/readers/stories").rglob("*.json")), referenced)

    def test_new_characters_have_one_full_profile_and_resources_keep_codex_lore(self):
        for name in ["vesna", "alyosha", "mitya", "vodyanitsa", "valeriy", "odette"]:
            story = load(ROOT / "data/stories" / (name + ".json"))
            self.assertEqual(sum(p["title"].get("ru") == "О персонаже" for p in story["parts"]), 1, name)
        fruit = load(ROOT / "data/items/item_101279.json")
        self.assertIn("Но разве в Снежной вообще бывает жарко?", fruit["text"]["ru"])
        crystal = load(ROOT / "data/items/item_101270.json")
        self.assertIn("Великого альянса Натлана", crystal["text"]["ru"])
        self.assertGreater(len(crystal["text"]["ru"]), 800)


if __name__ == "__main__":
    unittest.main()
