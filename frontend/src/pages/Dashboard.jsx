import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Search, Trash2, RotateCcw, CheckCircle2, ArrowUp, AlertTriangle, Languages, ArrowRight, ArrowUpRight,
    Plus, MessageSquare, Scale, BookOpenCheck
} from 'lucide-react';
import { chatService, authService } from '../services/api';
import AppShell from '../components/AppShell';
import ConfirmDialog from '../components/ConfirmDialog';
import CommandPalette from '../components/CommandPalette';
import { TopicIcon } from '../components/Brand';
import { TOPICS, LANGUAGES, LIBRARY, LAW_AREAS } from '../data/content';
import { actInfo, citationLabel, uniqueCitations } from '../utils/acts';

const FILTERS = [['all', 'All'], ['open', 'Open'], ['resolved', 'Resolved']];
const POPULAR = [TOPICS[0].questions[1], TOPICS[2].questions[0], TOPICS[3].questions[0]];
// Typed into the empty question box, one after another
const EXAMPLES = [
    'My landlord is keeping my ₹40,000 deposit after I moved out…',
    'Someone is using my photos on a fake Instagram account…',
    'The police refused to register my FIR…',
    'My employer has not paid my salary for two months…',
];
const PREVIEW_CHARS = 240;  // the sessions API sends at most this much of the last message

