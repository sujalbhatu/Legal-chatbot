# Gunicorn Configuration for Legal RAG Flask API
# Optimized for 1GB RAM server
#
# Usage: gunicorn -c gunicorn.conf.py app:app

import multiprocessing
import os

# === Server Socket ===
bind = "127.0.0.1:5000"  # Only accessible via localhost (Nginx/Node proxies to this)

# === Workers ===
# CRITICAL: Only 1 worker on 1GB RAM!
# Each worker loads the full embedding model into memory.
# 2 workers = 2x model in RAM = OOM kill.
workers = 1

# Use sync worker (gthread can leak memory with ML models)
worker_class = "sync"

# Threads per worker (handle concurrent requests within single process)
threads = 2

# === Memory Management ===
# No periodic worker restarts: on the 1 GB VM a restart reloads the models, which takes
# about two minutes, and the question that triggers it waits that long. Memory is capped
# by systemd instead (MemoryHigh/MemoryMax in legal-rag.service).
max_requests = 0

# === Timeouts ===
# RAG queries can take 30-60s (LLM generation via Groq API)
timeout = 120
graceful_timeout = 30
keepalive = 5

# === Preload ===
# Preload app before forking workers — loads model once, shared via fork
preload_app = True

# === Logging ===
accesslog = "/var/log/legal-query/gunicorn-access.log"
errorlog = "/var/log/legal-query/gunicorn-error.log"
loglevel = "info"

# === Process Naming ===
proc_name = "legal-rag-api"

# === Server Mechanics ===
# Don't daemonize (systemd manages the process)
daemon = False


def post_worker_init(worker):
    """Load the models in the background as soon as the worker starts, so the first
    question after a restart does not pay the load time (about two minutes on the VM).
    A thread, because loading takes longer than `timeout` and the worker must keep
    sending heartbeats; a question that arrives meanwhile waits on the pipeline's lock."""
    import threading

    def warm():
        from app import get_pipeline
        get_pipeline()
        worker.log.info("RAG pipeline loaded")

    threading.Thread(target=warm, name="warm-pipeline", daemon=True).start()
