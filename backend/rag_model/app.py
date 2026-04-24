"""
Flask API Server for the Legal RAG Pipeline.
Exposes endpoints for querying and ingestion.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Lazy-load pipeline to avoid loading on import
_pipeline = None

def get_pipeline():
    global _pipeline
    if _pipeline is None:
        from rag_pipeline import get_pipeline as _get
        _pipeline = _get()
    return _pipeline


@app.route('/api/query', methods=['POST'])
def query():
    """Process a legal query through the RAG pipeline with multilingual support."""
    try:
        data = request.get_json()
        
        if not data or 'query' not in data:
            return jsonify({"error": "Missing 'query' field"}), 400
        
        user_query = data['query'].strip()
        if not user_query:
            return jsonify({"error": "Query cannot be empty"}), 400
        
        chat_history = data.get('chat_history', [])
        language = data.get('language', None)  # Optional language override
        
        pipeline = get_pipeline()
        result = pipeline.query(user_query, chat_history, language)
        
        return jsonify({
            "success": True,
            "answer": result['answer'],
            "sources": result['sources'],
            "language": result['language'],
            "language_name": result['language_name']
        })
    
    except Exception as e:
        print(f"Error processing query: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/api/ingest', methods=['POST'])
def ingest():
    """Trigger re-ingestion of PDFs."""
    try:
        from ingest import ingest_all
        ingest_all()
        
        # Reload pipeline to pick up new data
        global _pipeline
        _pipeline = None
        
        return jsonify({
            "success": True,
            "message": "Ingestion complete. Vector store rebuilt."
        })
    
    except Exception as e:
        print(f"Error during ingestion: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "legal-rag-api"})


if __name__ == '__main__':
    print("Starting Legal RAG API Server...")
    # Pre-load the pipeline
    get_pipeline()
    app.run(host='0.0.0.0', port=5000, debug=False)
