"""
Unit tests for the Week 3 retrieval/answer pieces. No model downloads, no Groq calls.
Run from backend/rag_model:  python -m unittest discover -s tests -v
"""

import json
import os
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.pop("FASTTEXT_LID_MODEL", None)   # test the script rules on their own

import answer_utils  # noqa: E402
import language  # noqa: E402
import query_understanding as qu  # noqa: E402
import sections  # noqa: E402


class SectionParserTests(unittest.TestCase):
    def test_sections_without_a_space_after_the_number(self):
        # The 2023 codes: "303.(1) Whoever ..." - the old chunker missed these
        text = ("CHAPTER XVII\nOF OFFENCES AGAINST PROPERTY\n"
                "1.(1) This Act may be called the Sanhita.\n(2) It extends to the whole of India.\n"
                "303.(1) Whoever, intending to take dishonestly any movable property ... is said to commit theft.\n"
                "304.(1) Theft is snatching if, in order to commit theft, the offender suddenly seizes ...\n")
        parsed = sections.parse_act(text)
        self.assertEqual([s.number for s in parsed.sections], ["1", "303", "304"])
        self.assertIn("commit theft", sections.find_section(parsed, "303").text)
        self.assertNotIn("snatching", sections.find_section(parsed, "303").text)

    def test_table_of_contents_and_footnotes_are_not_sections(self):
        text = ("ARRANGEMENT OF SECTIONS\n1. Short title.\n2. Interpretation clause.\n3. Theft.\n"
                "1. Short title.—This Act may be called the Test Act.\n"
                "2. Interpretation clause.—In this Act, unless the context otherwise requires, words mean things.\n"
                "1. Subs. by Act 10 of 2009, s. 2, for certain words (w.e.f. 27-10-2009).\n"
                "3. Theft.—Whoever takes property dishonestly commits theft and shall be punished.\n")
        parsed = sections.parse_act(text)
        self.assertEqual([s.number for s in parsed.sections], ["1", "2", "3"])
        self.assertTrue(sections.find_section(parsed, "2").text.startswith("2. Interpretation clause.—In this Act"))
        self.assertNotIn("Subs. by Act", sections.find_section(parsed, "2").text)
        self.assertEqual(sections.find_section(parsed, "3").title, "Theft")

    def test_margin_notes_become_titles_and_leave_the_text(self):
        # Gazette layout: a page's margin notes come last, glued to the last body line
        text = ("----- PAGE 1 -----\n"
                "301.Whoever trespasses in any place of worship or burial place shall be punished.\n"
                "302.Whoever utters any word with deliberate intent to wound religious feelings shall\n"
                "be punished with imprisonment for a term which may extend to one year.\n"
                "303.(1) Whoever, intending to take dishonestly any movable property, commits theft and\n"
                "is punished under this section with imprisonment and fine.Trespassing on\n"
                "burial places,\netc.\nUttering words,\netc., with\ndeliberate\nintent.\n"
                "Theft.78THE GAZETTE OF INDIA EXTRAORDINARY[Part II\n"
                "----- PAGE 2 -----\n"
                "304.(1) Theft is snatching if the offender suddenly seizes the property.Snatching.79THE GAZETTE OF INDIA\n")
        parsed = sections.parse_act(text)
        titles = {s.number: s.title for s in parsed.sections}
        self.assertEqual(titles, {"301": "Trespassing on burial places, etc.",
                                  "302": "Uttering words, etc., with deliberate intent",
                                  "303": "Theft", "304": "Snatching"})
        self.assertNotIn("Trespassing on", sections.find_section(parsed, "303").text)
        self.assertNotIn("GAZETTE", sections.find_section(parsed, "303").text)

    def test_margin_notes_are_skipped_when_counts_do_not_match(self):
        text = ("----- PAGE 1 -----\n"
                "10.Whoever does the first thing shall be punished with a fine of some amount.\n"
                "11.Whoever does the second thing shall be punished with a fine of some amount.\n"
                "Only one\nnote.\n5THE GAZETTE OF INDIA\n")
        self.assertEqual({s.title for s in sections.parse_act(text).sections}, {""})

    def test_amended_section_with_bracket_marker(self):
        text = ("1. Short title.—This is the Act and it has some body text here.\n"
                "2[10. Specific performance in respect of contracts.—The specific performance shall be enforced.]\n")
        parsed = sections.parse_act(text)
        self.assertEqual([s.number for s in parsed.sections], ["1", "10"])

    def test_letter_suffixes_keep_order(self):
        self.assertLess(sections.ordinal("66"), sections.ordinal("66", "A"))
        self.assertLess(sections.ordinal("66", "A"), sections.ordinal("66", "B"))
        self.assertLess(sections.ordinal("66", "AA"), sections.ordinal("66", "B"))
        self.assertLess(sections.ordinal("66", "Z"), sections.ordinal("67"))

    def test_schedule_is_not_swallowed_by_the_last_section(self):
        text = ("1. Short title.—This Act may be called the Test Act and so on and so forth.\n"
                "2. Last section.—This is the final section of the Act.\n"
                "THE FIRST SCHEDULE\nForm of something very long " + "lorem ipsum " * 50 + "\n")
        parsed = sections.parse_act(text)
        self.assertNotIn("FIRST SCHEDULE", sections.find_section(parsed, "2").text)
        self.assertTrue(any("FIRST SCHEDULE" in heading for heading, _ in parsed.extra))