/** The last message as one plain line: the short answer itself, without greeting, markdown or [n]. */
function plainPreview(text) {
    const t = text || '';
    const short = t.search(/\*\*Short answer\*\*/i);
    const plain = (short >= 0 ? t.slice(short).replace(/^\*\*Short answer\*\*/i, '') : t)
        .replace(/\[(\d+)\]/g, '')
        .replace(/[*_`#>]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return t.length >= PREVIEW_CHARS ? `${plain.replace(/\s+\S*$/, '')}…` : plain;
}

function timeLabel(dateString) {
    const d = new Date(dateString);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400 && d.getDate() === new Date().getDate()) {
        return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(d);
    }
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(d);
}

const readLanguage = () => {
    try { return localStorage.getItem('legal_lang') || 'auto'; } catch { return 'auto'; }
};
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Types EXAMPLES into a placeholder while `active`. */
function useTypedPlaceholder(active) {
    const [text, setText] = useState(EXAMPLES[0]);
    useEffect(() => {
        if (!active || reducedMotion()) { setText(EXAMPLES[0]); return undefined; }
        let i = 0, n = 0, deleting = false, timer;
        const tick = () => {
            const full = EXAMPLES[i];
            n += deleting ? -1 : 1;
            setText(full.slice(0, n) || ' ');
            let wait = deleting ? 18 : 42;
            if (!deleting && n >= full.length) { deleting = true; wait = 2200; }
            else if (deleting && n <= 0) { deleting = false; i = (i + 1) % EXAMPLES.length; wait = 350; }
            timer = setTimeout(tick, wait);
        };
        timer = setTimeout(tick, 600);
        return () => clearTimeout(timer);
    }, [active]);
    return text;
}

/** Ring showing resolved / total. */
function Ring({ value, total }) {
    const r = 26, c = 2 * Math.PI * r;
    const frac = total ? value / total : 0;
    return (
        <svg className="cd-ring" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r={r} className="cd-ring-track" />
            <circle cx="32" cy="32" r={r} className="cd-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
        </svg>
    );
}

export default function Dashboard() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [sessions, setSessions] = useState(null);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [question, setQuestion] = useState('');
    const [lens, setLens] = useState(null);           // a TOPICS entry whose example questions are shown
    const [focused, setFocused] = useState(false);
    const [language, setLanguage] = useState(readLanguage);
    const [starting, setStarting] = useState(false);
    const [toDelete, setToDelete] = useState(null);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const composerRef = useRef(null);
    const handledAsk = useRef(false);
    const user = authService.getCurrentUser();
    const firstName = (user?.name || '').trim().split(/\s+/)[0];
    const loading = sessions === null;
    const placeholder = useTypedPlaceholder(!question && !focused);

    const loadSessions = useCallback(async () => {
        try {
            setError('');
            const data = await chatService.getSessions();
            setSessions(data.sessions);
        } catch (err) {
            console.error('Failed to load sessions', err);
            setError('Could not load your cases. Check your connection and try again.');
            setSessions(prev => prev || []);
        }
    }, []);

    useEffect(() => { loadSessions(); }, [loadSessions]);

    useEffect(() => {
        try { localStorage.setItem('legal_lang', language); } catch { /* private mode */ }
    }, [language]);

    // Ctrl/Cmd+K opens the palette anywhere; "/" too when not typing
    useEffect(() => {
        const onKey = (e) => {
            const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
            if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                setPaletteOpen(o => !o);
            } else if (e.key === '/' && !typing) {
                e.preventDefault();
                setPaletteOpen(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Start a conversation; the chat page sends `ask` as its first question
    const startChat = useCallback(async (ask) => {
        if (starting) return;
        setStarting(true);
        setError('');
        try {
            const data = await chatService.createSession('New Legal Query');
            const q = (ask || '').trim();
            navigate(`/chat/${data.session._id}${q ? `?ask=${encodeURIComponent(q)}` : ''}`);
        } catch (err) {
            console.error('Failed to create session', err);
            setError('Could not start a new conversation. Please try again.');
            setStarting(false);
        }
    }, [navigate, starting]);

    // A question typed on the landing page arrives as ?ask=
    useEffect(() => {
        const ask = params.get('ask');
        if (ask && !handledAsk.current) {
            handledAsk.current = true;
            setParams({}, { replace: true });
            startChat(ask);
        }
    }, [params, setParams, startChat]);

    const focusComposer = useCallback((text) => {
        if (text !== undefined) setQuestion(text);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        requestAnimationFrame(() => {
            const el = composerRef.current;
            if (!el) return;
            el.focus({ preventScroll: true });
            el.setSelectionRange(el.value.length, el.value.length);
        });
    }, []);

    const submit = (e) => {
        e?.preventDefault();
        if (question.trim()) startChat(question);
    };

    const toggleSolved = async (e, s) => {
        e.stopPropagation();
        try {
            if (s.isSolved) await chatService.reopenSession(s._id);
            else await chatService.solveSession(s._id);
            setSessions(prev => prev.map(x => x._id === s._id ? { ...x, isSolved: !s.isSolved } : x));
        } catch (err) {
            console.error('Failed to update session', err);
        }
    };

    const confirmDelete = async () => {
        const s = toDelete;
        setToDelete(null);
        try {
            await chatService.deleteSession(s._id);
            setSessions(prev => prev.filter(x => x._id !== s._id));
        } catch (err) {
            console.error('Failed to delete session', err);
            setError('Could not delete that case.');
        }
    };

    const list = useMemo(() => (sessions || []).map(s => ({ ...s, cites: uniqueCitations(s.citations) })), [sessions]);

    const stats = useMemo(() => {
        const sections = new Set();
        const acts = new Map();
        for (const s of list) {
            const seenActs = new Set();
            for (const c of s.cites) {
                sections.add(`${c.act}|${c.section}`);
                const { short, area } = actInfo(c.act);
                if (!seenActs.has(short)) {
                    seenActs.add(short);
                    acts.set(short, { short, area, cases: (acts.get(short)?.cases || 0) + 1 });
                }
            }
        }
        return {
            all: list.length,
            open: list.filter(s => !s.isSolved).length,
            resolved: list.filter(s => s.isSolved).length,
            questions: list.reduce((n, s) => n + Math.floor((s.messageCount || 0) / 2), 0),
            sections: sections.size,
            acts: [...acts.values()].sort((a, b) => b.cases - a.cases),
        };
    }, [list]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return list.filter(s => {
            if (filter === 'open' && s.isSolved) return false;
            if (filter === 'resolved' && !s.isSolved) return false;
            if (!q) return true;
            return `${s.title} ${s.lastMessage} ${s.cites.map(citationLabel).join(' ')}`.toLowerCase().includes(q);
        });
    }, [list, filter, search]);

    const paletteItems = useMemo(() => [
        ...list.map(s => ({
            id: s._id, kind: 'case', title: s.title || 'New Legal Query',
            hint: [s.isSolved ? 'Resolved' : 'Open', ...s.cites.slice(0, 2).map(citationLabel)].join(' · '),
            run: () => navigate(`/chat/${s._id}`),
        })),
        ...LIBRARY.map(a => ({
            id: `act-${a.short}`, kind: 'act', title: a.name, hint: a.scope,
            run: () => focusComposer(`Under the ${a.name}, `),
        })),
    ], [list, navigate, focusComposer]);

    const suggestions = lens ? lens.questions : POPULAR;
    const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

    return (
        <AppShell sessions={sessions || undefined} onNewChat={() => focusComposer('')} newChatBusy={starting}>
            <div className="cd">
                {/* ── The ask: one place to start ── */}
                <section className="cd-hero">
                    <div className="cd-aurora" aria-hidden="true"><span /><span /><span /></div>
                    <div className="cd-grain" aria-hidden="true" />
                    <div className="cd-hero-inner">
                        <div className="cd-topline">
                            <span className="cd-date">{today}</span>
                            <button type="button" className="cd-palette-btn" onClick={() => setPaletteOpen(true)}>
                                <Search size={14} /> Search or jump to… <kbd>Ctrl</kbd><kbd>K</kbd>
                            </button>
                        </div>

                        <h1 className="cd-title">
                            What&rsquo;s on your mind{firstName ? <>, <span className="cd-name">{firstName}</span></> : ''}?
                        </h1>
                        <p className="cd-sub">Describe what happened in your own words. You get the law that applies, section by section.</p>

                        <form className={`cd-composer${focused ? ' is-focused' : ''}`} onSubmit={submit}>
                            <div className="cd-composer-inner">
                                <textarea ref={composerRef} rows={2} value={question} maxLength={2000}
                                    aria-label="Describe your situation" placeholder={placeholder}
                                    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
                                    }} />
                                <div className="cd-composer-bar">
                                    <label className="cd-lang" title="Answer language">
                                        <Languages size={14} />
                                        <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Answer language">
                                            {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                                        </select>
                                    </label>
                                    <span className="cd-composer-hint"><kbd>Enter</kbd> to ask · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line</span>
                                    <button type="submit" className="cd-send" disabled={!question.trim() || starting} aria-label="Ask">
                                        {starting ? <span className="cd-spinner" /> : <ArrowUp size={18} strokeWidth={2.4} />}
                                    </button>
                                </div>
                            </div>
                        </form>

                        <div className="cd-lenses" role="group" aria-label="Pick a topic">
                            {TOPICS.map(t => (
                                <button key={t.key} type="button" aria-pressed={lens?.key === t.key}
                                    className={`cd-lens${lens?.key === t.key ? ' active' : ''}`}
                                    onClick={() => setLens(l => (l?.key === t.key ? null : t))}>
                                    <TopicIcon name={t.icon} size={15} /> {t.label}
                                </button>
                            ))}
                        </div>

                        <ul className="cd-suggest" key={lens?.key || 'popular'}>
                            {suggestions.map((q, i) => (
                                <li key={q} style={{ animationDelay: `${i * 60}ms` }}>
                                    <button type="button" onClick={() => startChat(q)} disabled={starting}>
                                        <span>{q}</span> <ArrowUpRight size={15} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <div className="cd-body">
                    {/* ── Your desk at a glance ── */}
                    <section className="cd-insights" aria-label="Your desk at a glance">
                        <div className="cd-insight">
                            <div className="cd-ring-wrap">
                                <Ring value={stats.resolved} total={stats.all} />
                                <span className="cd-ring-num">{loading ? '–' : stats.all}</span>
                            </div>
                            <div>
                                <div className="cd-insight-label">Cases</div>
                                <div className="cd-insight-text">
                                    {loading ? 'Loading…' : stats.all
                                        ? <><strong>{stats.resolved}</strong> resolved · <strong>{stats.open}</strong> open</>
                                        : 'Your first question opens your first case.'}
                                </div>
                            </div>
                        </div>
                        <div className="cd-insight">
                            <span className="cd-insight-icon"><BookOpenCheck size={20} /></span>
                            <div>
                                <div className="cd-insight-label">Sections cited</div>
                                <div className="cd-insight-big">{loading ? '–' : stats.sections}</div>
                                <div className="cd-insight-text">from {stats.acts.length} {stats.acts.length === 1 ? 'Act' : 'Acts'}, across {stats.questions} {stats.questions === 1 ? 'answer' : 'answers'}</div>
                            </div>
                        </div>
                        <div className="cd-insight cd-insight-wide">
                            <span className="cd-insight-icon"><Scale size={20} /></span>
                            <div className="cd-insight-acts">
                                <div className="cd-insight-label">The law in your cases</div>
                                {stats.acts.length ? (
                                    <div className="cd-act-bars">
                                        {stats.acts.slice(0, 4).map(a => (
                                            <div key={a.short} className={`cd-act-bar area-${a.area}`}>
                                                <span className="cd-act-bar-name">{a.short}</span>
                                                <span className="cd-act-bar-track">
                                                    <span style={{ width: `${(a.cases / stats.acts[0].cases) * 100}%` }} />
                                                </span>
                                                <span className="cd-act-bar-n">{a.cases}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="cd-insight-text">The Acts your answers rely on will show up here.</div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* ── Cases ── */}
                    <section className="cd-section" aria-labelledby="cd-cases-title">
                        <div className="cd-section-head">
                            <h2 id="cd-cases-title">Your cases</h2>
                            <div className="cd-controls">
                                <div className="cd-seg" role="tablist" aria-label="Filter cases">
                                    {FILTERS.map(([key, label]) => (
                                        <button key={key} type="button" role="tab" aria-selected={filter === key}
                                            className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
                                            {label} <span>{loading ? '–' : stats[key]}</span>
                                        </button>
                                    ))}
                                </div>
                                <div className="cd-search">
                                    <Search size={15} />
                                    <input value={search} onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Filter by title, answer or section" aria-label="Filter cases" />
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="form-alert form-alert-error cd-error">
                                <AlertTriangle size={16} /> {error}
                                <button type="button" className="btn btn-secondary btn-sm" onClick={loadSessions}>Retry</button>
                            </div>
                        )}

                        <ul className="cd-cases">
                            <li>
                                <button type="button" className="cd-case cd-case-new" onClick={() => focusComposer('')}>
                                    <span className="cd-case-new-icon"><Plus size={22} /></span>
                                    <strong>New case</strong>
                                    <span>Describe a situation and get the sections that apply.</span>
                                </button>
                            </li>
                            {loading && [1, 2].map(i => (
                                <li key={i}><div className="cd-case cd-case-skeleton">
                                    <div className="skeleton-box" style={{ width: 70, height: 20, borderRadius: 999 }} />
                                    <div className="skeleton-box" style={{ width: '80%', height: 16, marginTop: 14 }} />
                                    <div className="skeleton-box" style={{ width: '95%', height: 12, marginTop: 10 }} />
                                    <div className="skeleton-box" style={{ width: '60%', height: 12, marginTop: 6 }} />
                                </div></li>
                            ))}
                            {!loading && visible.map((s, i) => (
                                <li key={s._id} style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
                                    <div className={`cd-case ${s.isSolved ? 'is-resolved' : 'is-open'}`} role="button" tabIndex={0}
                                        onClick={() => navigate(`/chat/${s._id}`)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/chat/${s._id}`); }}>
                                        <div className="cd-case-top">
                                            <span className={`cd-status ${s.isSolved ? 'resolved' : 'open'}`}>
                                                <span className="cd-status-dot" />{s.isSolved ? 'Resolved' : 'Open'}
                                            </span>
                                            <span className="cd-case-time">{timeLabel(s.updatedAt)}</span>
                                        </div>
                                        <h3 className="cd-case-title">{s.title || 'New Legal Query'}</h3>
                                        <p className="cd-case-excerpt">{plainPreview(s.lastMessage) || 'No answer yet.'}</p>
                                        {s.cites.length > 0 && (
                                            <div className="cd-cites">
                                                {s.cites.slice(0, 3).map(c => (
                                                    <span key={`${c.act}${c.section}`} className={`cd-cite area-${actInfo(c.act).area}`}>
                                                        {citationLabel(c)}
                                                    </span>
                                                ))}
                                                {s.cites.length > 3 && <span className="cd-cite cd-cite-more">+{s.cites.length - 3}</span>}
                                            </div>
                                        )}
                                        <div className="cd-case-foot">
                                            <span className="cd-case-count"><MessageSquare size={13} /> {s.messageCount || 0} messages</span>
                                            <span className="cd-case-actions">
                                                <button type="button" className="btn-icon" title={s.isSolved ? 'Reopen' : 'Mark resolved'}
                                                    aria-label={s.isSolved ? 'Reopen' : 'Mark resolved'} onClick={(e) => toggleSolved(e, s)}>
                                                    {s.isSolved ? <RotateCcw size={15} /> : <CheckCircle2 size={15} />}
                                                </button>
                                                <button type="button" className="btn-icon btn-icon-danger" title="Delete" aria-label="Delete"
                                                    onClick={(e) => { e.stopPropagation(); setToDelete(s); }}>
                                                    <Trash2 size={15} />
                                                </button>
                                                <ArrowRight size={16} className="cd-case-go" />
                                            </span>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        {!loading && list.length > 0 && visible.length === 0 && (
                            <p className="cd-nomatch">No cases match. Try another filter or search.</p>
                        )}
                    </section>

                    {/* ── Library ── */}
                    <section className="cd-section" aria-labelledby="cd-lib-title">
                        <div className="cd-section-head">
                            <div>
                                <h2 id="cd-lib-title">The library</h2>
                                <p>123 Central Acts are searchable. Start from the ones people ask about most.</p>
                            </div>
                        </div>
                        <ul className="cd-library">
                            {LIBRARY.map(a => (
                                <li key={a.short}>
                                    <button type="button" className={`cd-book area-${a.area}`}
                                        onClick={() => focusComposer(`Under the ${a.name}, `)}>
                                        <span className="cd-book-code">{a.short}</span>
                                        <span className="cd-book-area">{LAW_AREAS[a.area]}</span>
                                        <strong className="cd-book-name">{a.name}</strong>
                                        <span className="cd-book-scope">{a.scope}</span>
                                        <span className="cd-book-go">Ask about it <ArrowRight size={13} /></span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>
            </div>

            <button type="button" className="cd-fab" onClick={() => focusComposer('')} aria-label="New question">
                <Plus size={22} />
            </button>

            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems}
                onAsk={(q) => startChat(q)} />

            <ConfirmDialog
                open={!!toDelete}
                title="Delete this case?"
                message={toDelete ? `"${toDelete.title}" and all its messages will be removed. This cannot be undone.` : ''}
                confirmLabel="Delete"
                danger
                onConfirm={confirmDelete}
                onCancel={() => setToDelete(null)}
            />
        </AppShell>
    );
}
