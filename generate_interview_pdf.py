"""
Generate an Interview Preparation PDF for the Legal Query System project.
Covers complete workflow, techniques/models at each step, and cross-questions.
"""

import os
from fpdf import FPDF

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "Legal_Query_System_Interview_Prep.pdf")
FONT_DIR = r"C:\Windows\Fonts"


class PrepPDF(FPDF):
    def __init__(self):
        super().__init__('P', 'mm', 'A4')
        self.set_auto_page_break(auto=True, margin=25)
        self.add_font("af", "", os.path.join(FONT_DIR, "arial.ttf"), uni=True)
        self.add_font("af", "B", os.path.join(FONT_DIR, "arialbd.ttf"), uni=True)
        self.add_font("af", "I", os.path.join(FONT_DIR, "ariali.ttf"), uni=True)
        self.add_font("af", "BI", os.path.join(FONT_DIR, "arialbi.ttf"), uni=True)

    def header(self):
        if self.page_no() > 1:
            self.set_font("af", "I", 8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 8, "Legal Query System \u2014 Interview Preparation Guide", align="L")
            self.ln(4)
            self.set_draw_color(200, 200, 200)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(6)

    def footer(self):
        if self.page_no() > 1:
            self.set_y(-15)
            self.set_font("af", "I", 8)
            self.set_text_color(150, 150, 150)
            self.cell(0, 10, f"Page {self.page_no()}", align="C")

    def h1(self, text):
        self.ln(4)
        self.set_font("af", "B", 16)
        self.set_text_color(26, 54, 93)
        self.cell(0, 10, text, new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(26, 54, 93)
        self.set_line_width(0.6)
        self.line(15, self.get_y(), 195, self.get_y())
        self.ln(6)

    def h2(self, text):
        self.ln(3)
        self.set_font("af", "B", 13)
        self.set_text_color(43, 108, 176)
        self.cell(0, 8, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

    def h3(self, text):
        self.ln(2)
        self.set_font("af", "B", 11)
        self.set_text_color(44, 122, 123)
        self.cell(0, 7, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def p(self, text):
        self.set_font("af", "", 10.5)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5.5, text)
        self.ln(3)

    def bold_p(self, label, text):
        self.set_font("af", "B", 10.5)
        self.set_text_color(40, 40, 40)
        self.write(5.5, label + " ")
        self.set_font("af", "", 10.5)
        self.write(5.5, text)
        self.ln(8)

    def bullet(self, items):
        self.set_font("af", "", 10.5)
        self.set_text_color(40, 40, 40)
        for item in items:
            self.cell(5)
            self.cell(5, 5.5, "\u2022 ")
            self.multi_cell(175, 5.5, item)
            self.ln(1.5)
        self.ln(2)

    def qa_block(self, q_num, question, answer):
        """Render a Q&A block with colored question and plain answer."""
        # Question
        self.set_font("af", "B", 11)
        self.set_text_color(26, 54, 93)
        self.multi_cell(0, 6, f"Q{q_num}. {question}")
        self.ln(2)
        # Answer
        self.set_font("af", "", 10.5)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5.5, f"Ans: {answer}")
        self.ln(5)

    def tip_box(self, text):
        y = self.get_y()
        self.set_fill_color(255, 250, 230)
        self.set_draw_color(200, 170, 50)
        self.set_line_width(1.0)
        self.set_font("af", "", 10)
        self.set_text_color(80, 60, 0)
        lines = len(text) / 85 + text.count('\n')
        box_h = max(12, lines * 5 + 8)
        self.rect(15, y, 180, box_h, style="F")
        self.line(15, y, 15, y + box_h)
        self.set_xy(19, y + 3)
        self.multi_cell(172, 5, text)
        self.set_y(y + box_h + 4)

    def info_box(self, text):
        y = self.get_y()
        self.set_fill_color(235, 248, 255)
        self.set_draw_color(43, 108, 176)
        self.set_line_width(1.0)
        self.set_font("af", "", 10)
        self.set_text_color(40, 40, 40)
        lines = len(text) / 85 + text.count('\n')
        box_h = max(12, lines * 5 + 8)
        self.rect(15, y, 180, box_h, style="F")
        self.line(15, y, 15, y + box_h)
        self.set_xy(19, y + 3)
        self.multi_cell(172, 5, text)
        self.set_y(y + box_h + 4)


def build():
    pdf = PrepPDF()

    # ═══════════════════ COVER PAGE ═══════════════════
    pdf.add_page()
    pdf.set_margins(10, 10, 10)
    pdf.set_fill_color(26, 54, 93)
    pdf.rect(0, 0, 210, 297, style="F")
    pdf.set_fill_color(44, 122, 123)
    pdf.rect(0, 190, 210, 107, style="F")

    pdf.set_y(70)
    pdf.set_font("af", "B", 50)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 20, "\u2696", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(8)
    pdf.set_font("af", "B", 34)
    pdf.cell(0, 16, "Legal Query System", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)
    pdf.set_font("af", "", 18)
    pdf.set_text_color(200, 230, 255)
    pdf.cell(0, 10, "Interview Preparation Guide", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_font("af", "", 14)
    pdf.cell(0, 8, "Complete Workflow, Techniques & Cross Questions", align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.ln(14)
    pdf.set_draw_color(255, 255, 255)
    pdf.set_line_width(0.4)
    pdf.line(80, pdf.get_y(), 130, pdf.get_y())
    pdf.ln(14)
    pdf.set_font("af", "", 13)
    pdf.set_text_color(220, 240, 255)
    pdf.cell(0, 8, "April 2026", align="C", new_x="LMARGIN", new_y="NEXT")

    # ═══════════════════ TABLE OF CONTENTS ═══════════════════
    pdf.add_page()
    pdf.set_margins(15, 15, 15)
    pdf.set_font("af", "B", 22)
    pdf.set_text_color(26, 54, 93)
    pdf.cell(0, 14, "Contents", new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(26, 54, 93)
    pdf.set_line_width(0.8)
    pdf.line(15, pdf.get_y() + 2, 195, pdf.get_y() + 2)
    pdf.ln(10)

    toc = [
        "Project Overview & One-Liner",
        "End-to-End Workflow",
        "Step 1: PDF Text Extraction \u2014 PyPDF2",
        "Step 2: Text Cleaning \u2014 Regular Expressions",
        "Step 3: Metadata Detection \u2014 Filename Parsing",
        "Step 4: Legal Chunking \u2014 Section-Aware Splitting",
        "Step 5: Embedding Generation \u2014 Sentence Transformers",
        "Step 6: Vector Store \u2014 ChromaDB",
        "Step 7: Semantic Retrieval \u2014 Cosine Similarity",
        "Step 8: Context Formatting",
        "Step 9: LLM Generation \u2014 Gemini 2.0 Flash (Vertex AI)",
        "Step 10: Source Filtering & Response Construction",
        "System Architecture Overview",
        "Interview Cross Questions & Answers",
        "Quick Revision Cheat Sheet",
    ]
    for i, item in enumerate(toc, 1):
        pdf.set_font("af", "B", 11)
        pdf.set_text_color(26, 54, 93)
        pdf.cell(12, 7, f"{i}.")
        pdf.set_font("af", "", 11)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(0, 7, item, new_x="LMARGIN", new_y="NEXT")
        pdf.set_draw_color(230, 230, 230)
        pdf.line(15, pdf.get_y(), 195, pdf.get_y())
        pdf.ln(1)

    # ═══════════════════ 1. PROJECT OVERVIEW ═══════════════════
    pdf.add_page()
    pdf.set_margins(15, 15, 15)
    pdf.h1("1. Project Overview & One-Liner")

    pdf.tip_box(
        "Elevator Pitch (use this in interviews):\n"
        "\"I built a Legal Query System \u2014 an AI-powered chatbot that lets users ask legal questions in "
        "plain English and get accurate, cited answers from 18 Indian laws. It uses RAG (Retrieval-Augmented "
        "Generation) to first search a vector database of legal documents and then feed the relevant sections "
        "to Google Gemini to generate responses with exact Act names and Section numbers.\""
    )

    pdf.h2("What the project does")
    pdf.p(
        "It is a full-stack web application where users sign up, log in, and ask legal questions through a chat "
        "interface. Behind the scenes, the system searches through 18 major Indian legal documents (stored as "
        "vector embeddings), retrieves the most relevant sections, feeds them to a large language model, and "
        "returns an answer with proper legal citations."
    )

    pdf.h2("Why this project matters")
    pdf.bullet([
        "Solves a real problem \u2014 legal information is inaccessible to common people.",
        "Uses cutting-edge AI (RAG + LLM) \u2014 not just a basic chatbot.",
        "Demonstrates full-stack skills \u2014 React frontend, Node.js/Express backend, Python ML pipeline.",
        "Shows understanding of NLP concepts \u2014 embeddings, vector search, prompt engineering.",
        "Production-ready features \u2014 JWT auth, session management, multi-turn chat, source filtering."
    ])

    # ═══════════════════ 2. END-TO-END WORKFLOW ═══════════════════
    pdf.add_page()
    pdf.h1("2. End-to-End Workflow")
    pdf.p("The project has two main phases:")

    pdf.h2("Phase A: Offline \u2014 PDF Ingestion (runs once)")
    pdf.p("This phase processes all legal PDFs into a searchable vector database:")
    pdf.bullet([
        "Step 1: Extract raw text from each PDF using PyPDF2.",
        "Step 2: Clean the extracted text (remove headers, footers, gazette noise).",
        "Step 3: Detect metadata (Act name, year) from the PDF filename.",
        "Step 4: Chunk the text by legal sections (section-aware splitting).",
        "Step 5: Convert each chunk into a 384-dimensional vector embedding using Sentence Transformers.",
        "Step 6: Store all embeddings + metadata in ChromaDB (persistent vector database)."
    ])

    pdf.h2("Phase B: Online \u2014 Query Processing (runs per query)")
    pdf.p("This phase handles every user question in real time:")
    pdf.bullet([
        "Step 7: Convert the user's question into a vector and find the top-6 most similar chunks (semantic retrieval).",
        "Step 8: Format the retrieved chunks into a structured context string with headers.",
        "Step 9: Send the context + question + system prompt to Gemini 2.0 Flash LLM for answer generation.",
        "Step 10: Filter out low-relevance sources (< 45% similarity) and construct the final response with citations."
    ])

    pdf.info_box(
        "Key insight for interviews: The offline phase is O(n) \u2014 it processes all documents once. "
        "The online phase is O(log n) per query thanks to the HNSW index in ChromaDB, making retrieval "
        "sub-linear and fast even with thousands of chunks."
    )

    # ═══════════════════ 3. STEP 1: TEXT EXTRACTION ═══════════════════
    pdf.add_page()
    pdf.h1("3. Step 1: PDF Text Extraction")

    pdf.h2("Tool Used: PyPDF2")
    pdf.bold_p("What it is:", "A pure-Python library for reading PDF files. It can extract text, metadata, and manipulate PDF pages.")
    pdf.bold_p("Why we chose it:", "Lightweight, no system dependencies (unlike pdfminer or Tesseract), works well for text-based PDFs (our legal docs are digitally created, not scanned).")

    pdf.h2("How it works in our project")
    pdf.bullet([
        "Opens each PDF file in binary read mode.",
        "Iterates through every page of the PDF using PdfReader.",
        "Calls extract_text() on each page to get the text content.",
        "Concatenates all page texts with page markers (e.g., \"----- PAGE 1 -----\") for traceability.",
        "Saves the result as a .txt file in the extracted_text/ directory."
    ])

    pdf.h2("Limitations to mention in interviews")
    pdf.bullet([
        "Cannot extract text from scanned PDFs (would need OCR like Tesseract).",
        "Sometimes loses formatting \u2014 columns, tables, and special characters may not extract perfectly.",
        "Does not preserve the visual layout of the PDF."
    ])

    # ═══════════════════ 4. STEP 2: TEXT CLEANING ═══════════════════
    pdf.h1("4. Step 2: Text Cleaning")

    pdf.h2("Tool Used: Regular Expressions (Python re module)")
    pdf.bold_p("What it is:", "Regex is a pattern-matching language built into Python. It lets you find and replace complex text patterns.")
    pdf.bold_p("Why we need it:", "PDF-extracted text is noisy \u2014 it contains gazette headers, page markers, extra whitespace, and formatting artifacts that would confuse the AI model.")

    pdf.h2("What we clean")
    pdf.bullet([
        "Page markers like \"----- PAGE 33 -----\" are removed.",
        "Gazette headers like \"THE GAZETTE OF INDIA EXTRAORDINARY\" are stripped.",
        "Multiple spaces/tabs are collapsed into a single space.",
        "Excessive newlines (3+) are collapsed into double newlines (paragraph breaks)."
    ])

    pdf.info_box(
        "Interview point: This is a classic NLP preprocessing step. Cleaning ensures that the embedding model "
        "focuses on actual legal content rather than noise, improving retrieval accuracy."
    )

    # ═══════════════════ 5. STEP 3: METADATA DETECTION ═══════════════════
    pdf.add_page()
    pdf.h1("5. Step 3: Metadata Detection")

    pdf.h2("Technique: Filename Parsing")
    pdf.bold_p("How it works:", "The PDF filename itself encodes the Act name and year. For example, \"indian_contract_act_1872.pdf\" tells us the document is the Indian Contract Act from 1872.")

    pdf.h2("Parsing algorithm")
    pdf.bullet([
        "Check if the filename matches a special-case dictionary (for names like \"engaadhaar\" that don't follow conventions).",
        "Extract a trailing 4-digit year using regex (e.g., 1872, 2023).",
        "Remove the year portion from the filename string.",
        "Replace underscores with spaces and apply title-casing.",
        "Result: (\"Indian Contract Act, 1872\", \"1872\")."
    ])

    pdf.h2("Why not extract metadata from the PDF content?")
    pdf.p(
        "Legal PDFs have inconsistent internal formatting \u2014 some put the Act name on page 1, others have it "
        "buried in headers. Filename-based detection is simple, reliable, and 100% accurate for our controlled "
        "dataset. If we were accepting user-uploaded PDFs, we would need content-based extraction."
    )

    # ═══════════════════ 6. STEP 4: LEGAL CHUNKING ═══════════════════
    pdf.h1("6. Step 4: Legal Chunking")

    pdf.h2("Technique: Section-Aware Splitting")
    pdf.bold_p("What chunking means:", "Breaking a large document into smaller pieces (chunks) that can each be individually embedded and retrieved.")
    pdf.bold_p("Why not fixed-size chunking?", "Legal text has a natural structure \u2014 Sections, Chapters, Clauses. If you split at every 500 characters, you will cut a section in half, losing its legal meaning. Our approach respects the document structure.")

    pdf.h2("How our chunking works (step by step)")
    pdf.bullet([
        "CLEAN: Remove PDF noise from the raw text.",
        "DETECT SECTIONS: Use regex to find section boundaries (pattern: number + period + title, e.g., \"73. Compensation for loss\").",
        "TRACK CHAPTERS: Continuously watch for chapter headers (\"CHAPTER IV \u2014 ...\") and update the current chapter label.",
        "CAPTURE PREAMBLE: Any text before the first section is saved as a \"Preamble\" chunk.",
        "SPLIT LARGE SECTIONS: If a section is > 3,000 characters, split it at sentence boundaries (period + space) within a 1,500-character window.",
        "SKIP SHORT FRAGMENTS: Sections < 70 characters (likely ToC entries) are discarded.",
        "STORE: Each chunk is saved as a JSON record with text + metadata (act_name, year, chapter, section, section_title)."
    ])

    pdf.h2("Chunk metadata structure")
    pdf.p(
        "Each chunk contains: act_name (e.g., \"Indian Contract Act, 1872\"), year (\"1872\"), source_file, "
        "chapter (\"CHAPTER VI \u2014 Consequences of Breach\"), section (\"73\"), section_title (\"Compensation "
        "for loss or damage\"). This metadata is what enables precise legal citations in the final answer."
    )

    # ═══════════════════ 7. STEP 5: EMBEDDINGS ═══════════════════
    pdf.add_page()
    pdf.h1("7. Step 5: Embedding Generation")

    pdf.h2("Model Used: Sentence Transformers (all-MiniLM-L6-v2)")
    pdf.bold_p("What it is:", "A pre-trained transformer model from Hugging Face that converts any text into a fixed-size vector (384 dimensions). It is fine-tuned specifically for semantic similarity tasks.")
    pdf.bold_p("Architecture:", "It is based on Microsoft's MiniLM, which is a distilled (compressed) version of BERT. It has 6 layers (L6), 384 hidden dimensions, and 22.7 million parameters.")
    pdf.bold_p("Why this model?", "It is small (80 MB), fast (can embed 1000+ sentences/second on CPU), and performs well on semantic similarity benchmarks. Perfect for our use case where we need speed without a GPU.")

    pdf.h2("How embeddings work (explain this in interviews)")
    pdf.p(
        "An embedding model takes a text string (like \"What is the punishment for theft?\") and converts it "
        "into a list of 384 numbers (called a vector). The key property is that texts with similar meanings "
        "produce vectors that are close together in 384-dimensional space. So \"punishment for theft\" and "
        "\"penalty for stealing\" would have vectors pointing in nearly the same direction, even though they "
        "use different words."
    )
    pdf.p(
        "This is fundamentally different from keyword search. Keyword search would fail if the user says "
        "\"stealing\" but the document says \"theft\". Embedding-based search understands that these mean the "
        "same thing."
    )

    pdf.h2("Technical details for interviews")
    pdf.bullet([
        "Input: Any text string (our chunks are typically 200-1500 characters).",
        "Output: A 384-dimensional float vector (numpy array).",
        "Training: Pre-trained on 1 billion+ sentence pairs from NLI and paraphrase datasets.",
        "Tokenizer: WordPiece tokenizer (same as BERT), max 256 tokens input.",
        "Batch processing: We embed in batches of 32 for efficiency.",
        "The model is loaded once (singleton pattern) and reused for all queries."
    ])

    pdf.tip_box(
        "Common interview question: \"Why not use OpenAI embeddings or a larger model?\"\n"
        "Answer: all-MiniLM-L6-v2 runs entirely locally (no API costs), is fast on CPU, and is sufficient "
        "for our domain. Larger models would give marginal improvement but add latency and cost. For a "
        "production system with millions of documents, we might consider fine-tuning or using a legal-specific "
        "embedding model."
    )

    # ═══════════════════ 8. STEP 6: VECTOR STORE ═══════════════════
    pdf.add_page()
    pdf.h1("8. Step 6: Vector Store \u2014 ChromaDB")

    pdf.h2("What is ChromaDB?")
    pdf.p(
        "ChromaDB is an open-source, lightweight vector database designed for AI applications. It stores "
        "text documents along with their vector embeddings and metadata, and allows fast similarity searches."
    )

    pdf.h2("Why ChromaDB (vs. Pinecone, Weaviate, FAISS)?")
    pdf.bullet([
        "Runs locally \u2014 no cloud setup or API keys needed (unlike Pinecone).",
        "Persistent storage \u2014 data survives restarts (stored on disk).",
        "Built-in metadata filtering \u2014 can filter by act_name, year, etc.",
        "Simple Python API \u2014 easy to integrate with our Flask backend.",
        "Supports cosine similarity natively via HNSW (Hierarchical Navigable Small World) index."
    ])

    pdf.h2("How we use it")
    pdf.bullet([
        "Create a collection called \"legal_docs\" with cosine distance metric.",
        "Store each chunk with: its text (document), its embedding (384-dim vector), its metadata (act_name, section, etc.), and a unique ID.",
        "At query time, pass the query embedding and retrieve top-k most similar documents.",
        "HNSW index enables approximate nearest neighbor search in O(log n) time."
    ])

    pdf.h2("HNSW Index (explain if asked)")
    pdf.p(
        "HNSW (Hierarchical Navigable Small World) is the indexing algorithm ChromaDB uses. It builds a "
        "multi-layer graph where each node is a vector. Higher layers have fewer, more spread-out nodes "
        "(for coarse search), and lower layers have more nodes (for fine-grained search). During a query, "
        "the algorithm starts at the top layer and navigates down, progressively narrowing the search. This "
        "makes it much faster than a brute-force comparison against every vector."
    )

    # ═══════════════════ 9. STEP 7: SEMANTIC RETRIEVAL ═══════════════════
    pdf.add_page()
    pdf.h1("9. Step 7: Semantic Retrieval")

    pdf.h2("What happens at query time")
    pdf.bullet([
        "User types a question, e.g., \"What are my rights if I am arrested?\"",
        "The question is converted to a 384-dim vector using the same all-MiniLM-L6-v2 model.",
        "ChromaDB searches its HNSW index and returns the top-6 chunks with the highest cosine similarity.",
        "Each result includes: the chunk text, its metadata, and the cosine distance."
    ])

    pdf.h2("Cosine Similarity (explain this)")
    pdf.p(
        "Cosine similarity measures the angle between two vectors. If two vectors point in the same direction, "
        "cosine similarity = 1 (perfectly similar). If perpendicular, similarity = 0 (unrelated). If opposite, "
        "similarity = -1 (opposite meaning). We convert ChromaDB's cosine distance to similarity using: "
        "similarity = 1 - distance."
    )

    pdf.h2("Why top-6?")
    pdf.p(
        "We retrieve 6 chunks to give the LLM enough context. A legal question might relate to multiple "
        "sections or even multiple Acts. Too few chunks (1-2) might miss important context. Too many "
        "(10-20) would add noise and exceed the LLM's context window. 6 is a good balance based on "
        "our testing."
    )

    # ═══════════════════ 10. STEP 8: CONTEXT FORMATTING ═══════════════════
    pdf.h1("10. Step 8: Context Formatting")

    pdf.h2("Why format the context?")
    pdf.p(
        "The LLM needs to know WHERE each piece of text comes from in order to generate proper citations. "
        "Raw text without labels would make it impossible for the model to say \"According to Section 73 of "
        "the Indian Contract Act...\""
    )

    pdf.h2("How we format")
    pdf.p(
        "Each retrieved chunk is prefixed with a structured header:\n"
        "[Source: Indian Contract Act, 1872, Section 73 \u2014 Compensation for loss | CHAPTER VI | Relevance: 89.34%]\n"
        "...followed by the actual chunk text. All chunks are separated by \"---\" dividers."
    )

    pdf.p(
        "This format is specifically designed for the LLM \u2014 the square brackets and labels make it easy "
        "for the model to parse and reference the source information in its answer."
    )

    # ═══════════════════ 11. STEP 9: LLM GENERATION ═══════════════════
    pdf.add_page()
    pdf.h1("11. Step 9: LLM Generation")

    pdf.h2("Model Used: Google Gemini 2.0 Flash")
    pdf.bold_p("What it is:", "Gemini 2.0 Flash is a large language model from Google, accessed through the Vertex AI cloud platform. It is optimized for speed (\"Flash\") while maintaining high quality.")
    pdf.bold_p("Access method:", "We use the LangChain library (langchain_google_vertexai) to connect to the Gemini API using a GCP service account credential file.")
    pdf.bold_p("Temperature:", "Set to 0.2 (low). This makes responses more deterministic and focused \u2014 critical for legal accuracy where we don't want creative or variable outputs.")
    pdf.bold_p("Max tokens:", "2048 tokens, which is enough for a detailed legal explanation with citations.")

    pdf.h2("System Prompt (Prompt Engineering)")
    pdf.p("The system prompt is the most critical piece of the pipeline. It instructs the LLM on exactly how to behave:")
    pdf.bullet([
        "For legal questions: Start with a simple explanation, then give the formal legal definition, then cite the exact Act, Section, and clause text.",
        "For casual talk (hello, what can you do?): Respond naturally like a human, no legal jargon.",
        "Never hallucinate: If the context doesn't contain the answer, say \"I don't have specific information about this.\"",
        "Never reveal implementation: Don't discuss AI architecture, training, or internal workings.",
        "Always add a disclaimer: \"This information is for general awareness only. Please consult a qualified legal professional.\"",
        "The prompt also lists all 18 legal topics the system covers, so it can describe its capabilities naturally."
    ])

    pdf.h2("Multi-Turn Conversation")
    pdf.p(
        "The system supports follow-up questions by passing the last 6 messages (3 exchanges) as conversation "
        "history. The LangChain library converts these into HumanMessage and AIMessage objects that Gemini "
        "understands. This lets users say things like \"Tell me more about that section\" without repeating context."
    )

    pdf.tip_box(
        "Interview point: \"Why Gemini and not GPT-4 or Claude?\"\n"
        "Answer: Gemini 2.0 Flash offers a good balance of quality, speed, and cost. It integrates natively "
        "with Google Cloud (Vertex AI), where we already host our credentials. The Flash variant is optimized "
        "for low latency while maintaining strong reasoning. However, the architecture is LLM-agnostic \u2014 "
        "swapping to GPT-4 or Claude would only require changing the LangChain model class."
    )

    # ═══════════════════ 12. STEP 10: SOURCE FILTERING ═══════════════════
    pdf.add_page()
    pdf.h1("12. Step 10: Source Filtering & Response Construction")

    pdf.h2("Source Filtering")
    pdf.bold_p("Threshold:", "0.45 (45% cosine similarity). Any source below this is not shown to the user.")
    pdf.p(
        "This solves a subtle but important problem: when a user says \"Hello, how are you?\", the retrieval "
        "still returns 6 chunks (because it always returns top-k), but all of them have very low similarity "
        "scores (0.1-0.3). Without filtering, we would show irrelevant legal citations alongside a casual greeting. "
        "The 0.45 threshold ensures only genuinely relevant sources appear."
    )

    pdf.h2("Source Text Cleaning")
    pdf.bullet([
        "Leading section numbers (like \"73. \") are removed from the display text since the section number is already shown in metadata.",
        "Multiple whitespace is collapsed into single spaces.",
        "Long texts are truncated at sentence boundaries (at ~1200 characters) to keep the UI clean."
    ])

    pdf.h2("Final Response Structure")
    pdf.p("The API returns a JSON object with two fields:")
    pdf.bullet([
        "\"answer\": The complete natural-language response from the LLM with citations woven into the text.",
        "\"sources\": An array of source objects, each containing act_name, section, section_title, chapter, year, text excerpt, and similarity score."
    ])

    # ═══════════════════ 13. SYSTEM ARCHITECTURE ═══════════════════
    pdf.add_page()
    pdf.h1("13. System Architecture Overview")

    pdf.h2("Three-Tier Architecture")
    pdf.bullet([
        "Frontend (React + Vite): 4 pages \u2014 Login, Signup, Dashboard, Chat. Uses Axios for API calls with JWT token in headers.",
        "Application Server (Node.js + Express on port 3001): Handles auth (JWT + bcrypt), chat session CRUD, and proxies queries to the RAG API. Connects to MongoDB.",
        "RAG API Server (Python + Flask on port 5000): Hosts the ML pipeline \u2014 embedding model, ChromaDB, Gemini LLM. Exposes /api/query and /api/ingest endpoints."
    ])

    pdf.h2("Request Flow (for a query)")
    pdf.bullet([
        "1. User types question in React chat UI.",
        "2. Frontend sends POST /api/chat/sessions/{id}/query with JWT token in header.",
        "3. Express server verifies JWT, loads the session from MongoDB, builds chat history.",
        "4. Express server forwards query + chat_history to Flask RAG API (POST /api/query).",
        "5. Flask server runs RAG pipeline: embed query \u2192 retrieve \u2192 format \u2192 generate \u2192 filter.",
        "6. Flask returns {answer, sources} to Express server.",
        "7. Express server saves user message + assistant response in MongoDB session.",
        "8. Express server returns the response to the React frontend.",
        "9. React renders the answer with expandable source citations."
    ])

    pdf.h2("Database Schema (MongoDB)")
    pdf.bullet([
        "User collection: name, email, password (bcrypt hash), timestamps.",
        "ChatSession collection: userId (ref), title, messages[] (role, content, sources[], timestamp), isSolved flag, timestamps."
    ])

    # ═══════════════════ 14. INTERVIEW QUESTIONS ═══════════════════
    pdf.add_page()
    pdf.h1("14. Interview Cross Questions & Answers")
    pdf.p("These are the most likely questions an interviewer will ask about this project. Practice answering them out loud.")

    pdf.h2("A. About RAG & Architecture")

    pdf.qa_block(1,
        "What is RAG and why did you use it instead of fine-tuning?",
        "RAG stands for Retrieval-Augmented Generation. Instead of fine-tuning an LLM on legal data "
        "(which is expensive, requires large datasets, and makes the model outdated when laws change), RAG "
        "retrieves relevant documents at query time and feeds them as context to the LLM. This means: "
        "(1) the knowledge base can be updated just by adding new PDFs \u2014 no retraining needed, "
        "(2) every answer is traceable to a source document, (3) it dramatically reduces hallucination "
        "because the model works from provided text, not its own potentially outdated training data."
    )

    pdf.qa_block(2,
        "What happens if the user asks a question your knowledge base doesn't cover?",
        "The retrieval step will still return 6 chunks, but they will all have low similarity scores. "
        "Two things protect us: (1) the source filter (threshold 0.45) will remove all weak matches so "
        "no misleading citations are shown, (2) the system prompt explicitly instructs the LLM to say "
        "\"I don't have specific information about this\" when the context doesn't contain the answer."
    )

    pdf.qa_block(3,
        "Why two separate backend servers? Why not just one?",
        "Separation of concerns. The Python/Flask server handles the ML-heavy work (loading models, "
        "running embeddings, calling Gemini). The Node.js/Express server handles web application logic "
        "(authentication, session management, database operations). This means we can scale them independently "
        "\u2014 for example, running multiple Flask instances behind a load balancer for ML processing while "
        "keeping a single Express server for auth. It also means a crash in the ML pipeline doesn't bring "
        "down the auth system."
    )

    pdf.qa_block(4,
        "How would you scale this system for millions of users?",
        "Several approaches: (1) Use a managed vector database like Pinecone or Weaviate instead of local "
        "ChromaDB for distributed search. (2) Cache frequent queries using Redis. (3) Run multiple Flask "
        "RAG workers behind Nginx/load balancer. (4) Use async processing \u2014 queue queries and return results "
        "via WebSocket. (5) Move to a faster embedding model or pre-compute embeddings for common queries."
    )

    pdf.add_page()
    pdf.h2("B. About Embeddings & Vector Search")

    pdf.qa_block(5,
        "What is the difference between keyword search and semantic search?",
        "Keyword search (like SQL LIKE or Elasticsearch) matches exact words. If the user says \"stealing\" "
        "but the document says \"theft\", keyword search fails. Semantic search converts both into vector "
        "embeddings that capture meaning, so \"stealing\" and \"theft\" produce similar vectors and match "
        "correctly. This is critical for legal queries where users use informal language but documents use "
        "formal legal terminology."
    )

    pdf.qa_block(6,
        "Why did you choose all-MiniLM-L6-v2? What are its limitations?",
        "Chosen for its balance of speed, size, and quality. At 22.7M parameters, it runs on CPU in "
        "milliseconds. Limitations: (1) Max input is 256 tokens (~300 words), so very long chunks may be "
        "truncated. (2) It's a general-purpose model, not fine-tuned on legal text, so it might miss "
        "domain-specific nuances. (3) It produces 384-dimensional vectors \u2014 larger models like "
        "all-mpnet-base-v2 produce 768 dimensions with better accuracy but are slower."
    )

    pdf.qa_block(7,
        "What is cosine similarity and why use it over Euclidean distance?",
        "Cosine similarity measures the angle between two vectors, ignoring magnitude. This is important "
        "because we care about the direction (meaning) of the vector, not its length. Two texts about the "
        "same topic should be similar regardless of how long they are. Euclidean distance is affected by "
        "vector magnitude, which can be misleading for text embeddings where longer texts naturally have "
        "larger magnitudes."
    )

    pdf.qa_block(8,
        "What is HNSW and why does ChromaDB use it?",
        "HNSW (Hierarchical Navigable Small World) is an approximate nearest neighbor algorithm. It builds "
        "a multi-layer graph of vectors. Finding exact nearest neighbors in high-dimensional space (384 "
        "dimensions) is extremely slow with brute force (O(n)). HNSW gives approximate results in O(log n) "
        "time by navigating through the graph layers from coarse to fine. The accuracy is typically 95-99% "
        "of exact search, which is more than sufficient for our use case."
    )

    pdf.add_page()
    pdf.h2("C. About Chunking & Preprocessing")

    pdf.qa_block(9,
        "Why is chunking important? What happens if you skip it?",
        "LLMs have a limited context window. If we send an entire 300-page Act as context, it either won't "
        "fit or the model will lose focus. Chunking breaks documents into small, focused pieces (typically "
        "200-1500 chars). This also improves retrieval \u2014 searching within small, topic-specific chunks is "
        "more precise than searching within entire documents."
    )

    pdf.qa_block(10,
        "Why did you use section-based chunking instead of fixed-size?",
        "Legal documents have a natural structure: Acts \u2192 Chapters \u2192 Sections. Each section is a self-contained "
        "legal provision. Fixed-size chunking (e.g., 500 chars) would cut sections in half, splitting a law "
        "like \"73. Compensation for breach\" across two chunks and losing its meaning. Section-based chunking "
        "preserves the legal integrity of each provision."
    )

    pdf.qa_block(11,
        "How do you handle sections that are very long?",
        "If a section exceeds 3,000 characters, we sub-split it at sentence boundaries \u2014 looking for the "
        "last period or semicolon within a 1,500-character window. This ensures each sub-chunk is grammatically "
        "complete and ends at a logical point. We also add a 'part' number to the metadata so we know which "
        "piece of the section it is."
    )

    pdf.qa_block(12,
        "What chunk overlap strategy do you use?",
        "We don't use chunk overlap in the traditional sense. Since our chunks are section-based (each "
        "section is complete), there's no risk of losing context at boundaries. Overlap is primarily "
        "needed for fixed-size chunking where arbitrary cuts might miss information. However, if we wanted "
        "to improve recall, we could add 50-100 character overlaps between sub-splits of large sections."
    )

    pdf.add_page()
    pdf.h2("D. About the LLM & Prompt Engineering")

    pdf.qa_block(13,
        "What is prompt engineering and why is your system prompt so long?",
        "Prompt engineering is the art of crafting instructions for an LLM to produce desired outputs. Our "
        "system prompt is detailed because it needs to handle multiple scenarios: legal questions (3-part "
        "structure with citations), casual chat (natural responses), edge cases (no relevant context), and "
        "safety rules (never hallucinate, always show disclaimer). Each rule exists because we encountered "
        "a specific failure mode during testing."
    )

    pdf.qa_block(14,
        "Why is temperature set to 0.2? What would happen at 1.0?",
        "Temperature controls randomness in the LLM's output. At 0.2, the model is highly deterministic \u2014 "
        "it almost always picks the most probable next token, resulting in consistent, focused answers. "
        "At 1.0, the model would be more creative and varied, potentially producing different answers for "
        "the same question each time. For legal information, consistency and accuracy are critical, so we "
        "use a low temperature."
    )

    pdf.qa_block(15,
        "How do you handle multi-turn conversations?",
        "We pass the last 6 messages (3 user-assistant exchanges) as conversation history to the LLM. "
        "These are formatted as HumanMessage and AIMessage objects via LangChain. The LLM sees the history "
        "and can understand references like \"tell me more about that\" or \"what about the next section?\". "
        "We limit to 6 messages to stay within the context window and avoid diluting the legal context."
    )

    pdf.qa_block(16,
        "What is hallucination in LLMs and how do you mitigate it?",
        "Hallucination is when an LLM generates plausible-sounding but factually incorrect information. In "
        "legal contexts, this is dangerous \u2014 citing a non-existent section could mislead someone. Our "
        "mitigations: (1) RAG ensures the model works from actual documents, not memory. (2) The system "
        "prompt explicitly says \"never make up information.\" (3) Low temperature (0.2) reduces creative "
        "outputs. (4) Source citations let users verify claims independently."
    )

    pdf.add_page()
    pdf.h2("E. About Authentication & Full-Stack")

    pdf.qa_block(17,
        "How does JWT authentication work in your system?",
        "When a user logs in with email/password, the Express server verifies the password against the "
        "bcrypt hash stored in MongoDB. If correct, it creates a JWT token containing the user's ID and "
        "signs it with a secret key. This token is sent to the frontend, which stores it in localStorage. "
        "On every subsequent API call, the frontend includes this token in the Authorization header. The "
        "server's auth middleware decodes the token, extracts the user ID, and attaches it to the request "
        "object. This is stateless authentication \u2014 the server doesn't need to track sessions."
    )

    pdf.qa_block(18,
        "Why bcrypt with salt factor 12?",
        "bcrypt is a password hashing algorithm designed to be computationally expensive. The salt factor "
        "(cost factor) of 12 means bcrypt will perform 2^12 = 4,096 iterations of hashing. This makes "
        "brute-force attacks extremely slow \u2014 hashing one password takes ~250ms, meaning an attacker "
        "would need millions of years to crack a strong password. The salt is a random string added to "
        "each password before hashing, ensuring that two users with the same password have different hashes."
    )

    pdf.qa_block(19,
        "Why did you use MongoDB instead of SQL?",
        "MongoDB's document model fits our data naturally. Chat sessions contain an array of messages, "
        "each with nested sources \u2014 this maps directly to MongoDB's nested document structure without "
        "needing complex JOIN queries. Also, the schema can evolve easily (e.g., adding new fields to "
        "messages) without database migrations. For a relational database, we would need separate tables "
        "for users, sessions, messages, and sources with foreign keys."
    )

    pdf.add_page()
    pdf.h2("F. Scenario-Based & Critical Thinking")

    pdf.qa_block(20,
        "What if someone uploads a malicious PDF?",
        "Currently, we don't accept user uploads \u2014 all PDFs are pre-loaded by us. If we added uploads: "
        "(1) validate file type and size, (2) scan with antivirus before processing, (3) run text extraction "
        "in a sandboxed environment, (4) sanitize extracted text for injection attacks. PyPDF2 can have "
        "vulnerabilities with malformed PDFs, so input validation is critical."
    )

    pdf.qa_block(21,
        "How would you add a new legal document to the system?",
        "Simply place the new PDF in the data/raw_pdfs/ directory and run the ingestion pipeline "
        "(python ingest.py). The pipeline will extract text, detect metadata from the filename, chunk it, "
        "generate embeddings, and add it to the ChromaDB vector store. No code changes needed \u2014 it's "
        "designed for easy extensibility."
    )

    pdf.qa_block(22,
        "What would you change if you had to support Hindi queries?",
        "Three changes: (1) Use a multilingual embedding model like paraphrase-multilingual-MiniLM-L12-v2 "
        "instead of the English-only model. (2) Ensure the chunking regex supports Devanagari characters. "
        "(3) Update the system prompt to allow Hindi responses. The LLM (Gemini) already supports Hindi, "
        "so the main bottleneck is the embedding model."
    )

    pdf.qa_block(23,
        "What is the weakest part of your system?",
        "Honestly, the embedding model. all-MiniLM-L6-v2 is a general-purpose model, not trained on "
        "legal text. Legal queries often use domain-specific terminology (\"locus standi\", \"suo motu\") "
        "that the model may not represent well. Fine-tuning the embedding model on Indian legal text "
        "would significantly improve retrieval accuracy. The second weakness is lack of hybrid search \u2014 "
        "pure semantic search can miss queries that use exact section numbers (\"Section 302\")."
    )

    pdf.qa_block(24,
        "How do you evaluate the quality of your RAG pipeline?",
        "Currently through manual testing. For a production system, I would: (1) build a test dataset of "
        "100+ question-answer pairs with expected source sections, (2) measure retrieval accuracy "
        "(hit@k: does the correct section appear in the top-6?), (3) measure answer quality using "
        "LLM-as-judge (have GPT-4 rate answers for accuracy, completeness, and citation correctness), "
        "(4) track user satisfaction metrics in the chat UI."
    )

    pdf.qa_block(25,
        "What is the difference between RAG and fine-tuning? When would you use each?",
        "RAG retrieves external knowledge at query time; fine-tuning bakes knowledge into the model's weights. "
        "Use RAG when: knowledge changes frequently, you need source citations, or you have limited training "
        "data. Use fine-tuning when: you need the model to learn a specific style/format, the knowledge is "
        "static, or you need faster inference (no retrieval step). In our case, RAG is ideal because laws "
        "are amended regularly and citations are mandatory."
    )

    # ═══════════════════ 15. CHEAT SHEET ═══════════════════
    pdf.add_page()
    pdf.h1("15. Quick Revision Cheat Sheet")
    pdf.p("Use this for last-minute revision before an interview:")

    entries = [
        ("Project:", "Legal Query System \u2014 AI-powered Indian legal chatbot using RAG"),
        ("Frontend:", "React.js (Vite) \u2014 Login, Signup, Dashboard, Chat pages"),
        ("App Server:", "Node.js + Express (port 3001) \u2014 JWT auth, MongoDB sessions"),
        ("RAG Server:", "Python + Flask (port 5000) \u2014 ML pipeline"),
        ("Database:", "MongoDB (users, chat sessions) + ChromaDB (vector embeddings)"),
        ("PDF Extraction:", "PyPDF2 \u2014 reads text from each PDF page"),
        ("Text Cleaning:", "Regex \u2014 removes gazette headers, page markers, whitespace"),
        ("Metadata:", "Filename parsing \u2014 extracts Act name and year automatically"),
        ("Chunking:", "Section-based \u2014 splits by legal sections, sub-splits large ones at sentence boundaries"),
        ("Embeddings:", "all-MiniLM-L6-v2 \u2014 384-dim vectors, 22.7M params, runs on CPU"),
        ("Vector DB:", "ChromaDB \u2014 cosine similarity, HNSW index, persistent storage"),
        ("Retrieval:", "Top-6 chunks by cosine similarity"),
        ("LLM:", "Gemini 2.0 Flash (Vertex AI) \u2014 temp=0.2, max 2048 tokens"),
        ("Filtering:", "Similarity threshold 0.45 \u2014 removes irrelevant sources"),
        ("Auth:", "JWT tokens + bcrypt (salt 12) password hashing"),
        ("Knowledge Base:", "18 Indian legal documents covering constitutional, criminal, civil, family, cyber, tax, and environmental law"),
        ("Key RAG benefit:", "No hallucination \u2014 every answer is grounded in actual source documents"),
    ]

    for label, value in entries:
        pdf.set_font("af", "B", 10)
        pdf.set_text_color(26, 54, 93)
        pdf.cell(35, 6, label)
        pdf.set_font("af", "", 10)
        pdf.set_text_color(40, 40, 40)
        pdf.multi_cell(145, 6, value)
        pdf.ln(1)

    pdf.ln(10)
    pdf.tip_box(
        "Final tip: When discussing this project in interviews, always start with the PROBLEM (legal info "
        "is inaccessible), then the SOLUTION (RAG-based chatbot), then the IMPACT (accurate, cited answers "
        "from 18 laws). Interviewers love the problem \u2192 solution \u2192 impact narrative."
    )

    # Footer
    pdf.ln(15)
    pdf.set_draw_color(200, 200, 200)
    pdf.line(15, pdf.get_y(), 195, pdf.get_y())
    pdf.ln(6)
    pdf.set_font("af", "I", 9)
    pdf.set_text_color(130, 130, 130)
    pdf.cell(0, 5, "Legal Query System \u2014 Interview Preparation Guide  |  April 2026", align="C")

    # Save
    pdf.output(OUTPUT_PATH)
    print(f"\nInterview Prep PDF generated successfully!")
    print(f"Location: {OUTPUT_PATH}")
    print(f"Total pages: {pdf.page_no()}")


if __name__ == "__main__":
    build()
