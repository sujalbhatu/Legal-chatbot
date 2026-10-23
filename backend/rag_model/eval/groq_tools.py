"""
Groq helpers for evaluation runs on the free tier (8k tokens/min per model).

* RateLimited: retries 429s with the server's retry-after instead of failing. Without
  this a rate-limit error inside the pipeline's intent/translation step is swallowed
  and silently degrades retrieval, which would corrupt the comparison.
* Cached: disk cache keyed on (model, messages, params) so re-running retrieval
  experiments does not spend tokens again. Never used when measuring latency.
"""

import hashlib
import json
import re
import threading
import time
from pathlib import Path

CACHE_FILE = Path(__file__).resolve().parent / "results" / "llm_cache.jsonl"
_lock = threading.Lock()


class _Msg:
    def __init__(self, content):
        self.content = content
        self.role = "assistant"


class _Choice:
    def __init__(self, content, finish_reason):
        self.message = _Msg(content)
        self.finish_reason = finish_reason


class _Usage:
    def __init__(self, d):
        self.prompt_tokens = d.get("prompt_tokens", 0)
        self.completion_tokens = d.get("completion_tokens", 0)
        self.total_tokens = self.prompt_tokens + self.completion_tokens


class CachedResponse:
    def __init__(self, d):
        self.choices = [_Choice(d["content"], d.get("finish_reason"))]
        self.usage = _Usage(d.get("usage", {}))
        self.cached = True


def _key(kwargs):
    material = {k: v for k, v in kwargs.items() if k not in ("timeout", "stream")}
    return hashlib.sha256(json.dumps(material, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


class RateLimited:
    """Wraps a `chat.completions`-like object; retries rate-limit errors."""

    def __init__(self, inner, max_wait_s=600):
        self._inner = inner
        self.max_wait_s = max_wait_s
        self.waits = 0
        self.waited_s = 0.0      # total time slept on 429s (subtracted from measured latency)

    def create(self, *args, **kwargs):
        waited = 0.0
        while True:
            try:
                return self._inner.create(*args, **kwargs)
            except Exception as e:  # groq.RateLimitError, without importing groq here
                msg = str(e)
                if "429" not in msg and "rate_limit" not in msg.lower():
                    raise
                m = re.search(r"try again in (?:(\d+)m)?([\d.]+)s", msg)
                delay = (int(m.group(1) or 0) * 60 + float(m.group(2)) + 0.5) if m else 10.0
                if waited + delay > self.max_wait_s:
                    raise
                self.waits += 1
                self.waited_s += delay
                time.sleep(delay)
                waited += delay


class Cached:
    """Wraps a `chat.completions`-like object with a persistent response cache."""

    def __init__(self, inner):
        self._inner = inner
        self.hits = 0
        self.misses = 0
        self._mem = {}
        if CACHE_FILE.exists():
            with open(CACHE_FILE, encoding="utf-8") as f:
                for line in f:
                    rec = json.loads(line)
                    self._mem[rec["key"]] = rec["value"]

    def create(self, *args, **kwargs):
        key = _key(kwargs)
        if key in self._mem:
            self.hits += 1
            return CachedResponse(self._mem[key])
        self.misses += 1
        resp = self._inner.create(*args, **kwargs)
        choice = resp.choices[0]
        usage = getattr(resp, "usage", None)
        value = {"content": choice.message.content, "finish_reason": choice.finish_reason,
                 "usage": {"prompt_tokens": getattr(usage, "prompt_tokens", 0),
                           "completion_tokens": getattr(usage, "completion_tokens", 0)}}
        if value["content"]:          # never cache empty / failed generations
            with _lock:
                self._mem[key] = value
                CACHE_FILE.parent.mkdir(exist_ok=True)
                with open(CACHE_FILE, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"key": key, "value": value}, ensure_ascii=False) + "\n")
        return resp


def install(metered_client, cache: bool):
    """Wrap the MeteredClient's inner completions so metering still sees every call."""
    inner = metered_client.chat.completions._inner
    wrapped = RateLimited(inner)
    if cache:
        wrapped = Cached(wrapped)
    metered_client.chat.completions._inner = wrapped
    return wrapped
