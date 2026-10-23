# OpenForge legal assistant: Week 3 results

Branch `week3/memory-and-hardening` (local, not pushed). Everything below was measured on
this laptop between 21 and 22 October 2026, against the 18 Acts in the index. Numbers come
from files in `backend/rag_model/eval/results/`; every table says which.

> **Status of this document.** All numbers are final (22 Oct 2026). The end-to-end
> comparison in §5 ran on 22 Oct with the same answer model as the baseline
> (`gpt-oss-20b`), on the final 123-Act index. Deployed 22-23 Oct; server
> measurements and later fixes are in §13-14.

## 1. What changed, in one paragraph

The chatbot was failing mostly *before* the LLM. The chunker missed most sections of the
new criminal codes and mislabelled the rest, so the right section was often not in the
index at all. On top of that the pipeline made up to two LLM calls before every answer,
padded the prompt with web snippets, showed fake "99% match" scores, and could start a
100-second scrape-and-ingest from a normal chat message. Week 3 does three things:
- **Rebuilds retrieval and measures it:** section-aware chunks, BM25 + dense with RRF, a
  cross-encoder reranker, and query expansion.
- **Grounds the answer:** numbered citations, a post-check of every cited section, and
  honest scores.
- **Makes the chat feel like a product:** streaming, clickable citations, follow-ups,
  feedback and a language picker.

All 13 code-review findings are fixed with tests (55 Python, 10 Node).

## 2. Evaluation set

`backend/rag_model/eval/questions.jsonl`, 120 questions:

| Type | n | Example |
|---|---:|---|
| Section number | 22 | "What does Section 303 of the Bharatiya Nyaya Sanhita say?" |
| Acronym | 16 | "Under CGST, who is liable to get registered?" |
| Plain-language scenario | 52 | "My neighbour is spreading false stories about me…" |
| Non-English | 15 | Hindi 6 (one in Latin script), Bengali 2, Odia 2, Assamese 2, Tamil, Marathi, Gujarati |
| Multi-turn follow-up | 10 | (after a theft answer) "What if it is a chain being snatched?" |
| Out of corpus | 5 | "Punishment for cheque bounce under s.138 NI Act?" (Act not indexed) |

**How the labels were made (be upfront about this in an interview).**
- I (with an AI assistant) drafted every question and its gold `[act, section, phrase]`
  from knowledge of the Acts.
- `eval/check_labels.py` then parses the Act text and checks that the section exists and
  contains the phrase: **160/160 labels verified**. That proves the section is real and on
  topic. It does not prove it is the *best* answer, so a human spot-check is still needed.
- There is no Santali question, because I could not write or verify one. Santali (Ol
  Chiki) detection is covered by a unit test instead.
- One label change was considered after seeing results (BNS 305 for the bike question)
  and rejected after reading the section.
- The 15 non-English questions were written by me, not native speakers.

Spot-check list for Sujal (20 random labels, `check_labels.py`, seed 7):

| id | Question | Gold |
|---|---|---|
| scn27 | A factory near us is releasing toxic waste into the river. | EPA s.7 |
| scn01 | Someone stole my bike from outside my house. What offence is this? | BNS s.303 |
| scn39 | Someone is circulating my private intimate photos without my consent. | IT Act s.67A (also 66E, BNS 77) |
| sec13 | Explain Section 74 of the CGST Act. | CGST s.74 |
| sec19 | What is Section 27 of the Special Marriage Act? | SMA s.27 |
| ml09 | குழந்தைகளுக்கு எதிரான பாலியல் வன்கொடுமைக்கு என்ன தண்டனை? | POCSO s.4/6/8/10 |
| acr03 | How do I file an RTI application? | RTI s.6 |
| scn35 | Can a Hindu and a Christian marry each other legally in India? | SMA s.4 |
| mt02 | (after a DV answer) Can I get an order stopping him from contacting me? | DV Act s.18 |
| sec15 | What is Section 480 of the BNSS about? | BNSS s.480 |
| ml06 | mera phone chori ho gaya aur police FIR nahi likh rahi, kya karu? | BNSS s.173, BNS s.303 |
| scn11 | I was arrested yesterday. Do the police have to tell me why? | BNSS s.47 |
| sec10 | What is Article 32 of the Constitution about? | Art. 32 |
| acr01 | Under CGST, who is liable to get registered? | CGST s.22 |
| scn45 | I lost my civil appeal in the district court. Can I appeal again to the High Court? | CPC s.100 |
| scn42 | In a court case, who has to prove the facts? | BSA s.104 |
| sec18 | What does Article 14 guarantee? | Art. 14 |
| scn15 | My neighbour is spreading false stories about me… | BNS s.356 |
| acr02 | What is the punishment for sexual assault under POCSO? | POCSO s.8 |
| ml12 | ଘରୋଇ ହିଂସାରୁ ମହିଳାମାନଙ୍କୁ ସୁରକ୍ଷା ଦେବା ପାଇଁ କେଉଁ ଆଇନ ଅଛି? | DV Act s.3/12/18 |

