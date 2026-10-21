"""
IndiaCode law fetcher (admin only).

Finds an Act on indiacode.nic.in, downloads its PDF and adds it to the index.
Called from the admin endpoint /api/fetch-law, never from a chat query: scraping,
downloading and re-embedding takes minutes and memory, and letting any user trigger
it allowed corpus pollution and out-of-memory kills on the 1 GB server.

Safety:
  * only https URLs on indiacode.nic.in are followed or downloaded;
  * downloads are streamed with a size cap and must start with %PDF;
  * one ingestion at a time; re-ingesting an act replaces its chunks (stable ids).
"""

import json
import re
import threading
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_PDFS_DIR = DATA_DIR / "raw_pdfs"
INDIACODE_PDFS_DIR = RAW_PDFS_DIR / "indiacode_pdfs"
CHUNKS_DIR = DATA_DIR / "chunks"
VECTOR_DB_DIR = DATA_DIR / "vector_db"

INDIACODE_HOSTS = {"indiacode.nic.in", "www.indiacode.nic.in"}
INDIACODE_BASE = "https://www.indiacode.nic.in"
MAX_PDF_BYTES = 25 * 1024 * 1024

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
}

# Known act mappings — common act names -> chunk file stem, for instant KB checks
KNOWN_ACTS = {
    "constitution of india": {"file_stem": "constitution_of_india_2024_english", "year": "2024"},
    "indian penal code": {"file_stem": "bharatiya_nyaya_sanhita_2023", "year": "2023", "alt_name": "Bharatiya Nyaya Sanhita"},
    "bharatiya nyaya sanhita": {"file_stem": "bharatiya_nyaya_sanhita_2023", "year": "2023"},
    "bharatiya nagarik suraksha sanhita": {"file_stem": "bharatiya_nagarik_suraksha_sanhita_2023", "year": "2023"},
    "bharatiya sakshya adhiniyam": {"file_stem": "bharatiya_sakshya_adhiniyam_2023", "year": "2023"},
    "indian evidence act": {"file_stem": "bharatiya_sakshya_adhiniyam_2023", "year": "2023", "alt_name": "Bharatiya Sakshya Adhiniyam"},
    "code of criminal procedure": {"file_stem": "bharatiya_nagarik_suraksha_sanhita_2023", "year": "2023", "alt_name": "Bharatiya Nagarik Suraksha Sanhita"},
    "crpc": {"file_stem": "bharatiya_nagarik_suraksha_sanhita_2023", "year": "2023"},
    "code of civil procedure": {"file_stem": "code_of_civil_procedure_1908", "year": "1908"},
    "cpc": {"file_stem": "code_of_civil_procedure_1908", "year": "1908"},
    "indian contract act": {"file_stem": "indian_contract_act_1872", "year": "1872"},
    "contract act": {"file_stem": "indian_contract_act_1872", "year": "1872"},
    "hindu marriage act": {"file_stem": "hindu_marriage_act_1955", "year": "1955"},
    "special marriage act": {"file_stem": "special_marriage_act_1954", "year": "1954"},
    "information technology act": {"file_stem": "information_technology_act_2000", "year": "2000"},
    "it act": {"file_stem": "information_technology_act_2000", "year": "2000"},
    "motor vehicles act": {"file_stem": "motor_vehicles_act_1988", "year": "1988"},
    "environment protection act": {"file_stem": "environment_protection_act_1986", "year": "1986"},
    "pocso act": {"file_stem": "pocso_act_2012", "year": "2012"},
    "pocso": {"file_stem": "pocso_act_2012", "year": "2012"},
    "protection of children from sexual offences act": {"file_stem": "pocso_act_2012", "year": "2012"},
    "domestic violence act": {"file_stem": "protection_of_women_from_domestic_violence_act_2005", "year": "2005"},
    "protection of women from domestic violence act": {"file_stem": "protection_of_women_from_domestic_violence_act_2005", "year": "2005"},
    "right to information act": {"file_stem": "right_to_information_act_2005", "year": "2005"},
    "rti act": {"file_stem": "right_to_information_act_2005", "year": "2005"},
    "rti": {"file_stem": "right_to_information_act_2005", "year": "2005"},
    "specific relief act": {"file_stem": "specific_relief_act_1963", "year": "1963"},
    "transfer of property act": {"file_stem": "transfer_of_property_act_1882", "year": "1882"},
    "gst act": {"file_stem": "central_goods_and_services_tax_act_2017", "year": "2017"},
    "cgst": {"file_stem": "central_goods_and_services_tax_act_2017", "year": "2017"},
    "central goods and services tax act": {"file_stem": "central_goods_and_services_tax_act_2017", "year": "2017"},
    "aadhaar act": {"file_stem": "BENEFITS AND SERVICES) ACT, 2016", "year": "2016"},
}