class ChunkTests(unittest.TestCase):
    def test_chunk_ids_are_stable_and_unique(self):
        from ingest import chunk_legal_text, context_header
        text = ("1. Short title.—This Act may be called the Test Act and it extends to India.\n"
                "2. Long section.—" + "Whoever does a thing shall be punished. " * 80 + "\n")
        chunks = chunk_legal_text(text, "test_act_2020.txt", "Test Act, 2020", "2020")
        ids = [c["metadata"]["chunk_id"] for c in chunks]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(ids, [c["metadata"]["chunk_id"] for c in
                               chunk_legal_text(text, "test_act_2020.txt", "Test Act, 2020", "2020")])
        self.assertIn("test_act_2020::s2::p2", ids)
        self.assertEqual(context_header(chunks[0]["metadata"]), "Test Act, 2020 - Section 1: Short title")


class LanguageTests(unittest.TestCase):
    def test_scripts(self):
        cases = {
            "ସୂଚନା ଅଧିକାର ଆଇନରେ ଉତ୍ତର": "or",
            "চুৰি কৰাৰ শাস্তি কি?": "as",          # ৰ only exists in Assamese
            "চুরি করার শাস্তি কী?": "bn",
            "குழந்தைகளுக்கு எதிரான": "ta",
            "મારા પતિ દહેજ માટે": "gu",
            "ᱟᱢᱟᱜ ᱧᱩᱛᱩᱢ ᱪᱮᱫ": "sat",              # Ol Chiki
            "चोरी की सज़ा क्या है?": "hi",
            "हेल्मेट न घालता दुचाकी चालवल्यास काय दंड आहे?": "mr",
            "What is the punishment for theft?": "en",
        }
        for text, expected in cases.items():
            self.assertEqual(language.detect_language(text)[0], expected, text)

    def test_hinglish(self):
        self.assertEqual(language.detect_language("mera phone chori ho gaya, police kya karegi?")[0], "hinglish")

    def test_ui_choice_is_respected_for_latin_text_but_not_other_scripts(self):
        self.assertEqual(language.resolve_language("what is bail", "hi")[0], "hi")
        self.assertEqual(language.resolve_language("ଜାମିନ କଣ?", "hi")[0], "or")
        self.assertEqual(language.resolve_language("जमानत क्या है", "mr")[0], "mr")   # same script: trust the user
        self.assertEqual(language.resolve_language("what is bail", None)[0], "en")
        self.assertEqual(language.resolve_language("what is bail", "klingon")[0], "en")

    def test_short_hindi_follow_up_is_not_marathi(self):
        self.assertEqual(language.detect_language("अगर वह नाबालिग हो तो?")[0], "hi")
        self.assertEqual(language.resolve_language("अगर वह नाबालिग हो तो?", None, "hi")[0], "hi")
        # a Marathi conversation keeps Marathi for a short same-script follow-up
        self.assertEqual(language.resolve_language("अगर वह नाबालिग हो तो?", None, "mr")[0], "mr")
        # but a switch of script is a switch of language
        self.assertEqual(language.resolve_language("What about a minor?", None, "hi")[0], "en")

    def test_deterministic(self):
        text = "मुझे तलाक के बारे में बताओ"
        self.assertEqual({language.detect_language(text) for _ in range(20)}, {language.detect_language(text)})


