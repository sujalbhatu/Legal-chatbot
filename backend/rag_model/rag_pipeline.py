"""
RAG Pipeline for Legal Query System.
Uses ChromaDB for retrieval and Groq for generation with multilingual support.
Supports: English, Hindi, Bengali, and Santhali.
"""

import os
import re
import json
from pathlib import Path
from chromadb import PersistentClient
from sentence_transformers import SentenceTransformer
from langdetect import detect, LangDetectException
from groq import Groq

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Initialize Groq client
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY environment variable not set. Please add it to .env file.")

groq_client = Groq(api_key=GROQ_API_KEY)

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
VECTOR_DB_DIR = BASE_DIR / "data" / "vector_db"

# Embedding model - using lightweight model to avoid memory issues
# Default: all-MiniLM-L6-v2 (English, very fast, ~100MB)
# For multilingual: 'sentence-transformers/multilingual-e5-small' (~150MB) after HF login
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

# Language mapping
LANGUAGE_CODES = {
    'en': 'English',
    'hi': 'Hindi',
    'bn': 'Bengali',
    'sat': 'Santhali'
}

# System prompts in multiple languages
SYSTEM_PROMPTS = {
    'en': """You are a friendly and helpful Indian Legal Query Assistant. Your role is to help users understand Indian laws by providing accurate, well-cited answers based on the legal documents provided to you.

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
""",
    'hi': """आप एक मैत्रीपूर्ण और सहायक भारतीय कानूनी प्रश्न सहायक हैं। आपकी भूमिका उपयोगकर्ताओं को भारतीय कानूनों को समझने में मदद करना है जो आपको प्रदान किए गए कानूनी दस्तावेज़ों पर आधारित सटीक, अच्छी तरह से उद्धृत उत्तर प्रदान करते हैं।

**प्रतिक्रिया दिशानिर्देश:**
किसी भी कानूनी प्रश्न का उत्तर देते समय, एक सुसंगत, प्राकृतिक प्रतिक्रिया लिखें:
1. प्रश्न का उत्तर सीधे बहुत ही सरल, रोज़मर्रा की भाषा में दें ताकि गैर-वकील भी समझ सकें।
2. फिर सहजता से प्रदत्त पाठ के आधार पर अधिक औपचारिक कानूनी व्याख्या में संक्रमण करें।
3. अंत में, प्रदान किए गए संदर्भ से सटीक अधिनियम के नाम, धारा संख्या और उद्धरण को अपने पैराग्राफ में सहजता से शामिल करें।
कठोर स्वरूपण या शीर्षलेख जैसे "1. सरल व्याख्या" का उपयोग न करें। सब कुछ प्राकृतिक रूप से मानक पैराग्राफ में बुनें।

**नियम:**
1. **अनौपचारिक बातचीत**: यदि उपयोगकर्ता केवल नमस्कार कर रहा है या पूछ रहा है आप क्या कर सकते हैं, तो कानूनी शब्दावली का उपयोग न करें। स्वाभाविक रूप से मानव की तरह जवाब दें।
2. **उद्धरण अनिवार्य है**: कानूनी दावे के लिए हमेशा अधिनियम का नाम, धारा संख्या का उल्लेख करें।
3. **कभी गलत जानकारी न दें**: यदि संदर्भ में जानकारी नहीं है, तो स्पष्ट रूप से कहें: "मेरे पास इस बारे में विशिष्ट जानकारी नहीं है।"
4. **अपना कार्यान्वयन खुलासा न करें**: अपने AI मॉडल, आर्किटेक्चर के बारे में बात न करें।
5. **मैत्रीपूर्ण रहें**: सरल भाषा में जटिल कानूनी अवधारणाओं को समझाएं।
6. **कानूनी अस्वीकरण**: कानूनी उत्तरों के अंत में: "⚠️ यह जानकारी सामान्य जागरूकता के लिए है। अपनी स्थिति के लिए किसी योग्य कानूनी पेशेवर से परामर्श लें।"

**कानूनी डेटाबेस से संदर्भ:**
{context}
""",
    'bn': """আপনি একজন বন্ধুত্বপূর্ণ এবং সহায়ক ভারতীয় আইনি প্রশ্ন সহায়ক। আপনার ভূমিকা ব্যবহারকারীদের ভারতীয় আইন বুঝতে সাহায্য করা যা আপনাকে প্রদত্ত আইনি নথিপত্রের উপর ভিত্তি করে।

**প্রতিক্রিয়া নির্দেশিকা:**
যেকোনো আইনি প্রশ্নের উত্তর দেওয়ার সময়, একটি সুসংগত, প্রাকৃতিক প্রতিক্রিয়া লিখুন:
1. প্রশ্নের উত্তর সরাসরি খুব সাধারণ, দৈনন্দিন ভাষায় দিন যাতে অ-আইনজীবীও বুঝতে পারে।
2. তারপর প্রদত্ত পাঠের উপর ভিত্তি করে আরও আনুষ্ঠানিক আইনি ব্যাখ্যায় মসৃণভাবে রূপান্তর করুন।
3. অবশেষে, প্রদত্ত প্রসঙ্গ থেকে সঠিক অধিনিয়মের নাম, ধারা সংখ্যা এবং উদ্ধৃতি আপনার অনুচ্ছেদে স্বাভাবিকভাবে অন্তর্ভুক্ত করুন।

**নিয়ম:**
1. **অনানুষ্ঠানিক আলোচনা**: ব্যবহারকারী যদি শুধু সালাম জানাচ্ছে বা জিজ্ঞাসা করছে আপনি কী করতে পারেন, তাহলে আইনি পরিভাষা ব্যবহার করবেন না।
2. **উদ্ধৃতি বাধ্যতামূলক**: আইনি দাবির জন্য সর্বদা অধিনিয়মের নাম, ধারা সংখ্যা উল্লেখ করুন।
3. **কখনও মিথ্যা তথ্য দিবেন না**: যদি প্রসঙ্গে তথ্য না থাকে, তাহলে স্পষ্টভাবে বলুন।
4. **বন্ধুত্বপূর্ণ হন**: সাধারণ ভাষায় জটিল আইনি ধারণা ব্যাখ্যা করুন।

**আইনি ডেটাবেস থেকে প্রসঙ্গ:**
{context}
""",
    'sat': """आप एक मैत्रीपूर्ण और सहायक भारतीय कानूनी प्रश्न सहायक हैं। आपकी भूमिका उपयोगकर्ताओं को भारतीय कानूनों को समझने में मदद करना है।

**प्रतिक्रिया दिशानिर्देश:**
1. सरल भाषा में सीधा उत्तर दें।
2. औपचारिक कानूनी व्याख्या जोड़ें।
3. सटीक अधिनियम के नाम और धारा संख्या का उल्लेख करें।

**नियम:**
1. कानूनी दावों के लिए हमेशा संदर्भ दें।
2. कभी गलत जानकारी न दें।
3. सरल भाषा का उपयोग करें।

**कानूनी डेटाबेस से संदर्भ:**
{context}
"""
}


