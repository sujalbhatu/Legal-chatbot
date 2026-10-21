"""
Flask API Server for the Legal RAG Pipeline.
Exposes endpoints for querying and ingestion.
"""

import traceback

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)


def get_pipeline():
    """The pipeline singleton lives in rag_pipeline (thread-safe, loaded lazily)."""
    from rag_pipeline import get_pipeline as _get
    return _get()


def reload_pipeline():
    """Make the next request rebuild the pipeline, so newly ingested acts are searchable."""
    from rag_pipeline import reset_pipeline
    reset_pipeline()


def server_error(context: str, exc: Exception):
    """Log the details; never send internals (paths, provider errors) to the client."""
    print(f"Error {context}: {exc}")
    traceback.print_exc()
    return jsonify({"success": False, "error": f"Internal error {context}."}), 500


def is_message_list(value) -> bool:
    return isinstance(value, list) and all(isinstance(m, dict) for m in value)


@app.route('/api/query', methods=['POST'])
def query():
    """Process a legal query through the RAG pipeline with multilingual support."""
    try:
        data = request.get_json(silent=True)

        if not isinstance(data, dict) or 'query' not in data:
            return jsonify({"error": "Missing 'query' field"}), 400

        if not isinstance(data['query'], str):
            return jsonify({"error": "'query' must be a string"}), 400
        user_query = data['query'].strip()
        if not user_query:
            return jsonify({"error": "Query cannot be empty"}), 400

        chat_history = data.get('chat_history') or []  # messages not yet summarized
        if not is_message_list(chat_history):
            return jsonify({"error": "'chat_history' must be a list of messages"}), 400
        language = data.get('language')  # Optional language override
        if language is not None and not isinstance(language, str):
            language = None
        memory_summary = data.get('memory_summary') or ''  # long-term memory stored on the chat session
        if not isinstance(memory_summary, str):
            memory_summary = ''

        from rag_pipeline import LLMUnavailableError
        try:
            result = get_pipeline().query(user_query, chat_history, language, memory_summary)
        except LLMUnavailableError as e:
            print(f"LLM unavailable: {e}")
            return jsonify({"success": False, "error": "The language model is unavailable. Please try again shortly."}), 503

        return jsonify({
            "success": True,
            "answer": result['answer'],
            "sources": result['sources'],
            "language": result['language'],
            "language_name": result['language_name'],
            "memory": result.get('memory'),
            "usage": result.get('usage')
        })

    except Exception as e:
        return server_error("processing query", e)


@app.route('/api/ingest', methods=['POST'])
def ingest():
    """Trigger re-ingestion of PDFs."""
    try:
        from ingest import ingest_all
        ingest_all()

        # Reload pipeline to pick up new data
        reload_pipeline()

        return jsonify({
            "success": True,
            "message": "Ingestion complete. Vector store rebuilt."
        })

    except Exception as e:
        return server_error("during ingestion", e)


@app.route('/api/fetch-law', methods=['POST'])
def fetch_law():
    """Manually trigger fetching a law from IndiaCode by act name."""
    try:
        data = request.get_json(silent=True)

        if not isinstance(data, dict) or not isinstance(data.get('act_name'), str):
            return jsonify({"error": "Missing 'act_name' field"}), 400

        act_name = data['act_name'].strip()
        if not act_name:
            return jsonify({"error": "Act name cannot be empty"}), 400

        from indiacode_fetcher import (
            check_existing_knowledge_base, search_indiacode,
            download_pdf, ingest_single_pdf
        )

        # Check if already in KB
        if check_existing_knowledge_base(act_name):
            return jsonify({
                "success": True,
                "message": f"'{act_name}' already exists in the knowledge base.",
                "already_exists": True
            })

        # Search and download
        pdf_url = search_indiacode(act_name)
        if not pdf_url:
            return jsonify({
                "success": False,
                "message": f"Could not find PDF for '{act_name}' on IndiaCode."
            })

        pdf_path = download_pdf(pdf_url, act_name)
        if not pdf_path:
            return jsonify({
                "success": False,
                "message": f"Failed to download PDF for '{act_name}'."
            })

        # Ingest
        success = ingest_single_pdf(pdf_path)

        if success:
            reload_pipeline()

            return jsonify({
                "success": True,
                "message": f"Successfully fetched and ingested '{act_name}'.",
                "already_exists": False
            })
        else:
            return jsonify({
                "success": False,
                "message": f"PDF downloaded but ingestion failed for '{act_name}'."
            })

    except Exception as e:
        return server_error("fetching law", e)


@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "legal-rag-api"})


if __name__ == '__main__':
    print("Starting Legal RAG API Server...")
    # Pre-load the pipeline
    get_pipeline()
    # Localhost only: the Node server is the public entry point
    app.run(host='127.0.0.1', port=5000, debug=False)
