"""
RAG Pipeline for Legal Query System.
Uses ChromaDB for retrieval and Vertex AI (Gemini) for generation.
"""

import os
import re
import json
from pathlib import Path
from chromadb import PersistentClient
from sentence_transformers import SentenceTransformer

# Google Cloud / Vertex AI
from google.oauth2 import service_account
from langchain_google_vertexai import ChatVertexAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
CREDENTIALS_PATH = BASE_DIR / "credentials.json"
VECTOR_DB_DIR = BASE_DIR / "data" / "vector_db"

# Load credentials
credentials = service_account.Credentials.from_service_account_file(
    str(CREDENTIALS_PATH),
    scopes=["https://www.googleapis.com/auth/cloud-platform"]
)

# Load the project ID from credentials
with open(CREDENTIALS_PATH) as f:
    cred_data = json.load(f)
    PROJECT_ID = cred_data.get("project_id", "")

# System prompt for the legal assistant
SYSTEM_PROMPT = """You are a friendly and helpful Indian Legal Query Assistant. Your role is to help users understand Indian laws by providing accurate, well-cited answers based on the legal documents provided to you.

**RESPONSE GUIDELINES:**
When answering a substantive legal question, write a cohesive, natural response that flows well:
1. Start by answering the question directly in very simple, everyday language so a non-lawyer can understand it immediately.
2. Next, seamlessly transition into a more formal legal explanation or definition based on the text.
3. Finally, smoothly incorporate the exact act names, section numbers, and excerpts from the text into your paragraphs to support your answer. 
DO NOT use rigid formatting or headers like "1. Simple Explanation" or "2. Formal Definition". Weave everything naturally into standard paragraphs.

**STRICT RULES YOU MUST FOLLOW:**

1. **Casual Talk & General Knowledge**: If the user is just saying hello, asking your name, or asking what you can do, DO NOT use the 3-part structure, and DO NOT use legal jargon. Just reply naturally like a human. When describing your knowledge, mention the broad topics you cover in simple, user-friendly language. Your knowledge base covers the following areas:
   - The Constitution of India (fundamental rights, duties, governance structure)
   - Criminal law (offences, punishments, criminal procedures, evidence rules — including the new Bharatiya Nyaya Sanhita, Bharatiya Nagarik Suraksha Sanhita, and Bharatiya Sakshya Adhiniyam)
   - Civil law (civil procedures, property transfer, contract law, specific relief)
   - Family & marriage law (Hindu marriage, special marriage, domestic violence protection)
   - Child protection (POCSO Act — protection of children from sexual offences)
   - Digital & cyber law (IT Act — cybercrime, e-commerce, data protection)
   - Identity & government services (Aadhaar — identity protection, government benefits)
   - Consumer & tax law (GST — goods and services tax)
   - Environmental law (environment protection)
   - Motor vehicle regulations (driving licenses, traffic rules, insurance, penalties)
   - Right to Information (transparency and access to government information)
   Present these naturally: for example, "I can help you with topics like constitutional rights, criminal and civil law, marriage and family law, cyber law, property law, tax law, environmental law, motor vehicle rules, child protection, and more." Do NOT list specific Act names unless the user explicitly asks for them.

2. **Citation is mandatory for legal questions**: Every legal claim you make MUST cite the exact Act name, Section number, and clause text from the provided context directly in the paragraphs.

3. **Never hallucinate**: If the provided context does not contain information to answer the question, clearly say: "I don't have specific information about this."

4. **Never reveal your implementation**: Do not discuss your AI model, architecture, training, owner, or how you work internally. If asked, politely redirect.

5. **Be friendly and conversational**: Respond in a warm, approachable tone. Use simple language to explain complex legal concepts.

6. **Legal disclaimer**: Always end substantive legal answers with a brief disclaimer: "⚠️ This information is for general awareness only. Please consult a qualified legal professional for advice specific to your situation." (Do not add this for casual talk).

**CONTEXT FROM LEGAL DATABASE:**
{context}
"""