_ingest_lock = threading.Lock()


def is_indiacode_url(url: str) -> bool:
    """https and exactly an IndiaCode host - not merely a URL that contains the name
    (https://indiacode.nic.in.evil.com/ or https://evil.com/?indiacode.nic.in)."""
    if "\\" in url:   # parsers disagree on backslashes; never ambiguous URLs
        return False
    try:
        parsed = urlparse(url)
        port = parsed.port
    except ValueError:
        return False
    if parsed.username or parsed.password or port not in (None, 443):
        return False
    return parsed.scheme == "https" and (parsed.hostname or "").lower() in INDIACODE_HOSTS


def check_existing_knowledge_base(act_name: str) -> bool:
    """True if this act's chunks already exist."""
    if not act_name:
        return True
    act_name_lower = act_name.lower().strip()

    if act_name_lower in KNOWN_ACTS:
        if (CHUNKS_DIR / f"{KNOWN_ACTS[act_name_lower]['file_stem']}_chunks.jsonl").exists():
            return True

    act_words = act_name_lower.replace(",", "").split()
    for chunk_file in CHUNKS_DIR.glob("*_chunks.jsonl"):
        stem_lower = chunk_file.stem.replace("_chunks", "").replace("_", " ").lower()
        if len(act_words) >= 2 and all(w in stem_lower for w in act_words[:3]):
            return True
        try:
            with open(chunk_file, 'r', encoding='utf-8') as f:
                first_line = f.readline().strip()
            if first_line:
                metadata_act = json.loads(first_line).get("metadata", {}).get("act_name", "").lower()
                if metadata_act and (act_name_lower in metadata_act or metadata_act in act_name_lower):
                    return True
        except (OSError, ValueError):
            continue
    return False


def search_indiacode(act_name: str, max_retries: int = 2) -> str:
    """Search IndiaCode for the act; returns a PDF URL on indiacode.nic.in, or ''."""
    if not act_name:
        return ""
    search_url = f"{INDIACODE_BASE}/handle/123456789/1362/simple-search"
    params = {"searchtext": act_name, "sort_by": "score", "order": "desc", "rpp": "10", "etal": "0", "start": "0"}
    session = requests.Session()
    session.headers.update(BROWSER_HEADERS)

    for attempt in range(max_retries):
        try:
            resp = session.get(search_url, params=params, timeout=20)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, 'lxml')
            result_links = soup.find_all('a', href=re.compile(r'/handle/123456789/\d+'))
            if not result_links:
                continue

            act_words = set(act_name.lower().split())
            best_link = max(result_links, key=lambda a: len(act_words & set(a.get_text(strip=True).lower().split())))
            act_url = urljoin(INDIACODE_BASE, best_link['href'])
            if not is_indiacode_url(act_url):
                continue

            time.sleep(1)  # be polite to the server
            act_resp = session.get(act_url, timeout=20)
            act_resp.raise_for_status()
            act_soup = BeautifulSoup(act_resp.text, 'lxml')
            pdf_links = act_soup.find_all('a', href=re.compile(r'/bitstream/.*\.pdf', re.IGNORECASE))
            for link in pdf_links:
                pdf_url = urljoin(INDIACODE_BASE, link['href'])
                if is_indiacode_url(pdf_url):
                    return pdf_url
        except requests.RequestException as e:
            print(f"  ⚠ IndiaCode request failed: {str(e)[:100]}")
            time.sleep(2)
        except Exception as e:
            print(f"  ⚠ IndiaCode parsing error: {str(e)[:100]}")
    return ""


