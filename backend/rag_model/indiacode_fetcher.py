"""
IndiaCode Dynamic Law Fetcher.
Analyses user queries to identify relevant Indian laws, checks local knowledge base,
and fetches missing PDFs from indiacode.nic.in on demand.
"""

import os
import re
import json
import time
import requests
from pathlib import Path
from bs4 import BeautifulSoup

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_PDFS_DIR = DATA_DIR / "raw_pdfs"
INDIACODE_PDFS_DIR = RAW_PDFS_DIR / "indiacode_pdfs"
CHUNKS_DIR = DATA_DIR / "chunks"
VECTOR_DB_DIR = DATA_DIR / "vector_db"

# Ensure directories exist
INDIACODE_PDFS_DIR.mkdir(parents=True, exist_ok=True)

# Common headers to mimic a real browser
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}

# Known act mappings — maps common act names to their IndiaCode handle IDs or filenames
# This allows instant lookup without web scraping for frequently requested laws
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
    "protection of children from sexual offences": {"file_stem": "pocso_act_2012", "year": "2012"},
    "protection of children from sexual offences act": {"file_stem": "pocso_act_2012", "year": "2012"},
    "domestic violence act": {"file_stem": "protection_of_women_from_domestic_violence_act_2005", "year": "2005"},
    "protection of women from domestic violence act": {"file_stem": "protection_of_women_from_domestic_violence_act_2005", "year": "2005"},
    "right to information act": {"file_stem": "right_to_information_act_2005", "year": "2005"},
    "rti act": {"file_stem": "right_to_information_act_2005", "year": "2005"},
    "specific relief act": {"file_stem": "specific_relief_act_1963", "year": "1963"},
    "transfer of property act": {"file_stem": "transfer_of_property_act_1882", "year": "1882"},
    "gst act": {"file_stem": "central_goods_and_services_tax_act_2017", "year": "2017"},
    "goods and services tax act": {"file_stem": "central_goods_and_services_tax_act_2017", "year": "2017"},
    "central goods and services tax act": {"file_stem": "central_goods_and_services_tax_act_2017", "year": "2017"},
    "cgst": {"file_stem": "central_goods_and_services_tax_act_2017", "year": "2017"},
    "pocso": {"file_stem": "pocso_act_2012", "year": "2012"},
    "rti": {"file_stem": "right_to_information_act_2005", "year": "2005"},
    "it": {"file_stem": "information_technology_act_2000", "year": "2000"},
    "aadhaar act": {"file_stem": "BENEFITS AND SERVICES) ACT, 2016", "year": "2016"},
}


