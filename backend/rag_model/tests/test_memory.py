"""Unit tests for conversation memory and token metering (no network, no third-party packages).

Run from backend/rag_model:   python -m unittest discover -s tests -v
"""
import os
import sys
import threading
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import llm_usage  # noqa: E402
from memory import MemoryConfig, build_memory, summary_block  # noqa: E402


def chat(n_exchanges, start=1):
    msgs = []
    for i in range(start, start + n_exchanges):
        msgs.append({"role": "user", "content": f"question {i}"})
        msgs.append({"role": "assistant", "content": f"answer {i}"})
    return msgs


class FakeSummarizer:
    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail

    def __call__(self, old_summary, messages):
        if self.fail:
            raise RuntimeError("rate limited")
        self.calls.append((old_summary, list(messages)))
        covered = [m["content"] for m in messages if m["role"] == "user"]
        return (old_summary + " | " if old_summary else "") + "covers " + ", ".join(covered)


CFG = MemoryConfig(trigger_messages=10, short_term_messages=4, summary_max_tokens=400)


class BuildMemoryTests(unittest.TestCase):
    def test_short_chat_is_sent_verbatim(self):
        s = FakeSummarizer()
        r = build_memory(chat(5), "", s, CFG)  # 10 messages = at the trigger, not over it
        self.assertFalse(r.compacted)
        self.assertEqual(len(r.recent), 10)
        self.assertEqual(s.calls, [])

    def test_overflow_folds_all_but_the_last_four(self):
        s = FakeSummarizer()
        r = build_memory(chat(6), "", s, CFG)  # 12 messages
        self.assertTrue(r.compacted)
        self.assertEqual(r.newly_summarized, 8)
        self.assertEqual([m["content"] for m in r.recent], ["question 5", "answer 5", "question 6", "answer 6"])
        self.assertEqual(len(s.calls), 1)
        self.assertEqual(len(s.calls[0][1]), 8)

    def test_summary_is_recursive(self):
        s = FakeSummarizer()
        r = build_memory(chat(6), "covers question 0", s, CFG)
        self.assertEqual(s.calls[0][0], "covers question 0")
        self.assertIn("question 0", r.summary)
        self.assertIn("question 4", r.summary)

    def test_short_term_window_starts_on_a_user_message(self):
        s = FakeSummarizer()
        history = chat(6)[1:]  # 11 messages, starts with an assistant answer
        r = build_memory(history, "", s, CFG)
        self.assertEqual(r.recent[0]["role"], "user")

    def test_summarizer_failure_falls_back_to_a_bounded_window(self):
        r = build_memory(chat(8), "old", FakeSummarizer(fail=True), CFG)
        self.assertFalse(r.compacted)
        self.assertEqual(r.summary, "old")
        self.assertEqual(r.newly_summarized, 0)
        self.assertEqual(len(r.recent), CFG.trigger_messages)
        self.assertIn("rate limited", r.error)

    def test_twenty_turn_session_keeps_prompt_bounded_and_loses_nothing(self):
        """Simulates the Node server: it stores summary + summarizedCount and resends the rest."""
        s = FakeSummarizer()
        messages, summary, summarized = [], "", 0
        max_recent = 0
        for turn in range(1, 21):
            r = build_memory(messages[summarized:], summary, s, CFG)
            max_recent = max(max_recent, len(r.recent))
            if r.newly_summarized:
                summary, summarized = r.summary, summarized + r.newly_summarized
            messages += [{"role": "user", "content": f"question {turn}"},
                         {"role": "assistant", "content": f"answer {turn}"}]
            # invariant: every message is either summarized or still pending
            self.assertEqual(summarized + len(messages[summarized:]), len(messages))
        self.assertLessEqual(max_recent, CFG.trigger_messages)
        for turn in range(1, 16):
            self.assertIn(f"question {turn}", summary)
        # compaction happens every few turns, not on every request
        self.assertLess(len(s.calls), 20 / 2)

    def test_summary_block(self):
        self.assertEqual(summary_block(""), "")
        self.assertIn("facts", summary_block("facts"))


class UsageMeterTests(unittest.TestCase):
    def _client(self, prompt, completion):
        usage = SimpleNamespace(prompt_tokens=prompt, completion_tokens=completion)
        completions = SimpleNamespace(create=lambda **kw: SimpleNamespace(usage=usage))
        return llm_usage.MeteredClient(SimpleNamespace(chat=SimpleNamespace(completions=completions)))

    def test_counts_calls_by_purpose(self):
        client = self._client(100, 20)
        token = llm_usage.begin()
        with llm_usage.purpose("answer"):
            client.chat.completions.create(model="m")
        with llm_usage.purpose("memory_summary"):
            client.chat.completions.create(model="m")
        totals = llm_usage.end(token)
        self.assertEqual(totals["llm_calls"], 2)
        self.assertEqual(totals["total_tokens"], 240)
        self.assertEqual(totals["by_purpose"]["memory_summary"]["calls"], 1)

    def test_threads_do_not_share_counts(self):
        client = self._client(10, 0)
        results = {}

        def worker(name, n):
            token = llm_usage.begin()
            for _ in range(n):
                client.chat.completions.create(model="m")
            results[name] = llm_usage.end(token)["prompt_tokens"]

        threads = [threading.Thread(target=worker, args=("a", 3)), threading.Thread(target=worker, args=("b", 5))]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(results, {"a": 30, "b": 50})


if __name__ == "__main__":
    unittest.main()
