import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    ArrowRight, BookOpen, Languages, MessageSquareQuote, SearchCheck, ShieldCheck, Sparkles, Sun, Moon,
    ChevronDown, Zap, FileSearch, Scale, CornerDownLeft, UserRound, Lock
} from 'lucide-react';
import { authService } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { Logo, TopicIcon } from '../components/Brand';
import { TOPICS, LANGUAGE_SAMPLES, STATS, FAQ } from '../data/content';

/* Reveal sections as they scroll into view; content is visible anyway if the
   observer never fires (old browsers, screenshots, reduced motion). */
function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }) {
    const ref = useRef(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (!('IntersectionObserver' in window)) { el.classList.add('visible'); return; }
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) { el.classList.add('visible'); observer.disconnect(); }
        }, { threshold: 0.1 });
        observer.observe(el);
        const fallback = setTimeout(() => el.classList.add('visible'), 1500);
        return () => { observer.disconnect(); clearTimeout(fallback); };
    }, []);
    return <Tag ref={ref} className={`reveal ${delay ? `reveal-d${delay}` : ''} ${className}`}>{children}</Tag>;
}

/* The product, as it really answers: cited facts, clickable sources, follow-ups */
function AnswerPreview() {
    return (
        <div className="lp-preview" aria-label="Example answer">
            <div className="lp-preview-bar">
                <span className="lp-dot" /><span className="lp-dot" /><span className="lp-dot" />
                <span className="lp-preview-title">OpenForge</span>
            </div>
            <div className="lp-preview-body">
                <div className="lp-q">Someone snatched my phone from my hand. What is the punishment?</div>
                <div className="lp-a">
                    <div className="lp-a-head">Short answer</div>
                    <p>This is <strong>snatching</strong>, an offence under the Bharatiya Nyaya Sanhita, punishable with
                        imprisonment of up to <strong>three years</strong> and a fine <span className="cite-chip cite-chip-static">1</span>.</p>
                    <div className="lp-a-head">What you can do next</div>
                    <ul>
                        <li>File an FIR at the nearest police station</li>
                        <li>Share the phone&apos;s IMEI number with the police</li>
                    </ul>
                </div>
                <div className="lp-source">
                    <span className="lp-source-n">1</span>
                    <span className="lp-source-text">
                        <strong>Bharatiya Nyaya Sanhita, 2023</strong>
                        <span>Section 304: Snatching</span>
                    </span>
                    <span className="badge badge-success">Cited</span>
                </div>
                <div className="lp-chips">
                    <span className="lp-chip"><Sparkles size={12} /> Is snatching a bailable offence?</span>
                    <span className="lp-chip"><Sparkles size={12} /> How do I file an e-FIR?</span>
                </div>
            </div>
        </div>
    );
}

const STEPS = [
    { icon: MessageSquareQuote, title: 'Ask in your own words', text: 'Describe your situation in plain English or your own language. No legal jargon needed.' },
    { icon: FileSearch, title: 'We find the exact sections', text: 'Hybrid search reads across 123 Acts and picks the sections that actually apply to you.' },
    { icon: BookOpen, title: 'Get a cited answer', text: 'A short answer, what the law says, and your next steps, with every fact linked to its section.' },
];

const FEATURES = [
    { icon: BookOpen, title: 'Sources you can open', text: 'Tap any [1] in an answer to read the exact section it came from.' },
    { icon: SearchCheck, title: 'Honest when unsure', text: 'If the Acts don\'t cover your question, it says so instead of making something up.' },
    { icon: Languages, title: '14 languages', text: 'Hindi, Bengali, Marathi, Tamil, Odia, Assamese, Santali and more, auto-detected.' },
    { icon: Zap, title: 'Answers stream in', text: 'The first words appear in under 2.5 seconds, so you are never left staring at a spinner.' },
    { icon: Sparkles, title: 'Remembers the conversation', text: 'Ask follow-ups like "and if he is a minor?" and it keeps the context of your case.' },
    { icon: ShieldCheck, title: 'Private and secure', text: 'Verified accounts and conversations only you can see. Guest questions are not stored.' },
];