def analyse_query_intent(query: str, groq_client) -> dict:
    """
    Use Groq LLM to extract the legal act/topic from a user query.
    
    Returns:
        dict with keys: 'act_name' (str), 'year' (str), 'keywords' (list),
                        'is_legal_query' (bool), 'is_casual' (bool)
    """
    # Always use a highly reliable model for strict JSON intent extraction
    # The pipeline's default model (like openai/gpt-oss-20b) might fail here
    groq_model = "llama-3.3-70b-versatile"
    
    system_prompt = """You are a legal query analyser. Given a user query, extract:
1. The specific Indian Act/Law being referenced (if any)
2. The year of that act (if mentioned or known)
3. Key legal keywords
4. Whether this is a substantive legal query or casual talk (hello, what can you do, etc.)

Respond ONLY in this exact JSON format, nothing else:
{"act_name": "Name of the Act", "year": "YYYY", "keywords": ["keyword1", "keyword2"], "is_legal_query": true, "is_casual": false}

Rules:
- If the query mentions a specific act, extract it exactly (e.g., "Consumer Protection Act")
- If the query is about a legal topic but doesn't name a specific act, set act_name to "" and fill keywords
- If the query is casual/greeting, set is_casual to true and is_legal_query to false
- Map old acts to new replacements: IPC → Bharatiya Nyaya Sanhita, CrPC → Bharatiya Nagarik Suraksha Sanhita, Indian Evidence Act → Bharatiya Sakshya Adhiniyam
- Always use the most common, standard name for the act"""

    try:
        response = groq_client.chat.completions.create(
            model=groq_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ],
            temperature=0.0,
            max_tokens=256,
            timeout=15
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # Extract JSON from response (handle markdown code blocks)
        json_match = re.search(r'\{[^{}]+\}', result_text, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            return {
                "act_name": result.get("act_name", ""),
                "year": str(result.get("year", "")),
                "keywords": result.get("keywords", []),
                "is_legal_query": result.get("is_legal_query", True),
                "is_casual": result.get("is_casual", False),
            }
    except Exception as e:
        print(f"  ⚠ Query intent analysis failed: {str(e)[:100]}")
    
    # Fallback: treat as a general legal query
    return {
        "act_name": "",
        "year": "",
        "keywords": query.split()[:5],
        "is_legal_query": True,
        "is_casual": False,
    }


def check_existing_knowledge_base(act_name: str) -> bool:
    """
    Check if documents for this act already exist in the knowledge base.
    Checks both chunk files and the known acts mapping.
    
    Returns True if the act is already in the knowledge base.
    """
    if not act_name:
        return True  # No specific act → use whatever we have
    
    act_name_lower = act_name.lower().strip()
    
    # 1. Check known acts mapping
    if act_name_lower in KNOWN_ACTS:
        file_stem = KNOWN_ACTS[act_name_lower]["file_stem"]
        chunk_file = CHUNKS_DIR / f"{file_stem}_chunks.jsonl"
        if chunk_file.exists():
            print(f"  ✓ Act '{act_name}' found in knowledge base (known mapping → {file_stem})")
            return True
    
    # 2. Fuzzy check: search chunk filenames for partial match
    for chunk_file in CHUNKS_DIR.glob("*_chunks.jsonl"):
        stem_lower = chunk_file.stem.replace("_chunks", "").replace("_", " ").lower()
        # Check if the act name words appear in the filename
        act_words = act_name_lower.replace(",", "").split()
        if len(act_words) >= 2 and all(w in stem_lower for w in act_words[:3]):
            print(f"  ✓ Act '{act_name}' found in knowledge base (fuzzy match → {chunk_file.stem})")
            return True
    
    # 3. Check chunk metadata for act_name field
    for chunk_file in CHUNKS_DIR.glob("*_chunks.jsonl"):
        try:
            with open(chunk_file, 'r', encoding='utf-8') as f:
                first_line = f.readline().strip()
                if first_line:
                    data = json.loads(first_line)
                    metadata_act = data.get("metadata", {}).get("act_name", "").lower()
                    if act_name_lower in metadata_act or metadata_act in act_name_lower:
                        print(f"  ✓ Act '{act_name}' found in chunk metadata ({chunk_file.stem})")
                        return True
        except Exception:
            continue
    
    print(f"  ✗ Act '{act_name}' NOT found in knowledge base")
    return False


def search_indiacode(act_name: str, max_retries: int = 2) -> str:
    """
    Search IndiaCode for the given act name and try to find a PDF download URL.
    
    Returns: URL to the PDF, or empty string if not found.
    """
    if not act_name:
        return ""
    
    search_url = "https://www.indiacode.nic.in/handle/123456789/1362/simple-search"
    params = {
        "searchtext": act_name,
        "sort_by": "score",
        "order": "desc",
        "rpp": "10",
        "etal": "0",
        "start": "0",
    }
    
    session = requests.Session()
    session.headers.update(BROWSER_HEADERS)
    
    for attempt in range(max_retries):
        try:
            print(f"  🔍 Searching IndiaCode for: '{act_name}' (attempt {attempt + 1})...")
            
            resp = session.get(search_url, params=params, timeout=20)
            resp.raise_for_status()
            
            soup = BeautifulSoup(resp.text, 'lxml')
            
            # Look for act links in the search results
            # IndiaCode uses DSpace: results are in <td> tags with links to /handle/123456789/XXXXX
            result_links = soup.find_all('a', href=re.compile(r'/handle/123456789/\d+'))
            
            if not result_links:
                print(f"  ⚠ No results found on IndiaCode for '{act_name}'")
                continue
            
            # Find the best matching result
            best_link = None
            best_score = 0
            act_words = set(act_name.lower().split())
            
            for link in result_links:
                link_text = link.get_text(strip=True).lower()
                # Score by word overlap
                link_words = set(link_text.split())
                overlap = len(act_words & link_words)
                if overlap > best_score:
                    best_score = overlap
                    best_link = link
            
            if not best_link:
                best_link = result_links[0]
            
            act_url = best_link['href']
            if not act_url.startswith('http'):
                act_url = f"https://www.indiacode.nic.in{act_url}"
            
            print(f"  📄 Found act page: {act_url}")
            
            # Now visit the act page to find PDF/bitstream
            time.sleep(1)  # Be polite to the server
            act_resp = session.get(act_url, timeout=20)
            act_resp.raise_for_status()
            
            act_soup = BeautifulSoup(act_resp.text, 'lxml')
            
            # Look for PDF download links (bitstream links)
            pdf_links = act_soup.find_all('a', href=re.compile(r'/bitstream/.*\.pdf', re.IGNORECASE))
            
            if not pdf_links:
                # Try alternate patterns
                pdf_links = act_soup.find_all('a', href=re.compile(r'/bitstream/', re.IGNORECASE))
            
            if not pdf_links:
                # Look for "show full item" or direct PDF link, explicitly EXCLUDING site manuals
                pdf_links = [
                    a for a in act_soup.find_all('a', href=re.compile(r'\.pdf', re.IGNORECASE))
                    if 'userguide' not in a['href'].lower() and 'help' not in a['href'].lower()
                ]
            
            if pdf_links:
                pdf_url = pdf_links[0]['href']
                if not pdf_url.startswith('http'):
                    pdf_url = f"https://www.indiacode.nic.in{pdf_url}"
                print(f"  ✓ Found PDF URL: {pdf_url}")
                return pdf_url
            
            # Try to construct a show-data URL for section-wise view
            # IndiaCode often has /show-data?abv=CEN&statehandle=123456789/1362&actid=...
            show_links = act_soup.find_all('a', href=re.compile(r'/show-data'))
            if show_links:
                print(f"  ℹ Found section-wise view but no direct PDF download available")
            
            print(f"  ⚠ No PDF download found on the act page")
            
        except requests.Timeout:
            print(f"  ⚠ IndiaCode request timed out (attempt {attempt + 1})")
            time.sleep(2)
        except requests.RequestException as e:
            print(f"  ⚠ IndiaCode request failed: {str(e)[:100]}")
            time.sleep(2)
        except Exception as e:
            print(f"  ⚠ IndiaCode parsing error: {str(e)[:100]}")
    
    # Fallback: try Google search for IndiaCode PDF
    return _google_search_fallback(act_name)


def _google_search_fallback(act_name: str) -> str:
    """
    Fallback: Use a web search to find the act PDF from IndiaCode or other government sources.
    """
    try:
        print(f"  🔍 Trying Google fallback search for: '{act_name}'...")
        
        search_query = f"site:indiacode.nic.in {act_name} filetype:pdf"
        search_url = "https://www.google.com/search"
        params = {"q": search_query, "num": "5"}
        
        resp = requests.get(search_url, params=params, headers=BROWSER_HEADERS, timeout=15)
        
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, 'lxml')
            # Look for PDF links in search results
            for link in soup.find_all('a', href=True):
                href = link['href']
                if 'indiacode.nic.in' in href and '.pdf' in href.lower():
                    # Clean Google redirect URL
                    if '/url?q=' in href:
                        href = href.split('/url?q=')[1].split('&')[0]
                    print(f"  ✓ Found PDF via Google: {href}")
                    return href
        
        print(f"  ⚠ Google fallback also found no PDF for '{act_name}'")
    except Exception as e:
        print(f"  ⚠ Google fallback failed: {str(e)[:80]}")
    
    return ""


