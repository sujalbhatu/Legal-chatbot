"""
Split the extracted text of an Act into its real sections (or articles).

Why this exists: the original chunker looked for "<number>. <title>" with a space
after the dot. The 2023 criminal codes are printed as "303.(1) Whoever ..." with no
space, so most of their sections were never found, and the few matches that were
found (often cross-references) swallowed the following sections. A chunk labelled
"Section 144" of the Bharatiya Nyaya Sanhita actually held sections 151-156, so
users were shown the wrong section number.

How it works:
  1. Every line that starts with "<number>[letters]." is a candidate section start.
     Amendment footnotes ("3. Subs. by Act 10 of 2009 ...") are thrown out.
  2. Both the table of contents and the body of an Act list sections in increasing
     order, so the real body is the increasing chain of candidates that covers the
     most text. That is a maximum-weight increasing subsequence, solved in
     O(n log n) with a Fenwick tree.
  3. Text after a section that belongs to a schedule (CPC Orders, Constitution
     Schedules) is cut off at the schedule heading and returned separately, so a
     section never absorbs a whole schedule.

No third-party imports, so it is cheap to unit-test.
"""

import re
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

# "303.(1) Whoever", "54. “Sale” defined", and amended sections such as "2[226. Power of ..."
CANDIDATE_RE = re.compile(r'(?m)^[ \t]*(?:\d{1,2}[ \t]?\[[ \t]?)?(\d{1,3})([A-Z]{0,3})[ \t]?\.[ \t]*(?=\S)')
# CGST prints the margin note on the same line: "...furnishing of returns.of 39. (1) Every registered person"
MIDLINE_RE = re.compile(r'(?<=[a-z.)])[ \t]?(\d{1,3})([A-Z]{0,2})\.[ \t]?(?=\(1\)[ \t])')

# "3. Subs. by Act 10 of 2009, s. 2 ..." / "1. Ins. by s. 14, ibid. (w.e.f. 14-11-1994)."
FOOTNOTE_START_RE = re.compile(
    r'^(Subs\.|Ins\.|Omitted\b|Rep\.|Added\b|The words\b|Renumbered\b|Vide\b|Now see\b|'
    r'See\b|But see\b|C\.?\s?f\.|As to\b|For the Statement\b|For an Exception\b|Ss?\.\s?\d|Para\s?graph\b|Certain\b|The brackets\b|The original\b|Came into force\b|\d{1,2}\s?(st|nd|rd|th)\b)',
    re.IGNORECASE)
FOOTNOTE_HINT_RE = re.compile(r'\b(ibid|w\.\s?e\.\s?f|by Act \d|by s\.\s?\d|notification No)\b', re.IGNORECASE)

SCHEDULE_HEADING_RE = re.compile(
    r'^[ \t]*(?:THE[ \t]+)?(?:(?:FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|'
    r'TENTH|ELEVENTH|TWELFTH)[ \t]+)?SCHEDULE\b[^\n]*$|^[ \t]*ORDER[ \t]+[IVXL]+[ \t]*$', re.MULTILINE)
CHAPTER_RE = re.compile(r'(?m)^[ \t]*(CHAPTER|PART)[ \t]*([IVXLC]+[A-Z]?)[ \t]*\n[ \t]*([A-Z][^\n]{2,80})')

# Gazette header noise on the first pages of the 2023 codes
NOISE_LINE_RE = re.compile(
    r'(EXTRAORDINARY|PUBLISHED BY AUTHORITY|REGISTERED NO\.|xxxGID|MINISTRY OF LAW|'
    r'Separate paging is given|^\s*-{3,}\s*PAGE\s*\d+\s*-{3,}\s*$)')

MAX_SECTION_CHARS = 20000   # a section longer than this has run into unmarked schedule text
# Chains are compared mostly by how many sections they contain, then by how much text
# they cover: a lone long footnote must not beat two real sections.
SECTION_WEIGHT = 8000


@dataclass
class Section:
    number: str                 # "303", "66A"
    title: str                  # "" when the Act prints titles only as margin notes
    text: str                   # full text of the section, starting with its number
    chapter: str = ""
    start: int = 0              # character offset in the cleaned text


@dataclass
class ParsedAct:
    sections: List[Section] = field(default_factory=list)
    extra: List[Tuple[str, str]] = field(default_factory=list)   # (heading, text) of schedules/orders


def ordinal(number: str, suffix: str = "") -> int:
    """66 < 66A < 66B < 67 ; 21 < 21A < 21AA < 22."""
    value = int(number) * 10000
    for i, ch in enumerate(suffix[:3]):
        value += (ord(ch) - 64) * (100 if i == 0 else 4 if i == 1 else 1)
    return value


def clean_text(text: str) -> str:
    lines = [ln for ln in text.splitlines() if not NOISE_LINE_RE.search(ln)]
    text = "\n".join(lines)
    text = re.sub(r'[ \t]+', ' ', text)
    return re.sub(r'\n{3,}', '\n\n', text)


