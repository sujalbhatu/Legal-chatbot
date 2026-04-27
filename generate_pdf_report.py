from fpdf import FPDF

class LegalReport(FPDF):
    def header(self):
        self.set_font('Arial', 'B', 15)
        self.set_text_color(26, 35, 126)
        self.cell(0, 10, 'Multilingual Legal Query System: Technical Report', 0, 1, 'C')
        self.set_draw_color(26, 35, 126)
        self.line(10, 22, 200, 22)
        self.ln(15)

    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')

def create_report():
    pdf = LegalReport()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    
    # Exec Summary
    pdf.set_font('Arial', 'B', 14)
    pdf.set_text_color(13, 71, 161)
    pdf.cell(0, 10, 'Executive Summary', 0, 1, 'L')
    pdf.ln(2)
    pdf.set_font('Arial', '', 11)
    pdf.set_text_color(0, 0, 0)
    pdf.multi_cell(0, 6, 'The Multilingual Legal Query System is an advanced RAG platform for Indian Law. It enables users to query a localized database of Acts in 14 regional languages, providing high-precision, well-cited answers.')
    pdf.ln(10)

    # Tech Stack
    pdf.set_font('Arial', 'B', 14)
    pdf.set_text_color(13, 71, 161)
    pdf.cell(0, 10, 'Technology Stack', 0, 1, 'L')
    pdf.ln(2)
    pdf.set_font('Arial', '', 11)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 6, '- LLM Reasoning: Groq Engine (Llama-3.3-70B)', 0, 1)
    pdf.cell(0, 6, '- Embedding Engine: law-ai/InLegalBERT', 0, 1)
    pdf.cell(0, 6, '- Vector Storage: ChromaDB (Persistent)', 0, 1)
    pdf.cell(0, 6, '- Frontend/Backend: React.js, Node.js (Express), Python (Flask)', 0, 1)
    pdf.ln(10)

    # Key Features
    pdf.set_font('Arial', 'B', 14)
    pdf.set_text_color(13, 71, 161)
    pdf.cell(0, 10, 'Core Features', 0, 1, 'L')
    pdf.ln(2)
    pdf.set_font('Arial', '', 11)
    pdf.set_text_color(0, 0, 0)
    pdf.multi_cell(0, 6, '1. Multilingual Support: Full support for 14 Indian languages via LLM Translation Bridge.\n2. InLegalBERT: Domain-trained embeddings for superior legal retrieval.\n3. Intent-Pivoting: Metadata-driven force-retrieval for high-priority Acts.\n4. Dynamic Scraper: Automated searching and ingestion from IndiaCode portal.')
    pdf.ln(10)

    # Data Pipeline
    pdf.set_font('Arial', 'B', 14)
    pdf.set_text_color(13, 71, 161)
    pdf.cell(0, 10, 'Data Pipeline & Coverage', 0, 1, 'L')
    pdf.ln(2)
    pdf.set_font('Arial', '', 11)
    pdf.set_text_color(0, 0, 0)
    pdf.multi_cell(0, 6, 'The system indexes over 6,700 legal chunks including the Constitution of India, CGST Act, CPC 1908, POCSO Act, and the 2023 Criminal Laws (BNS).')
    
    pdf.output("c:/Users/sujal/OneDrive/Pictures/Desktop/LEGAL QUERY SYSTEM/Legal_Query_System_Project_Report.pdf")
    print("PDF successfully generated.")

if __name__ == "__main__":
    create_report()