def download_pdf(url: str, act_name: str) -> str:
    """
    Download a PDF from the given URL and save it to the indiacode_pdfs directory.
    
    Returns: Path to the saved PDF file, or empty string if download failed.
    """
    if not url:
        return ""
    
    # Create a clean filename from the act name
    clean_name = re.sub(r'[^\w\s-]', '', act_name.lower())
    clean_name = re.sub(r'\s+', '_', clean_name.strip())
    if not clean_name:
        clean_name = "unknown_act"
    
    pdf_path = INDIACODE_PDFS_DIR / f"{clean_name}.pdf"
    
    # Skip if already downloaded
    if pdf_path.exists() and pdf_path.stat().st_size > 1000:
        print(f"  ✓ PDF already downloaded: {pdf_path.name}")
        return str(pdf_path)
    
    try:
        print(f"  ⬇ Downloading PDF: {url[:80]}...")
        resp = requests.get(url, headers=BROWSER_HEADERS, timeout=60, stream=True)
        resp.raise_for_status()
        
        # Verify it's actually a PDF
        content_type = resp.headers.get('Content-Type', '')
        if 'pdf' not in content_type.lower() and not resp.content[:5] == b'%PDF-':
            print(f"  ⚠ Downloaded content is not a PDF (Content-Type: {content_type})")
            return ""
        
        with open(pdf_path, 'wb') as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        
        file_size = pdf_path.stat().st_size
        print(f"  ✓ PDF downloaded: {pdf_path.name} ({file_size / 1024:.1f} KB)")
        return str(pdf_path)
        
    except Exception as e:
        print(f"  ⚠ PDF download failed: {str(e)[:100]}")
        # Clean up partial download
        if pdf_path.exists():
            pdf_path.unlink()
        return ""