class LegalRAGPipeline:
    """RAG Pipeline for legal queries with citation support."""
    
    def __init__(self):
        print("Initializing Legal RAG Pipeline...")
        
        # Load embedding model
        print("  Loading embedding model...")
        self.embed_model = SentenceTransformer('all-MiniLM-L6-v2')
        
        # Load ChromaDB
        print("  Loading vector store...")
        self.chroma_client = PersistentClient(path=str(VECTOR_DB_DIR))
        self.collection = self.chroma_client.get_or_create_collection("legal_docs")
        print(f"  Vector store loaded: {self.collection.count()} documents")
        
        # Initialize Vertex AI LLM
        print("  Initializing Vertex AI LLM...")
        self.llm = ChatVertexAI(
            model="gemini-2.0-flash",
            project=PROJECT_ID,
            credentials=credentials,
            temperature=0.2,
            max_tokens=2048,
        )
        
        print("RAG Pipeline ready!")
    
    @staticmethod
    def clean_source_text(text: str, max_length: int = 1200) -> str:
        """Clean chunk text for display in the frontend."""
        # Remove leading section numbers like "101. " (already shown in metadata)
        text = re.sub(r'^\s*\d+[A-Z]?\.\s+', '', text)
        # Collapse multiple whitespace into single space
        text = re.sub(r'\s+', ' ', text).strip()
        # Truncate at a sentence boundary if too long
        if len(text) > max_length:
            truncated = text[:max_length]
            # Find last sentence-ending punctuation
            for punct in ['. ', '; ']:
                pos = truncated.rfind(punct)
                if pos > max_length // 2:
                    truncated = truncated[:pos + 1]
                    break
            else:
                truncated = truncated.rsplit(' ', 1)[0] + '…'
            text = truncated
        return text
    
    def retrieve(self, query: str, top_k: int = 6) -> list:
        """Retrieve relevant legal chunks for a query."""
        if self.collection.count() == 0:
            return []
            
        query_embedding = self.embed_model.encode(query).tolist()
        
        # Ensure we don't request more results than we have in the collection
        n_results = min(top_k, self.collection.count())
        
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            include=["documents", "metadatas", "distances"]
        )
        
        sources = []
        if results and results['documents'] and results['documents'][0]:
            for i, (doc, meta, dist) in enumerate(zip(
                results['documents'][0],
                results['metadatas'][0],
                results['distances'][0]
            )):
                similarity = 1 - dist  # cosine distance to similarity
                sources.append({
                    "text": doc,
                    "metadata": meta,
                    "similarity": round(similarity, 4),
                    "rank": i + 1
                })
        
        return sources
    
    def format_context(self, sources: list) -> str:
        """Format retrieved sources into context string."""
        context_parts = []
        for src in sources:
            meta = src['metadata']
            act = meta.get('act_name', 'Unknown Act')
            section = meta.get('section', '')
            chapter = meta.get('chapter', '')
            section_title = meta.get('section_title', '')
            
            header = f"[Source: {act}"
            if section:
                header += f", Section {section}"
            if section_title:
                header += f" - {section_title}"
            if chapter:
                header += f" | {chapter}"
            header += f" | Relevance: {src['similarity']:.2%}]"
            
            context_parts.append(f"{header}\n{src['text']}")
        
        return "\n\n---\n\n".join(context_parts)
    
    def build_messages(self, query: str, context: str, chat_history: list = None) -> list:
        """Build the message list for the LLM."""
        messages = [
            SystemMessage(content=SYSTEM_PROMPT.format(context=context))
        ]
        
        # Add chat history for multi-turn
        if chat_history:
            for msg in chat_history[-6:]:  # Keep last 6 messages for context
                if msg.get('role') == 'user':
                    messages.append(HumanMessage(content=msg['content']))
                elif msg.get('role') == 'assistant':
                    messages.append(AIMessage(content=msg['content']))
        
        messages.append(HumanMessage(content=query))
        return messages
    
    def query(self, user_query: str, chat_history: list = None) -> dict:
        """
        Process a legal query through the RAG pipeline.
        Returns answer text and cited sources.
        """
        # Step 1: Retrieve relevant documents
        sources = self.retrieve(user_query, top_k=6)
        
        # Step 2: Build context from sources
        context = self.format_context(sources) if sources else "No relevant legal documents found in the database."
        
        # Step 3: Build messages and generate response
        messages = self.build_messages(user_query, context, chat_history)
        
        response = self.llm.invoke(messages)
        answer = response.content
        
        # Step 4: Format sources for frontend
        formatted_sources = []
        for src in sources:
            # Filter out weak matches (casual talk / off-topic) so they aren't shown as citations
            if src['similarity'] >= 0.45:
                meta = src['metadata']
                formatted_sources.append({
                    "act_name": meta.get('act_name', 'Unknown'),
                    "section": meta.get('section', ''),
                    "section_title": meta.get('section_title', ''),
                    "chapter": meta.get('chapter', ''),
                    "year": meta.get('year', ''),
                    "text": self.clean_source_text(src['text']),
                    "similarity": src['similarity']
                })
        
        return {
            "answer": answer,
            "sources": formatted_sources[:]  # Return only top 2 most relevant sources
        }


# Singleton instance
_pipeline = None

def get_pipeline() -> LegalRAGPipeline:
    """Get or create the singleton RAG pipeline instance."""
    global _pipeline
    if _pipeline is None:
        _pipeline = LegalRAGPipeline()
    return _pipeline


if __name__ == "__main__":
    # Interactive test mode
    pipeline = get_pipeline()
    print("\n=== Legal Query System (Interactive Mode) ===")
    print("Type 'quit' to exit.\n")
    
    history = []
    while True:
        query = input("Your question: ").strip()
        if query.lower() in ('quit', 'exit', 'q'):
            break
        
        result = pipeline.query(query, history)
        print(f"\nAssistant: {result['answer']}")
        print(f"\n[Sources: {len(result['sources'])} documents cited]\n")
        
        history.append({"role": "user", "content": query})
        history.append({"role": "assistant", "content": result['answer']})