class FakeLLM:
    def __init__(self, content=None, error=None):
        self.calls = 0
        self.content, self.error = content, error
        self.chat = types.SimpleNamespace(completions=self)

    def create(self, **kwargs):
        self.calls += 1
        if self.error:
            raise self.error
        msg = types.SimpleNamespace(content=self.content)
        return types.SimpleNamespace(choices=[types.SimpleNamespace(message=msg, finish_reason="stop")])


class QueryUnderstandingTests(unittest.TestCase):
    def test_acts_and_section_refs(self):
        self.assertEqual(qu.detect_acts("punishment under IPC"), ["bharatiya_nyaya_sanhita_2023"])
        self.assertEqual(qu.detect_acts("Section 66C IT Act"), ["information_technology_act_2000"])
        self.assertIn("constitution_of_india_2024_english", qu.detect_acts("what does Article 21 say"))
        self.assertEqual(qu.section_refs("Section 13B and sec. 9 and Article 21A"), ["13B", "9", "21A"])

    def test_abbreviations_are_spelled_out_for_search(self):
        self.assertEqual(qu.spell_out("How do I file an RTI application?"),
                         "How do I file an RTI application? (Right to Information)")
        self.assertIn("first information report", qu.spell_out("police refused my FIR"))
        # already spelled out, or only part of another word: unchanged
        self.assertEqual(qu.spell_out("Right to Information RTI fee"), "Right to Information RTI fee")
        self.assertEqual(qu.spell_out("the firm is hiring"), "the firm is hiring")

    def test_contract_by_a_minor_gets_the_statute_wording(self):
        for q in ("Is a contract signed by a 16-year-old valid?", "Can a minor sign a loan agreement?"):
            self.assertIn("competent to contract", qu.spell_out(q))
        # a child in a criminal question is not a contract question
        self.assertNotIn("competent to contract", qu.spell_out("A 15 year old was assaulted, what is the punishment?"))

    def test_english_first_message_needs_no_llm_call_without_expansion(self):
        llm = FakeLLM()
        with mock.patch.dict(os.environ, {"QUERY_EXPANSION": "0"}):
            u = qu.understand("What is Section 303 of the BNS?", [], "en", llm, "m")
        self.assertEqual(llm.calls, 0)
        self.assertEqual(u.acts, ["bharatiya_nyaya_sanhita_2023"])
        self.assertEqual(u.section_refs, ["303"])

    def test_expansion_adds_legal_terms_in_one_call(self):
        llm = FakeLLM(json.dumps({"act": "Bharatiya Nyaya Sanhita", "legal_terms": ["theft", "dishonestly"]}))
        with mock.patch.dict(os.environ, {"QUERY_EXPANSION": "1"}):
            u = qu.understand("someone stole my bike", [], "en", llm, "m")
        self.assertEqual(llm.calls, 1)
        self.assertEqual(u.search_query, "someone stole my bike theft dishonestly")
        self.assertEqual(u.acts, ["bharatiya_nyaya_sanhita_2023"])

    def test_no_expansion_call_when_the_act_or_section_is_named(self):
        llm = FakeLLM(json.dumps({"act": "", "legal_terms": ["x"]}))
        with mock.patch.dict(os.environ, {"QUERY_EXPANSION": "1"}):
            u = qu.understand("What does Section 303 of the BNS say?", [], "en", llm, "m")
        self.assertEqual(llm.calls, 0)
        self.assertEqual(u.section_refs, ["303"])

    def test_expansion_failure_keeps_the_query(self):
        with mock.patch.dict(os.environ, {"QUERY_EXPANSION": "1"}):
            u = qu.understand("someone stole my bike", [], "en", FakeLLM(error=RuntimeError("timeout")), "m")
        self.assertEqual(u.search_query, "someone stole my bike")

    def test_follow_up_is_rewritten_in_one_call(self):
        llm = FakeLLM(json.dumps({"query": "punishment for identity theft under Section 66C IT Act",
                                  "act": "Information Technology Act"}))
        history = [{"role": "user", "content": "someone made a fake profile of me"},
                   {"role": "assistant", "content": "That is identity theft under Section 66C."}]
        u = qu.understand("what is the punishment?", history, "en", llm, "m")
        self.assertEqual(llm.calls, 1)
        self.assertIn("66C", u.section_refs)
        self.assertEqual(u.acts, ["information_technology_act_2000"])

    def test_small_talk_is_not_searched(self):
        for q in ("can i ask?", "Can I ask you a question?", "may i ask something", "hi", "Hello there!",
                  "thank you so much", "ok", "who are you?", "what can you do", "good morning", "I have a doubt"):
            llm = FakeLLM(json.dumps({"query": "x", "act": ""}))
            u = qu.understand(q, [{"role": "user", "content": "earlier"}], "en", llm, "m")
            self.assertTrue(u.small_talk, q)
            self.assertEqual(llm.calls, 0, q)
        for q in ("Can I ask my landlord to return the deposit?", "can i ask the police for a copy of the FIR",
                  "hi, my employer has not paid my salary", "what can you do if a cheque bounces",
                  "help me file a complaint against my neighbour"):
            self.assertFalse(qu.is_small_talk(q), q)

    def test_rewrite_failure_falls_back_to_the_raw_query(self):
        llm = FakeLLM(error=RuntimeError("429"))
        u = qu.understand("चोरी की सज़ा", [], "hi", llm, "m")
        self.assertEqual(u.search_query, "चोरी की सज़ा")
        self.assertTrue(u.error)


