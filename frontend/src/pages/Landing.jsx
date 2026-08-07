import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale, BookOpen, Shield, MessageSquare, ArrowRight, Lock, Search } from 'lucide-react';
import { authService } from '../services/api';

/* ── Scroll-reveal hook ─────────────────────────────────── */
function useReveal() {
    const ref = useRef(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { el.classList.add('visible'); observer.unobserve(el); } },
            { threshold: 0.15 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return ref;
}
function Reveal({ children, className = '', delay = 0, style }) {
    const ref = useReveal();
    const delayClass = delay ? `reveal-d${delay}` : '';
    return <div ref={ref} className={`reveal ${delayClass} ${className}`} style={style}>{children}</div>;
}

/* ── Static chat mockup ─────────────────────────────────── */
function ProductMockup() {
    return (
        <div className="product-mockup">
            <div className="mockup-bar">
                <div className="mockup-dot"></div>
                <div className="mockup-dot"></div>
                <div className="mockup-dot"></div>
                <span style={{ marginLeft: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Legal Query — Aadhaar Act</span>
            </div>
            <div className="mockup-body">
                {/* User question */}
                <div className="mock-msg mock-user">
                    <div className="mock-avatar">S</div>
                    <div className="mock-bubble">
                        What is the penalty for impersonation under the Aadhaar Act?
                    </div>
                </div>

                {/* AI answer */}
                <div className="mock-msg mock-ai">
                    <div className="mock-avatar"><Scale size={14} /></div>
                    <div className="mock-bubble">
                        Under the Aadhaar (Targeted Delivery of Financial and Other Subsidies, Benefits and Services) Act, 2016, impersonation is addressed in <strong>Section 35</strong>.<br /><br />
                        Whoever impersonates or attempts to impersonate another person, whether dead or alive, real or imaginary, by providing any false demographic or biometric information, shall be punishable with <strong>imprisonment for up to three years</strong> or a <strong>fine of up to ₹10,000</strong>, or both.
                    </div>
                </div>

                {/* Source citation */}
                <div style={{ marginLeft: '44px', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                    <BookOpen size={13} color="var(--accent-gold)" />
                    <span><strong style={{ color: 'var(--text-secondary)' }}>Source:</strong> Aadhaar Act, 2016 — Section 35 · 98% match</span>
                </div>
            </div>
        </div>
    );
}

/* ── Feature visual — code-like snippet ─────────────────── */
function CitationVisual() {
    return (
        <div className="product-mockup" style={{ fontSize: '0.82rem' }}>
            <div className="mockup-bar">
                <div className="mockup-dot"></div><div className="mockup-dot"></div><div className="mockup-dot"></div>
                <span style={{ marginLeft: '12px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Response Detail</span>
            </div>
            <div style={{ padding: '1.25rem' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.75rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cited Sources</div>
                {[
                    { act: 'Aadhaar Act, 2016', section: 'Section 35', title: 'Penalty for impersonation', match: '98%' },
                    { act: 'Aadhaar Act, 2016', section: 'Section 40', title: 'Penalty for unauthorised access', match: '87%' },
                ].map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0.7rem 0', borderTop: i > 0 ? '1px solid var(--border-color)' : 'none' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent-gold-transparent)', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.82rem' }}>{s.act}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{s.section}: {s.title}</div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--accent-gold)', fontWeight: 600, flexShrink: 0 }}>{s.match}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PrivacyVisual() {
    const items = ['OTP email verification', 'Bcrypt password hashing (salt 12)', 'JWT session tokens', 'Isolated user data'];
    return (
        <div className="product-mockup" style={{ fontSize: '0.82rem' }}>
            <div className="mockup-bar">
                <div className="mockup-dot"></div><div className="mockup-dot"></div><div className="mockup-dot"></div>
                <span style={{ marginLeft: '12px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Security Overview</span>
            </div>
            <div style={{ padding: '1.25rem' }}>
                {items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0.65rem 0', borderTop: i > 0 ? '1px solid var(--border-color)' : 'none' }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Lock size={11} color="#10b981" />
                        </div>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{item}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ── Main Landing ───────────────────────────────────────── */
export default function Landing() {
    const navigate = useNavigate();
    const isAuth = authService.isAuthenticated();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 40);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const go = useCallback((path) => () => navigate(path), [navigate]);

    return (
        <div style={{ backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>

            {/* ── Navbar ─────────────────────────────────── */}
            <nav className={`landing-nav ${scrolled ? 'scrolled' : ''}`}>
                <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                        <Scale size={22} color="var(--accent-gold)" />
                        <span style={{ fontWeight: 700, fontSize: '1.15rem', color: '#fff', letterSpacing: '-0.02em' }}>OpenForge</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        {!isAuth && (
                            <button className="btn" style={{ background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.9rem', padding: '0.5rem 1rem' }} onClick={go('/login')}>
                                Sign In
                            </button>
                        )}
                        <button className="btn btn-primary" style={{ fontSize: '0.9rem', padding: '0.6rem 1.25rem' }} onClick={go(isAuth ? '/dashboard' : '/signup')}>
                            {isAuth ? 'Dashboard' : 'Get Started'}
                        </button>
                    </div>
                </div>
            </nav>

            {/* ── Hero ────────────────────────────────────── */}
            <section style={{ paddingTop: '140px', paddingBottom: '60px', position: 'relative' }}>
                {/* Single subtle ambient glow */}
                <div style={{ position: 'absolute', top: '5%', left: '50%', transform: 'translateX(-50%)', width: '60%', height: '400px', background: 'radial-gradient(ellipse, rgba(6,182,212,0.06) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

                <div className="container" style={{ position: 'relative', zIndex: 1 }}>
                    <div className="landing-hero-grid" style={{ display: 'flex', alignItems: 'center', gap: '4rem' }}>

                        {/* Text */}
                        <div style={{ flex: '1 1 480px', maxWidth: '540px' }}>
                            <Reveal>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '1.25rem', fontWeight: 500 }}>
                                    Legal Research, Reimagined
                                </p>
                            </Reveal>
                            <Reveal delay={1}>
                                <h1 style={{ fontSize: 'clamp(2.25rem, 4.5vw, 3.5rem)', lineHeight: 1.12, marginBottom: '1.5rem', fontWeight: 700, letterSpacing: '-0.03em', color: '#fff' }}>
                                    Ask a question.<br />Get the exact statute.
                                </h1>
                            </Reveal>
                            <Reveal delay={2}>
                                <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '2.5rem', lineHeight: 1.7, maxWidth: '460px' }}>
                                    Query Indian statutory laws in plain language and receive answers with precise section citations — not AI hallucinations.
                                </p>
                            </Reveal>
                            <Reveal delay={3}>
                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    <button className="btn btn-primary" style={{ padding: '0.85rem 1.75rem', fontSize: '1rem' }} onClick={go(isAuth ? '/dashboard' : '/signup')}>
                                        Start for free <ArrowRight size={16} />
                                    </button>
                                    <button className="btn btn-secondary" style={{ padding: '0.85rem 1.75rem', fontSize: '1rem' }} onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}>
                                        See it in action
                                    </button>
                                </div>
                            </Reveal>
                        </div>

                        {/* Product mockup */}
                        <div style={{ flex: '1 1 440px', minWidth: 0 }}>
                            <Reveal delay={2}>
                                <ProductMockup />
                            </Reveal>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Trust bar ───────────────────────────────── */}
            <section style={{ position: 'relative', zIndex: 1 }}>
                <div className="container">
                    <Reveal>
                        <div className="trust-bar">
                            <div className="trust-item"><div className="trust-value">50+</div><div className="trust-label">Indian Statutes</div></div>
                            <div className="trust-item"><div className="trust-value">Exact</div><div className="trust-label">Section Citations</div></div>
                            <div className="trust-item"><div className="trust-value">&lt; 3s</div><div className="trust-label">Response Time</div></div>
                            <div className="trust-item"><div className="trust-value">AES-256</div><div className="trust-label">Encrypted</div></div>
                        </div>
                    </Reveal>
                </div>
            </section>

            {/* ── Features ────────────────────────────────── */}
            <section style={{ padding: '80px 0', position: 'relative', zIndex: 1 }}>
                <div className="container">
                    <Reveal>
                        <p style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '0.5rem' }}>Features</p>
                        <h2 style={{ textAlign: 'center', fontSize: '2.25rem', letterSpacing: '-0.02em', marginBottom: '4rem', fontWeight: 600 }}>
                            Built for accuracy, not hype.
                        </h2>
                    </Reveal>

                    {/* Feature 1 */}
                    <Reveal>
                        <div className="feature-row">
                            <div className="feature-text">
                                <div className="feature-icon" style={{ background: 'var(--accent-gold-transparent)', border: '1px solid rgba(6,182,212,0.2)' }}>
                                    <BookOpen size={22} color="var(--accent-gold)" />
                                </div>
                                <h3>Every answer cites the source.</h3>
                                <p>Responses include the precise Section number, full clause text, and a similarity score. No hand-waving. You can verify every claim against the original statute in one click.</p>
                            </div>
                            <div className="feature-visual">
                                <CitationVisual />
                            </div>
                        </div>
                    </Reveal>

                    {/* Feature 2 */}
                    <Reveal>
                        <div className="feature-row reverse">
                            <div className="feature-text">
                                <div className="feature-icon" style={{ background: 'var(--accent-emerald-transparent)', border: '1px solid rgba(59,130,246,0.2)' }}>
                                    <Search size={22} color="var(--accent-emerald)" />
                                </div>
                                <h3>Ask in your own words.</h3>
                                <p>No need to memorize legal terminology. Type your question in plain English or Hindi. The retrieval engine converts your intent into a semantic vector and finds the most relevant clauses across the entire corpus.</p>
                            </div>
                            <div className="feature-visual">
                                <div className="product-mockup" style={{ padding: '1.5rem' }}>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Example queries</div>
                                        {[
                                            'What happens if someone misuses my Aadhaar?',
                                            'Can biometric data be shared with private companies?',
                                            'How is the UIDAI constituted?',
                                        ].map((q, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0.7rem 0.75rem', background: i === 0 ? 'rgba(6,182,212,0.06)' : 'transparent', borderRadius: '8px', marginBottom: '0.25rem', border: i === 0 ? '1px solid rgba(6,182,212,0.12)' : '1px solid transparent' }}>
                                                <MessageSquare size={14} color={i === 0 ? 'var(--accent-gold)' : 'var(--text-muted)'} />
                                                <span style={{ color: i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '0.82rem' }}>{q}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Reveal>

                    {/* Feature 3 */}
                    <Reveal>
                        <div className="feature-row">
                            <div className="feature-text">
                                <div className="feature-icon" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                    <Shield size={22} color="#10b981" />
                                </div>
                                <h3>Your data stays yours.</h3>
                                <p>Email verified via OTP. Passwords hashed with bcrypt. Sessions isolated per user. Your research queries are never shared, sold, or used to train models.</p>
                            </div>
                            <div className="feature-visual">
                                <PrivacyVisual />
                            </div>
                        </div>
                    </Reveal>
                </div>
            </section>

            {/* ── Demo CTA ────────────────────────────────── */}
            <section id="demo" style={{ padding: '80px 0', position: 'relative', zIndex: 1 }}>
                <div className="container" style={{ maxWidth: '720px' }}>
                    <Reveal>
                        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                            <h2 style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: '1rem' }}>See it for yourself.</h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: '480px', margin: '0 auto' }}>Here is a real conversation with our system. Every answer traces back to the original legal text.</p>
                        </div>
                    </Reveal>
                    <Reveal delay={1}>
                        <ProductMockup />
                    </Reveal>
                    <Reveal delay={2}>
                        <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
                            <button className="btn btn-primary" style={{ padding: '0.85rem 2rem', fontSize: '1rem' }} onClick={go(isAuth ? '/dashboard' : '/signup')}>
                                Try it yourself — it's free <ArrowRight size={16} />
                            </button>
                        </div>
                    </Reveal>
                </div>
            </section>

            {/* ── Footer ──────────────────────────────────── */}
            <footer style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '2.5rem 0' }}>
                <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Scale size={18} color="var(--text-muted)" />
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>OpenForge</span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        &copy; {new Date().getFullYear()} OpenForge. All rights reserved.
                    </div>
                </div>
            </footer>
        </div>
    );
}