**Metrics** (`eval/run_eval.py`):
- **Recall@k:** the gold section is among the top k *distinct sections* of the context
  given to the LLM.
- **MRR.**
- **Citation precision:** the share of citation cards shown to the user that are gold.
- **Unsupported citations:** a "Section N" / "Article N" in the answer that is not in the
  retrieved text (deterministic).
- **Hallucination rate:** an LLM judge (qwen3.8-27b, same prompt for both systems) asks
  whether the answer states a legal fact the context does not support.
- **Answer language:** checked by script.
- **Latency:** p50/p95, plus time to first token, Groq calls and tokens per query.
- **Fair comparison:** the baseline is commit `bdababc` run unchanged from a git worktree,
  with its committed index. Live scraping is disabled during evaluation in both systems.

## 3. Retrieval

`eval/summarize.py`, 115 answerable questions; out-of-corpus questions are excluded.

| Configuration | R@1 | R@5 | R@10 | MRR | p50 retrieval |
|---|---:|---:|---:|---:|---:|
| **Baseline** (old chunks, dense + LLM act booster) | 0.191 | 0.296 | 0.304 | 0.234 | 3,156 ms |
| Section-aware chunks, dense only | 0.409 | 0.765 | 0.817 | 0.550 | 35 ms |
| BM25 only | 0.400 | 0.530 | 0.643 | 0.462 | 15 ms |
| Hybrid (dense + BM25, RRF) | 0.487 | 0.713 | 0.791 | 0.573 | 47 ms |
| Hybrid + MiniLM cross-encoder | 0.461 | 0.817 | 0.852 | 0.601 | 776 ms |
| Same, int8 reranker weights | 0.504 | 0.809 | 0.861 | 0.625 | 439 ms |
| Same, bge-reranker-base instead (before margin titles) | 0.513 | 0.783 | 0.835 | 0.627 | 4,287 ms |
| Same, without act filter / exact section lookup | 0.374 | 0.765 | 0.809 | 0.531 | 623 ms |
| Hybrid + rerank + LLM query expansion on every English question | 0.583 | 0.870 | 0.904 | 0.696 | see §6 |
| **Final default, 123-Act index** (expansion only when no Act/section is named) | **0.548** | **0.870** | **0.904** | **0.668** | see §6 |

Recall@5 by question type:

| | Section | Acronym | Scenario | Multilingual | Multi-turn |
|---|---:|---:|---:|---:|---:|
| Baseline | 0.091 | 0.438 | 0.327 | 0.400 | 0.200 |
| Hybrid + rerank | 1.000 | 0.875 | 0.750 | 0.867 | 0.600 |
| + query expansion | — | — | 0.865 | — | — |

What the numbers say, honestly:

- **The biggest win is chunking, not models.** The old chunker needed a space after the
  section number, and the 2023 codes print "303.(1) Whoever…". So 49 of 358 BNS sections
  and 14 of 170 BSA sections were indexed, and a chunk labelled "Section 144" actually held
  sections 151–156. `sections.py` finds real section boundaries: a maximum-weight increasing
  subsequence over candidate "N." lines, which skips the table of contents and footnotes.
  It also recovers the 2023 codes' titles from their margin notes. Dense retrieval alone on
  the new chunks goes from 0.296 to 0.765 Recall@5.
