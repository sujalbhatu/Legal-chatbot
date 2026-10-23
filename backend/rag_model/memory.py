"""
Conversation memory for multi-turn legal consultations.

Two layers:
  * Short-term memory - the most recent messages, sent to the LLM word for word.
  * Long-term memory  - one running summary of everything older, stored on the
                        chat session by the Node server and sent back each turn.

When the unsummarized history grows past `trigger_messages`, every message except
the last `short_term_messages` is folded into the summary:

    new_summary = summarize(old_summary + evicted_messages)

This is recursive: the summary always covers the whole conversation so far, but
its size stays bounded, so prompt size stops growing with conversation length.
Compaction only runs when the window overflows - not on every request - so the
extra summarization call is paid once every few turns, not per message.

The module has no third-party imports; the LLM call is injected (`summarize_fn`),
which keeps it unit-testable without network access.
"""

from dataclasses import dataclass, field
from typing import Callable, List, Optional
import os


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


@dataclass
class MemoryConfig:
    # Read at construction time (after .env is loaded), not at import time.
    trigger_messages: int = field(default_factory=lambda: _env_int("MEMORY_TRIGGER_MESSAGES", 10))      # compact when history exceeds this
    short_term_messages: int = field(default_factory=lambda: _env_int("MEMORY_SHORT_TERM_MESSAGES", 4))  # always kept verbatim
    summary_max_tokens: int = field(default_factory=lambda: _env_int("MEMORY_SUMMARY_MAX_TOKENS", 800))  # includes the reasoning tokens of gpt-oss


@dataclass
class MemoryResult:
    summary: str                      # long-term memory after this turn
    recent: List[dict]                # short-term memory to send verbatim
    newly_summarized: int = 0         # messages folded into the summary on this turn (from the front of history)
    compacted: bool = False
    error: Optional[str] = None


SUMMARY_SYSTEM_PROMPT = """You maintain the long-term memory of a chat between a user and an Indian legal-help assistant.
Merge the EXISTING SUMMARY and the NEW MESSAGES into one updated summary.

Keep:
- the user's situation and every concrete fact (people, relationships, dates, places, amounts of money, documents)
- every act and section number discussed, and what was concluded about it
- advice already given, steps the user said they took or plan to take, and open questions

Drop greetings, disclaimers, repeated statutory text and formatting.
Write in English, as short bullet points, at most 200 words. Output only the summary."""


def _clean(history) -> List[dict]:
    """Keep only well-formed user/assistant messages."""
    cleaned = []
    for m in history or []:
        role = m.get("role")
        content = (m.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            cleaned.append({"role": role, "content": content})
    return cleaned


def build_memory(history, summary: str, summarize_fn: Callable[[str, List[dict]], str],
                 config: Optional[MemoryConfig] = None) -> MemoryResult:
    """
    Decide what conversation context to send this turn.

    history      -- messages not yet folded into the summary, oldest first
    summary      -- long-term summary so far ('' for a new chat)
    summarize_fn -- (old_summary, messages) -> new_summary
    """
    config = config or MemoryConfig()
    history = _clean(history)
    summary = (summary or "").strip()

    if len(history) <= config.trigger_messages:
        return MemoryResult(summary=summary, recent=history)

    evict_count = max(0, len(history) - config.short_term_messages)
    # Start the short-term window on a user message so the LLM never sees an orphaned answer.
    while evict_count < len(history) and history[evict_count]["role"] != "user":
        evict_count += 1
    if evict_count == 0:
        return MemoryResult(summary=summary, recent=history)

    try:
        new_summary = (summarize_fn(summary, history[:evict_count]) or "").strip()
        if not new_summary:
            raise ValueError("empty summary")
    except Exception as exc:  # LLM down or rate-limited: fall back to a bounded window, retry next turn
        return MemoryResult(summary=summary, recent=history[-config.trigger_messages:], error=str(exc)[:200])

    return MemoryResult(summary=new_summary, recent=history[evict_count:],
                        newly_summarized=evict_count, compacted=True)


def summary_block(summary: str) -> str:
    """Text appended to the system prompt when a long-term summary exists."""
    if not summary:
        return ""
    return ("\n\n**CONVERSATION SO FAR (summary of earlier messages - use it for context, "
            "do not repeat it back unless asked):**\n" + summary)


def make_llm_summarizer(client, model: str, max_tokens: int = 400, **extra) -> Callable[[str, List[dict]], str]:
    """Summarizer backed by an OpenAI-compatible chat client (Groq). `extra` is passed
    through to the API (e.g. reasoning_effort for reasoning models)."""

    def summarize(previous_summary: str, messages: List[dict]) -> str:
        transcript = "\n\n".join(f"{m['role'].upper()}: {m['content']}" for m in messages)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
                {"role": "user", "content": (
                    f"EXISTING SUMMARY:\n{previous_summary or '(none yet)'}\n\n"
                    f"NEW MESSAGES:\n{transcript}"
                )},
            ],
            temperature=0,
            max_tokens=max_tokens,
            timeout=20,
            **extra,
        )
        return response.choices[0].message.content or ""

    return summarize
