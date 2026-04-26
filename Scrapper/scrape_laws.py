"""
Indian Laws & Acts Scraper
===========================
Reads URLs from indian_laws_and_acts_v2.csv, scrapes legal text from
indiankanoon.org, and saves each document as a PDF in the scraped_pdf/ folder.

Usage:
    python scrape_laws.py
"""

import csv
import os
import re
import time
import logging
import hashlib
import json
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from fpdf import FPDF

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
CSV_FILE = "indian_laws_and_acts_v2.csv"
OUTPUT_DIR = "scraped_pdf"
PROGRESS_FILE = "scrape_progress.json"  # tracks completed URLs for resumability
REQUEST_DELAY = 2  # seconds between requests (be polite to the server)
REQUEST_TIMEOUT = 30  # seconds
MAX_RETRIES = 3
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("scrape_laws.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def sanitize_filename(name: str, max_len: int = 120) -> str:
    """Turn an arbitrary title string into a safe filename (no extension)."""
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', name)
    name = re.sub(r'[\s,;]+', '_', name)
    name = re.sub(r'_+', '_', name).strip('_.')
    if len(name) > max_len:
        name = name[:max_len].rstrip('_')
    return name


def load_progress() -> set:
    """Load the set of already-scraped URLs."""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
            return set(json.load(f))
    return set()


def save_progress(done: set):
    """Persist the set of already-scraped URLs."""
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(sorted(done), f)


def fetch_page(url: str, session: requests.Session) -> str | None:
    """Fetch a URL with retries.  Returns HTML text or None."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = session.get(url, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 200:
                return resp.text
            log.warning("HTTP %s for %s (attempt %d)", resp.status_code, url, attempt)
        except requests.RequestException as exc:
            log.warning("Request error for %s (attempt %d): %s", url, attempt, exc)
        time.sleep(REQUEST_DELAY * attempt)  # exponential-ish back-off
    return None


def extract_legal_text(html: str) -> tuple[str, str]:
    """
    Parse the Indian Kanoon page and return (title, body_text).
    The main legal content lives in a <div> with class 'judgments' or 'doc_content'.
    """
    soup = BeautifulSoup(html, "html.parser")

    # --- title ---
    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else "Untitled"

    # --- body text ---
    # Indian Kanoon puts the document in several possible containers
    content_div = (
        soup.find("div", class_="judgments")
        or soup.find("div", class_="doc_content")
        or soup.find("div", id="main-content")
        or soup.find("div", class_="result")
    )

    if content_div:
        # Remove script/style tags
        for tag in content_div.find_all(["script", "style", "nav", "header", "footer"]):
            tag.decompose()
        text = content_div.get_text(separator="\n")
    else:
        # Fallback: grab the whole body
        body = soup.find("body")
        if body:
            for tag in body.find_all(["script", "style", "nav", "header", "footer"]):
                tag.decompose()
            text = body.get_text(separator="\n")
        else:
            text = soup.get_text(separator="\n")

    # Clean up excessive blank lines
    lines = [line.strip() for line in text.splitlines()]
    text = "\n".join(line for line in lines if line)

    return title, text


class LegalPDF(FPDF):
    """Custom PDF class with header/footer for legal documents."""

    def __init__(self, doc_title: str, doc_url: str):
        super().__init__()
        self.doc_title = doc_title
        self.doc_url = doc_url
        self.set_auto_page_break(auto=True, margin=20)

    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(80, 80, 80)
        # Truncate long titles for the header
        header_title = (self.doc_title[:90] + "...") if len(self.doc_title) > 90 else self.doc_title
        self.cell(0, 8, header_title, align="C", new_x="LMARGIN", new_y="NEXT")
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")


def text_to_pdf(title: str, body: str, url: str, filepath: str):
    """Write the scraped text into a nicely formatted PDF."""
    pdf = LegalPDF(doc_title=title, doc_url=url)
    pdf.alias_nb_pages()
    pdf.add_page()

    # --- Title block ---
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(0, 0, 0)
    pdf.multi_cell(0, 9, title, align="C")
    pdf.ln(3)

    # --- Source URL ---
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(50, 50, 150)
    pdf.cell(0, 6, f"Source: {url}", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # --- Body text ---
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(0, 0, 0)

    # fpdf2 multi_cell handles line wrapping automatically
    # We need to handle encoding - replace chars that latin-1 can't encode
    safe_body = body.encode("latin-1", errors="replace").decode("latin-1")
    pdf.multi_cell(0, 5, safe_body)

    pdf.output(filepath)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Read CSV and collect unique URLs with their titles
    url_entries = []
    seen_urls = set()

    with open(CSV_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            url = row.get("url", "").strip()
            title = row.get("title", "").strip().strip('"')
            if url and url not in seen_urls:
                seen_urls.add(url)
                url_entries.append((title, url))

    total = len(url_entries)
    log.info("Found %d unique URLs in %s", total, CSV_FILE)

    # Load progress (for resumability)
    done = load_progress()
    log.info("Already completed: %d / %d", len(done), total)

    # Set up session
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    success_count = len(done)
    fail_count = 0

    for idx, (csv_title, url) in enumerate(url_entries, 1):
        if url in done:
            continue

        log.info("[%d/%d] Scraping: %s", idx, total, csv_title or url)

        html = fetch_page(url, session)
        if html is None:
            log.error("  ✗ Failed to fetch %s after %d retries", url, MAX_RETRIES)
            fail_count += 1
            continue

        title, body = extract_legal_text(html)
        if not body or len(body) < 50:
            log.warning("  ⚠ Very little content extracted for %s", url)

        # Use CSV title if available, otherwise the extracted <title>
        display_title = csv_title if csv_title else title

        # Build filename: index + sanitized title
        safe_name = sanitize_filename(display_title)
        if not safe_name:
            safe_name = hashlib.md5(url.encode()).hexdigest()[:12]
        filename = f"{idx:04d}_{safe_name}.pdf"
        filepath = os.path.join(OUTPUT_DIR, filename)

        try:
            text_to_pdf(display_title, body, url, filepath)
            log.info("  ✓ Saved → %s", filename)
            success_count += 1
            done.add(url)
        except Exception as exc:
            log.error("  ✗ PDF creation failed for %s: %s", url, exc)
            fail_count += 1

        # Save progress every 10 documents
        if success_count % 10 == 0:
            save_progress(done)

        # Polite delay
        time.sleep(REQUEST_DELAY)

    # Final save
    save_progress(done)

    log.info("=" * 60)
    log.info("DONE  |  Success: %d  |  Failed: %d  |  Total: %d", success_count, fail_count, total)
    log.info("PDFs saved in: %s", os.path.abspath(OUTPUT_DIR))


if __name__ == "__main__":
    main()