- **Final vs baseline:** Recall@5 +0.52 (95% bootstrap CI 0.42–0.63), MRR +0.37
  (0.27–0.46).
- **Hybrid RRF alone does not beat dense** on Recall@5 (0.713 vs 0.765). BM25 is strong on
  section numbers and acronyms but weak on plain-language scenarios (0.288), and plain RRF
  lets it drag those down. It only helps after the reranker re-scores the fused list.
- **The reranker's gain over dense alone is not statistically significant at n=115**
  (Recall@5 +0.05, CI −0.02 to +0.12). Keep it for MRR and acronyms, but don't oversell it.
- **Query expansion** (one LLM call that adds statutory terms to an English question;
  "stole" → theft) is the significant gain on top of reranking: MRR +0.095 (CI 0.04–0.15).
  The first prompt sometimes returned Hindi transliterations ("Chori"); the prompt now asks
  for English terms. The re-measured row goes in `retrieval_new_hybrid_rerank_final.json`.
- **The act filter and exact section lookup** are what make section-number questions
  reliable: removing them drops Recall@5 on those from 1.00 to 0.73.
- **bge-reranker-base** is 7× slower, uses about 1.3 GB here and is worse on non-English
  (0.467), so MiniLM it is.

### 3b. Corpus expansion: 18 → 123 Acts

After the baseline, I added the 105 central Acts Sujal compiled from India Code.
- **What's in it:** Divorce Act, Sale of Goods, Indian Stamp Act, Juvenile Justice,
  Prohibition of Child Marriage, Commercial Courts, Police Act, Lokpal and more. The list
  is in `data/raw_pdfs/central_acts/MANIFEST.json`.
- **How they were added:** names come from each PDF's title page; `ingest.py --add-new`
  extracts only new PDFs. 101 of 105 Acts parse with at least 70% section coverage.
- **Index size:** 10,712 chunks, up from 4,973.

| Same eval (18-Act questions), hybrid + rerank, expansion off | R@5 | MRR | Scenario R@5 |
|---|---:|---:|---:|
| 18-Act index | 0.817 | 0.601 | 0.750 |
| 123-Act index | 0.783 | 0.582 | 0.692 |

The drop (−0.034, inside the noise band) is the cost of about 6,000 extra distractor
chunks. Section-number and acronym questions are unaffected thanks to the act filter;
plain-language scenarios pay most of it. The end-to-end run in §5 uses the 123-Act index.

## 4. Memory footprint (legal-rag has `MemoryMax=500M` on a 1 GB VM)

`eval/memory_probe.py`, resident memory added by each part, Windows:

| Step | RSS | Added |
|---|---:|---:|
| Python + torch + sentence-transformers + chromadb imports | 387 MB | +368 |
| + MiniLM embedder | 458 MB | +71 |
| + Chroma collection + BM25 index (18 Acts / **123 Acts**) | 555 / **640 MB** | +97 / **+182** |
| + MiniLM cross-encoder (fp32) | 712 / **796 MB** | +157 / +156 |

- **Hybrid:** fits easily; it adds about 100 MB to what the live service already loads.
- **Reranker:** costs about 160 MB on top of that. Absolute numbers are lower on Linux (no
  torch DLLs). My estimate for the server is roughly 500–550 MB for hybrid + rerank, which
  is borderline for the 500 MB cap.
- **int8:** loads fp32 first and then quantizes, so it saves time, not memory.
- **Decision for Sujal at deploy:**
  - Check `systemctl status legal-rag` memory after restart. If it is above 450 MB, run
    `RETRIEVAL_MODE=hybrid` (no reranker; 0.713 Recall@5, still 2.4× the baseline).
  - Or raise `MemoryMax` to about 700M.
  - Query expansion runs on Groq and costs no server memory.

## 5. Grounded answers (end-to-end)

31-question stratified subset (every question type represented, including 2 out-of-corpus
questions). Both systems use the same answer model (`gpt-oss-20b`) and the same judge
(`qwen3.8-27b`, same prompt, temperature 0). The new system runs through its streaming
path, as users get it. Files: `eval/results/answer_baseline_report.json`,
`answer_new_report.json`.

