"""
Pure helpers for building the prompt and checking the answer (no model or network
imports, so they are unit-tested directly).
"""

import json
import re

FOLLOWUP_MARKER = "<<FOLLOWUPS>>"


def format_sources(sources: list) -> str:
    if not sources:
        return "(no sources)"
    parts = []
    for n, s in enumerate(sources, 1):
        parts.append(f"[{n}] {s['header']}\n{s['text']}")
    return "\n\n".join(parts)


CITATION_MARK_RE = re.compile(r"\[(\d{1,2})\]")
# gpt-oss often cites in its native style, 【4】 or 【4†L1-L3】, especially when not writing English
ALT_CITATION_RE = re.compile(r"[【［\[](\d{1,2})(?:†[^】］\]]*)?[】］\]]")
SECTION_MENTION_RE = re.compile(
    r"(?:\b(?:Section|Sec\.|Article|Art\.)|§|धारा|सेक्शन|अनुच्छेद|ধারা|ଧାରା)\s*(\d{1,3}[A-Z]{0,2})\b", re.IGNORECASE)


def normalize_citations(text: str) -> str:
    """【4】 / ［4］ / 【4†L2】 -> [4]"""
    return ALT_CITATION_RE.sub(lambda m: f"[{m.group(1)}]", text)


def split_followups(text: str):
    """Answer text and the follow-up suggestions after the marker."""
    if FOLLOWUP_MARKER not in text:
        return text.strip(), []
    answer, _, tail = text.partition(FOLLOWUP_MARKER)
    followups = []
    m = re.search(r"\[.*\]", tail, re.DOTALL)
    if m:
        try:
            followups = [str(x).strip() for x in json.loads(m.group()) if str(x).strip()][:3]
        except ValueError:
            pass
    return answer.strip(), followups


def check_citations(answer: str, sources: list):
    """
    Remove [n] markers that point to no source, and list section/article numbers the
    answer mentions that appear nowhere in the retrieved sources (possible hallucinations).
    Returns (clean_answer, cited_source_numbers, unsupported_section_numbers).
    """
    valid = set(range(1, len(sources) + 1))
    cited = []

    def keep(m):
        n = int(m.group(1))
        if n in valid:
            if n not in cited:
                cited.append(n)
            return m.group(0)
        return ""

    clean = CITATION_MARK_RE.sub(keep, answer)
    known_sections = {str(s["metadata"].get("section", "")).upper() for s in sources}
    all_text = " ".join(s["text"] for s in sources)
    unsupported = []
    for num in SECTION_MENTION_RE.findall(clean):
        num = num.upper()
        if num not in known_sections and not re.search(rf"\b{re.escape(num)}\b", all_text) and num not in unsupported:
            unsupported.append(num)
    return clean, cited, unsupported


def public_source(n: int, s: dict, cited: bool) -> dict:
    meta = s["metadata"]
    return {
        "n": n,
        "act_name": meta.get("act_name", "Unknown"),
        "section": meta.get("section", ""),
        "section_title": meta.get("section_title", ""),
        "chapter": meta.get("chapter", ""),
        "year": meta.get("year", ""),
        "source_file": meta.get("source_file", ""),
        "text": clean_source_text(s["text"]),
        # Real relevance from the cross-encoder (0-1), not a made-up percentage.
        "similarity": s["score"] if s.get("score_kind") == "rerank" else None,
        "cited": cited,
    }


def clean_source_text(text: str, max_length: int = 1500) -> str:
    """Tidy chunk text for display in the frontend."""
    text = re.sub(r'^\s*(?:\d{1,2}\[)?\d+[A-Z]*\.\s*', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    if len(text) > max_length:
        cut = text[:max_length]
        pos = max(cut.rfind('. '), cut.rfind('; '))
        text = cut[:pos + 1] if pos > max_length // 2 else cut.rsplit(' ', 1)[0] + '…'
    return text
