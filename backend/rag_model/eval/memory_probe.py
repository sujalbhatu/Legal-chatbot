"""
How much memory each part of the RAG service adds (resident set size, MB).

Absolute RSS differs between Windows and Linux (torch's DLLs/.so files), but the
increment each model adds is mostly its weights and is similar on both, so
"live service today + reranker increment" estimates the server footprint.

Usage (from backend/rag_model):
  python eval/memory_probe.py                      # fp32 reranker
  RERANKER_INT8=1 python eval/memory_probe.py      # int8 reranker
"""

import gc
import json
import os
import sys
import time
from pathlib import Path

import psutil

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
proc = psutil.Process()


def rss():
    gc.collect()
    return round(proc.memory_info().rss / 2**20)


steps = [("python", rss())]
import torch  # noqa: E402,F401
from sentence_transformers import SentenceTransformer  # noqa: E402
from chromadb import PersistentClient  # noqa: E402
steps.append(("imports (torch, sentence-transformers, chromadb)", rss()))

from ingest import COLLECTION_NAME, EMBEDDING_MODEL_NAME  # noqa: E402
from retrieval import HybridRetriever, load_reranker  # noqa: E402

embed = SentenceTransformer(EMBEDDING_MODEL_NAME)
embed.encode("warm up")
steps.append((f"+ embedding model ({EMBEDDING_MODEL_NAME})", rss()))

db = PersistentClient(path=str(Path(__file__).resolve().parents[3] / "data" / "vector_db"))
retriever = HybridRetriever(db.get_collection(COLLECTION_NAME), embed)
retriever.search("punishment for theft", variant="hybrid")
steps.append(("+ Chroma collection + BM25 index (hybrid search done once)", rss()))

name = os.getenv("RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
retriever.reranker = load_reranker(name)
t0 = time.perf_counter()
for _ in range(5):
    retriever.search("Someone stole my bike from outside my house", variant="hybrid_rerank")
rerank_ms = (time.perf_counter() - t0) / 5 * 1000
label = f"+ reranker {name}{' int8' if os.getenv('RERANKER_INT8') == '1' else ' fp32'}"
steps.append((label, rss()))

prev = 0
for step, mb in steps:
    print(f"{mb:6} MB  (+{mb - prev:4})  {step}")
    prev = mb
print(f"hybrid_rerank search, mean of 5: {rerank_ms:.0f} ms")
out = Path(__file__).resolve().parent / "results" / f"memory_probe{'_int8' if os.getenv('RERANKER_INT8') == '1' else ''}.json"
out.write_text(json.dumps({"steps": steps, "rerank_ms": round(rerank_ms), "platform": sys.platform}, indent=1))