| | Baseline | New |
|---|---:|---:|
| Answers produced | 24 / 31 (7 empty) | **31 / 31** |
| Hallucination rate (LLM judge, answerable questions) | 72.7% (16 of 22) | **34.5%** (10 of 29) |
| Section numbers in answers not found in the retrieved text | 75% (21 of 28) | **0%** (0 of 55) |
| Out-of-corpus questions declined | 0 / 2 | **2 / 2** |
| Answer in the question's language | 100% | 100% |
| Citation cards per answer | 0.71 | 6.0 (cited first) |
| Share of citation cards that are gold sections | 17.6% | 25.3% |
| Latency p50 / p95 (whole answer) | 2.8 s / 12.5 s | **2.4 s / 2.8 s** |
| Time to first word p50 / p95 | (no streaming) | **1.95 s / 2.33 s** |
| Groq calls / tokens per question | 2.04 / 3,208 | 1.65 / 2,466 |

What these mean:
- **Empty answers.** On 7 of 31 questions the old code got an empty reply from gpt-oss-20b
  and passed it on: the user would have seen nothing. The new code treats empty content
  as a failure and falls back to another model (0 of 31).
- **Hallucinations halved, not gone.** 34.5% of answers still contain at least one claim
  the judge could not find in the sources. Real examples, not judge noise:
  - "a minor's contract is voidable" (under Indian law it is void);
  - "30 days for a second appeal" (it is 90);
  - helmet fines quoted from the outdated Motor Vehicles PDF or from outside the sources.
  The deterministic citation check is stronger: none of the 55 section numbers the new
  system cited was missing from its sources, against 21 of 28 for the old system.
- **Citation precision is low for both,** because many questions have several reasonable
  sections and only 1-4 are gold. The new system lists every retrieved section it read
  (cited ones first), so it shows more non-gold cards.
- **Latency.** The new system is faster at p50 and far steadier at p95 (the old one's
  12.5 s tail comes from failed-model fallbacks). With streaming, users see the first
  words in under 2.5 s for 95% of questions.

Already observed:
- **Baseline hallucination.** The baseline answered the out-of-corpus cheque-bounce
  question by inventing "a fine of up to ₹10,000". Section 138 NI Act actually allows up
  to twice the cheque amount, and the Act is not even in the index.
- **No hard abstention threshold.** I planned to abstain when the best reranker score was
  low. Calibration on the eval set showed that is wrong for this domain: the cross-encoder
  ranks plain-language questions well but gives the *correct* section absolute scores near
  0 (15 of 18 low-score correct hits were scenarios). A 0.10 threshold would have refused
  21 of 93 answerable questions and caught only 2 of 5 out-of-corpus ones. So the
  threshold is off by default, and the grounded prompt decides whether the sources answer
  the question. For the same reason the UI does not show "High/Low relevance".
- **End-to-end smoke test** (local UI on in-memory MongoDB, gpt-oss-120b):
  - Time to first token 2.0–3.0 s over 4 queries (superseded by the table above).
  - Hindi answers cite correctly once gpt-oss's native `【4】` markers are normalised.
  - A follow-up ("And if he snatched my phone instead?") resolves to BNS s.304.

## 6. Latency and LLM calls

- **Before the answer:**
  - Baseline: 1.32 LLM calls on average (act detection for every message, plus
    translation for non-English) and **3.2 s p50 retrieval**.
  - New, without expansion: 0.21 calls (only non-English or follow-up messages need one;
    translation, follow-up resolution and act naming are a single JSON call) and 0.8 s p50.
  - With query expansion on every English question, the live expansion call cost 1–3 s,
    which brought pre-answer time back to about 3 s. So expansion now runs only when the
    question names no Act and no section (those are found by the act filter anyway); this
    also raised Recall@5 from 0.843 to 0.870 on the 123-Act index.
- **Answer:** streamed. First words at 1.95 s p50 / 2.33 s p95; whole answer 2.4 s p50 /
  2.8 s p95 (old system: 2.8 s / 12.5 s, no streaming).
