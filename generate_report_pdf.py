"""
Generate a professional PDF report for the Legal Query System project.
Uses fpdf2 library to create a formatted, multi-section PDF document.
"""

import os
import urllib.request
from fpdf import FPDF

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FLOWCHART_PATH = os.path.join(SCRIPT_DIR, "rag_pipeline_flowchart.png")
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "Legal_Query_System_Report.pdf")
FONT_DIR = r"C:\Windows\Fonts"
FONT_REGULAR = os.path.join(FONT_DIR, "arial.ttf")
FONT_BOLD = os.path.join(FONT_DIR, "arialbd.ttf")
FONT_ITALIC = os.path.join(FONT_DIR, "ariali.ttf")
FONT_BOLDITALIC = os.path.join(FONT_DIR, "arialbi.ttf")


def ensure_fonts():
    """Verify system fonts are available."""
    for path in [FONT_REGULAR, FONT_BOLD, FONT_ITALIC, FONT_BOLDITALIC]:
        if not os.path.exists(path):
            raise FileNotFoundError(f"Font not found: {path}")
    print("System fonts verified.")


class ReportPDF(FPDF):
    """Custom PDF class with header/footer and helper methods."""

    def __init__(self):
        super().__init__('P', 'mm', 'A4')
        self.set_auto_page_break(auto=True, margin=25)
        # Register Unicode font
        self.add_font("dejavu", "", FONT_REGULAR, uni=True)
        self.add_font("dejavu", "B", FONT_BOLD, uni=True)
        self.add_font("dejavu", "I", FONT_ITALIC, uni=True)
        self.add_font("dejavu", "BI", FONT_BOLDITALIC, uni=True)

    # ── Header & Footer ──────────────────────────────────────────
    def header(self):
        if self.page_no() > 1:
            self.set_font("dejavu", "I", 8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 8, "Legal Query System \u2014 Project Report", align="L")
            self.ln(4)
            self.set_draw_color(200, 200, 200)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(6)

    def footer(self):
        if self.page_no() > 1:
            self.set_y(-15)
            self.set_font("dejavu", "I", 8)
            self.set_text_color(150, 150, 150)
            self.cell(0, 10, f"Page {self.page_no()}", align="C")

    # ── Helpers ───────────────────────────────────────────────────
    def section_title(self, text):
        """Render a major section heading."""
        self.ln(4)
        self.set_font("dejavu", "B", 16)
        self.set_text_color(26, 54, 93)
        self.cell(0, 10, text, new_x="LMARGIN", new_y="NEXT")
        # Underline
        self.set_draw_color(26, 54, 93)
        self.set_line_width(0.6)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(6)

    def sub_title(self, text):
        """Render a sub-section heading."""
        self.ln(3)
        self.set_font("dejavu", "B", 13)
        self.set_text_color(43, 108, 176)
        self.cell(0, 8, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

    def sub_sub_title(self, text):
        """Render a sub-sub-section heading."""
        self.ln(2)
        self.set_font("dejavu", "B", 11)
        self.set_text_color(44, 122, 123)
        self.cell(0, 7, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def body_text(self, text):
        """Render a paragraph of body text."""
        self.set_font("dejavu", "", 10.5)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5.5, text)
        self.ln(3)

    def bullet_list(self, items):
        """Render a bulleted list."""
        self.set_font("dejavu", "", 10.5)
        self.set_text_color(40, 40, 40)
        for item in items:
            self.cell(5)  # indent
            self.cell(5, 5.5, "\u2022 ")
            self.multi_cell(175, 5.5, item)
            self.ln(1.5)
        self.ln(2)

    def numbered_list(self, items):
        """Render a numbered list."""
        self.set_font("dejavu", "", 10.5)
        self.set_text_color(40, 40, 40)
        for i, item in enumerate(items, 1):
            self.cell(5)  # indent
            self.set_font("dejavu", "B", 10.5)
            self.cell(8, 5.5, f"{i}.")
            self.set_font("dejavu", "", 10.5)
            self.multi_cell(172, 5.5, item)
            self.ln(1.5)
        self.ln(2)

    def info_box(self, text, color="blue"):
        """Render a highlighted information box."""
        x = self.get_x()
        y = self.get_y()
        if color == "blue":
            self.set_fill_color(235, 248, 255)
            bar_color = (43, 108, 176)
        else:
            self.set_fill_color(240, 255, 244)
            bar_color = (44, 122, 123)

        self.set_font("dejavu", "", 10)
        self.set_text_color(40, 40, 40)

        # Calculate height needed
        # Approximate: each line is about 5mm, 180mm width fits ~90 chars
        lines = len(text) / 85 + text.count('\n')
        box_h = max(12, lines * 5 + 8)

        self.set_draw_color(*bar_color)
        self.set_line_width(1.2)
        self.rect(10, y, 190, box_h, style="F")
        self.line(10, y, 10, y + box_h)

        self.set_xy(14, y + 3)
        self.multi_cell(182, 5, text)
        self.set_y(y + box_h + 4)

    def add_table(self, headers, rows, col_widths=None):
        """Render a simple table."""
        if col_widths is None:
            col_widths = [190 / len(headers)] * len(headers)

        # Header row
        self.set_font("dejavu", "B", 9.5)
        self.set_fill_color(26, 54, 93)
        self.set_text_color(255, 255, 255)
        for i, h in enumerate(headers):
            self.cell(col_widths[i], 8, h, border=1, fill=True, align="C")
        self.ln()

        # Data rows
        self.set_font("dejavu", "", 9.5)
        self.set_text_color(40, 40, 40)
        fill = False
        for row in rows:
            if fill:
                self.set_fill_color(245, 247, 250)
            else:
                self.set_fill_color(255, 255, 255)

            max_h = 7
            for i, cell in enumerate(row):
                # estimate if multi-line needed
                if len(cell) > col_widths[i] * 0.45:
                    lines = max(1, int(len(cell) / (col_widths[i] * 0.45)) + 1)
                    max_h = max(max_h, lines * 5 + 2)

            x_start = self.get_x()
            y_start = self.get_y()

            for i, cell in enumerate(row):
                self.set_xy(x_start + sum(col_widths[:i]), y_start)
                self.multi_cell(col_widths[i], 5, cell, border=1, fill=True)

            self.set_y(max(self.get_y(), y_start + max_h))
            fill = not fill
        self.ln(4)


def build_report():
    """Build the complete PDF report."""
    pdf = ReportPDF()

    # ═══════════════════ COVER PAGE ═══════════════════
    pdf.add_page()
    pdf.set_margins(10, 10, 10)

    # Blue background block
    pdf.set_fill_color(26, 54, 93)
    pdf.rect(0, 0, 210, 297, style="F")

    # Gradient overlay (simulated with layered rects)
    pdf.set_fill_color(43, 82, 130)
    pdf.rect(0, 100, 210, 100, style="F")
    pdf.set_fill_color(26, 54, 93)
    pdf.rect(0, 0, 210, 105, style="F")
    pdf.set_fill_color(43, 108, 176)
    pdf.rect(0, 195, 210, 102, style="F")

    # Icon
    pdf.set_y(75)
    pdf.set_font("dejavu", "B", 50)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 20, "\u2696", align="C", new_x="LMARGIN", new_y="NEXT")

    # Title
    pdf.ln(8)
    pdf.set_font("dejavu", "B", 36)
    pdf.cell(0, 16, "Legal Query System", align="C", new_x="LMARGIN", new_y="NEXT")

    # Subtitle
    pdf.ln(4)
    pdf.set_font("dejavu", "", 16)
    pdf.set_text_color(200, 220, 255)
    pdf.cell(0, 8, "An AI-Powered Indian Legal Assistant", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, "Built with Retrieval-Augmented Generation (RAG)", align="C", new_x="LMARGIN", new_y="NEXT")

    # Divider
    pdf.ln(10)
    pdf.set_draw_color(255, 255, 255)
    pdf.set_line_width(0.5)
    pdf.line(80, pdf.get_y(), 130, pdf.get_y())

    # Meta
    pdf.ln(12)
    pdf.set_font("dejavu", "", 13)
    pdf.set_text_color(220, 230, 255)
    pdf.cell(0, 8, "Project Report", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, "Final Submission", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)
    pdf.set_font("dejavu", "B", 12)
    pdf.cell(0, 8, "April 2026", align="C", new_x="LMARGIN", new_y="NEXT")

    # ═══════════════════ TABLE OF CONTENTS ═══════════════════
    pdf.add_page()
    pdf.set_margins(15, 15, 15)

    pdf.set_font("dejavu", "B", 22)
    pdf.set_text_color(26, 54, 93)
    pdf.cell(0, 14, "Table of Contents", new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(26, 54, 93)
    pdf.set_line_width(0.8)
    pdf.line(15, pdf.get_y() + 2, 195, pdf.get_y() + 2)
    pdf.ln(10)

    toc_items = [
        ("1.", "Introduction", [
            "Problem Statement",
            "Proposed Solution",
            "What is RAG (Retrieval-Augmented Generation)?"
        ]),
        ("2.", "PDF Ingestion Pipeline", [
            "Text Extraction",
            "Metadata Detection",
            "Legal Text Chunking",
            "Vector Store Construction"
        ]),
        ("3.", "RAG Query Pipeline", [
            "Semantic Retrieval",
            "Context Formatting",
            "LLM Generation",
            "Source Filtering",
            "Response Construction"
        ]),
        ("4.", "RAG Pipeline Flowchart", []),
        ("5.", "System Architecture", [
            "Backend Architecture",
            "Frontend Architecture",
            "Authentication & Session Management"
        ]),
        ("6.", "Knowledge Base & Legal Documents", []),
        ("7.", "Technology Stack", []),
        ("8.", "Key Features", []),
        ("9.", "Challenges & Solutions", []),
        ("10.", "Future Scope", []),
        ("11.", "Conclusion", []),
    ]

    for num, title, subs in toc_items:
        pdf.set_font("dejavu", "B", 12)
        pdf.set_text_color(26, 54, 93)
        pdf.cell(12, 7, num)
        pdf.set_font("dejavu", "", 12)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")

        # dotted line
        pdf.set_draw_color(220, 220, 220)
        pdf.set_line_width(0.2)
        y = pdf.get_y()
        pdf.line(15, y, 195, y)

        for sub in subs:
            pdf.cell(20)
            pdf.set_font("dejavu", "", 10)
            pdf.set_text_color(100, 100, 110)
            pdf.cell(5, 6, "\u25b8")
            pdf.cell(0, 6, sub, new_x="LMARGIN", new_y="NEXT")

        pdf.ln(1)

    # ═══════════════════ SECTION 1: INTRODUCTION ═══════════════════
    pdf.add_page()
    pdf.set_margins(15, 15, 15)

    pdf.section_title("1. Introduction")

    pdf.sub_title("1.1 Problem Statement")
    pdf.body_text(
        "India has one of the most extensive and complex legal frameworks in the world. With hundreds of laws, "
        "thousands of sections, and constantly evolving amendments, it is extremely difficult for ordinary citizens "
        "to understand their legal rights and obligations. When a person faces a legal issue \u2014 whether it is related "
        "to property, marriage, criminal matters, consumer rights, or digital privacy \u2014 they often have no easy way "
        "to get a quick, reliable answer without consulting an expensive lawyer."
    )
    pdf.body_text(
        "Existing legal information sources such as government websites, bare act PDFs, and legal databases are "
        "written in formal legal language that is hard to understand for someone without a law background. There is "
        "a clear gap: common people need a simple, accessible, and intelligent tool that can read through these "
        "complex legal documents and answer their questions in plain, everyday language."
    )

    pdf.sub_title("1.2 Proposed Solution")
    pdf.body_text(
        "The Legal Query System is a web-based AI assistant designed to bridge this gap. It allows users to ask "
        "legal questions in simple, natural language (for example, \"What happens if someone breaks a contract?\" "
        "or \"What are my rights if I am arrested?\") and receive clear, well-explained answers that include proper "
        "legal citations \u2014 the exact Act name, Section number, and relevant clause text."
    )
    pdf.body_text(
        "The system is built using a modern AI technique called Retrieval-Augmented Generation (RAG), which "
        "ensures that every answer is grounded in actual legal documents rather than being made up by the AI. "
        "This makes the system both accurate and trustworthy."
    )

    pdf.sub_title("1.3 What is RAG (Retrieval-Augmented Generation)?")
    pdf.body_text(
        "RAG is a technique that combines two powerful ideas to make AI systems more reliable:"
    )
    pdf.numbered_list([
        "Retrieval \u2014 Before answering a question, the system first searches through a knowledge base (in our case, "
        "Indian legal documents) and retrieves the most relevant sections that relate to the user's question.",
        "Generation \u2014 The retrieved sections are then given to a Large Language Model (LLM) as context, and the "
        "LLM uses this context to generate a well-written, accurate answer."
    ])
    pdf.body_text(
        "The key advantage of RAG over a plain AI chatbot is that the AI does not rely on its own memory to "
        "answer legal questions. Instead, it always refers back to the actual source documents. This dramatically "
        "reduces the chances of the AI \"hallucinating\" or making up incorrect information \u2014 a critical requirement "
        "when dealing with legal matters."
    )
    pdf.info_box(
        "In simple terms: Think of RAG like a very smart research assistant. When you ask a question, it first "
        "goes to the library (our legal database), finds the most relevant books and pages, reads them, and then "
        "explains the answer to you in simple words \u2014 while also telling you exactly which book and page the "
        "information came from."
    )

    # ═══════════════════ SECTION 2: PDF INGESTION PIPELINE ═══════════════════
    pdf.add_page()
    pdf.section_title("2. PDF Ingestion Pipeline")
    pdf.body_text(
        "Before the system can answer any legal queries, it must first process and understand all the legal "
        "documents. This is done through the PDF Ingestion Pipeline \u2014 a series of steps that takes raw legal "
        "PDF files and converts them into a searchable, AI-ready database. The pipeline runs once (or whenever "
        "new documents are added) and prepares the knowledge base for the RAG system."
    )

    pdf.sub_title("2.1 Text Extraction")
    pdf.body_text(
        "The first step is extracting readable text from the PDF files. Legal documents in India are typically "
        "published as PDF files by the government. These PDFs contain formatted text with headers, footers, "
        "page numbers, and sometimes multi-column layouts."
    )
    pdf.body_text(
        "Our system uses PyPDF2, a Python library, to open each PDF file and extract text from every page. "
        "The extracted text is saved as a plain text file for further processing. During extraction, the system "
        "also adds page markers (such as \"PAGE 1\", \"PAGE 2\") to keep track of which content came from which "
        "page \u2014 this helps during debugging and verification."
    )
    pdf.info_box(
        "What happens here: A PDF file like \"indian_contract_act_1872.pdf\" goes in, and a clean text file "
        "\"indian_contract_act_1872.txt\" comes out, containing all the text from every page of the PDF."
    )

    pdf.sub_title("2.2 Metadata Detection")
    pdf.body_text(
        "Legal documents need proper identification \u2014 the system must know which Act a piece of text belongs to, "
        "and what year it was enacted. Rather than manually entering this information for each document, our system "
        "automatically detects metadata from the filename of each PDF."
    )
    pdf.body_text("The filename is parsed using a smart algorithm:")
    pdf.bullet_list([
        "Underscores in the filename are replaced with spaces (e.g., \"indian_contract_act\" becomes \"Indian Contract Act\").",
        "A trailing four-digit number is recognized as the year (e.g., \"1872\").",
        "The remaining part is title-cased to create a clean, readable Act name.",
        "For special cases (like the Aadhaar Act or the Constitution), a manual mapping is used to get the exact correct name."
    ])
    pdf.body_text(
        "This metadata (Act name and year) is attached to every chunk of text extracted from that document, "
        "ensuring that when the AI cites a source, it can provide the exact name like \"Indian Contract Act, 1872, "
        "Section 73\" instead of just a filename."
    )

    pdf.sub_title("2.3 Legal Text Chunking")
    pdf.body_text(
        "This is one of the most important and carefully designed parts of the pipeline. Legal documents are very "
        "long \u2014 sometimes hundreds of pages. An AI model cannot process an entire document at once, so we need to "
        "break it into smaller, meaningful pieces called \"chunks.\" However, the way we chunk the text matters a lot "
        "\u2014 we cannot just split it arbitrarily, or we would lose the meaning of legal sections."
    )

    pdf.sub_sub_title("How Our Document-Based Chunking Strategy Works")
    pdf.body_text(
        "Our chunking strategy is specifically designed for the structure of Indian legal documents. Indian Acts "
        "and laws follow a well-defined structure:"
    )
    pdf.info_box(
        "Typical structure of an Indian legal document:\n"
        "Act Name -> contains multiple Chapters (e.g., Chapter I, Chapter II...) -> each Chapter contains "
        "multiple Sections (e.g., Section 1, Section 2...) -> each Section contains the actual legal text, "
        "definitions, provisions, and clauses.",
        color="green"
    )
    pdf.body_text("Our system exploits this natural structure to create intelligent chunks:")

    pdf.numbered_list([
        "Raw Text Cleaning: Before chunking, the extracted text is cleaned up. PDF artifacts like gazette "
        "headers (e.g., \"THE GAZETTE OF INDIA EXTRAORDINARY\"), page markers, excessive whitespace, and "
        "formatting noise are removed. This ensures that only the actual legal content is processed.",

        "Section-Based Splitting: The system uses a pattern-matching approach to identify section boundaries "
        "in the text. It looks for patterns like \"1. Short title and commencement\" or \"33A. Penalty for "
        "fraud\" \u2014 a number (optionally followed by a letter), a period, and then the section title. This is "
        "how sections are numbered in Indian legislation, and the system uses this pattern to split the text "
        "at every section boundary.",

        "Chapter Tracking: As the system reads through the text, it also watches for chapter headers (like "
        "\"CHAPTER IV \u2014 OF THE PERFORMANCE OF CONTRACTS\"). Whenever it finds a chapter header, it updates the "
        "current chapter label. This means every chunk knows which chapter it belongs to, enabling better citation.",

        "Preamble Handling: Any text that appears before the first section (such as the preamble, definitions "
        "of the Act, or introductory statements) is captured as a separate \"Preamble\" chunk so that it is not lost.",

        "Large Section Splitting: Some sections in legal documents can be very lengthy (for example, Section 34 "
        "of the Aadhaar Act or certain constitutional articles). If a section exceeds 3,000 characters, the "
        "system further splits it at sentence boundaries \u2014 it looks for full stops or semicolons followed by a "
        "space, and splits at the nearest one within a 1,500-character window. This ensures that even the "
        "sub-parts of a large section are complete, grammatically correct sentences.",

        "Fallback for Non-Standard Documents: If a document does not follow the standard section numbering "
        "(for example, the Preamble of the Constitution or an unnumbered schedule), the system falls back to "
        "pure sentence-boundary splitting, creating sequential parts labeled \"Part 1\", \"Part 2\", etc.",

        "Short Section Filtering: Very short text fragments (less than 70 characters) are automatically skipped. "
        "These are typically table-of-contents entries or formatting artifacts that would not be useful for "
        "answering legal queries."
    ])

    pdf.body_text(
        "Each chunk is stored as a structured record containing both the text content and its associated metadata "
        "\u2014 the Act name, year, source filename, chapter, section number, and section title. This rich metadata is "
        "what enables precise legal citations later."
    )

    pdf.info_box(
        "Example Chunk:\n"
        "Act: Indian Contract Act, 1872 | Chapter: CHAPTER VI \u2014 Of the Consequences of Breach of Contract | "
        "Section: 73 \u2014 Compensation for loss or damage caused by breach\n"
        "Text: \"When a contract has been broken, the party who suffers by such breach is entitled to receive, "
        "as compensation for loss or damage caused to him thereby, such as naturally arose in the usual course "
        "of things from such breach...\""
    )

    pdf.sub_title("2.4 Vector Store Construction")
    pdf.body_text(
        "Once all the legal documents have been extracted, cleaned, and chunked, the next step is to make them "
        "searchable by meaning rather than by keywords. This is done by converting each text chunk into a vector "
        "embedding \u2014 a list of numbers that represents the meaning of the text \u2014 and storing them in a vector database."
    )
    pdf.body_text("Our system uses the following components for this step:")
    pdf.bullet_list([
        "Sentence Transformers (all-MiniLM-L6-v2): This is a pre-trained AI model that converts any text into "
        "a 384-dimensional vector (a list of 384 numbers). Texts with similar meanings will have vectors that "
        "are close to each other in this mathematical space. For example, chunks about \"breach of contract\" "
        "and \"compensation for breaking an agreement\" would have vectors that are very similar.",

        "ChromaDB: This is a vector database that stores all the embeddings and their associated metadata. It "
        "is optimized for fast similarity searches \u2014 when a user asks a question, the system can quickly find "
        "the chunks whose meanings are closest to the question."
    ])
    pdf.body_text(
        "The vector store is configured to use cosine similarity as the distance metric, which measures the "
        "angle between two vectors. A cosine similarity of 1 means the texts are perfectly similar in meaning, "
        "while 0 means they are completely unrelated."
    )
    pdf.body_text(
        "All chunks are embedded in batches of 32 (for efficiency) and then added to ChromaDB in batches of 100. "
        "The resulting vector database is persisted to disk so that it does not need to be rebuilt every time the "
        "system starts \u2014 it is a one-time computation."
    )

    # ═══════════════════ SECTION 3: RAG QUERY PIPELINE ═══════════════════
    pdf.add_page()
    pdf.section_title("3. RAG Query Pipeline")
    pdf.body_text(
        "When a user asks a legal question, the system processes it through the RAG Query Pipeline. This pipeline "
        "takes the user's question, finds the most relevant legal content from the vector database, gives that "
        "content to an AI model for reasoning, and returns a well-structured, cited answer. Here is a breakdown "
        "of each step:"
    )

    pdf.sub_title("3.1 Semantic Retrieval")
    pdf.body_text(
        "The first step in answering a query is finding the most relevant chunks from the legal database. This is "
        "called semantic retrieval because it searches by meaning, not just by keywords."
    )
    pdf.body_text(
        "When a user types a question (for example, \"What is the punishment for theft?\"), the system:"
    )
    pdf.numbered_list([
        "Converts the question into a vector embedding using the same Sentence Transformer model that was used "
        "during ingestion.",
        "Searches the ChromaDB vector store for the top 6 most similar chunks (called top-k retrieval). "
        "The similarity is calculated using cosine distance.",
        "Returns these 6 chunks along with their metadata (Act name, section, chapter) and their similarity scores."
    ])
    pdf.body_text(
        "The reason we retrieve 6 chunks (instead of just 1 or 2) is to give the AI model enough context to form "
        "a comprehensive answer. A legal question might span multiple sections or even multiple Acts, and having 6 "
        "relevant pieces of text gives the model a more complete picture."
    )

    pdf.sub_title("3.2 Context Formatting")
    pdf.body_text(
        "The retrieved chunks cannot be passed to the AI model as raw text \u2014 they need to be organized and "
        "labeled properly so that the model can understand where each piece of information comes from. This step "
        "creates a structured context string."
    )
    pdf.body_text("For each retrieved chunk, the system creates a header that includes:")
    pdf.bullet_list([
        "The Act name (e.g., \"Bharatiya Nyaya Sanhita, 2023\")",
        "The Section number and title (e.g., \"Section 303 \u2014 Theft\")",
        "The Chapter (e.g., \"CHAPTER XVII \u2014 Of Offences Against Property\")",
        "The Relevance score (e.g., \"Relevance: 89.34%\")"
    ])
    pdf.body_text(
        "All chunks are then joined together with separators, creating a single, well-formatted block of text "
        "that the AI model can read and reference. This formatting is crucial \u2014 it gives the AI model clear "
        "signals about which Act and section each piece of text belongs to, enabling accurate citations."
    )

    pdf.sub_title("3.3 LLM Generation")
    pdf.body_text(
        "The core intelligence of the system comes from the Large Language Model (LLM). Our system uses Google "
        "Gemini 2.0 Flash, accessed through the Vertex AI platform. This model reads the formatted context (the "
        "relevant legal chunks) and the user's question, and generates a natural, human-readable answer."
    )
    pdf.body_text("The LLM is guided by a carefully crafted system prompt that instructs it to:")
    pdf.bullet_list([
        "First explain the answer in very simple, everyday language so that anyone can understand it.",
        "Then provide the formal legal explanation with proper citations (Act name, Section number, and exact clause text).",
        "Never make up information \u2014 if the provided context does not contain the answer, it should honestly say so.",
        "For casual conversations (like greetings), respond naturally without legal jargon.",
        "Always include a legal disclaimer at the end of substantive legal answers."
    ])
    pdf.body_text(
        "The model also supports multi-turn conversations \u2014 it remembers the last 6 messages from the "
        "conversation history, allowing users to ask follow-up questions like \"Can you explain Section 73 in "
        "more detail?\" without having to repeat the context."
    )
    pdf.body_text(
        "The model's temperature is set to 0.2 (a low value), which makes the responses more focused and "
        "deterministic \u2014 important for legal accuracy where creative or variable responses are not desirable."
    )

    pdf.sub_title("3.4 Source Filtering")
    pdf.body_text(
        "Not all retrieved chunks are equally relevant. Some may have been retrieved simply because they share a "
        "few common words with the question but are not actually related to the topic. To handle this, the system "
        "applies a relevance threshold."
    )
    pdf.body_text(
        "Any source with a similarity score below 0.45 (45%) is filtered out and not shown to the user as a "
        "citation. This ensures that:"
    )
    pdf.bullet_list([
        "When a user asks a genuine legal question, only the truly relevant sources are displayed.",
        "When a user is just having a casual conversation (like saying \"hello\"), no irrelevant legal citations "
        "are shown \u2014 the system recognizes that a greeting has low similarity with all legal documents and "
        "filters everything out."
    ])
    pdf.body_text(
        "This filtering step is essential for maintaining user trust. Showing irrelevant citations would confuse "
        "users and undermine the credibility of the system."
    )

    pdf.sub_title("3.5 Response Construction")
    pdf.body_text(
        "The final step is assembling the complete response that is sent back to the user. The response contains "
        "two parts:"
    )
    pdf.numbered_list([
        "The Answer: The natural-language explanation generated by the LLM, which includes the simple "
        "explanation, the legal reasoning, and the citations woven naturally into the text.",
        "The Source Citations: A list of the filtered, relevant source documents, each containing the Act name, "
        "Section, Chapter, year, a cleaned excerpt of the source text, and the similarity score. The source text "
        "is cleaned for display \u2014 leading section numbers are removed (since they are already shown in metadata), "
        "excessive whitespace is collapsed, and long texts are truncated at sentence boundaries to keep them readable."
    ])
    pdf.body_text(
        "This dual-response design allows the user interface to display the answer prominently while also "
        "providing expandable source citations that users can click to verify the information \u2014 much like how a "
        "legal brief includes footnotes."
    )

    # ═══════════════════ SECTION 4: FLOWCHART ═══════════════════
    pdf.add_page()
    pdf.section_title("4. RAG Pipeline Flowchart")
    pdf.body_text(
        "The following diagram provides a visual overview of the complete RAG pipeline \u2014 from document ingestion "
        "to query answering:"
    )

    if os.path.exists(FLOWCHART_PATH):
        # Center the image
        img_w = 170
        x = (210 - img_w) / 2
        pdf.image(FLOWCHART_PATH, x=x, w=img_w)
        pdf.ln(4)
        pdf.set_font("dejavu", "I", 9)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 6, "Figure 1: Complete RAG Pipeline \u2014 PDF Ingestion (top) and Query Processing (bottom)", align="C", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(6)
    else:
        pdf.body_text("[Flowchart image not found at: " + FLOWCHART_PATH + "]")

    pdf.body_text("As shown in the diagram, the system operates in two distinct phases:")
    pdf.bullet_list([
        "Offline Phase (PDF Ingestion): This runs once (or when new documents are added). It processes all legal "
        "PDFs through text extraction, metadata detection, legal chunking, and vector store construction. The "
        "result is a ready-to-search vector database stored on disk.",
        "Online Phase (Query Processing): This runs every time a user asks a question. The query flows through "
        "semantic retrieval, context formatting, LLM generation, source filtering, and response construction \u2014 "
        "returning a cited answer in seconds."
    ])

    # ═══════════════════ SECTION 5: SYSTEM ARCHITECTURE ═══════════════════
    pdf.add_page()
    pdf.section_title("5. System Architecture")
    pdf.body_text(
        "The Legal Query System follows a three-tier architecture with clearly separated responsibilities:"
    )

    pdf.sub_title("5.1 Backend Architecture")
    pdf.body_text("The backend consists of two servers running simultaneously:")
    pdf.numbered_list([
        "RAG API Server (Python/Flask \u2014 Port 5000): This server hosts the RAG pipeline. It exposes a "
        "/api/query endpoint that accepts a user's question and returns the AI-generated answer with citations. "
        "It also provides an /api/ingest endpoint to trigger re-ingestion of PDFs, and a /api/health endpoint "
        "for health checks. The RAG pipeline is loaded as a singleton (created once, reused for all requests) "
        "to avoid the overhead of loading models repeatedly.",

        "Application Server (Node.js/Express \u2014 Port 3001): This server handles user authentication, session "
        "management, and acts as a gateway to the RAG API. It connects to a MongoDB database to store user "
        "accounts and chat sessions. When a user sends a query through the frontend, this server first "
        "authenticates the user, then forwards the query to the RAG API, receives the response, saves the "
        "conversation in the database, and sends the result back to the frontend."
    ])

    pdf.sub_title("5.2 Frontend Architecture")
    pdf.body_text(
        "The frontend is built with React.js (using the Vite build tool for fast development) and provides "
        "four main pages:"
    )
    pdf.bullet_list([
        "Login Page: Allows existing users to sign in with their email and password.",
        "Signup Page: Allows new users to create an account with their name, email, and password.",
        "Dashboard: Displays all of the user's chat sessions, sorted by most recent. Users can create new "
        "sessions, view old ones, mark queries as solved, or delete sessions.",
        "Chat Page: The main interaction page where users type their legal questions and receive AI-generated "
        "answers with expandable source citations. The chat interface supports multi-turn conversations and "
        "displays a legal disclaimer with each response."
    ])

    pdf.sub_title("5.3 Authentication & Session Management")
    pdf.body_text("The system implements secure user authentication using:")
    pdf.bullet_list([
        "JWT (JSON Web Tokens): After a user logs in, the server issues a signed token that the frontend stores "
        "locally. This token is sent with every subsequent request to verify the user's identity.",
        "bcrypt Password Hashing: User passwords are never stored in plain text. They are hashed using bcrypt "
        "with a salt factor of 12, making them virtually impossible to reverse-engineer.",
        "Chat Sessions: Each user's conversations are stored as separate sessions in MongoDB, with full message "
        "history and source citations. Users can return to previous sessions to review past legal queries and answers."
    ])

    # ═══════════════════ SECTION 6: KNOWLEDGE BASE ═══════════════════
    pdf.add_page()
    pdf.section_title("6. Knowledge Base & Legal Documents")
    pdf.body_text(
        "The system's knowledge base contains 18 major Indian legal documents covering a wide range of legal topics:"
    )

    pdf.add_table(
        headers=["#", "Document Name", "Category"],
        rows=[
            ["1", "Constitution of India, 2024", "Constitutional Law"],
            ["2", "Bharatiya Nyaya Sanhita, 2023", "Criminal Law"],
            ["3", "Bharatiya Nagarik Suraksha Sanhita, 2023", "Criminal Procedure"],
            ["4", "Bharatiya Sakshya Adhiniyam, 2023", "Law of Evidence"],
            ["5", "Indian Contract Act, 1872", "Civil Law"],
            ["6", "Code of Civil Procedure, 1908", "Civil Procedure"],
            ["7", "Transfer of Property Act, 1882", "Property Law"],
            ["8", "Specific Relief Act, 1963", "Civil Law"],
            ["9", "Hindu Marriage Act, 1955", "Family Law"],
            ["10", "Special Marriage Act, 1954", "Family Law"],
            ["11", "Protection of Women from DV Act, 2005", "Family Law"],
            ["12", "POCSO Act, 2012", "Child Protection"],
            ["13", "Information Technology Act, 2000", "Cyber & Digital Law"],
            ["14", "Aadhaar Act, 2016", "Identity & Govt Services"],
            ["15", "Central GST Act, 2017", "Tax Law"],
            ["16", "Environment Protection Act, 1986", "Environmental Law"],
            ["17", "Motor Vehicles Act, 1988", "Motor Vehicle Regulation"],
            ["18", "Right to Information Act, 2005", "Transparency & Governance"],
        ],
        col_widths=[12, 110, 58]
    )
    pdf.body_text(
        "This diverse collection ensures that the system can answer questions across constitutional rights, "
        "criminal law, civil procedures, family matters, child protection, cyber law, tax, environmental issues, "
        "traffic regulations, and government transparency."
    )

    # ═══════════════════ SECTION 7: TECH STACK ═══════════════════
    pdf.section_title("7. Technology Stack")
    pdf.add_table(
        headers=["Component", "Technology", "Purpose"],
        rows=[
            ["Frontend", "React.js (Vite)", "User interface with chat and dashboard"],
            ["App Server", "Node.js / Express.js", "Authentication, sessions, API gateway"],
            ["RAG API Server", "Python / Flask", "RAG pipeline \u2014 retrieval & AI generation"],
            ["Database", "MongoDB", "User accounts and chat session storage"],
            ["Vector Database", "ChromaDB", "Storing and searching text embeddings"],
            ["Embedding Model", "Sentence Transformers", "Converting text to vector representations"],
            ["LLM", "Gemini 2.0 Flash (Vertex AI)", "Generating natural-language legal answers"],
            ["PDF Processing", "PyPDF2", "Extracting text from legal PDFs"],
            ["Authentication", "JWT + bcrypt", "Secure login and password hashing"],
            ["HTTP Client", "Axios", "Frontend-backend communication"],
        ],
        col_widths=[32, 55, 93]
    )

    # ═══════════════════ SECTION 8: KEY FEATURES ═══════════════════
    pdf.add_page()
    pdf.section_title("8. Key Features")
    pdf.numbered_list([
        "Natural Language Understanding: Users can ask questions in plain English without knowing specific "
        "legal terminology. The semantic search finds relevant sections regardless of the exact wording used.",
        "Accurate Legal Citations: Every answer includes properly cited references \u2014 the Act name, Section "
        "number, Chapter, and relevant excerpt \u2014 so users can verify the information independently.",
        "Multi-Turn Conversations: The system remembers the context of the ongoing conversation (up to the "
        "last 6 messages), allowing users to ask follow-up questions naturally.",
        "Smart Response Behavior: The system distinguishes between casual greetings and actual legal questions. "
        "For greetings, it responds naturally. For legal questions, it provides structured, cited answers.",
        "Source Transparency: Every response comes with expandable source citations showing the relevant "
        "text excerpts, similarity scores, and exact legal references.",
        "Session Management: Users can create, revisit, and manage multiple query sessions \u2014 useful for "
        "tracking different legal issues over time.",
        "Secure Authentication: Protected user accounts with hashed passwords and JWT-based authentication "
        "ensure data privacy.",
        "Relevance Filtering: A 45% similarity threshold automatically filters out irrelevant sources, "
        "preventing noise in the citations.",
        "Legal Disclaimer: Every substantive legal answer includes a disclaimer advising users to consult a "
        "qualified professional, ensuring responsible use."
    ])

    # ═══════════════════ SECTION 9: CHALLENGES & SOLUTIONS ═══════════════════
    pdf.section_title("9. Challenges & Solutions")
    pdf.add_table(
        headers=["Challenge", "Solution"],
        rows=[
            [
                "PDF text extraction produces noisy output with headers, footers, and artifacts",
                "Implemented a text cleaning step that removes gazette headers, page markers, and whitespace using regex"
            ],
            [
                "Fixed-size chunking breaks legal sections in the middle, losing meaning",
                "Designed section-aware chunking that splits by legal section boundaries and sub-splits at sentence ends"
            ],
            [
                "Some documents don't follow standard section numbering",
                "Implemented a fallback strategy that splits by sentence boundaries into sequential parts"
            ],
            [
                "Identifying Act names and years reliably from diverse filenames",
                "Combined filename parsing with a manual override map for special cases"
            ],
            [
                "AI model generating citations for casual greetings",
                "Added similarity-based source filtering (threshold 0.45) and system prompt rules"
            ],
            [
                "Long response times due to model loading on each request",
                "Used a singleton pattern to load the pipeline once and reuse it for all requests"
            ],
        ],
        col_widths=[90, 90]
    )

    # ═══════════════════ SECTION 10: FUTURE SCOPE ═══════════════════
    pdf.add_page()
    pdf.section_title("10. Future Scope")
    pdf.bullet_list([
        "Multi-Language Support: Extending the system to accept queries and generate answers in Hindi and "
        "other regional Indian languages to serve a wider audience.",
        "Case Law Integration: Adding Supreme Court and High Court judgments to the knowledge base, enabling "
        "the system to cite relevant case precedents along with bare Act text.",
        "Hybrid Search: Combining semantic (vector) search with keyword-based (BM25) search for improved "
        "retrieval accuracy, especially for queries containing specific legal terms or section numbers.",
        "Voice Interface: Adding speech-to-text and text-to-speech capabilities so that users can ask legal "
        "questions verbally \u2014 particularly useful for users who are not comfortable typing.",
        "Document Upload: Allowing users to upload their own legal documents (such as contracts or agreements) "
        "for the AI to analyze and explain.",
        "Advanced Citation Linking: Providing clickable links that directly highlight the cited section text "
        "within the original PDF document.",
        "Admin Dashboard: Building an admin panel to monitor usage statistics, manage documents, and view "
        "analytics on the most commonly asked legal topics.",
        "Fine-Tuned Embeddings: Training custom embedding models specifically on Indian legal text to improve "
        "retrieval accuracy beyond what general-purpose models can achieve."
    ])

    # ═══════════════════ SECTION 11: CONCLUSION ═══════════════════
    pdf.section_title("11. Conclusion")
    pdf.body_text(
        "The Legal Query System demonstrates how modern AI techniques \u2014 specifically Retrieval-Augmented "
        "Generation \u2014 can be applied to make complex legal information accessible to ordinary citizens. By "
        "combining intelligent document processing, semantic search, and large language model generation, the "
        "system provides accurate, well-cited, and easy-to-understand answers to legal questions."
    )
    pdf.body_text(
        "The carefully designed PDF ingestion pipeline ensures that legal documents are broken into meaningful, "
        "well-labeled chunks that preserve the natural structure of Indian legislation. The RAG query pipeline "
        "ensures that every answer is grounded in actual source documents, with proper citations and relevance "
        "filtering to maintain accuracy and trust."
    )
    pdf.body_text(
        "With 18 major Indian laws in its knowledge base \u2014 covering everything from constitutional rights and "
        "criminal law to cyber law, environmental protection, and motor vehicle regulations \u2014 the system serves "
        "as a comprehensive first point of reference for anyone seeking to understand their legal rights and "
        "obligations under Indian law."
    )
    pdf.body_text(
        "While the system is not a substitute for professional legal counsel, it significantly lowers the barrier "
        "to accessing legal knowledge and empowers citizens to make more informed decisions about their legal matters."
    )

    # Footer
    pdf.ln(15)
    pdf.set_draw_color(200, 200, 200)
    pdf.line(15, pdf.get_y(), 195, pdf.get_y())
    pdf.ln(6)
    pdf.set_font("dejavu", "I", 9)
    pdf.set_text_color(130, 130, 130)
    pdf.cell(0, 5, "Legal Query System \u2014 Project Report  |  April 2026", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 5, "This report was prepared as part of the final project submission.", align="C")

    # ═══════════════════ SAVE ═══════════════════
    pdf.output(OUTPUT_PATH)
    print(f"\nPDF report generated successfully!")
    print(f"Location: {OUTPUT_PATH}")
    print(f"Total pages: {pdf.page_no()}")


if __name__ == "__main__":
    ensure_fonts()
    build_report()