class FakeCollection:
    def __init__(self, docs):
        self.docs = docs   # [(id, text, meta)]

    def get(self, include=None):
        return {"ids": [d[0] for d in self.docs], "documents": [d[1] for d in self.docs],
                "metadatas": [d[2] for d in self.docs]}

    def query(self, query_embeddings, n_results, where=None, include=None):
        rows = [d for d in self.docs if not where or d[2]["source_file"] == where["source_file"]]
        return {"ids": [[d[0] for d in rows[:n_results]]], "distances": [[0.5] * len(rows[:n_results])]}


class FakeEmbedder:
    def encode(self, text):
        return types.SimpleNamespace(tolist=lambda: [0.0])


class RetrievalTests(unittest.TestCase):
    def setUp(self):
        from retrieval import HybridRetriever
        meta = lambda f, s, t: {"source_file": f, "section": s, "act_name": f, "section_title": t}  # noqa: E731
        docs = [
            ("a1", "Whoever commits murder shall be punished with death.", meta("bns.txt", "103", "Murder")),
            ("a2", "Whoever dishonestly takes movable property commits theft.", meta("bns.txt", "303", "Theft")),
            ("b1", "A computer resource used for identity theft is punishable.", meta("ita.txt", "66C", "Identity theft")),
        ]
        self.r = HybridRetriever(FakeCollection(docs), FakeEmbedder())

    def test_rrf_rewards_agreement(self):
        from retrieval import HybridRetriever
        fused = HybridRetriever.rrf([[1, 2, 3], [2, 1, 3], [2, 3]])
        self.assertEqual(fused[0][0], 2)

    def test_bm25_finds_exact_tokens(self):
        hits = self.r.search("identity theft 66C", variant="bm25")
        self.assertEqual(hits[0]["metadata"]["section"], "66C")

    def test_cited_section_comes_first(self):
        hits = self.r.search("what does it say", variant="hybrid", act_stems=["bns"], section_refs=["303"])
        self.assertEqual(hits[0]["metadata"]["section"], "303")

    def test_every_hit_appears_once(self):
        hits = self.r.search("theft", variant="hybrid", act_stems=["bns"])
        self.assertEqual(len({h["id"] for h in hits}), len(hits))


class HostedRerankerTests(unittest.TestCase):
    def make(self):
        from retrieval import HostedReranker
        r = HostedReranker("jina_secret", "jina-reranker-v2-base-multilingual", fallback_name="local-model",
                           timeout=1, max_chars=10)
        local = types.SimpleNamespace(score=mock.Mock(return_value=[0.1, 0.2]))
        r._local = lambda: local
        return r, local

    def test_scores_come_back_in_passage_order(self):
        r, local = self.make()
        resp = types.SimpleNamespace(status_code=200, json=lambda: {"results": [
            {"index": 1, "relevance_score": 0.9}, {"index": 0, "relevance_score": 0.3}]})
        with mock.patch("requests.post", return_value=resp) as post:
            self.assertEqual(r.score("theft", ["long passage one", "two"]), [0.3, 0.9])
        sent = post.call_args.kwargs["json"]["documents"]
        self.assertEqual(sent, ["long passa", "two"])          # trimmed to max_chars
        local.score.assert_not_called()

    def test_failures_fall_back_to_the_local_model_without_logging_the_key(self):
        r, local = self.make()
        for outcome in (types.SimpleNamespace(status_code=429, json=lambda: {}), TimeoutError("slow")):
            kwargs = {"return_value": outcome} if not isinstance(outcome, Exception) else {"side_effect": outcome}
            with mock.patch("requests.post", **kwargs), mock.patch("builtins.print") as log:
                self.assertEqual(r.score("q", ["a", "b"]), [0.1, 0.2])
            self.assertNotIn("jina_secret", str(log.call_args))

    def test_load_reranker_picks_hosted_only_with_a_key(self):
        import retrieval
        with mock.patch.dict(os.environ, {"JINA_API_KEY": "k", "RERANKER_PROVIDER": "jina"}):
            self.assertIsInstance(retrieval.load_reranker("m"), retrieval.HostedReranker)
        with mock.patch.dict(os.environ, {"JINA_API_KEY": "k", "RERANKER_PROVIDER": "local"}), \
                mock.patch.object(retrieval, "LocalReranker", return_value="local") as local:
            self.assertEqual(retrieval.load_reranker("m"), "local")
            local.assert_called_once_with("m")


