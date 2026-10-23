"""
Verify the gold labels in questions.jsonl against the text of the Acts.

For every [act, section, phrase] it checks that
  1. the section exists in the parsed act text, and
  2. the phrase occurs in that section (whitespace-insensitive),
and records whether the OLD index (data/chunks_v1, original chunker) has any chunk
labelled with that section - questions whose gold is missing there cannot be answered
correctly by the baseline no matter how good its ranking is.

Writes eval/results/label_check.json and prints a spot-check sample.
Usage: python eval/check_labels.py
"""

import json
import random
from collections import defaultdict

from common import ACTS, DATA_DIR, RESULTS_DIR, TEXT_DIR, load_questions, squash
from sections import find_section, parse_act


def old_index_sections():
    by_act = defaultdict(set)
    for path in (DATA_DIR / "chunks_v1").glob("*_chunks.jsonl"):
        with open(path, encoding="utf-8") as f:
            for line in f:
                meta = json.loads(line)["metadata"]
                by_act[meta["source_file"].rsplit(".txt", 1)[0]].add(str(meta.get("section", "")))
    return by_act


def main():
    questions = load_questions()
    parsed = {stem: parse_act((TEXT_DIR / f"{stem}.txt").read_text(encoding="utf-8")) for stem in ACTS.values()}
    old = old_index_sections()

    problems, rows = [], []
    for q in questions:
        for code, sec, phrase in q["gold"]:
            stem = ACTS[code]
            section = find_section(parsed[stem], sec)
            ok_exists = section is not None
            ok_phrase = ok_exists and squash(phrase) in squash(section.text)
            row = {"id": q["id"], "act": code, "section": sec, "phrase": phrase,
                   "exists": ok_exists, "phrase_found": ok_phrase,
                   "in_old_index": sec in old.get(stem, set()),
                   "title": section.title if section else "",
                   "excerpt": (section.text[:220].replace("\n", " ") if section else "")}
            rows.append(row)
            if not ok_phrase:
                problems.append(row)

    n_q = len(questions)
    n_labels = len(rows)
    answerable = [q for q in questions if q["gold"]]
    old_ok = sum(1 for q in answerable
                 if any(r["in_old_index"] for r in rows if r["id"] == q["id"]))
    summary = {
        "questions": n_q,
        "by_type": {t: sum(1 for q in questions if q["type"] == t) for t in sorted({q["type"] for q in questions})},
        "gold_labels": n_labels,
        "labels_verified": n_labels - len(problems),
        "answerable_questions": len(answerable),
        "answerable_with_old_index": old_ok,
    }
    RESULTS_DIR.mkdir(exist_ok=True)
    with open(RESULTS_DIR / "label_check.json", "w", encoding="utf-8") as f:
        json.dump({"summary": summary, "problems": problems, "labels": rows}, f, ensure_ascii=False, indent=1)

    print(json.dumps(summary, indent=1))
    for p in problems:
        print(f"  PROBLEM {p['id']} {p['act']} s.{p['section']} exists={p['exists']} phrase='{p['phrase']}' | {p['excerpt'][:120]}")

    random.seed(7)
    print("\nSpot-check sample (20 labels):")
    for r in random.sample(rows, 20):
        q = next(q for q in questions if q["id"] == r["id"])
        print(f"- {r['id']}: \"{q['question']}\" -> {r['act']} s.{r['section']} ({r['title'] or 'no title'})")


if __name__ == "__main__":
    main()