def download_pdf(url: str, act_name: str, max_bytes: int = MAX_PDF_BYTES) -> str:
    """Download an IndiaCode PDF (streamed, size-capped). Returns the saved path or ''."""
    if not url or not is_indiacode_url(url):
        print(f"  ⚠ Refusing to download from a non-IndiaCode URL: {url[:80]}")
        return ""

    clean_name = re.sub(r'[^\w\s-]', '', act_name.lower())
    clean_name = re.sub(r'\s+', '_', clean_name.strip()) or "unknown_act"
    INDIACODE_PDFS_DIR.mkdir(parents=True, exist_ok=True)
    pdf_path = INDIACODE_PDFS_DIR / f"{clean_name}.pdf"
    if pdf_path.exists() and pdf_path.stat().st_size > 1000:
        return str(pdf_path)

    tmp_path = pdf_path.with_suffix(".part")
    try:
        with requests.get(url, headers=BROWSER_HEADERS, timeout=60, stream=True, allow_redirects=False) as resp:
            resp.raise_for_status()
            declared = int(resp.headers.get("Content-Length") or 0)
            if declared > max_bytes:
                print(f"  ⚠ PDF too large ({declared} bytes)")
                return ""
            size, first = 0, b""
            with open(tmp_path, 'wb') as f:
                for chunk in resp.iter_content(chunk_size=65536):
                    if not first:
                        first = chunk[:5]
                        if first != b'%PDF-':
                            print("  ⚠ Downloaded content is not a PDF")
                            return ""
                    size += len(chunk)
                    if size > max_bytes:
                        print(f"  ⚠ PDF exceeded {max_bytes} bytes, aborted")
                        return ""
                    f.write(chunk)
        tmp_path.replace(pdf_path)
        print(f"  ✓ PDF downloaded: {pdf_path.name} ({size / 1024:.1f} KB)")
        return str(pdf_path)
    except Exception as e:
        print(f"  ⚠ PDF download failed: {str(e)[:100]}")
        return ""
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


def ingest_single_pdf(pdf_path: str) -> bool:
    """Extract -> chunk -> embed one PDF into the shared collection. Re-ingesting the
    same act replaces its chunks. Only one ingestion runs at a time."""
    from ingest import (COLLECTION_NAME, EMBEDDING_MODEL_NAME, act_name_from_filename,
                        chunk_legal_text, extract_text_from_pdf, save_chunks_jsonl, upsert_chunks)

    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        return False
    if not _ingest_lock.acquire(blocking=False):
        print("  ⚠ Another ingestion is running; skipped")
        return False
    try:
        stem = pdf_path.stem
        act_name, year = act_name_from_filename(stem)
        text = extract_text_from_pdf(str(pdf_path))
        extracted_dir = DATA_DIR / "extracted_text"
        extracted_dir.mkdir(parents=True, exist_ok=True)
        (extracted_dir / f"{stem}.txt").write_text(text, encoding='utf-8')

        chunks = chunk_legal_text(text, f"{stem}.txt", act_name, year)
        if not chunks:
            print("  ⚠ No chunks generated from PDF")
            return False
        CHUNKS_DIR.mkdir(parents=True, exist_ok=True)
        save_chunks_jsonl(chunks, str(CHUNKS_DIR / f"{stem}_chunks.jsonl"))

        from chromadb import PersistentClient
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(EMBEDDING_MODEL_NAME)
        collection = PersistentClient(path=str(VECTOR_DB_DIR)).get_or_create_collection(
            COLLECTION_NAME, metadata={"hnsw:space": "cosine", "embedding_model": EMBEDDING_MODEL_NAME})
        collection.delete(where={"source_file": f"{stem}.txt"})   # drop stale parts of an earlier version
        added = upsert_chunks(collection, model, chunks)
        print(f"  ✓ Indexed {added} chunks for {act_name} (total: {collection.count()})")
        return True
    except Exception as e:
        print(f"  ⚠ Ingestion failed: {str(e)[:150]}")
        return False
    finally:
        _ingest_lock.release()
