"""
Turn the user's message into what retrieval needs, with at most ONE LLM call.

The old pipeline made up to two sequential calls before answering (translate, then
act detection). Now:
  * English, first message      -> no LLM call: acts and section numbers are found
                                   with the alias table / regex below.
  * other language or follow-up -> one JSON call that translates, resolves the
                                   follow-up against the conversation ("what is the
                                   punishment for that?") and names the act.
"""

import json
import os
import re
from dataclasses import dataclass, field
from typing import List, Optional

import llm_usage

# alias regex -> file stem of the act in the index
ACT_ALIASES = [
    (r"bharatiya nyaya sanhita|nyaya sanhita|\bbns\b|\bipc\b|indian penal code", "bharatiya_nyaya_sanhita_2023"),
    (r"nagarik suraksha|\bbnss\b|\bcrpc\b|cr\.?\s?p\.?\s?c|code of criminal procedure", "bharatiya_nagarik_suraksha_sanhita_2023"),
    (r"sakshya adhiniyam|\bbsa\b|evidence act", "bharatiya_sakshya_adhiniyam_2023"),
    (r"\bc?gst\b|goods and services tax|input tax credit", "central_goods_and_services_tax_act_2017"),
    (r"civil procedure|\bcpc\b", "code_of_civil_procedure_1908"),
    (r"constitution|\barticle\s*\d", "constitution_of_india_2024_english"),
    (r"environment(al)? \(?protection\)? act|\bepa\b", "environment_protection_act_1986"),
    (r"hindu marriage|\bhma\b", "hindu_marriage_act_1955"),
    (r"contract act", "indian_contract_act_1872"),
    (r"information technology act|\bit act\b", "information_technology_act_2000"),
    (r"motor vehicles? act|\bmv act\b|\bmva\b", "motor_vehicles_act_1988"),
    (r"pocso|protection of children from sexual offences", "pocso_act_2012"),
    (r"domestic violence act|\bdv act\b|pwdva|protection of women from domestic violence", "protection_of_women_from_domestic_violence_act_2005"),
    (r"\brti\b|right to information", "right_to_information_act_2005"),
    (r"special marriage", "special_marriage_act_1954"),
    (r"specific relief", "specific_relief_act_1963"),
    (r"transfer of property|\btpa\b", "transfer_of_property_act_1882"),
    (r"aadh?aar|uidai", "BENEFITS AND SERVICES) ACT, 2016"),
]
def _manifest_aliases():
    """Aliases for Acts added in batches (data/raw_pdfs/*/MANIFEST.json): the Act's
    name without 'The', the year and bracketed parts, e.g. 'sale of goods act',
    'juvenile justice act'. Multi-word names also match without the word 'act'."""
    try:
        from ingest import MANIFEST_TITLES
    except Exception:
        return []
    aliases = []
    for stem, title in MANIFEST_TITLES.items():
        core = re.sub(r"\(.*?\)|,?\s*\d{4}$|^indian\s+", "", title, flags=re.IGNORECASE).strip().lower()
        core = re.sub(r"\s+", " ", core)
        words = core.split()
        if not words:
            continue
        pattern = re.escape(core)
        if words[-1] == "act" and len(words) >= 3:
            pattern = re.escape(" ".join(words[:-1])) + r"(?:\s+act)?"
        aliases.append((r"\b" + pattern + r"\b", stem))
    return aliases


_ALIASES = [(re.compile(p, re.IGNORECASE), stem) for p, stem in ACT_ALIASES + _manifest_aliases()]
# Abbreviations people type but statutes spell out. The cross-encoder reranker has never
# seen "RTI", so "How do I file an RTI application?" ranked IT Act s.22 ("application
# for licence") above RTI Act s.6. The search query gets the full name added.
ABBREVIATIONS = {
    "rti": "Right to Information", "fir": "first information report",
    "ipc": "Indian Penal Code Bharatiya Nyaya Sanhita", "bns": "Bharatiya Nyaya Sanhita",
    "crpc": "Code of Criminal Procedure Bharatiya Nagarik Suraksha Sanhita",
    "bnss": "Bharatiya Nagarik Suraksha Sanhita", "bsa": "Bharatiya Sakshya Adhiniyam",
    "cpc": "Code of Civil Procedure", "pocso": "Protection of Children from Sexual Offences",
    "ndps": "Narcotic Drugs and Psychotropic Substances", "gst": "Goods and Services Tax",
    "pio": "Public Information Officer", "dv": "domestic violence", "mv": "motor vehicles",
    "pil": "public interest litigation", "nri": "non-resident Indian",
}
_ABBR_RE = re.compile(r"\b(" + "|".join(ABBREVIATIONS) + r")\b", re.IGNORECASE)


def spell_out(query: str) -> str:
    """'file an RTI application' -> '... (Right to Information)' for retrieval only."""
    names = []
    for m in _ABBR_RE.finditer(query or ""):
        name = ABBREVIATIONS[m.group(1).lower()]
        if name.lower() not in query.lower() and name not in names:
            names.append(name)
    return f"{query} ({'; '.join(names)})" if names else query


SECTION_REF_RE = re.compile(r"\b(?:section|sec\.?|s\.|article|art\.?)\s*(\d{1,3}[a-z]{0,2})\b", re.IGNORECASE)


def detect_acts(*texts: str) -> List[str]:
    found = []
    for text in texts:
        for rx, stem in _ALIASES:
            if text and rx.search(text) and stem not in found:
                found.append(stem)
    return found