def ingest_single_pdf(pdf_path: str) -> bool:
    """
    Ingest a single PDF into the knowledge base (extract → chunk → append to vector store).
    Does NOT rebuild the entire vector store — only appends new documents.
    
    Returns True if ingestion succeeded.
    """
    from ingest import (
        extract_text_from_pdf, act_name_from_filename, 
        chunk_legal_text, save_chunks_jsonl
    )
    
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        print(f"  ⚠ PDF not found: {pdf_path}")
        return False
    
    stem = pdf_path.stem
    act_name, year = act_name_from_filename(stem)
    print(f"\n  --- Ingesting: {pdf_path.name} → \"{act_name}\" ---")
    
    # Step 1: Extract text
    from pathlib import Path as P
    extracted_text_dir = DATA_DIR / "extracted_text"
    extracted_text_dir.mkdir(parents=True, exist_ok=True)
    
    txt_path = extracted_text_dir / f"{stem}.txt"
    print(f"  Extracting text...")
    text = extract_text_from_pdf(str(pdf_path))
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f"  Saved text: {txt_path.name}")
    
    # Step 2: Chunk text
    chunks_path = CHUNKS_DIR / f"{stem}_chunks.jsonl"
    print(f"  Chunking text...")
    chunks = chunk_legal_text(text, f"{stem}.txt", act_name, year)
    save_chunks_jsonl(chunks, str(chunks_path))
    print(f"  Created {len(chunks)} chunks → {chunks_path.name}")
    
    if not chunks:
        print(f"  ⚠ No chunks generated from PDF")
        return False
    
    # Step 3: Append to existing vector store
    print(f"  Embedding and adding to vector store...")
    try:
        from chromadb import PersistentClient
        from sentence_transformers import SentenceTransformer
        import gc
        
        model = SentenceTransformer('all-MiniLM-L6-v2')
        client = PersistentClient(path=str(VECTOR_DB_DIR))
        collection = client.get_or_create_collection(
            name="legal_docs",
            metadata={"hnsw:space": "cosine"}
        )
        
        batch_size = 16
        batch_texts = []
        batch_metadatas = []
        batch_ids = []
        total_added = 0
        
        for idx, chunk in enumerate(chunks):
            text_content = chunk['text']
            metadata = chunk['metadata']
            
            # Flatten metadata for ChromaDB
            flat_metadata = {}
            for k, v in metadata.items():
                if isinstance(v, (str, int, float, bool)):
                    flat_metadata[k] = str(v)
            
            doc_id = f"indiacode_{stem}_{idx}"
            batch_texts.append(text_content)
            batch_metadatas.append(flat_metadata)
            batch_ids.append(doc_id)
            
            if len(batch_texts) >= batch_size:
                embeddings = model.encode(batch_texts, show_progress_bar=False, batch_size=batch_size)
                collection.add(
                    documents=batch_texts,
                    metadatas=batch_metadatas,
                    ids=batch_ids,
                    embeddings=embeddings.tolist()
                )
                total_added += len(batch_texts)
                batch_texts, batch_metadatas, batch_ids = [], [], []
                gc.collect()
        
        # Process remaining
        if batch_texts:
            embeddings = model.encode(batch_texts, show_progress_bar=False, batch_size=batch_size)
            collection.add(
                documents=batch_texts,
                metadatas=batch_metadatas,
                ids=batch_ids,
                embeddings=embeddings.tolist()
            )
            total_added += len(batch_texts)
        
        print(f"  ✓ Added {total_added} chunks to vector store (total: {collection.count()})")
        return True
        
    except Exception as e:
        print(f"  ⚠ Vector store append failed: {str(e)[:150]}")
        return False


