"""
Language detection for user queries.

The old detector (langdetect) had no profiles for Odia, Assamese or Santali, was
non-deterministic without a seed, and the UI language was ignored for any query of
15+ characters. This one is deterministic:

  1. Script first. Most Indian languages have their own Unicode block, so the script
     alone settles Odia, Gujarati, Punjabi (Gurmukhi), Tamil, Telugu, Kannada,
     Malayalam, Urdu and Santali (Ol Chiki).
  2. Shared scripts are disambiguated with fastText lid.176 (~1 MB):
     Bengali block -> Bengali vs Assamese, Devanagari -> Hindi vs Marathi.
  3. Latin script -> English, or Hinglish when it is romanised Hindi.
  4. A language the user picked in the UI wins unless the message is written in a
     different (non-Latin) script.
"""

import os
import re
import threading
from typing import Optional, Tuple

LANGUAGE_NAMES = {
    'en': 'English', 'hi': 'Hindi', 'bn': 'Bengali', 'sat': 'Santali', 'ta': 'Tamil',
    'te': 'Telugu', 'mr': 'Marathi', 'gu': 'Gujarati', 'kn': 'Kannada', 'ml': 'Malayalam',
    'pa': 'Punjabi', 'or': 'Odia', 'ur': 'Urdu', 'as': 'Assamese',
    'hinglish': 'Hinglish (Hindi written in English letters)',
}

# (first, last, code) - "beng" and "deva" are shared and need a second step
SCRIPT_RANGES = [
    (0x1C50, 0x1C7F, 'sat'),   # Ol Chiki
    (0x0B00, 0x0B7F, 'or'),
    (0x0A80, 0x0AFF, 'gu'),
    (0x0A00, 0x0A7F, 'pa'),
    (0x0B80, 0x0BFF, 'ta'),
    (0x0C00, 0x0C7F, 'te'),
    (0x0C80, 0x0CFF, 'kn'),
    (0x0D00, 0x0D7F, 'ml'),
    (0x0600, 0x06FF, 'ur'),
    (0x0980, 0x09FF, 'beng'),
    (0x0900, 0x097F, 'deva'),
]
SCRIPT_OF_LANG = {'hi': 'deva', 'mr': 'deva', 'bn': 'beng', 'as': 'beng'}

# Common romanised-Hindi words that are rare in English text
HINGLISH_WORDS = set("""hai hain nahi nahin kya kyu kyun kaise kaisa mera meri mere mujhe hum aap tum
karu karun karna karein kare raha rahi gaya gayi hoga hogi ke ki ko se mein bhi aur lekin agar toh
kitna kitni kab kahan wala wali chahiye sakta sakti batao bataye bataiye kanoon saza jail paisa""".split())

_model = None
_model_lock = threading.Lock()
FASTTEXT_MODEL = os.getenv("FASTTEXT_LID_MODEL", "")


def _fasttext():
    """lid.176.ftz, loaded once; None if not configured / not installed."""
    global _model
    if _model is None and FASTTEXT_MODEL and os.path.exists(FASTTEXT_MODEL):
        with _model_lock:
            if _model is None:
                try:
                    import fasttext
                    _model = fasttext.load_model(FASTTEXT_MODEL)
                except Exception as e:  # missing wheel: fall back to rules
                    print(f"  fastText unavailable ({str(e)[:60]}), using script rules only")
                    _model = False
    return _model or None


def _fasttext_pick(text: str, allowed, min_prob: float = 0.0) -> Optional[str]:
    model = _fasttext()
    if not model:
        return None
    # model.predict() breaks on NumPy 2; the low-level call returns [(prob, label)]
    for prob, label in model.f.predict(text.replace("\n", " "), 5, 0.0, "strict"):
        code = label.replace("__label__", "")
        if code in allowed:
            return code if prob >= min_prob else None
    return None


MARATHI_MARKERS = re.compile(r'ळ|\b(?:आहे|आहेत|नाही|काय|आणि|मला|माझ्या|माझे|करावे|पाहिजे|चालवल्यास)\b')


def script_counts(text: str):
    counts = {'latin': 0}
    for ch in text:
        if not ch.isalpha():
            continue
        cp = ord(ch)
        if cp < 0x250:
            counts['latin'] += 1
            continue
        for lo, hi, code in SCRIPT_RANGES:
            if lo <= cp <= hi:
                counts[code] = counts.get(code, 0) + 1
                break
    return counts


def detect_language(text: str) -> Tuple[str, str]:
    """Returns (language code, how it was decided)."""
    counts = script_counts(text or "")
    total = sum(counts.values())
    if total == 0:
        return 'en', 'empty'
    script, n = max(((k, v) for k, v in counts.items() if k != 'latin'), key=lambda kv: kv[1], default=(None, 0))
    if script and n / total >= 0.3:
        if script == 'beng':
            picked = _fasttext_pick(text, {'bn', 'as'})
            if picked:
                return picked, 'fasttext'
            return ('as' if re.search('[ৰৱ]', text) else 'bn'), 'script-rule'
        if script == 'deva':
            # Hindi is the default for Devanagari; Marathi needs real evidence, because
            # fastText is unreliable on a few words ("अगर वह नाबालिग हो तो?" -> mr).
            if MARATHI_MARKERS.search(text):
                return 'mr', 'script-rule'
            if len(text.split()) >= 6 and _fasttext_pick(text, {'hi', 'mr', 'ne'}, min_prob=0.9) == 'mr':
                return 'mr', 'fasttext'
            return 'hi', 'script-rule'
        return script, 'script'
    words = re.findall(r"[a-z]+", text.lower())
    if words and sum(w in HINGLISH_WORDS for w in words) >= max(2, len(words) // 4):
        return 'hinglish', 'hinglish-words'
    return 'en', 'latin'


def resolve_language(text: str, ui_language: Optional[str], previous: Optional[str] = None) -> Tuple[str, str]:
    """Language to answer in: the UI choice, unless the message is in another script.
    Without a UI choice, a short message in the same script as the previous turn keeps
    that turn's language (Hindi and Marathi, Bengali and Assamese share scripts)."""
    detected, how = detect_language(text)
    ui = ui_language if ui_language in LANGUAGE_NAMES else None
    if not ui:
        if (previous in LANGUAGE_NAMES and previous != detected and len(text.split()) < 8
                and SCRIPT_OF_LANG.get(previous, previous) == SCRIPT_OF_LANG.get(detected, detected)):
            return previous, 'previous-turn'
        return detected, how
    if detected in ('en', 'hinglish'):
        return ui, 'ui'                     # typed in Latin letters: honour the chosen language
    if SCRIPT_OF_LANG.get(detected, detected) == SCRIPT_OF_LANG.get(ui, ui):
        return ui, 'ui'                     # same script (e.g. Hindi UI, Devanagari text): trust the user
    return detected, how