def section_refs(*texts: str) -> List[str]:
    refs = []
    for text in texts:
        for m in SECTION_REF_RE.finditer(text or ""):
            num = m.group(1).upper()
            if num not in refs:
                refs.append(num)
    return refs


@dataclass
class Understanding:
    search_query: str                       # English, standalone
    acts: List[str] = field(default_factory=list)
    section_refs: List[str] = field(default_factory=list)
    llm_used: bool = False
    error: Optional[str] = None


REWRITE_PROMPT = """You prepare search queries for a database of Indian statutes.
Given the conversation and the user's LATEST message, return JSON:
{"query": "<the latest message as ONE standalone English search query>", "act": "<name of the Indian Act it concerns, or empty>"}

Rules:
- Translate to English if needed. Keep legal terms and any section/article numbers.
- Resolve follow-ups using the conversation ("what is the punishment for that?" -> name the offence and act).
- Old names map to new codes: IPC -> Bharatiya Nyaya Sanhita, CrPC -> Bharatiya Nagarik Suraksha Sanhita, Indian Evidence Act -> Bharatiya Sakshya Adhiniyam.
- Do not answer the question. JSON only."""


# Plain-language English questions ("someone stole my bike") rarely share words with
# the statute ("theft"). With QUERY_EXPANSION=1 they also get one LLM call that adds
# the legal terms; otherwise they need no LLM call at all. Measured in the eval:
# MRR +0.095 (95% CI 0.04-0.15), about 0.5-0.9 s for the extra call. It runs on its
# own model (EXPAND_MODEL) so it does not share the answer model's free-tier quota.
EXPAND_PROMPT = """You prepare search queries for a database of Indian statutes.
Return JSON: {"act": "<name of the Indian Act the message concerns, or empty>", "legal_terms": ["<up to 5 legal terms or offence names in ENGLISH, worded as the Act itself words them, e.g. theft, criminal intimidation, maintenance, specific performance>"]}
Old names map to new codes: IPC -> Bharatiya Nyaya Sanhita, CrPC -> Bharatiya Nagarik Suraksha Sanhita, Indian Evidence Act -> Bharatiya Sakshya Adhiniyam.
Do not answer the question. JSON only."""


def query_expansion_enabled() -> bool:
    return os.getenv("QUERY_EXPANSION", "1") == "1"


def _expand(query: str, llm, model: str) -> Understanding:
    # Optional step: the raw query still works, so when the free tier is rate-limited
    # this gives up at once instead of retrying with backoff (up to ~30 s before).
    if hasattr(llm, "with_options"):
        llm = llm.with_options(max_retries=0)
    try:
        with llm_usage.purpose("query_rewrite"):
            resp = llm.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": EXPAND_PROMPT}, {"role": "user", "content": query}],
                temperature=0, max_tokens=300, reasoning_effort="low",
                response_format={"type": "json_object"}, timeout=5)
        data = json.loads(resp.choices[0].message.content or "{}")
        terms = [str(t).strip() for t in (data.get("legal_terms") or []) if str(t).strip()][:5]
        act = (data.get("act") or "").strip()
        expanded = f"{query} {' '.join(terms)}".strip()
        return Understanding(search_query=expanded, acts=detect_acts(query, act),
                             section_refs=section_refs(query), llm_used=True)
    except Exception as e:
        return Understanding(search_query=query, acts=detect_acts(query), section_refs=section_refs(query),
                             llm_used=True, error=str(e)[:200])


def understand(query: str, history: list, language: str, llm, model: str) -> Understanding:
    u = _understand(query, history, language, llm, model)
    u.search_query = spell_out(u.search_query)
    return u


def _understand(query: str, history: list, language: str, llm, model: str) -> Understanding:
    recent = [m for m in (history or []) if m.get("role") in ("user", "assistant")][-4:]
    if language == "en" and not recent:
        acts, refs = detect_acts(query), section_refs(query)
        # A question that names its Act or section is already found by the act filter
        # (Recall@5 1.00 on section-number questions without expansion), so the
        # 1-3 s expansion call is only spent on plain-language questions.
        if query_expansion_enabled() and not acts and not refs:
            return _expand(query, llm, os.getenv("EXPAND_MODEL", "openai/gpt-oss-120b"))
        return Understanding(search_query=query, acts=acts, section_refs=refs)

    convo = "\n".join(f"{m['role'].upper()}: {m['content'][:400]}" for m in recent) or "(none)"
    try:
        with llm_usage.purpose("query_rewrite"):
            resp = llm.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": REWRITE_PROMPT},
                          {"role": "user", "content": f"CONVERSATION:\n{convo}\n\nLATEST MESSAGE:\n{query}"}],
                temperature=0, max_tokens=400, reasoning_effort="low",
                response_format={"type": "json_object"}, timeout=15)
        data = json.loads(resp.choices[0].message.content or "{}")
        rewritten = (data.get("query") or "").strip() or query
        act = (data.get("act") or "").strip()
        return Understanding(search_query=rewritten,
                             acts=detect_acts(query, rewritten, act),
                             section_refs=section_refs(query, rewritten),
                             llm_used=True)
    except Exception as e:
        # Still usable: the raw query, plus the previous user turn for short follow-ups.
        last_user = next((m["content"] for m in reversed(recent) if m["role"] == "user"), "")
        fallback = f"{last_user[:200]} {query}".strip() if last_user and len(query.split()) < 10 else query
        return Understanding(search_query=fallback, acts=detect_acts(fallback),
                             section_refs=section_refs(fallback), llm_used=True, error=str(e)[:200])
