"""
PDF Ingestion & Chunking Pipeline for Legal Documents.
Parses PDFs, extracts text, chunks by sections, and stores in ChromaDB.
"""

import os
import re
import json
import sys
import PyPDF2
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_PDFS_DIR = DATA_DIR / "raw_pdfs"
EXTRACTED_TEXT_DIR = DATA_DIR / "extracted_text"
CHUNKS_DIR = DATA_DIR / "chunks"
VECTOR_DB_DIR = DATA_DIR / "vector_db"

# Ensure directories exist
for d in [EXTRACTED_TEXT_DIR, CHUNKS_DIR, VECTOR_DB_DIR]:
    d.mkdir(parents=True, exist_ok=True)


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract full text from a PDF file."""
    with open(pdf_path, 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        text = ""
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                text += f"\n----- PAGE {i+1} -----\n"
                text += page_text
    return text


SECTION_START_RE = re.compile(r'^(\d{1,3}[A-Z]{0,3})\s?\.\s?(?=[(“"A-Z])')
MIN_MARGIN_TITLES = 10   # fewer matches than this: the Act does not use margin notes


def margin_titles_from_pdf(pdf_path: str) -> dict:
    """
    Section titles of Acts printed with margin notes (the 2023 Gazette codes BNS, BNSS
    and BSA), read from the PDF layout: a note is a narrow block in the outer margin
    whose top lines up with the first line of its section ("138." at y=111.3, note at
    y=111.9). Plain text extraction glues the notes into the body, often without spaces
    ("Power toreleasepersonsimprisoned"), so most BNSS titles were lost.
    Returns {section number: title}; {} when PyMuPDF is missing or the Act has no notes.
    """
    try:
        import fitz   # PyMuPDF
    except ImportError:
        return {}
    titles = {}
    with fitz.open(pdf_path) as doc:
        for page in doc:
            width = page.rect.width
            starts, notes = [], []
            for x0, y0, x1, _y1, text, *_ in page.get_text("blocks"):
                text = " ".join(text.split())
                if not text or y0 < 70:              # running header
                    continue
                if x1 < width * 0.2 or x0 > width * 0.8:
                    notes.append((y0, text))
                else:
                    m = SECTION_START_RE.match(text)
                    if m:
                        starts.append((y0, m.group(1)))
            for y, note in notes:
                near = [num for sy, num in starts if abs(sy - y) <= 4]
                if len(near) == 1 and len(note) <= 160:
                    titles.setdefault(near[0], note if note.endswith('etc.') else note.rstrip(' .'))
    return titles if len(titles) >= MIN_MARGIN_TITLES else {}


def titles_path(stem: str) -> Path:
    return EXTRACTED_TEXT_DIR / f"{stem}.titles.json"


def save_margin_titles(pdf_path: Path) -> int:
    """Write <stem>.titles.json next to the extracted text when the PDF has margin notes."""
    titles = margin_titles_from_pdf(str(pdf_path))
    if titles:
        titles_path(pdf_path.stem).write_text(json.dumps(titles, ensure_ascii=False, indent=0), encoding="utf-8")
    return len(titles)


# Mapping from filename stems to proper act names (for special cases)
FILENAME_TO_ACT = {
    "engaadhaar": ("Aadhaar Act", "2016"),
    "BENEFITS AND SERVICES) ACT, 2016": (
        "Aadhaar (Targeted Delivery of Financial and Other Subsidies, Benefits and Services) Act, 2016", "2016"),
    "constitution_of_india_2024_english": ("Constitution of India", "2024"),
    "pocso_act_2012": ("Protection of Children from Sexual Offences (POCSO) Act, 2012", "2012"),
    "central_goods_and_services_tax_act_2017": ("Central Goods and Services Tax Act, 2017", "2017"),
    "protection_of_women_from_domestic_violence_act_2005": (
        "Protection of Women from Domestic Violence Act, 2005", "2005"),
    "transfer_of_property_act_1882": ("Transfer of Property Act, 1882", "1882"),
    "right_to_information_act_2005": ("Right to Information Act, 2005", "2005"),
}

# Settings shared by build-time and runtime ingestion (one source of truth, see fix #5)
EMBEDDING_MODEL_NAME = os.getenv('EMBEDDING_MODEL', 'all-MiniLM-L6-v2')
COLLECTION_NAME = os.getenv('CHROMA_COLLECTION', 'legal_sections')

CHUNK_MAX_CHARS = 1500      # sections longer than this are split at sentence boundaries


SMALL_WORDS = {"of", "and", "the", "to", "for", "from", "in", "on"}


def _title_case(title: str) -> str:
    # str.title() would give "Seamen'S"; capitalise only each word's first letter
    words = [re.sub(r"[a-z]", lambda m: m.group().upper(), w.lower(), count=1) for w in title.split()]
    return " ".join(w.lower() if i and w.lower() in SMALL_WORDS else w for i, w in enumerate(words))


def _manifest_titles() -> dict:
    """Titles read from each PDF's first page when a batch of Acts was added
    (data/raw_pdfs/<batch>/MANIFEST.json): stem -> "Indian Stamp Act, 1899"."""
    titles = {}
    for manifest in RAW_PDFS_DIR.glob("*/MANIFEST.json"):
        for entry in json.loads(manifest.read_text(encoding="utf-8")):
            name = re.sub(r"^THE\s+", "", entry["title"].strip(), flags=re.IGNORECASE)
            titles[entry["stem"]] = _title_case(name)
    return titles


MANIFEST_TITLES = _manifest_titles()


def act_name_from_filename(stem: str) -> tuple:
    """
    Derive a clean act name and year from the PDF filename stem.
    Returns (act_name, year).
    Example: 'indian_contract_act_1872' -> ('Indian Contract Act', '1872')
    """
    # Check special-case mapping first
    if stem in MANIFEST_TITLES:
        year = (re.search(r"(\d{4})$", stem) or [None, ""])[1]
        return MANIFEST_TITLES[stem], year
    if stem in FILENAME_TO_ACT:
        return FILENAME_TO_ACT[stem]

    # Try to extract trailing year
    year_match = re.search(r'(\d{4})$', stem)
    year = year_match.group(1) if year_match else ""

    # Remove trailing year (and optional underscore before it)
    name_part = re.sub(r'_?\d{4}$', '', stem)

    # Convert underscores to spaces and title-case
    words = name_part.replace('_', ' ').strip().title().split()
    # "Code Of Civil Procedure" -> "Code of Civil Procedure"
    act_name = " ".join(w.lower() if i and w.lower() in {"of", "and", "the", "to", "for", "from", "in", "on"} else w
                        for i, w in enumerate(words))

    # Append year to the act name for display
    if year:
        act_name = f"{act_name}, {year}"

    return (act_name, year)


def clean_raw_text(text: str) -> str:
    """Clean raw PDF-extracted text before chunking."""
    # Remove page markers like "----- PAGE 33 -----"
    text = re.sub(r'-{3,}\s*PAGE\s*\d+\s*-{3,}', ' ', text)
    # Remove gazette / header noise
    text = re.sub(r'THE GAZETTE OF INDIA[^\n]*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'EXTRAORDINARY\[?Part[^\n]*', '', text, flags=re.IGNORECASE)
    # Collapse multiple whitespace / newlines into single space
    text = re.sub(r'[ \t]+', ' ', text)
    # But keep paragraph breaks (double newlines)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def split_at_sentence_boundary(text: str, max_chars: int = 1500) -> list:
    """
    Split text into parts at sentence boundaries (period, semicolon).
    Each part will be at most max_chars, split at the nearest sentence end.
    """
    if len(text) <= max_chars:
        return [text]

    parts = []
    remaining = text
    while len(remaining) > max_chars:
        # Find the last sentence-ending punctuation within max_chars
        cut_region = remaining[:max_chars]
        # Look for period, semicolon, or colon followed by space as sentence boundary
        last_period = -1
        for punct in ['. ', '; ', '.\n', ';\n']:
            pos = cut_region.rfind(punct)
            if pos > last_period:
                last_period = pos + 1  # include the punctuation

        if last_period > max_chars // 3:
            # Found a good sentence boundary in the latter 2/3 of the chunk
            parts.append(remaining[:last_period].strip())
            remaining = remaining[last_period:].strip()
        else:
            # No good boundary found, just take the whole chunk
            parts.append(cut_region.strip())
            remaining = remaining[max_chars:].strip()

    if remaining.strip():
        parts.append(remaining.strip())

    return parts


def context_header(meta: dict) -> str:
    """'Bharatiya Nyaya Sanhita, 2023 - Section 303: Theft'. Prepended to the chunk text
    before embedding / BM25 indexing so a chunk is findable by its act and section even
    when its body never names them (contextual chunk headers)."""
    header = meta.get('act_name', '')
    if meta.get('section'):
        label = "Article" if meta.get('source_file', '').startswith('constitution') else "Section"
        header += f" - {label} {meta['section']}"
    if meta.get('section_title'):
        header += f": {meta['section_title']}"
    if meta.get('part'):
        header += f" (part {meta['part']})"
    return header


def chunk_id(meta: dict, index: int) -> str:
    """Stable id, so re-ingesting an act overwrites its chunks instead of duplicating them."""
    stem = Path(meta.get('source_file', 'unknown')).stem
    if meta.get('section'):
        return f"{stem}::s{meta['section']}::p{meta.get('part', 1)}"
    return f"{stem}::x{index}"


def chunk_legal_text(text: str, source_file: str, act_name: str, year: str, titles: dict = None) -> list:
    """
    Chunk an Act into one chunk per real section (split further when long).
    Schedules / CPC Orders that are not numbered sections are kept as unnumbered chunks.
    `titles` (from the PDF layout, see margin_titles_from_pdf) win over titles parsed from text.
    """
    from sections import parse_act

    parsed = parse_act(text)
    for sec in parsed.sections:
        sec.title = (titles or {}).get(sec.number) or sec.title
    chunks = []
    for sec in parsed.sections:
        parts = split_at_sentence_boundary(sec.text, max_chars=CHUNK_MAX_CHARS)
        for part_num, part_text in enumerate(parts, 1):
            meta = {
                "act_name": act_name, "year": year, "source_file": source_file,
                "chapter": sec.chapter, "section": sec.number, "section_title": sec.title,
            }
            if len(parts) > 1:
                meta["part"] = part_num
            chunks.append({"metadata": meta, "text": part_text})
    for heading, body in parsed.extra:
        for part_text in split_at_sentence_boundary(body, max_chars=CHUNK_MAX_CHARS):
            if len(part_text.strip()) < 80:
                continue
            chunks.append({"metadata": {
                "act_name": act_name, "year": year, "source_file": source_file,
                "chapter": heading, "section": "", "section_title": heading or "Schedule",
            }, "text": part_text})
    for i, c in enumerate(chunks):
        c["metadata"]["chunk_id"] = chunk_id(c["metadata"], i)
    return chunks


def chunk_legal_text_v1(text: str, source_file: str, act_name: str, year: str) -> list:
    """
    The original chunker, kept only so the eval can reproduce the baseline index.
    It misses sections printed without a space after the number ("303.(1) Whoever").
    """
    # Clean the raw text first
    text = clean_raw_text(text)

    chunks = []
    current_chapter = "Preliminary"

    # Split by section pattern: number followed by period and title
    # Pattern matches "1. Short title..." or "33A. Penalty for..."
    section_pattern = re.compile(
        r'(?:^|\n)\s*(\d+[A-Z]?)\.\s+([^\n—.]+?)[\s—.]+',
        re.MULTILINE
    )

    # Find all sections
    matches = list(section_pattern.finditer(text))

    if not matches:
        # If no sections found, chunk by sentence boundary
        parts = split_at_sentence_boundary(text, max_chars=1500)
        for idx, part in enumerate(parts):
            chunks.append({
                "metadata": {
                    "act_name": act_name,
                    "year": year,
                    "source_file": source_file,
                    "chapter": current_chapter,
                    "section": "",
                    "section_title": f"Part {idx + 1}" if len(parts) > 1 else "General"
                },
                "text": part
            })
        return chunks

    # Process text before first section (preamble)
    preamble = text[:matches[0].start()].strip()
    if preamble and len(preamble) > 50:
        chapter_match = re.search(r'CHAPTER\s+([IVXLC]+[A-Z]*)\s*[\n\r]+\s*(.+?)(?:\n|$)', preamble)
        if chapter_match:
            current_chapter = f"CHAPTER {chapter_match.group(1)} - {chapter_match.group(2).strip()}"

        chunks.append({
            "metadata": {
                "act_name": act_name,
                "year": year,
                "source_file": source_file,
                "chapter": current_chapter,
                "section": "",
                "section_title": "Preamble"
            },
            "text": preamble[:3000]
        })

    # Process each section
    for i, match in enumerate(matches):
        section_num = match.group(1)
        section_title = match.group(2).strip()

        # Get section text (from this match to next match or end)
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        section_text = text[start:end].strip()

        # Skip very short sections (likely Table of Contents entries)
        if len(section_text) < 70:
            continue

        # Check for chapter headers within section text
        chapter_match = re.search(r'CHAPTER\s+([IVXLC]+[A-Z]*)\s*[\n\r]+\s*(.+?)(?:\n|$)', section_text)
        if chapter_match:
            current_chapter = f"CHAPTER {chapter_match.group(1)} - {chapter_match.group(2).strip()}"

        # Split large sections at sentence boundaries
        if len(section_text) > 3000:
            parts = split_at_sentence_boundary(section_text, max_chars=1500)
            for part_num, part_text in enumerate(parts, 1):
                chunks.append({
                    "metadata": {
                        "act_name": act_name,
                        "year": year,
                        "source_file": source_file,
                        "chapter": current_chapter,
                        "section": section_num,
                        "section_title": section_title,
                        "part": part_num
                    },
                    "text": part_text
                })
        else:
            chunks.append({
                "metadata": {
                    "act_name": act_name,
                    "year": year,
                    "source_file": source_file,
                    "chapter": current_chapter,
                    "section": section_num,
                    "section_title": section_title
                },
                "text": section_text
            })

    return chunks


def save_chunks_jsonl(chunks: list, output_path: str):
    """Save chunks as JSONL file."""
    with open(output_path, 'w', encoding='utf-8') as f:
        for chunk in chunks:
            f.write(json.dumps(chunk, ensure_ascii=False) + '\n')


def load_chunk_files(chunks_dir) -> list:
    chunks = []
    for chunk_file in sorted(Path(chunks_dir).glob("*.jsonl")):
        with open(chunk_file, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f):
                if line.strip():
                    data = json.loads(line)
                    data['metadata'].setdefault('chunk_id', f"{chunk_file.stem}_{line_num}")
                    chunks.append(data)
    return chunks


def upsert_chunks(collection, model, chunks: list, batch_size: int = 32) -> int:
    """Embed '<context header>\\n<text>' and upsert by stable chunk id (idempotent)."""
    import gc
    total = 0
    for start in range(0, len(chunks), batch_size):
        batch = chunks[start:start + batch_size]
        metas = [{k: str(v) for k, v in c['metadata'].items() if isinstance(v, (str, int, float, bool))}
                 for c in batch]
        embed_inputs = [f"{context_header(m)}\n{c['text']}" for m, c in zip(metas, batch)]
        embeddings = model.encode(embed_inputs, show_progress_bar=False, batch_size=8)
        collection.upsert(
            ids=[m['chunk_id'] for m in metas],
            documents=[c['text'] for c in batch],
            metadatas=metas,
            embeddings=embeddings.tolist(),
        )
        total += len(batch)
        gc.collect()
    return total


def build_vector_store(chunks_dir: str, vector_db_dir: str, collection_name: str = None):
    """(Re)build the Chroma collection from all chunk files."""
    from chromadb import PersistentClient
    from sentence_transformers import SentenceTransformer

    collection_name = collection_name or COLLECTION_NAME
    print(f"Loading embedding model: {EMBEDDING_MODEL_NAME}...")
    model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    client = PersistentClient(path=str(vector_db_dir))
    try:
        client.delete_collection(collection_name)
    except Exception:
        pass
    collection = client.create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine", "embedding_model": EMBEDDING_MODEL_NAME},
    )
    chunks = load_chunk_files(chunks_dir)
    print(f"Embedding {len(chunks)} chunks into '{collection_name}'...")
    total = upsert_chunks(collection, model, chunks)
    print(f"Successfully indexed {total} chunks into ChromaDB")


def ingest_all():
    """Full ingestion pipeline: PDF -> Text -> Chunks -> Vector Store."""
    pdf_files = list(RAW_PDFS_DIR.glob("**/*.pdf"))
    
    if not pdf_files:
        print("No PDF files found in data/raw_pdfs/indiacode_pdfs/")
        return
    
    print(f"Found {len(pdf_files)} PDF file(s)")
    
    # Clean up old data first
    print("\n--- Cleaning old data ---")
    import shutil
    for old_txt in EXTRACTED_TEXT_DIR.glob("*"):
        old_txt.unlink()
        print(f"  Deleted {old_txt.name}")
    for old_chunk in CHUNKS_DIR.glob("*"):
        old_chunk.unlink()
        print(f"  Deleted {old_chunk.name}")
    # The vector store is not wiped: build_vector_store() recreates only its own collection.

    for pdf_path in pdf_files:
        stem = pdf_path.stem
        act_name, year = act_name_from_filename(stem)
        print(f"\n--- Processing: {pdf_path.name} -> \"{act_name}\" ---")
        
        # Step 1: Extract text
        txt_path = EXTRACTED_TEXT_DIR / f"{stem}.txt"
        print(f"  Extracting text...")
        text = extract_text_from_pdf(str(pdf_path))
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f"  Saved to {txt_path.name}")
        save_margin_titles(pdf_path)
        
        # Step 2: Chunk text (using filename-based act name)
        chunks_path = CHUNKS_DIR / f"{stem}_chunks.jsonl"
        print(f"  Chunking text...")
        chunks = chunk_legal_text(text, f"{stem}.txt", act_name, year, load_titles(stem))
        save_chunks_jsonl(chunks, str(chunks_path))
        print(f"  Created {len(chunks)} chunks -> {chunks_path.name}")
    
    # Step 3: Build vector store
    print(f"\n--- Building Vector Store ---")
    build_vector_store(str(CHUNKS_DIR), str(VECTOR_DB_DIR))
    print("Done!")


def extract_new_pdfs():
    """Extract text only for PDFs that have no extracted text yet (adding Acts
    without touching the existing extractions)."""
    added = 0
    for pdf_path in sorted(RAW_PDFS_DIR.glob("**/*.pdf")):
        txt_path = EXTRACTED_TEXT_DIR / f"{pdf_path.stem}.txt"
        if txt_path.exists():
            continue
        txt_path.write_text(extract_text_from_pdf(str(pdf_path)), encoding="utf-8")
        save_margin_titles(pdf_path)
        added += 1
    print(f"Extracted text for {added} new PDF(s)")


def extract_margin_titles_all():
    """(Re)build the <stem>.titles.json files for every PDF, without re-extracting text."""
    for pdf_path in sorted(RAW_PDFS_DIR.glob("**/*.pdf")):
        n = save_margin_titles(pdf_path)
        if n:
            print(f"  {n:4} margin titles  {pdf_path.stem}")


def load_titles(stem: str) -> dict:
    path = titles_path(stem)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def rechunk_all():
    """Re-chunk from the already extracted text (no PDF parsing) and rebuild the index."""
    for old_chunk in CHUNKS_DIR.glob("*_chunks.jsonl"):
        old_chunk.unlink()
    for txt_path in sorted(EXTRACTED_TEXT_DIR.glob("*.txt")):
        act_name, year = act_name_from_filename(txt_path.stem)
        text = txt_path.read_text(encoding='utf-8')
        chunks = chunk_legal_text(text, txt_path.name, act_name, year, load_titles(txt_path.stem))
        save_chunks_jsonl(chunks, str(CHUNKS_DIR / f"{txt_path.stem}_chunks.jsonl"))
        print(f"  {len(chunks):5} chunks  {act_name}")
    build_vector_store(str(CHUNKS_DIR), str(VECTOR_DB_DIR))


if __name__ == "__main__":
    if "--add-new" in sys.argv:
        extract_new_pdfs()
        rechunk_all()
    elif "--rechunk" in sys.argv:
        if "--titles" in sys.argv:
            extract_margin_titles_all()
        rechunk_all()
    else:
        ingest_all()
