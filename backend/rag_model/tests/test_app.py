"""
API-level tests for app.py with a stub pipeline (no model download, no Groq calls).
Run from backend/rag_model:  python -m unittest discover -s tests -v
"""

import sys
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


class LLMUnavailableError(RuntimeError):
    pass


class StubPipeline:
    fail_with = None

    def query(self, user_query, chat_history, language, memory_summary):
        if self.fail_with:
            raise self.fail_with
        return {"answer": f"echo: {user_query}", "sources": [], "language": "en",
                "language_name": "English", "memory": None, "usage": {"total_tokens": 0}}


stub = types.ModuleType("rag_pipeline")
stub.LLMUnavailableError = LLMUnavailableError
stub.instance = StubPipeline()
stub.resets = 0
stub.get_pipeline = lambda: stub.instance


def _reset():
    stub.resets += 1


stub.reset_pipeline = _reset
sys.modules["rag_pipeline"] = stub

import app as app_module  # noqa: E402  (after the stub is installed)


class QueryEndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = app_module.app.test_client()
        stub.instance.fail_with = None

    def post(self, body):
        return self.client.post("/api/query", json=body)

    def test_answers_a_query(self):
        res = self.post({"query": "  what is bail?  "})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["answer"], "echo: what is bail?")

    def test_rejects_non_string_query(self):
        self.assertEqual(self.post({"query": {"$gt": ""}}).status_code, 400)
        self.assertEqual(self.post({"query": 42}).status_code, 400)

    def test_rejects_bad_history(self):
        self.assertEqual(self.post({"query": "hi", "chat_history": "nope"}).status_code, 400)

    def test_rejects_non_json_body(self):
        res = self.client.post("/api/query", data="not json", content_type="text/plain")
        self.assertEqual(res.status_code, 400)

    def test_llm_outage_is_a_503_not_an_answer(self):
        stub.instance.fail_with = LLMUnavailableError("groq: model decommissioned, key gsk_secret")
        res = self.post({"query": "hi"})
        self.assertEqual(res.status_code, 503)
        self.assertNotIn("gsk_secret", res.get_data(as_text=True))
        self.assertNotIn("answer", res.get_json())

    def test_internal_errors_are_not_leaked(self):
        stub.instance.fail_with = ValueError("C:/secret/path/chroma.sqlite3 is locked")
        res = self.post({"query": "hi"})
        self.assertEqual(res.status_code, 500)
        self.assertNotIn("secret/path", res.get_data(as_text=True))


class ReloadTests(unittest.TestCase):
    def test_ingest_really_resets_the_pipeline_singleton(self):
        ingest = types.ModuleType("ingest")
        ingest.ingest_all = lambda: None
        sys.modules["ingest"] = ingest
        before = stub.resets
        res = app_module.app.test_client().post("/api/ingest")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(stub.resets, before + 1)


if __name__ == "__main__":
    unittest.main()
