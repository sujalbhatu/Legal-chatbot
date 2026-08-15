import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale, BookOpen, Shield, MessageSquare, ArrowRight, Lock, Search, Sun, Moon } from 'lucide-react';
import { authService } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';

/* ── Scroll-reveal hook ─────────────────────────────── */
function useReveal() {
    const ref = useRef(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { el.classList.add('visible'); observer.unobserve(el); } },
            { threshold: 0.12 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return ref;
}
function Reveal({ children, className = '', delay = 0 }) {
    const ref = useReveal();
    const d = delay ? `reveal-d${delay}` : '';
    return <div ref={ref} className={`reveal ${d} ${className}`}>{children}</div>;
}

/* ── Chat mockup component ──────────────────────────── */
function ChatMockup() {
    return (
        <div className="l-mockup">
            <div className="l-mockup-bar">
                <div className="l-mockup-dot" />
                <div className="l-mockup-dot" />
                <div className="l-mockup-dot" />
                <span style={{ marginLeft: '10px', fontSize: '0.72rem', color: 'var(--l-text-muted)', fontWeight: 500 }}>
                    Legal Query — Aadhaar Act
                </span>
            </div>
            <div className="l-mockup-body">
                <div className="l-msg l-msg-user">
                    <div className="l-avatar">S</div>
                    <div className="l-bubble">What is the penalty for impersonation under the Aadhaar Act?</div>
                </div>
                <div className="l-msg l-msg-ai">
                    <div className="l-avatar"><Scale size={13} /></div>
                    <div className="l-bubble">
                        Under the Aadhaar Act, 2016, impersonation is addressed in <strong>Section 35</strong>.<br /><br />
                        Whoever impersonates another person by providing false demographic or biometric information shall be punishable with <strong>imprisonment up to three years</strong> or a <strong>fine up to ₹10,000</strong>, or both.
                    </div>
                </div>
                <div className="l-source-tag">
                    <BookOpen size={12} color="var(--l-gold)" />
                    <span><strong style={{ color: 'var(--l-text-secondary)' }}>Source:</strong> Aadhaar Act, 2016 — Section 35 · 98% match</span>
                </div>
            </div>
        </div>
    );
}

/* ── Feature visuals ────────────────────────────────── */
function CitationVisual() {
    const sources = [
        { act: 'Aadhaar Act, 2016', section: 'Section 35', title: 'Penalty for impersonation', match: '98%' },
        { act: 'Aadhaar Act, 2016', section: 'Section 40', title: 'Penalty for unauthorised access', match: '87%' },
        { act: 'Aadhaar Act, 2016', section: 'Section 37', title: 'Penalty for tampering with data', match: '72%' },
    ];
    return (
        <div className="l-mockup" style={{ fontSize: '0.82rem' }}>
            <div className="l-mockup-bar">
                <div className="l-mockup-dot" /><div className="l-mockup-dot" /><div className="l-mockup-dot" />
                <span style={{ marginLeft: '10px', fontSize: '0.68rem', color: 'var(--l-text-muted)' }}>Response — Sources</span>
            </div>
            <div style={{ padding: '1.15rem' }}>
                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--l-text-muted)', marginBottom: '0.6rem', fontWeight: 600 }}>Cited Sources</div>
                {sources.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0.6rem 0', borderTop: i ? `1px solid var(--l-border-light)` : 'none' }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--l-gold-light)', color: 'var(--l-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: 'var(--l-text)', fontWeight: 500, fontSize: '0.8rem' }}>{s.act}</div>
                            <div style={{ color: 'var(--l-text-muted)', fontSize: '0.7rem' }}>{s.section}: {s.title}</div>
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--l-accent)', fontWeight: 600, flexShrink: 0 }}>{s.match}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function QueriesVisual() {
    const queries = [
        'What happens if someone misuses my Aadhaar?',
        'Can biometric data be shared with private companies?',
        'How is the UIDAI constituted?',
    ];
    return (
        <div className="l-mockup">
            <div style={{ padding: '1.25rem' }}>
                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--l-text-muted)', marginBottom: '0.7rem', fontWeight: 600 }}>Example queries</div>
                {queries.map((q, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0.6rem 0.7rem', background: i === 0 ? 'var(--l-accent-light)' : 'transparent', borderRadius: '8px', marginBottom: '0.2rem', border: i === 0 ? '1px solid rgba(30,58,95,0.1)' : '1px solid transparent' }}>
                        <MessageSquare size={14} color={i === 0 ? 'var(--l-accent)' : 'var(--l-text-muted)'} />
                        <span style={{ color: i === 0 ? 'var(--l-text)' : 'var(--l-text-secondary)', fontSize: '0.8rem' }}>{q}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SecurityVisual() {
    const items = ['OTP email verification', 'Bcrypt password hashing (salt 12)', 'JWT session tokens', 'Isolated user data'];
    return (
        <div className="l-mockup">
            <div style={{ padding: '1.25rem' }}>
                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--l-text-muted)', marginBottom: '0.7rem', fontWeight: 600 }}>Security Layers</div>
                {items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0.55rem 0', borderTop: i ? '1px solid var(--l-border-light)' : 'none' }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '5px', background: 'rgba(22,163,74,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Lock size={11} color="#16a34a" />
                        </div>
                        <span style={{ color: 'var(--l-text-secondary)', fontSize: '0.8rem' }}>{item}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════
   Main Landing Component
   ════════════════════════════════════════════════════════ */
export default function Landing() {
    const navigate = useNavigate();
    const isAuth = authService.isAuthenticated();
    const [scrolled, setScrolled] = useState(false);
    const { theme, toggleTheme } = useTheme();

    useEffect(() => {
        const fn = () => setScrolled(window.scrollY > 40);
        window.addEventListener('scroll', fn, { passive: true });
        return () => window.removeEventListener('scroll', fn);
    }, []);

    const go = useCallback((p) => () => navigate(p), [navigate]);

    return (
        <div className="landing">

            {/* ── Nav ────────────────────────────────── */}
            <nav className={`l-nav ${scrolled ? 'scrolled' : ''}`}>
                <div className="l-nav-inner">
                    <div className="l-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                        <Scale size={20} color="var(--l-accent)" />
                        <span>OpenForge</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button className="l-btn l-btn-ghost" onClick={toggleTheme} style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                        {!isAuth && <button className="l-btn l-btn-ghost" onClick={go('/login')}>Sign In</button>}
                        <button className="l-btn l-btn-primary" onClick={go(isAuth ? '/dashboard' : '/signup')}>
                            {isAuth ? 'Dashboard' : 'Get Started'}
                        </button>
                    </div>
                </div>
            </nav>

            {/* ── Hero ───────────────────────────────── */}
            <section className="l-hero">
                <div className="l-section">
                    <div className="l-hero-grid">
                        <div className="l-hero-text">
                            <Reveal>
                                <div className="l-hero-tag">
                                    <Scale size={12} /> Legal Research Tool
                                </div>
                            </Reveal>
                            <Reveal delay={1}>
                                <h1>Ask a question.<br />Get the exact statute.</h1>
                            </Reveal>
                            <Reveal delay={2}>
                                <p>Query Indian statutory laws in plain language. Receive answers backed by precise section citations — not guesswork.</p>
                            </Reveal>
                            <Reveal delay={3}>
                                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                                    <button className="l-btn l-btn-primary l-btn-lg" onClick={go(isAuth ? '/dashboard' : '/signup')}>
                                        Start for free <ArrowRight size={15} />
                                    </button>
                                    <button className="l-btn l-btn-secondary l-btn-lg" onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}>
                                        See it in action
                                    </button>
                                </div>
                            </Reveal>
                        </div>
                        <div className="l-hero-visual">
                            <Reveal delay={2}>
                                <ChatMockup />
                            </Reveal>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Trust Bar ──────────────────────────── */}
            <div className="l-section">
                <Reveal>
                    <div className="l-trust">
                        <div className="l-trust-item"><div className="l-trust-val">50+</div><div className="l-trust-label">Indian Statutes</div></div>
                        <div className="l-trust-item"><div className="l-trust-val">Exact</div><div className="l-trust-label">Section Citations</div></div>
                        <div className="l-trust-item"><div className="l-trust-val">&lt; 3s</div><div className="l-trust-label">Response Time</div></div>
                        <div className="l-trust-item"><div className="l-trust-val">Encrypted</div><div className="l-trust-label">End-to-End</div></div>
                    </div>
                </Reveal>
            </div>

            {/* ── Features ───────────────────────────── */}
            <section style={{ padding: '4rem 0 2rem' }}>
                <div className="l-section">
                    <Reveal>
                        <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--l-text-muted)', textAlign: 'center', marginBottom: '0.4rem', fontWeight: 600 }}>Features</p>
                        <h2 style={{ textAlign: 'center', fontSize: '2rem', letterSpacing: '-0.02em', marginBottom: '3rem', fontWeight: 600 }}>
                            Built for accuracy, not hype.
                        </h2>
                    </Reveal>

                    {/* Feature 1 */}
                    <Reveal>
                        <div className="l-feature-row">
                            <div className="l-feature-text">
                                <div className="l-feature-icon" style={{ background: 'var(--l-accent-light)' }}>
                                    <BookOpen size={20} color="var(--l-accent)" />
                                </div>
                                <h3>Every answer cites the source.</h3>
                                <p>Responses include the precise Section number, full clause text, and a similarity score. You can verify every claim against the original statute in one click.</p>
                            </div>
                            <div className="l-feature-visual"><CitationVisual /></div>
                        </div>
                    </Reveal>

                    {/* Feature 2 */}
                    <Reveal>
                        <div className="l-feature-row reverse">
                            <div className="l-feature-text">
                                <div className="l-feature-icon" style={{ background: 'var(--l-gold-light)' }}>
                                    <Search size={20} color="var(--l-gold)" />
                                </div>
                                <h3>Ask in your own words.</h3>
                                <p>No legal jargon required. Type your question naturally. The retrieval engine converts your intent into a semantic vector and finds the most relevant clauses across the full corpus.</p>
                            </div>
                            <div className="l-feature-visual"><QueriesVisual /></div>
                        </div>
                    </Reveal>

                    {/* Feature 3 */}
                    <Reveal>
                        <div className="l-feature-row">
                            <div className="l-feature-text">
                                <div className="l-feature-icon" style={{ background: 'rgba(22,163,74,0.07)' }}>
                                    <Shield size={20} color="#16a34a" />
                                </div>
                                <h3>Your data stays yours.</h3>
                                <p>Email verified via OTP. Passwords hashed with bcrypt. Sessions isolated per user. Your research queries are never shared, sold, or used to train models.</p>
                            </div>
                            <div className="l-feature-visual"><SecurityVisual /></div>
                        </div>
                    </Reveal>
                </div>
            </section>

            {/* ── Demo CTA ───────────────────────────── */}
            <section id="demo">
                <div className="l-section">
                    <Reveal>
                        <div className="l-cta-section">
                            <h2>See it for yourself.</h2>
                            <p>Every answer traces back to the original legal text. No hallucinations. No guesswork.</p>
                            <button className="l-btn l-btn-primary l-btn-lg" onClick={go(isAuth ? '/dashboard' : '/signup')}>
                                Try it free <ArrowRight size={15} />
                            </button>
                        </div>
                    </Reveal>
                </div>
            </section>

            {/* ── Footer ─────────────────────────────── */}
            <footer>
                <div className="l-section">
                    <div className="l-footer">
                        <div className="l-footer-logo"><Scale size={16} /> OpenForge</div>
                        <div className="l-footer-copy">&copy; {new Date().getFullYear()} OpenForge. All rights reserved.</div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