export default function Landing() {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const isAuth = authService.isAuthenticated();
    const [scrolled, setScrolled] = useState(false);
    const [question, setQuestion] = useState('');
    const [topic, setTopic] = useState(TOPICS[0].key);
    const [openFaq, setOpenFaq] = useState(0);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Signed-in users ask from their dashboard (saved); visitors use guest mode
    const ask = (q) => {
        const text = (q ?? question).trim();
        const target = isAuth ? '/dashboard' : '/try';
        navigate(text ? `${target}?ask=${encodeURIComponent(text)}` : target);
    };
    const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    const activeTopic = TOPICS.find(t => t.key === topic) || TOPICS[0];

    return (
        <div className="lp">
            {/* ── Navigation ─────────────────────────────── */}
            <header className={`lp-nav ${scrolled ? 'lp-nav-scrolled' : ''}`}>
                <div className="lp-container lp-nav-inner">
                    <Logo size={32} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
                    <nav className="lp-nav-links" aria-label="Sections">
                        <button type="button" onClick={() => scrollTo('how')}>How it works</button>
                        <button type="button" onClick={() => scrollTo('topics')}>What you can ask</button>
                        <button type="button" onClick={() => scrollTo('faq')}>FAQ</button>
                    </nav>
                    <div className="lp-nav-actions">
                        <button type="button" className="btn-icon" onClick={toggleTheme} aria-label="Toggle theme">
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                        {isAuth ? (
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/dashboard')}>
                                Dashboard <ArrowRight size={15} />
                            </button>
                        ) : (
                            <>
                                <Link to="/login" className="lp-signin">Sign in</Link>
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/try')}>
                                    Try free <ArrowRight size={15} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </header>

            {/* ── Hero ───────────────────────────────────── */}
            <section className="lp-hero">
                <div className="lp-container lp-hero-grid">
                    <div className="lp-hero-text">
                        <span className="lp-eyebrow"><Scale size={13} /> Indian law · 123 Acts · 14 languages</span>
                        <h1><span className="lp-nowrap">Understand Indian law</span><br /><span className="lp-accent">in plain language.</span></h1>
                        <p className="lp-lead">
                            Describe your situation and get a clear answer based on the actual text of Indian Acts,
                            with the exact sections cited so you can check every word.
                        </p>
                        <form className="lp-ask" onSubmit={(e) => { e.preventDefault(); ask(); }}>
                            <input
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                placeholder="e.g. My landlord won't return my deposit"
                                aria-label="Your legal question"
                                maxLength={2000}
                            />
                            <button type="submit" className="btn btn-primary">
                                Ask <CornerDownLeft size={16} />
                            </button>
                        </form>
                        <div className="lp-hero-meta">
                            <span><Lock size={13} /> No sign-up needed</span>
                            <span><BookOpen size={13} /> Every answer cites its sources</span>
                        </div>
                        <div className="lp-try-chips">
                            {['What are my rights if I am arrested?', 'How do I file an RTI application?', 'Is a non-compete clause valid?'].map(q => (
                                <button type="button" key={q} className="chip" onClick={() => ask(q)}>{q}</button>
                            ))}
                        </div>
                    </div>
                    <div className="lp-hero-visual">
                        <AnswerPreview />
                    </div>
                </div>
            </section>

            {/* ── Stats ──────────────────────────────────── */}
            <section className="lp-container">
                <Reveal className="lp-stats">
                    {STATS.map(s => (
                        <div className="lp-stat" key={s.label}>
                            <div className="lp-stat-value">{s.value}</div>
                            <div className="lp-stat-label">{s.label}</div>
                        </div>
                    ))}
                </Reveal>
            </section>

            {/* ── How it works ───────────────────────────── */}
            <section id="how" className="lp-section">
                <div className="lp-container">
                    <Reveal className="lp-heading">
                        <span className="lp-kicker">How it works</span>
                        <h2>From your question to the exact law, in seconds</h2>
                    </Reveal>
                    <div className="lp-steps">
                        {STEPS.map(({ icon: Icon, title, text }, i) => (
                            <Reveal key={title} delay={i + 1} className="lp-step">
                                <span className="lp-step-num">{i + 1}</span>
                                <span className="lp-step-icon"><Icon size={22} /></span>
                                <h3>{title}</h3>
                                <p>{text}</p>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Features ───────────────────────────────── */}
            <section className="lp-section lp-section-alt">
                <div className="lp-container">
                    <Reveal className="lp-heading">
                        <span className="lp-kicker">Why OpenForge</span>
                        <h2>Built to be trusted, not just to sound confident</h2>
                    </Reveal>
                    <div className="lp-features">
                        {FEATURES.map(({ icon: Icon, title, text }, i) => (
                            <Reveal key={title} delay={(i % 3) + 1} className="lp-feature">
                                <span className="lp-feature-icon"><Icon size={20} /></span>
                                <h3>{title}</h3>
                                <p>{text}</p>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Topics ─────────────────────────────────── */}
            <section id="topics" className="lp-section">
                <div className="lp-container">
                    <Reveal className="lp-heading">
                        <span className="lp-kicker">What you can ask</span>
                        <h2>Everyday legal questions, answered from the law itself</h2>
                    </Reveal>
                    <Reveal className="lp-topics">
                        <div className="lp-topic-tabs" role="tablist" aria-label="Topics">
                            {TOPICS.map(t => (
                                <button key={t.key} type="button" role="tab" aria-selected={topic === t.key}
                                    className={`lp-topic-tab ${topic === t.key ? 'active' : ''}`} onClick={() => setTopic(t.key)}>
                                    <TopicIcon name={t.icon} size={17} /> {t.label}
                                </button>
                            ))}
                        </div>
                        <div className="lp-topic-panel" role="tabpanel">
                            {activeTopic.questions.map(q => (
                                <button key={q} type="button" className="lp-topic-q" onClick={() => ask(q)}>
                                    <span>{q}</span>
                                    <span className="lp-topic-go">Ask <ArrowRight size={14} /></span>
                                </button>
                            ))}
                        </div>
                    </Reveal>
                </div>
            </section>

            {/* ── Languages ──────────────────────────────── */}
            <section className="lp-section lp-section-alt">
                <div className="lp-container">
                    <Reveal className="lp-heading">
                        <span className="lp-kicker">Your language</span>
                        <h2>Ask in the language you think in</h2>
                        <p>Language is detected automatically, or choose the answer language yourself.</p>
                    </Reveal>
                    <Reveal className="lp-langs">
                        {LANGUAGE_SAMPLES.map(l => <span key={l} className="lp-lang">{l}</span>)}
                    </Reveal>
                </div>
            </section>

            {/* ── FAQ ────────────────────────────────────── */}
            <section id="faq" className="lp-section">
                <div className="lp-container lp-faq-wrap">
                    <Reveal className="lp-heading lp-heading-left">
                        <span className="lp-kicker">FAQ</span>
                        <h2>Questions people ask first</h2>
                        <p>Still unsure? Ask OpenForge directly. It is free to try.</p>
                    </Reveal>
                    <div className="lp-faq">
                        {FAQ.map((item, i) => (
                            <div key={item.q} className={`lp-faq-item ${openFaq === i ? 'open' : ''}`}>
                                <button type="button" className="lp-faq-q" aria-expanded={openFaq === i}
                                    onClick={() => setOpenFaq(openFaq === i ? -1 : i)}>
                                    {item.q} <ChevronDown size={18} />
                                </button>
                                {openFaq === i && <p className="lp-faq-a">{item.a}</p>}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Final CTA ──────────────────────────────── */}
            <section className="lp-container">
                <Reveal className="lp-cta">
                    <div>
                        <h2>Have a legal question right now?</h2>
                        <p>Ask it free, without signing up. Create an account to save your conversations.</p>
                    </div>
                    <div className="lp-cta-actions">
                        <button type="button" className="btn lp-cta-primary" onClick={() => navigate(isAuth ? '/dashboard' : '/try')}>
                            Ask a question <ArrowRight size={16} />
                        </button>
                        {!isAuth && (
                            <button type="button" className="btn lp-cta-secondary" onClick={() => navigate('/signup')}>
                                <UserRound size={16} /> Create free account
                            </button>
                        )}
                    </div>
                </Reveal>
            </section>

            {/* ── Footer ─────────────────────────────────── */}
            <footer className="lp-footer">
                <div className="lp-container lp-footer-inner">
                    <div className="lp-footer-brand">
                        <Logo size={28} />
                        <p>Indian law in plain language, with sources.</p>
                    </div>
                    <nav className="lp-footer-links" aria-label="Footer">
                        <Link to="/try">Ask as guest</Link>
                        <Link to={isAuth ? '/dashboard' : '/signup'}>{isAuth ? 'Dashboard' : 'Create account'}</Link>
                        {!isAuth && <Link to="/login">Sign in</Link>}
                        <button type="button" onClick={() => scrollTo('faq')}>FAQ</button>
                    </nav>
                </div>
                <div className="lp-container lp-footer-legal">
                    <p>OpenForge provides general information about Indian law based on the text of Acts. It is not
                        legal advice and does not create a lawyer-client relationship. For your specific situation,
                        consult a qualified advocate.</p>
                    <p>© {new Date().getFullYear()} OpenForge</p>
                </div>
            </footer>
        </div>
    );
}