def _is_footnote(line: str) -> bool:
    body = CANDIDATE_RE.sub('', line, count=1).strip()
    return bool(FOOTNOTE_START_RE.match(body) or FOOTNOTE_HINT_RE.search(body[:160]))


def _strip_footnotes(text: str) -> str:
    out = []
    for ln in text.splitlines():
        if CANDIDATE_RE.match(ln) and _is_footnote(ln):
            continue
        out.append(ln)
    return "\n".join(out).strip()


class _MaxFenwick:
    """Prefix-maximum Fenwick tree over ranks; stores (best_weight, index)."""

    def __init__(self, n):
        self.n = n
        self.tree = [(0, -1)] * (n + 1)

    def update(self, i, value):
        while i <= self.n:
            if value[0] > self.tree[i][0]:
                self.tree[i] = value
            i += i & -i

    def query(self, i):
        best = (0, -1)
        while i > 0:
            if self.tree[i][0] > best[0]:
                best = self.tree[i]
            i -= i & -i
        return best


def _best_chain(cands: List[Tuple[int, int, int]]) -> List[int]:
    """cands: (position, ordinal, weight) in position order. Returns indices of the
    increasing-ordinal chain with the largest total weight."""
    if not cands:
        return []
    ranks = {o: r + 1 for r, o in enumerate(sorted({c[1] for c in cands}))}
    fw = _MaxFenwick(len(ranks))
    best_total, prev = [0] * len(cands), [-1] * len(cands)
    for i, (_, ordv, weight) in enumerate(cands):
        r = ranks[ordv]
        total, j = fw.query(r - 1)          # strictly smaller ordinal
        best_total[i], prev[i] = total + weight, j
        fw.update(r, (best_total[i], i))
    i = max(range(len(cands)), key=lambda k: best_total[k])
    chain = []
    while i != -1:
        chain.append(i)
        i = prev[i]
    return chain[::-1]


def _title_of(section_text: str) -> str:
    """'54. “Sale” defined .—“Sale” is ...' -> '“Sale” defined'."""
    head = CANDIDATE_RE.sub('', section_text, count=1)
    m = re.match(r'([^\n]{3,160}?)\s?\.?\s?[—–-]{1,2}', head)
    if m and not re.match(r'\(\d', m.group(1)):
        title = re.sub(r'\s+', ' ', m.group(1)).strip(' .')
        return title
    return ""


PAGE_SPLIT_RE = re.compile(r'(-{3,}\s*PAGE\s*\d+\s*-{3,})')
GAZETTE_MARKER_RE = re.compile(r'(?m)^(.*?)(\d{1,4})\s?THE GAZETTE OF INDIA')
MARGIN_LINE_MAX = 26     # margin notes are printed in a narrow column


def extract_margin_notes(raw_text: str):
    """
    The 2023 Gazette PDFs (BNS, BNSS, BSA) have no table of contents: each section's
    title is a margin note, and the text extraction puts a page's notes at the end of
    that page, in order, glued to the last line ("...breach of trust.Trespassing on /
    burial places, / etc. / ... / Theft.78THE GAZETTE OF INDIA ...").

    Returns (text with the note blocks removed, {section number: title}). A page's
    notes are only used when their count equals the number of sections starting on
    that page, so a page that does not line up gets no titles rather than wrong ones.
    """
    parts = PAGE_SPLIT_RE.split(raw_text)
    titles, out = {}, []
    last_ord = 0
    for part in parts:
        if PAGE_SPLIT_RE.fullmatch(part):
            out.append(part)
            continue
        marker = GAZETTE_MARKER_RE.search(part)
        body, notes = part, []
        if marker:
            lines = part[:marker.start()].split('\n') + [marker.group(1)]
            i = len(lines)
            while i > 0 and len(lines[i - 1].strip()) <= MARGIN_LINE_MAX:
                i -= 1
            block = [ln.strip() for ln in lines[i:] if ln.strip()]
            body_lines = lines[:i]
            if body_lines:   # first note glued to the last body line: "trust.Trespassing on"
                glued = re.search(r'([.;:—])([A-Z][^.]{0,40}\.?)$', body_lines[-1])
                if glued:
                    block.insert(0, glued.group(2).strip())
                    body_lines[-1] = body_lines[-1][:glued.start() + 1]
            current = []
            for ln in block:
                current.append(ln)
                if ln.endswith('.'):
                    note = re.sub(r'\s+', ' ', ' '.join(current)).strip()
                    notes.append(note if note.endswith('etc.') else note.rstrip(' .'))
                    current = []
            body = '\n'.join(body_lines) + '\n' + part[marker.end():].split('\n', 1)[-1] if '\n' in part[marker.end():] else '\n'.join(body_lines)
        # sections that start on this page, continuing the increasing sequence
        starts = []
        for m in CANDIDATE_RE.finditer(body):
            o = ordinal(m.group(1), m.group(2))
            if o > last_ord and not _is_footnote(body[m.start():body.find('\n', m.start())]):
                starts.append(m.group(1) + m.group(2))
                last_ord = o
        if notes and len(notes) == len(starts):
            for number, note in zip(starts, notes):
                titles.setdefault(number, note)
        out.append(body)
    return ''.join(out), titles


