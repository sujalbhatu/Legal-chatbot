"""Shared helpers for the evaluation scripts."""

import json
import os
import re
import sys
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent
RAG_DIR = EVAL_DIR.parent
# EVAL_RAG_DIR points at another checkout (e.g. a worktree of the baseline commit)
# whose pipeline code and data/ should be evaluated instead of this one.
PIPELINE_DIR = Path(os.environ.get("EVAL_RAG_DIR") or RAG_DIR)
sys.path.insert(0, str(RAG_DIR))
sys.path.insert(0, str(PIPELINE_DIR))
# The API key always comes from this checkout's .env (never copied into the worktree).
try:
    from dotenv import load_dotenv
    load_dotenv(RAG_DIR / ".env")
except ImportError:
    pass

DATA_DIR = RAG_DIR.parent.parent / "data"
TEXT_DIR = DATA_DIR / "extracted_text"
RESULTS_DIR = EVAL_DIR / "results"

# Short codes used in questions.jsonl -> file stem of the act (also its source_file stem)
ACTS = {
    "AADHAAR": "BENEFITS AND SERVICES) ACT, 2016",
    "BNSS": "bharatiya_nagarik_suraksha_sanhita_2023",
    "BNS": "bharatiya_nyaya_sanhita_2023",
    "BSA": "bharatiya_sakshya_adhiniyam_2023",
    "CGST": "central_goods_and_services_tax_act_2017",
    "CPC": "code_of_civil_procedure_1908",
    "COI": "constitution_of_india_2024_english",
    "EPA": "environment_protection_act_1986",
    "HMA": "hindu_marriage_act_1955",
    "ICA": "indian_contract_act_1872",
    "ITA": "information_technology_act_2000",
    "MVA": "motor_vehicles_act_1988",
    "POCSO": "pocso_act_2012",
    "DV": "protection_of_women_from_domestic_violence_act_2005",
    "RTI": "right_to_information_act_2005",
    "SMA": "special_marriage_act_1954",
    "SRA": "specific_relief_act_1963",
    "TPA": "transfer_of_property_act_1882",
}
STEM_TO_CODE = {v: k for k, v in ACTS.items()}


def load_questions(path=None):
    path = path or EVAL_DIR / "questions.jsonl"
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def squash(text: str) -> str:
    """Lowercase and drop all whitespace/hyphens: PDF text is full of 'perso n' and 'non -bailable'."""
    return re.sub(r"[\s\-‐–]+", "", text or "").lower()


def gold_pairs(q):
    """{(stem, section)} accepted as correct for a question."""
    return {(ACTS[code], sec) for code, sec, _ in q["gold"]}


def source_key(meta: dict):
    """(stem, section) of a retrieved chunk's metadata."""
    return (Path(meta.get("source_file", "")).stem, str(meta.get("section", "")))
