"""
Hybrid retrieval over the section-aligned chunks.

    query --+--> dense (MiniLM, Chroma HNSW) --+
            +--> BM25 (rank_bm25)            --+--> Reciprocal Rank Fusion --> cross-encoder rerank
            +--> same two, restricted to the act the user named (soft act filter)
            +--> exact lookup when the user cites "Section 303" / "Article 21"

Why both: dense retrieval matches meaning ("someone stole my bike" -> theft) but is
weak on exact tokens such as "66C", "13B" or "CGST"; BM25 is the opposite. RRF merges
ranked lists without having to calibrate their scores against each other.

The cross-encoder reads (query, chunk) together and gives a much better relevance
score than either retriever; its sigmoid probability is the score shown to users
and used to decide when the evidence is too weak to answer from.

Every variant returns the same shape, so the eval can compare them directly:
    [{"id", "text", "metadata", "score", "score_kind"}]   best first
"""

import math
import os
import re
import threading
from typing import Dict, List, Optional, Sequence, Tuple

from rank_bm25 import BM25Okapi

from ingest import context_header

RRF_K = 60
RERANK_TOP_N = int(os.getenv("RERANK_TOP_N", "20"))          # candidates the cross-encoder scores
RERANK_MAX_CHARS = int(os.getenv("RERANK_MAX_CHARS", "800"))   # passage length it reads (CPU cost is ~linear)
VARIANTS = ("dense", "bm25", "hybrid", "hybrid_rerank")

_STOPWORDS = set("""a an and are as at be by can could do does for from had has have how i if in into is it its
me my of on or our should so that the their them then there these they this to under was we what when
where which who whom why will with would you your about am any been being did get got if just may might
not now off one only other own same some such than too very""".split())

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> List[str]:
    return [t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOPWORDS]


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