def perform_web_search_context(query: str) -> str:
    """Uses DuckDuckGo HTML version to get quick search snippets as fallback context."""
    try:
        url = "https://html.duckduckgo.com/html/"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"}
        data = {"q": query + " indian law provisions key facts"}
        resp = requests.post(url, data=data, headers=headers, timeout=10)
        
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, 'lxml')
            snippets = [a.get_text(strip=True) for a in soup.find_all('a', class_='result__snippet')]
            if snippets:
                return "\n---\n".join(snippets[:5])
    except Exception as e:
        print(f"  ⚠ Web search fallback failed: {str(e)[:100]}")
    return ""


def fetch_and_ingest_if_needed(query: str, groq_client) -> dict:
    """
    Orchestrator: analyse query → check KB → fetch from IndiaCode if needed → ingest.
    
    Returns:
        dict with keys:
        - 'ingested': bool — whether new data was added
        - 'act_name': str — identified act name
        - 'intent': dict — full intent analysis result
        - 'web_context': str — optional contextual fallback text if downloaded failed
    """
    # Step 1: Analyse the query intent
    intent = analyse_query_intent(query, groq_client)
    
    act_name = intent.get("act_name", "")
    
    # Skip for casual talk or non-legal queries
    if intent.get("is_casual", False) or not intent.get("is_legal_query", True):
        print(f"  ℹ Query is casual/non-legal, skipping IndiaCode fetch")
        return {"ingested": False, "act_name": "", "intent": intent}
    
    # Skip if no specific act identified
    if not act_name:
        print(f"  ℹ No specific act identified in query, using existing KB")
        return {"ingested": False, "act_name": "", "intent": intent}
    
    # Step 2: Check if act exists in knowledge base
    if check_existing_knowledge_base(act_name):
        return {"ingested": False, "act_name": act_name, "intent": intent}
    
    # Step 3: Try to fetch from IndiaCode
    print(f"\n  🌐 Attempting to fetch '{act_name}' from IndiaCode...")
    pdf_url = search_indiacode(act_name)
    
    if not pdf_url:
        print(f"  ⚠ Could not find PDF for '{act_name}' online")
        print("  🌐 Attempting rapid web search for context fallback instead...")
        web_context = perform_web_search_context(act_name)
        return {"ingested": False, "act_name": act_name, "intent": intent, "web_context": web_context}
    
    # Step 4: Download the PDF
    pdf_path = download_pdf(pdf_url, act_name)
    
    if not pdf_path:
        print("  🌐 Attempting rapid web search for context fallback instead...")
        web_context = perform_web_search_context(act_name)
        return {"ingested": False, "act_name": act_name, "intent": intent, "web_context": web_context}
    
    # Step 5: Ingest the PDF
    success = ingest_single_pdf(pdf_path)
    
    return {"ingested": success, "act_name": act_name, "intent": intent}


if __name__ == "__main__":
    # Test the fetcher
    print("=== IndiaCode Fetcher Test ===\n")
    
    # Test 1: Check existing knowledge base
    print("--- Test: Check existing KB ---")
    print(f"  'Indian Contract Act': {check_existing_knowledge_base('Indian Contract Act')}")
    print(f"  'Consumer Protection Act': {check_existing_knowledge_base('Consumer Protection Act')}")
    
    # Test 2: Query intent analysis (requires Groq)
    from dotenv import load_dotenv
    load_dotenv()
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        from groq import Groq
        client = Groq(api_key=groq_key)
        
        test_queries = [
            "What is the punishment for theft under IPC?",
            "Hello, what can you do?",
            "Tell me about Consumer Protection Act 2019",
            "मुझे तलाक के बारे में बताओ",
        ]
        
        print("\n--- Test: Query Intent Analysis ---")
        for q in test_queries:
            result = analyse_query_intent(q, client)
            print(f"  Q: {q[:50]}...")
            print(f"  → {result}")
            print()
