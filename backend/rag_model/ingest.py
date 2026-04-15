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


# Mapping from filename stems to proper act names (for special cases)
FILENAME_TO_ACT = {
    "engaadhaar": ("Aadhaar Act", "2016"),
    "constitution_of_india_2024_english": ("Constitution of India", "2024"),
    "DIP_Problem_statements_6th_sem": ("DIP Problem Statements", ""),
}


def act_name_from_filename(stem: str) -> tuple:
    """
    Derive a clean act name and year from the PDF filename stem.
    Returns (act_name, year).
    Example: 'indian_contract_act_1872' -> ('Indian Contract Act', '1872')
    """
    # Check special-case mapping first
    if stem in FILENAME_TO_ACT:
        return FILENAME_TO_ACT[stem]

    # Try to extract trailing year
    year_match = re.search(r'(\d{4})$', stem)
    year = year_match.group(1) if year_match else ""

    # Remove trailing year (and optional underscore before it)
    name_part = re.sub(r'_?\d{4}$', '', stem)

    # Convert underscores to spaces and title-case
    act_name = name_part.replace('_', ' ').strip().title()

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


def chunk_legal_text(text: str, source_file: str, act_name: str, year: str) -> list:
    """
    Chunk legal text by sections and chapters.
    Text is cleaned first, then split by sections.
    Large sections are split at sentence boundaries to keep clauses meaningful.
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


def build_vector_store(chunks_dir: str, vector_db_dir: str):
    """Build ChromaDB vector store from all chunk files."""
    from chromadb import PersistentClient
    from sentence_transformers import SentenceTransformer
    
    print("Loading embedding model...")
    model = SentenceTransformer('all-MiniLM-L6-v2')
    
    # Initialize ChromaDB
    client = PersistentClient(path=str(vector_db_dir))
    
    # Delete existing collection if it exists
    try:
        client.delete_collection("legal_docs")
    except Exception:
        pass
    
    collection = client.create_collection(
        name="legal_docs",
        metadata={"hnsw:space": "cosine"}
    )
    
    all_texts = []
    all_metadatas = []
    all_ids = []
    
    chunk_files = list(Path(chunks_dir).glob("*.jsonl"))
    print(f"Found {len(chunk_files)} chunk file(s)")
    
    for chunk_file in chunk_files:
        with open(chunk_file, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f):
                if not line.strip():
                    continue
                data = json.loads(line)
                text = data['text']
                metadata = data['metadata']
                
                # Flatten metadata for ChromaDB (only string values)
                flat_metadata = {}
                for k, v in metadata.items():
                    if isinstance(v, (str, int, float, bool)):
                        flat_metadata[k] = str(v)
                
                doc_id = f"{chunk_file.stem}_{line_num}"
                all_texts.append(text)
                all_metadatas.append(flat_metadata)
                all_ids.append(doc_id)
    
    if not all_texts:
        print("No chunks found to index!")
        return
    
    print(f"Embedding {len(all_texts)} chunks...")
    embeddings = model.encode(all_texts, show_progress_bar=True, batch_size=32)
    
    # Add to ChromaDB in batches
    batch_size = 100
    for i in range(0, len(all_texts), batch_size):
        end = min(i + batch_size, len(all_texts))
        collection.add(
            documents=all_texts[i:end],
            metadatas=all_metadatas[i:end],
            ids=all_ids[i:end],
            embeddings=embeddings[i:end].tolist()
        )
    
    print(f"Successfully indexed {len(all_texts)} chunks into ChromaDB")


def ingest_all():
    """Full ingestion pipeline: PDF -> Text -> Chunks -> Vector Store."""
    pdf_files = list(RAW_PDFS_DIR.glob("*.pdf"))
    
    if not pdf_files:
        print("No PDF files found in data/raw_pdfs/")
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
    if VECTOR_DB_DIR.exists():
        shutil.rmtree(VECTOR_DB_DIR)
        VECTOR_DB_DIR.mkdir(parents=True, exist_ok=True)
        print("  Cleared vector_db/")
    
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
        
        # Step 2: Chunk text (using filename-based act name)
        chunks_path = CHUNKS_DIR / f"{stem}_chunks.jsonl"
        print(f"  Chunking text...")
        chunks = chunk_legal_text(text, f"{stem}.txt", act_name, year)
        save_chunks_jsonl(chunks, str(chunks_path))
        print(f"  Created {len(chunks)} chunks -> {chunks_path.name}")
    
    # Step 3: Build vector store
    print(f"\n--- Building Vector Store ---")
    build_vector_store(str(CHUNKS_DIR), str(VECTOR_DB_DIR))
    print("Done!")


if __name__ == "__main__":
    ingest_all()
