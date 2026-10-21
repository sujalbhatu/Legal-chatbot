"""
Per-request token accounting for every LLM call (translate, act detection,
memory summarization, answer). Wraps the Groq client so nothing that receives
`groq_client` needs to change. Uses a ContextVar, so concurrent Gunicorn threads
never mix up each other's counts.
"""

from contextlib import contextmanager
from contextvars import ContextVar

_calls = ContextVar("llm_calls", default=None)
_purpose = ContextVar("llm_purpose", default="other")


def begin():
    """Start counting for the current request; returns a token for end()."""
    return _calls.set([])


def end(token) -> dict:
    """Stop counting and return totals for the request."""
    calls = _calls.get() or []
    _calls.reset(token)
    totals = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "llm_calls": len(calls), "by_purpose": {}}
    for c in calls:
        totals["prompt_tokens"] += c["prompt_tokens"]
        totals["completion_tokens"] += c["completion_tokens"]
        bucket = totals["by_purpose"].setdefault(
            c["purpose"], {"prompt_tokens": 0, "completion_tokens": 0, "calls": 0, "models": []})
        bucket["prompt_tokens"] += c["prompt_tokens"]
        bucket["completion_tokens"] += c["completion_tokens"]
        bucket["calls"] += 1
        if c["model"] and c["model"] not in bucket["models"]:
            bucket["models"].append(c["model"])
    totals["total_tokens"] = totals["prompt_tokens"] + totals["completion_tokens"]
    return totals


@contextmanager
def purpose(label: str):
    """Label the LLM calls made inside this block (e.g. 'answer', 'memory_summary')."""
    token = _purpose.set(label)
    try:
        yield
    finally:
        _purpose.reset(token)


def _record(model, response):
    calls = _calls.get()
    usage = getattr(response, "usage", None)
    if calls is None or usage is None:
        return
    calls.append({
        "purpose": _purpose.get(),
        "model": model,
        "prompt_tokens": getattr(usage, "prompt_tokens", 0) or 0,
        "completion_tokens": getattr(usage, "completion_tokens", 0) or 0,
    })


class _MeteredCompletions:
    def __init__(self, inner):
        self._inner = inner

    def create(self, *args, **kwargs):
        response = self._inner.create(*args, **kwargs)
        _record(kwargs.get("model"), response)
        return response


class _MeteredChat:
    def __init__(self, inner):
        self.completions = _MeteredCompletions(inner.completions)


class MeteredClient:
    """Drop-in wrapper: client.chat.completions.create(...) is counted, everything else passes through."""

    def __init__(self, client):
        self._client = client
        self.chat = _MeteredChat(client.chat)

    def __getattr__(self, name):
        return getattr(self._client, name)