def parse_act(raw_text: str) -> ParsedAct:
    margin_titles = {}
    if GAZETTE_MARKER_RE.search(raw_text):
        raw_text, margin_titles = extract_margin_notes(raw_text)
    text = clean_text(raw_text)

    def line_at(pos):
        nl = text.find('\n', pos)
        return text[pos:nl if nl != -1 else len(text)]

    found = {m.start(): m for m in CANDIDATE_RE.finditer(text) if not _is_footnote(line_at(m.start()))}
    for m in MIDLINE_RE.finditer(text):
        if not any(abs(m.start() - p) < 4 for p in found):
            found[m.start()] = m
    matches = [found[p] for p in sorted(found)]

    # Skip the table of contents: the body starts at the first "1." that carries text
    # ("1. Short title.—This Act ...", "1.(1) This Act ..."), not a bare title line.
    toc_matches = []
    for k, m in enumerate(matches):
        if m.group(1) == "1" and not m.group(2):
            nxt = matches[k + 1].start() if k + 1 < len(matches) else len(text)
            line = line_at(m.start())
            if '—' in line or '(1)' in line or nxt - m.start() > 300:
                toc_matches, matches = matches[:k], matches[k:]
                break
    if not matches:
        return ParsedAct(extra=[("", text.strip())] if text.strip() else [])

    cands = []
    for k, m in enumerate(matches):
        end = matches[k + 1].start() if k + 1 < len(matches) else len(text)
        weight = SECTION_WEIGHT + min(end - m.start(), 6000)
        cands.append((m.start(), ordinal(m.group(1), m.group(2)), weight))
    chain = [matches[i] for i in _best_chain(cands)]

    # The table of contents, when the Act has one, gives a clean title for each section.
    toc_titles = {}
    body_start = chain[0].start()
    toc_end = toc_matches[-1].start() if toc_matches else 0
    for m in toc_matches + matches:
        if m.start() >= body_start:
            break
        line_end = text.find('\n', m.start())
        entry = text[m.end():line_end if line_end != -1 else len(text)].strip(' .')
        if 3 <= len(entry) <= 160:
            toc_titles.setdefault(m.group(1) + m.group(2), entry)

    chapters = [(c.start(), f"{c.group(1)} {c.group(2)} - {c.group(3).strip().title()}")
                for c in CHAPTER_RE.finditer(text) if c.start() > toc_end]
    schedule_starts = [s.start() for s in SCHEDULE_HEADING_RE.finditer(text) if s.start() > body_start]

    parsed = ParsedAct()
    preamble = text[:body_start].strip()
    for k, m in enumerate(chain):
        start = m.start()
        end = chain[k + 1].start() if k + 1 < len(chain) else len(text)
        cut = next((s for s in schedule_starts if start < s < end), None)
        if (cut or end) - start > MAX_SECTION_CHARS:
            cut = start + MAX_SECTION_CHARS
        if cut is not None:
            parsed.extra.extend(_split_extra(text[cut:end]))
            end = cut
        number = m.group(1) + m.group(2)
        body = _strip_footnotes(text[start:end])
        chapter = ""
        for pos, name in chapters:
            if pos < start:
                chapter = name
            else:
                break
        # Gazette-format Acts print no inline titles, only margin notes
        title = (margin_titles.get(number, "") if margin_titles
                 else _title_of(body) or toc_titles.get(number, ""))
        parsed.sections.append(Section(number=number, title=title,
                                       text=body, chapter=chapter, start=start))
    if preamble and len(preamble) > 200 and not parsed.sections[0].number == "1":
        parsed.extra.insert(0, ("Preamble", preamble))
    return parsed


def _split_extra(text: str) -> List[Tuple[str, str]]:
    """Split schedule/order text at its headings; each piece keeps its heading."""
    pieces = []
    heads = list(SCHEDULE_HEADING_RE.finditer(text))
    if not heads or heads[0].start() > 0:
        first_end = heads[0].start() if heads else len(text)
        if text[:first_end].strip():
            pieces.append(("", text[:first_end].strip()))
    for k, h in enumerate(heads):
        end = heads[k + 1].start() if k + 1 < len(heads) else len(text)
        body = text[h.start():end].strip()
        if len(body) > 40:
            pieces.append((h.group(0).strip(), body))
    return pieces


def find_section(parsed: ParsedAct, number: str) -> Optional[Section]:
    for s in parsed.sections:
        if s.number == number:
            return s
    return None