class AnswerCheckTests(unittest.TestCase):
    def test_followups_are_split_off(self):
        answer, followups = answer_utils.split_followups(
            'Theft is punishable [1].\n<<FOLLOWUPS>> ["What about snatching?", "Is it bailable?"]')
        self.assertEqual(answer, "Theft is punishable [1].")
        self.assertEqual(followups, ["What about snatching?", "Is it bailable?"])
        self.assertEqual(answer_utils.split_followups("Just text")[1], [])
        self.assertEqual(answer_utils.split_followups("x <<FOLLOWUPS>> not json")[1], [])

    def test_native_gpt_oss_citations_are_normalized(self):
        self.assertEqual(answer_utils.normalize_citations("तीन साल【4】, fine【2†L3-L5】 and ［1］"),
                         "तीन साल[4], fine[2] and [1]")

    def test_hindi_section_mentions_are_checked(self):
        sources = [{"text": "304. snatching", "metadata": {"section": "304"}}]
        self.assertEqual(answer_utils.check_citations("सेक्शन 304 [1] और धारा 999 और §998", sources)[2], ["999", "998"])

    def test_invalid_markers_removed_and_unsupported_sections_flagged(self):
        sources = [{"text": "303. Whoever ... commits theft.", "metadata": {"section": "303"}}]
        clean, cited, unsupported = answer_utils.check_citations(
            "Theft is in Section 303 [1]. Robbery is in Section 309 [4].", sources)
        self.assertNotIn("[4]", clean)
        self.assertEqual(cited, [1])
        self.assertEqual(unsupported, ["309"])


class FetcherSafetyTests(unittest.TestCase):
    def test_only_https_indiacode_hosts(self):
        from indiacode_fetcher import is_indiacode_url
        self.assertTrue(is_indiacode_url("https://www.indiacode.nic.in/bitstream/123/1/a.pdf"))
        self.assertTrue(is_indiacode_url("https://indiacode.nic.in/x.pdf"))
        for bad in ["http://www.indiacode.nic.in/a.pdf", "https://indiacode.nic.in.evil.com/a.pdf",
                    "https://evil.com/?u=indiacode.nic.in", "https://evil.com/indiacode.nic.in.pdf",
                    "file:///etc/passwd", "https://user@evil.com\\@indiacode.nic.in/"]:
            self.assertFalse(is_indiacode_url(bad), bad)

    def test_download_refuses_other_hosts_without_a_request(self):
        import indiacode_fetcher
        with mock.patch.object(indiacode_fetcher.requests, "get") as get:
            self.assertEqual(indiacode_fetcher.download_pdf("https://evil.com/a.pdf", "x"), "")
            get.assert_not_called()

    def test_download_stops_at_the_size_cap(self):
        import tempfile
        import indiacode_fetcher

        class Resp:
            headers = {}

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def raise_for_status(self):
                pass

            def iter_content(self, chunk_size):
                yield b"%PDF-" + b"0" * 1000
                while True:
                    yield b"0" * 1000

        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(indiacode_fetcher, "INDIACODE_PDFS_DIR", Path(tmp)), \
                mock.patch.object(indiacode_fetcher.requests, "get", return_value=Resp()):
            path = indiacode_fetcher.download_pdf("https://www.indiacode.nic.in/a.pdf", "big act", max_bytes=10_000)
            self.assertEqual(path, "")
            self.assertEqual(list(Path(tmp).iterdir()), [])


if __name__ == "__main__":
    unittest.main()