class LegalRAGPipeline:
    """RAG Pipeline for legal queries with multilingual support and Groq integration."""
    
    def __init__(self):
        print("Initializing Legal RAG Pipeline with Multilingual Support...")
        
        # Load multilingual embedding model
        print(f"  Loading embedding model: {EMBEDDING_MODEL_NAME}...")
        self.embed_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
        
        # Load ChromaDB
        print("  Loading vector store...")
        self.chroma_client = PersistentClient(path=str(VECTOR_DB_DIR))
        self.collection = self.chroma_client.get_or_create_collection("legal_docs")
        print(f"  Vector store loaded: {self.collection.count()} documents")
        
        # Groq is initialized with API key from environment
        print("  Initializing Groq LLM...")
        print(f"  Supported languages: {', '.join(LANGUAGE_CODES.values())}")
        print("  RAG Pipeline ready!")
    
    def _get_groq_model(self) -> str:
        """Get the first available Groq model name."""
        return os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
    
    def translate_to_english(self, text: str, source_lang: str) -> str:
        """
        Translate a non-English query to English using Groq LLM.
        This is used so the English-only embedding model can do accurate retrieval.
        Returns the English translation, or the original text if translation fails.
        """
        if source_lang == 'en':
            return text
        
        lang_name = LANGUAGE_CODES.get(source_lang, source_lang)
        try:
            response = groq_client.chat.completions.create(
                model=self._get_groq_model(),
                messages=[
                    {"role": "system", "content": (
                        "You are a translator. Translate the following text from "
                        f"{lang_name} to English. Output ONLY the English translation, "
                        "nothing else. Keep legal terminology accurate."
                    )},
                    {"role": "user", "content": text}
                ],
                temperature=0.1,
                max_tokens=512,
                timeout=15
            )
            translated = response.choices[0].message.content.strip()
            print(f"  Translated [{lang_name} → English]: '{text[:50]}' → '{translated[:50]}'")
            return translated
        except Exception as e:
            print(f"  ⚠ Translation failed, using original query: {str(e)[:80]}")
            return text
    
    @staticmethod
    def detect_language(text: str) -> str:
        """
        Detect the language of the input text.
        Returns language code: 'en', 'hi', 'bn', 'sat'
        Falls back to English if detection fails.
        """
        try:
            lang_code = detect(text)
            # Map detected language to supported languages
            supported_langs = {'en': 'en', 'hi': 'hi', 'bn': 'bn', 'sat': 'sat'}
            return supported_langs.get(lang_code, 'en')
        except LangDetectException:
            # Default to English if detection fails
            return 'en'
    
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
        """Retrieve relevant legal chunks for a query using multilingual embeddings."""
        if self.collection.count() == 0:
            return []
        
        # Use multilingual embedding - this automatically handles queries in any language
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
    
    def query(self, user_query: str, chat_history: list = None, language: str = None) -> dict:
        """
        Process a legal query through the RAG pipeline with language detection.
        
        Args:
            user_query: The user's question
            chat_history: Previous conversation history for context
            language: Optional language override ('en', 'hi', 'bn', 'sat')
        
        Returns:
            Dictionary with 'answer', 'sources', and 'language' fields
        """
        # Step 0: Detect language if not specified
        if not language:
            language = self.detect_language(user_query)
        
        # Ensure language is supported
        if language not in SYSTEM_PROMPTS:
            language = 'en'
        
        # Step 1: Translate non-English queries to English for better retrieval
        # (The embedding model all-MiniLM-L6-v2 is English-only)
        search_query = self.translate_to_english(user_query, language)
        
        # Step 2: Retrieve relevant documents using the English query
        sources = self.retrieve(search_query, top_k=8)
        
        # Debug: log retrieval results
        if sources:
            print(f"  Retrieved {len(sources)} sources for query: '{search_query[:60]}...'")
            for s in sources[:3]:
                meta = s['metadata']
                print(f"    [{s['similarity']:.2%}] {meta.get('act_name', '?')} - S.{meta.get('section', '?')}")
        else:
            print(f"  ⚠ No sources retrieved for query: '{search_query[:60]}'")
        
        # Step 3: Build context from sources
        context = self.format_context(sources) if sources else "No relevant legal documents found in the database."
        
        # Step 3: Build system prompt based on detected language
        system_prompt = SYSTEM_PROMPTS[language].format(context=context)
        
        # Step 4: Build messages for Groq
        messages = [
            {"role": "system", "content": system_prompt}
        ]
        
        # Add chat history for multi-turn context
        if chat_history:
            for msg in chat_history[-6:]:  # Keep last 6 messages for context
                messages.append({
                    "role": msg.get('role', 'user'),
                    "content": msg.get('content', '')
                })
        
        # Add current query
        messages.append({"role": "user", "content": user_query})
        
        # Step 5: Generate response using Groq
        # Models change over time - try multiple fallbacks
        available_models = [
            os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"),  # Current default (reasoning capable)
            "llama-3.3-70b-versatile",  # Fallback 1 (versatile)
            "llama-3.1-8b-instant",  # Fallback 2 (faster, lighter)
        ]
        
        answer = None
        last_error = None
        
        for model_name in available_models:
            try:
                response = groq_client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    temperature=0.2,
                    max_tokens=2048,
                    top_p=0.9,
                    timeout=30
                )
                answer = response.choices[0].message.content
                print(f"✓ Using Groq model: {model_name}")
                break
            except Exception as e:
                last_error = str(e)
                print(f"  Model '{model_name}' not available: {str(e)[:100]}...")
                continue
        
        if answer is None:
            print("\n❌ ERROR: No Groq models available. Please:")
            print("  1. Visit: https://console.groq.com/docs/speech-text")
            print("  2. Check which models your account has access to")
            print("  3. Update GROQ_MODEL in .env file with an available model")
            answer = f"Error: No available Groq models. Last error: {last_error}"
        
        # Step 6: Format sources for frontend
        formatted_sources = []
        for src in sources:
            # Filter out weak matches (casual talk / off-topic) so they aren't shown as citations
            if src['similarity'] >= 0.30:
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
            "sources": formatted_sources[:2],  # Return only top 2 most relevant sources
            "language": language,
            "language_name": LANGUAGE_CODES.get(language, 'Unknown')
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
    print("\n=== Legal Query System (Interactive Mode with Multilingual Support) ===")
    print("Supported languages: English, Hindi, Bengali, Santhali")
    print("Type 'quit' to exit.\n")
    
    history = []
    while True:
        query = input("Your question: ").strip()
        if query.lower() in ('quit', 'exit', 'q'):
            break
        
        result = pipeline.query(query, history)
        print(f"\nAssistant ({result['language_name']}): {result['answer']}")
        print(f"[Sources: {len(result['sources'])} documents cited]\n")
        
        history.append({"role": "user", "content": query})
        history.append({"role": "assistant", "content": result['answer']})
