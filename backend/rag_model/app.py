"""
Flask API Server for the Legal RAG Pipeline.
Exposes endpoints for querying and ingestion.
"""

import hmac
import json
import os
import threading
import traceback

from flask import Flask, Response, request, jsonify, stream_with_context

# Only the Node server (same machine) calls this API, so no CORS headers are sent.
app = Flask(__name__)

MAX_QUERY_CHARS = 2000
MAX_HISTORY_MESSAGES = 40
# Ingestion endpoints need this token in the X-Admin-Token header; unset = disabled.
ADMIN_TOKEN = os.getenv("RAG_ADMIN_TOKEN", "")
_ingest_lock = threading.Lock()


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


def clean_history(messages):
    """Only user/assistant turns with string content reach the LLM: a caller-supplied
    'system' message would otherwise override the system prompt."""
    cleaned = [{"role": m["role"], "content": m["content"][:8000],
                **({"language": m["language"]} if isinstance(m.get("language"), str) else {})}
               for m in messages
               if m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str) and m["content"].strip()]
    return cleaned[-MAX_HISTORY_MESSAGES:]


def parse_query_request():
    """Validate the body shared by /api/query and /api/query/stream. Returns (args, error_response)."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or 'query' not in data:
        return None, (jsonify({"error": "Missing 'query' field"}), 400)
    if not isinstance(data['query'], str):
        return None, (jsonify({"error": "'query' must be a string"}), 400)
    user_query = data['query'].strip()
    if not user_query:
        return None, (jsonify({"error": "Query cannot be empty"}), 400)
    if len(user_query) > MAX_QUERY_CHARS:
        return None, (jsonify({"error": f"Query is longer than {MAX_QUERY_CHARS} characters"}), 400)
    chat_history = data.get('chat_history') or []  # messages not yet summarized
    if not is_message_list(chat_history):
        return None, (jsonify({"error": "'chat_history' must be a list of messages"}), 400)
    language = data.get('language')  # language picked in the UI (optional)
    if not isinstance(language, str):
        language = None
    memory_summary = data.get('memory_summary') or ''  # long-term memory stored on the chat session
    if not isinstance(memory_summary, str):
        memory_summary = ''
    return (user_query, clean_history(chat_history), language, memory_summary), None


def require_admin():
    """None if the request carries the admin token, else an error response."""
    supplied = request.headers.get("X-Admin-Token", "")
    if not ADMIN_TOKEN or not hmac.compare_digest(supplied, ADMIN_TOKEN):
        return jsonify({"success": False, "error": "Forbidden"}), 403
    return None


def public_result(result: dict) -> dict:
    return {
        "success": True,
        "answer": result['answer'],
        "sources": result['sources'],
        "follow_ups": result.get('follow_ups', []),
        "grounded": result.get('grounded'),
        "unsupported_citations": result.get('unsupported_citations', []),
        "language": result['language'],
        "language_name": result['language_name'],
        "memory": result.get('memory'),
        "usage": result.get('usage'),
        "timings": result.get('timings'),
    }


@app.route('/api/query', methods=['POST'])
def query():
    """Process a legal query through the RAG pipeline with multilingual support."""
    try:
        args, error = parse_query_request()
        if error:
            return error

        from rag_pipeline import LLMUnavailableError
        try:
            result = get_pipeline().query(*args)
        except LLMUnavailableError as e:
            print(f"LLM unavailable: {e}")
            return jsonify({"success": False, "error": "The language model is unavailable. Please try again shortly."}), 503

        return jsonify(public_result(result))

    except Exception as e:
        return server_error("processing query", e)


@app.route('/api/query/stream', methods=['POST'])
def query_stream():
    """Same as /api/query, as Server-Sent Events: meta -> token* -> done (or error)."""
    args, error = parse_query_request()
    if error:
        return error

    def sse(event, data):
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    def generate():
        from rag_pipeline import LLMUnavailableError
        try:
            for event, payload in get_pipeline().stream(*args):
                if event == "token":
                    yield sse("token", {"text": payload})
                elif event == "meta":
                    yield sse("meta", payload)
                else:
                    yield sse("done", public_result(payload))
        except LLMUnavailableError as e:
            print(f"LLM unavailable: {e}")
            yield sse("error", {"error": "The language model is unavailable. Please try again shortly.", "status": 503})
        except Exception as e:
            print(f"Error streaming query: {e}")
            traceback.print_exc()
            yield sse("error", {"error": "Internal error processing query.", "status": 500})

    return Response(stream_with_context(generate()), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.route('/api/ingest', methods=['POST'])
def ingest():
    """Trigger re-ingestion of PDFs (admin only)."""
    denied = require_admin()
    if denied:
        return denied
    if not _ingest_lock.acquire(blocking=False):
        return jsonify({"success": False, "error": "An ingestion is already running"}), 409
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
    finally:
        _ingest_lock.release()


@app.route('/api/fetch-law', methods=['POST'])
def fetch_law():
    """Fetch an Act from IndiaCode by name and add it to the index (admin only).
    Chat queries never do this: it scrapes, downloads and re-embeds, which takes
    minutes and memory the 1 GB server does not have to spare under user traffic."""
    denied = require_admin()
    if denied:
        return denied
    if not _ingest_lock.acquire(blocking=False):
        return jsonify({"success": False, "error": "An ingestion is already running"}), 409
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
    finally:
        _ingest_lock.release()


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