- **Dead models:** the old fallback models (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`)
  and the memory summarizer's model returned 404 on this key, so in production long-term
  memory compaction had silently never run. Model lists are now checked and configurable,
  and empty gpt-oss content counts as a failure and triggers the fallback.

## 7. Conversation memory

`eval/benchmark_memory.py`, 20-turn cyber-fraud consultation, gpt-oss-120b:

| Strategy | Tokens, 20 turns (incl. summarizing) | vs full | Turn-20 prompt | Remembers turn-1 facts at turn 20 |
|---|---:|---:|---:|---|
| Full history | 82,678 | — | 7,012 | yes |
| Last 6 messages | 42,429 | −48.7% | 1,693 | **no** (forgot Rahul and ₹18,000) |
| **Last 4 + recursive summary** | 58,110 (8,446 summarizing) | **−29.7%** | 2,167 | **yes** |

How it was measured:
- One real run with summary memory, using Groq-reported tokens.
- The full/window prompts are rebuilt from the same transcript and the same retrieved
  sources, and counted with the gpt-oss tokenizer, calibrated against Groq's counts
  (within ~3%).
- All three turn-20 answers are real calls.
- The answers here are short, so full history only grows to about 7K tokens by turn 20.
  The saving rises with longer chats.

## 8. Multilingual

- **Detection:** script ranges decide Odia, Ol Chiki (Santali), Gujarati, Gurmukhi,
  Tamil, Telugu, Kannada, Malayalam and Urdu. fastText `lid.176.ftz` (1 MB) separates
  Bengali from Assamese and Hindi from Marathi. Romanised Hindi is answered as Hinglish.
  It is deterministic, unlike langdetect without a seed.
- **Short messages:** fastText mislabelled a short Hindi follow-up as Marathi, so
  Devanagari is now Hindi unless there is clear Marathi evidence, and a short message
  keeps the previous turn's language.
- **UI language:** the "Answer in" picker is respected unless the message is written in
  another script.
- **One prompt for all languages:** the old "Santali" prompt was Hindi text, and the
  per-language prompts were weaker copies of the English one.
- **Retrieval on the 15 non-English questions:** Recall@5 0.400 → 0.867.
- **Multilingual embeddings:** not adopted. Translation through the one LLM call already
  gives 0.867, and multilingual-e5-small would add about 120 MB on a server already at
  its memory limit.

## 9. Code-review findings (all on the branch, with tests)

| # | Finding | Fix |
|---|---|---|
| 1 | Any chat message could trigger scrape + download + ingest | Chat never ingests; `/api/fetch-law` and `/api/ingest` need `X-Admin-Token` and run one at a time |
| 2 | Any URL containing "indiacode.nic.in", no size cap | https + exact host, no userinfo/backslash/odd port; streamed with a 25 MB cap and a `%PDF` check |
| 3 | Web snippets in the system prompt; caller could send a "system" history message | Web context removed; history keeps user/assistant only |
| 4 | Concurrent ingests raced | Single-flight lock; stable chunk ids, upsert, old chunks of the act deleted first |
| 5 | Runtime ingestion hard-coded MiniLM | One `EMBEDDING_MODEL`/collection config; the pipeline refuses a collection built with another model |
| 6 | Fake 0.99→0.90 scores, duplicate citations | Real reranker scores; dedupe by chunk id |
| 7 | Dead Groq models, empty gpt-oss content | Checked model list; empty content counts as failure |
| 8 | Citations wiped / only 2 shown | All context sources shown, cited first |
| 9 | Self-XSS in chat | All text escaped before formatting |
| 10 | Signup revealed accounts; OTP mail bombing; reset did not revoke JWTs; CORS `*`; Node on 0.0.0.0 | Same response for every signup; 1 mail/min, 5/hour; `tokenVersion` in JWT; CORS = site origin; listens on 127.0.0.1 |
| 11 | Session list loaded every message | MongoDB projection (count + last-message preview) |
| 12 | Hygiene | Requirements pinned; langchain/langdetect/flask-cors removed; archives, stray scripts and derived data untracked (history not rewritten) |
| 13 | langdetect gaps | See §8 |

## 10. Honest caveats

- **Eval size and authorship:** 115 answerable questions written by me. Differences under
  about 0.06 are within noise (CIs above), and the labels still need Sujal's spot-check.
- **Outdated Motor Vehicles Act:** the indexed PDF predates the 2019 amendment (₹2,000
  drunk-driving fine instead of ₹10,000, no s.194D). On 21 Oct I downloaded India Code's
  current file (`bitstream/123456789/9460/1/a1988-59.pdf`): it is also pre-2019, and the
  Act's page returned 504s, so the old PDF stays until an amended copy is found. The bot
  can only be as current as its PDFs.
- **Incomplete titles:** BNSS titles are recovered for 44 of 528 sections (its layout
  differs), and CPC Orders/rules and Constitution Schedules are indexed as plain chunks.
- **LLM judge:** the hallucination rate comes from an LLM judge (qwen3.8-27b), not lawyers.
- **Machine-specific latency:** latencies are from this laptop and Groq's free tier. The
  server CPU will make the reranker slower.
- **Memory estimate:** the server memory figure is an estimate from Windows increments;
  it needs measuring on the server.

## 11. Resume lines (measured numbers only)

- Built an evaluation harness for a multilingual Indian-law RAG assistant: 120 questions
  with 160 gold section labels auto-verified against statute text, measuring Recall@k,
  MRR, LLM-judged hallucination rate, latency and token cost.
- Grew the corpus from 18 to 123 central Acts (10.7K section-aligned chunks) with
  automatic title extraction and incremental ingestion.
- Found and fixed a section-parsing bug that left 86% of the Bharatiya Nyaya Sanhita
  unindexed. Section-aware chunking plus hybrid BM25/dense retrieval, cross-encoder
  reranking and LLM query expansion raised Recall@5 from 0.30 to 0.87 and MRR from 0.23
  to 0.67 (123-Act index).
- Halved the LLM-judged hallucination rate (72.7% → 34.5%) with grounded prompting and a
  citation post-check; uncited section numbers fell from 75% to 0%, out-of-scope
  questions are declined instead of answered, and empty answers fell from 7/31 to 0.
- Streamed answers token-by-token (SSE through Flask → Node → React): first words in
  1.95 s p50 / 2.33 s p95, and p95 answer latency cut from 12.5 s to 2.8 s.
- Designed recursive-summary conversation memory that used 30% fewer tokens than full
  history over a 20-turn consultation while still recalling turn-1 facts that a sliding
  window lost.
- Hardened a production MERN + Flask service: JWT revocation on password reset, OTP
  brute-force and mail-flood limits, an SSRF-safe downloader, admin-only ingestion and an
  XSS fix, with 65 automated tests.


## 12. Interview questions and answers

1. **Why did chunking matter more than the model?**
   Retrieval can't find what isn't indexed. The parser missed "303.(1)"-style headings, so
   most BNS sections were absent or mislabelled. Fixing it took dense-only Recall@5 from
   0.30 to 0.77, a bigger jump than any model change.

2. **How do you find section boundaries in a messy PDF?**
   Every line starting "N." is a candidate, and both the table of contents and the body
   list sections in increasing order. I take the increasing chain that covers the most
   sections (maximum-weight increasing subsequence, O(n log n) with a Fenwick tree), drop
   amendment footnotes, and cut at schedule headings so the last section doesn't swallow a
   schedule.

3. **Why hybrid retrieval, given RRF alone didn't help?**
   BM25 nails exact tokens ("66C", "CGST", "13B") and dense handles paraphrase. RRF merges
   rankings without calibrating scores, but with a weak BM25 list it can push good dense
   hits down. That's why the reranker re-scores the fused top 20. I report that hybrid
   alone was 0.713 vs dense 0.765 rather than hiding it.

4. **Why not abstain when the reranker score is low?**
   I calibrated it. ms-marco cross-encoders give correct statutory sections near-zero
   scores for plain-language questions, so a 0.10 threshold would refuse 23% of answerable
   questions while catching 2 of 5 out-of-scope ones. A score that ranks well isn't
   necessarily a calibrated confidence.

5. **How do you stop hallucinated citations?**
   Sources are numbered and the model must cite [n]. Server-side, markers that point
   nowhere are removed and any "Section N" not present in the retrieved text is flagged to
   the user. An LLM judge measures unsupported claims offline.

6. **How did you measure the memory saving fairly?**
   One real run with the summary strategy. The other strategies' prompts are rebuilt from
   the identical transcript and sources and counted with the model's tokenizer, which is
   calibrated against Groq's reported counts. That isolates the memory representation from
   retrieval noise. The turn-20 answers are real, which is how we saw the window forget
   turn-1 facts.

7. **How does streaming work across three services?**
   Groq streams to Flask, which emits Server-Sent Events (meta → token → done). Node proxies
   the stream with `X-Accel-Buffering: no` for Nginx, decodes UTF-8 across chunk boundaries
   (a Hindi character can be split), and saves the exchange only when `done` arrives. The
   browser reads it with `fetch` and a stream reader.

8. **How did you handle an 8K-tokens-per-minute free tier during evaluation?**
   A rate-limit wrapper honours retry-after and subtracts the wait from measured latency,
   and a disk cache means re-running retrieval experiments costs no tokens. When the daily
   200K cap hit mid-run, the failed queries were set aside and re-run later on the same
   model rather than counted as baseline failures.

9. **What was the security story?**
   Chat messages could trigger scraping and ingestion, a DoS and corpus-poisoning path. The
   downloader trusted any URL containing the domain name (SSRF), password resets didn't
   revoke JWTs, and user text went unescaped into innerHTML. Each fix has a test.

10. **What would you do next?**
    - Get lawyers or law students to label 100 real user questions (the thumbs-down
      feedback now collected is the queue).
    - Move to a bigger instance: on the 1 GB VM the reranker costs ~8 s per question (§14).
    - Replace the outdated Motor Vehicles Act PDF.
    - Try a multilingual reranker if the memory budget allows.

## 13. Deploy (done 22-23 Oct 2026, on the Oracle VM)

What was done, in order (rollback copies are listed at the end):

1. Backed up `/opt/legal-query` (code, data, frontend; no venv/node_modules) to
   `/opt/backups/legal-query-20261022-2257.tar.gz`, plus the old `legal-rag.service`.
2. Installed `rank-bm25` and `fasttext-wheel` into the existing venv and downloaded
   `lid.176.ftz` to `data/models/`. Pre-downloaded the reranker
   (`cross-encoder/ms-marco-MiniLM-L-6-v2`), because the service runs with
   `ProtectSystem=strict` and cannot write to the model cache; the service now has
   `HF_HUB_OFFLINE=1`.
3. Copied the code from branch `frontend-redesign` (committed state, LF line endings) over
   `/opt/legal-query`, keeping the server's own gunicorn settings (port 5001, no preload).
4. Index: instead of rebuilding on the VM, exported only the `legal_sections` collection
   from the laptop (embeddings copied as they are, same nearest neighbours) into a clean
   106 MB Chroma database and uploaded it. Act-name manifests copied too.
5. Frontend: built on the laptop, uploaded to `frontend/dist`.
6. `.env`: added `FASTTEXT_LID_MODEL` and a random `RAG_ADMIN_TOKEN`.
7. `legal-rag.service`: `MemoryHigh=650M`, `MemoryMax=800M` (was a hard 500M), plus a
   drop-in `legal-rag.service.d/retrieval.conf` with `RERANKER_INT8=1` (see §14).
8. Gunicorn: models load in a background thread when the worker starts, and workers are no
   longer recycled every 200 requests (each recycle meant a two-minute reload).

Rollback: `/opt/legal-query/data/vector_db.old-20261022-2259`,
`/opt/legal-query/frontend/dist.old-20261022-2259`, and the backup tarball above.

Still open: the Motor Vehicles Act PDF (no amended copy found yet).

## 14. After the first write-up (22-23 Oct)

### Product
- Frontend redesign: landing page, dashboard (stats, conversations grouped by day with the
  sections each answer cited, Ctrl+K search), chat (answers read from the top; sources as
  compact chips, only cited ones shown by default), auth pages with a show-password button.
- Guest mode at `/try`: no login, streamed answers, nothing stored server-side; 10 questions
  an hour and 25 a day per IP plus 400 a day overall, refunded if the answer fails.

### Retrieval fixes found by using the product
- **Abbreviations:** the cross-encoder did not know "RTI", so "How do I file an RTI
  application?" ranked IT Act s.22 above RTI Act s.6 and the answer said nothing was found.
  Common abbreviations (RTI, FIR, IPC, CrPC, BNS, POCSO, GST, PIO...) now get their full
  names added to the search query. Retrieval MRR 0.582 -> 0.618 on the 115-question set.
- **Minors and contracts:** "Is a contract signed by a 16-year-old valid?" missed Contract
  Act s.11 about half the time; a context-specific hint (a minor or age under 18 *and* a
  contract) fixed it; a crime question about a child still goes to POCSO.
- **Section titles from the PDF layout:** BNSS titles 44 -> 526 of 531, CGST 0 -> 167.
  Retrieval (before -> after): Recall@1 0.504 -> 0.522, MRR 0.618 -> 0.631, Recall@5
  0.783 -> 0.765 (2 of 115 questions; within noise). The gain is mostly in what users see.

### Engineering
- Lint works again (the config referenced a plugin export that does not exist).
- 13 frontend unit tests (Vitest): the answer stream parser (split chunks, CRLF, errors,
  the guest 429 message), HTML escaping, citation chips, previews.
- GitHub Actions CI: API tests, 57 RAG unit tests (without the ML packages, which the
  tests stub) and the frontend lint, tests and build.

### Measured on the server (Oracle VM: 1 GB RAM, 2 burstable AMD vCPUs, 2 GB swap)

Same questions sent to the RAG service on the VM (`/api/query`, not streamed):

| Version | Time per question | Bike theft question cites |
|---|---:|---|
| Before deploy (old code, 18 Acts) | 10.1 s, 16.7 s | BNS 304 (snatching), BNSS 129 (wrong) |
| New, hybrid without reranker | 2.7-6 s | BNS 112 (organised crime, wrong) |
| New, reranker 10 x 400 chars | 7.5-10 s | BNS 303 + 112 |
| **New, int8 reranker (chosen)** | **10-15 s** | **BNS 305 (theft of a vehicle, right)** |

- With the int8 reranker every test question cited the right section (BNS 305, RTI Act
  s.6, BNSS 173, IT Act 66C, Contract Act s.11, Constitution Art. 21).
- The reranker costs about 8 s per question on this CPU (0.4 s on the laptop). One torch
  thread instead of two made no difference: the VM's CPU is the limit.
- Memory: legal-rag holds 330-490 MB resident, under `MemoryHigh=650M`; the VM uses about
  1.4 GB of swap overall (RollOne shares the VM). RollOne stayed up throughout.
- Model load after a restart: about 140 s, now done in the background.
- Through nginx and Node the answer streams (first bytes after about 1.5 s, then the
  status line until search finishes).

### Hosted reranker (23 Oct)

The reranker was the 8 s step, so it now runs on Jina's API (`jina-reranker-v2-base-multilingual`)
when `JINA_API_KEY` is set, with the local cross-encoder as the fallback (loaded only if a
call fails). Jina's free tier allows 100K tokens per minute; passages are cut to 1,000
characters (about what the local model reads), so about 19 questions a minute fit before
the fallback takes over.

Retrieval eval, 115 questions, same settings (expansion off), paced under the rate limit,
0 fallbacks:

| | Local MiniLM cross-encoder | Jina hosted |
|---|---:|---:|
| Recall@1 | 0.522 | **0.583** |
| Recall@5 | 0.765 | **0.791** |
| Recall@10 | 0.835 | 0.826 |
| MRR | 0.631 | **0.676** |

On the server the answer model was also switched to `gpt-oss-120b` first (20b as fallback):
same speed on Groq (~1 s), and the 20b had declined an answerable question ("fake Instagram
account" with BNS 319 and IT Act 66C retrieved).

Server, questions spaced like real traffic: **1.4-4.5 s per answer** (retrieval 0.7-2.6 s),
down from 10-15 s. Bursts above the Groq free tier's ~8K tokens per minute (several
questions within a minute) still slow the answer step; the first question after a restart
is slower while memory pages back in.