class HybridRetriever:
    def __init__(self, collection, embed_model, reranker=None, rerank_top_n: int = RERANK_TOP_N):
        self.collection = collection
        self.embed_model = embed_model
        self.reranker = reranker
        self.rerank_top_n = rerank_top_n
        self._lock = threading.Lock()
        self.reload()

    def reload(self):
        """(Re)load the chunk list and BM25 index from the collection (after ingestion)."""
        data = self.collection.get(include=["documents", "metadatas"])
        docs = []
        for cid, text, meta in zip(data["ids"], data["documents"], data["metadatas"]):
            docs.append({"id": cid, "text": text, "metadata": meta, "header": context_header(meta)})
        bm25 = BM25Okapi([tokenize(f"{d['header']} {d['text']}") for d in docs]) if docs else None
        by_act: Dict[str, List[int]] = {}
        by_section: Dict[Tuple[str, str], List[int]] = {}
        for i, d in enumerate(docs):
            stem = d["metadata"].get("source_file", "").rsplit(".txt", 1)[0]
            by_act.setdefault(stem, []).append(i)
            if d["metadata"].get("section"):
                by_section.setdefault((stem, d["metadata"]["section"]), []).append(i)
        with self._lock:
            self.docs, self.bm25 = docs, bm25
            self.by_act, self.by_section = by_act, by_section
            self.id_to_idx = {d["id"]: i for i, d in enumerate(docs)}

    # ---- individual retrievers -------------------------------------------------

    def dense(self, query: str, k: int, act_stem: Optional[str] = None) -> List[Tuple[int, float]]:
        if not self.docs:
            return []
        where = {"source_file": f"{act_stem}.txt"} if act_stem else None
        n = min(k, len(self.by_act.get(act_stem, [])) if act_stem else len(self.docs))
        if n <= 0:
            return []
        res = self.collection.query(query_embeddings=[self.embed_model.encode(query).tolist()],
                                    n_results=n, where=where, include=["distances"])
        return [(self.id_to_idx[cid], 1 - dist) for cid, dist in zip(res["ids"][0], res["distances"][0])
                if cid in self.id_to_idx]

    def lexical(self, query: str, k: int, act_stem: Optional[str] = None) -> List[Tuple[int, float]]:
        tokens = tokenize(query)
        if not tokens or self.bm25 is None:
            return []
        scores = self.bm25.get_scores(tokens)
        pool = self.by_act.get(act_stem, []) if act_stem else range(len(self.docs))
        ranked = sorted(pool, key=lambda i: scores[i], reverse=True)[:k]
        return [(i, float(scores[i])) for i in ranked if scores[i] > 0]

    def section_lookup(self, act_stem: str, refs: Sequence[str]) -> List[int]:
        out = []
        for ref in refs:
            out.extend(self.by_section.get((act_stem, ref), []))
        return out

    # ---- fusion -----------------------------------------------------------------

    @staticmethod
    def rrf(ranked_lists: List[List[int]], k: int = RRF_K) -> List[Tuple[int, float]]:
        scores: Dict[int, float] = {}
        for lst in ranked_lists:
            for rank, idx in enumerate(lst):
                scores[idx] = scores.get(idx, 0.0) + 1.0 / (k + rank + 1)
        return sorted(scores.items(), key=lambda x: x[1], reverse=True)

    def search(self, query: str, variant: str = "hybrid_rerank", top_k: int = 10,
               act_stems: Sequence[str] = (), section_refs: Sequence[str] = (),
               rerank_query: Optional[str] = None) -> List[dict]:
        """
        query        -- English search query (already translated / made standalone)
        act_stems    -- acts the user named; their chunks get their own ranked lists
        section_refs -- section/article numbers the user cited ("303", "21A")
        """
        if variant not in VARIANTS:
            raise ValueError(f"unknown retrieval variant {variant}")
        pool_k = 50
        lists: List[List[int]] = []
        dense_scores: Dict[int, float] = {}

        if variant in ("dense", "hybrid", "hybrid_rerank"):
            d = self.dense(query, pool_k)
            lists.append([i for i, _ in d])
            dense_scores.update(d)
            for stem in act_stems:
                d_act = self.dense(query, 20, stem)
                lists.append([i for i, _ in d_act])
                dense_scores.update(d_act)
        if variant in ("bm25", "hybrid", "hybrid_rerank"):
            lists.append([i for i, _ in self.lexical(query, pool_k)])
            for stem in act_stems:
                lists.append([i for i, _ in self.lexical(query, 20, stem)])
        # A cited section is what the user asked for: put it first in its own list,
        # twice, so fusion ranks it at the top unless both retrievers disagree strongly.
        exact = [i for stem in act_stems for i in self.section_lookup(stem, section_refs)]
        if exact:
            lists.extend([exact, exact])

        plain_dense = variant == "dense" and not act_stems and not exact
        if plain_dense:
            fused = sorted(dense_scores.items(), key=lambda x: x[1], reverse=True)
        else:
            fused = self.rrf(lists)

        if variant == "hybrid_rerank" and self.reranker is not None and fused:
            candidates = [i for i, _ in fused[: self.rerank_top_n]]
            rq = rerank_query or query
            pairs = [(rq, f"{self.docs[i]['header']}\n{self.docs[i]['text'][:1500]}") for i in candidates]
            logits = self.reranker.predict(pairs, batch_size=16, show_progress_bar=False)
            scored = sorted(zip(candidates, (sigmoid(float(x)) for x in logits)), key=lambda x: x[1], reverse=True)
            exact_set = set(exact)
            # Explicitly cited sections stay in the result even if the reranker is unsure.
            head = [(i, s) for i, s in scored if i in exact_set]
            rest = [(i, s) for i, s in scored if i not in exact_set]
            results, kind = (head + rest)[:top_k], "rerank"
        elif plain_dense:
            results, kind = fused[:top_k], "cosine"
        else:
            results, kind = fused[:top_k], "rrf"

        out = []
        for i, score in results:
            d = self.docs[i]
            out.append({"id": d["id"], "text": d["text"], "metadata": d["metadata"],
                        "header": d["header"], "score": round(float(score), 4), "score_kind": kind,
                        "cosine": round(dense_scores[i], 4) if i in dense_scores else None})
        return out


def load_reranker(name: str):
    """CrossEncoder, or None when RERANKER_MODEL is 'none'."""
    if not name or name.lower() == "none":
        return None
    from sentence_transformers import CrossEncoder
    return CrossEncoder(name, max_length=int(os.getenv("RERANK_MAX_TOKENS", "256")))
