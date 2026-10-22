import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Search, Trash2, RotateCcw, CheckCircle2, CornerDownLeft, AlertTriangle, Languages, ArrowRight,
    MessagesSquare, Plus
} from 'lucide-react';
import { chatService, authService } from '../services/api';
import AppShell from '../components/AppShell';
import ConfirmDialog from '../components/ConfirmDialog';
import { TOPICS, LANGUAGES, LIBRARY, LAW_AREAS } from '../data/content';

const FILTERS = [['all', 'All'], ['open', 'Open'], ['resolved', 'Resolved']];
const STARTERS = [TOPICS[0].questions[1], TOPICS[2].questions[0], TOPICS[3].questions[0]];

function greeting() {
    const h = new Date().getHours();
    if (h < 5) return 'Good evening';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

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
    // cut by the API: end on a whole word
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

/** Today / Yesterday / Previous 7 days / Earlier, newest first. */
function groupByDay(sessions) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const day = 86400000;
    const groups = [['Today', []], ['Yesterday', []], ['Previous 7 days', []], ['Earlier', []]];
    for (const s of sessions) {
        const t = new Date(s.updatedAt).getTime();
        const i = t >= startOfToday ? 0 : t >= startOfToday - day ? 1 : t >= startOfToday - 7 * day ? 2 : 3;
        groups[i][1].push(s);
    }
    return groups.filter(([, items]) => items.length);
}

const readLanguage = () => {
    try { return localStorage.getItem('legal_lang') || 'auto'; } catch { return 'auto'; }
};

export default function Dashboard() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [sessions, setSessions] = useState(null);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [question, setQuestion] = useState('');
    const [language, setLanguage] = useState(readLanguage);
    const [starting, setStarting] = useState(false);
    const [toDelete, setToDelete] = useState(null);
    const composerRef = useRef(null);
    const searchRef = useRef(null);
    const handledAsk = useRef(false);
    const user = authService.getCurrentUser();
    const firstName = (user?.name || '').trim().split(/\s+/)[0];
    const loading = sessions === null;

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

    // "/" jumps to the case search
    useEffect(() => {
        const onKey = (e) => {
            const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
            if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                searchRef.current?.focus();
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

    const focusComposer = (text) => {
        if (text !== undefined) setQuestion(text);
        const el = composerRef.current;
        if (!el) return;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        requestAnimationFrame(() => {
            el.focus({ preventScroll: true });
            el.setSelectionRange(el.value.length, el.value.length);
        });
    };

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

    const list = useMemo(() => sessions || [], [sessions]);
    const counts = useMemo(() => ({
        all: list.length,
        open: list.filter(s => !s.isSolved).length,
        resolved: list.filter(s => s.isSolved).length,
        questions: list.reduce((n, s) => n + Math.floor((s.messageCount || 0) / 2), 0),
    }), [list]);

    const groups = useMemo(() => {
        const q = search.trim().toLowerCase();
        return groupByDay(list.filter(s => {
            if (filter === 'open' && s.isSolved) return false;
            if (filter === 'resolved' && !s.isSolved) return false;
            if (!q) return true;
            return (s.title || '').toLowerCase().includes(q) || (s.lastMessage || '').toLowerCase().includes(q);
        }));
    }, [list, filter, search]);

    const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

    return (
        <AppShell sessions={sessions || undefined} onNewChat={() => focusComposer('')} newChatBusy={starting}>
            <div className="dh">
                {/* 1. Ask: the one place to start */}
                <section className="dh-hero">
                    <div className="dh-hero-inner">
                        <div className="dh-hero-head">
                            <div>
                                <p className="dh-date">{today}</p>
                                <h1 className="dh-title">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
                                <p className="dh-sub">Describe your situation. You get the law that applies, with the exact sections to check.</p>
                            </div>
                            {!loading && counts.questions > 0 && (
                                <div className="dh-hero-stat">
                                    <strong>{counts.questions}</strong>
                                    <span>{counts.questions === 1 ? 'question' : 'questions'} answered</span>
                                </div>
                            )}
                        </div>

                        <form className="dh-composer" onSubmit={submit}>
                            <textarea ref={composerRef} rows={3} value={question} maxLength={2000}
                                aria-label="Describe your situation"
                                onChange={(e) => setQuestion(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
                                }}
                                placeholder="What happened? Who was involved, and when? For example: my landlord is keeping my ₹40,000 deposit after I moved out." />
                            <div className="dh-composer-bar">
                                <label className="dh-lang" title="Answer language">
                                    <Languages size={14} />
                                    <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Answer language">
                                        {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                                    </select>
                                </label>
                                <span className="dh-composer-hint">Tip: name the Act if you know it</span>
                                <button type="submit" className="dh-ask" disabled={!question.trim() || starting}>
                                    {starting ? 'Starting…' : <>Ask <CornerDownLeft size={15} /></>}
                                </button>
                            </div>
                        </form>

                        <div className="dh-starters">
                            <span>Popular</span>
                            {STARTERS.map(q => (
                                <button key={q} type="button" onClick={() => startChat(q)} disabled={starting}>{q}</button>
                            ))}
                        </div>
                    </div>
                </section>

                <div className="dh-body">
                    {/* 2. Your cases */}
                    <section className="dh-section" aria-labelledby="dh-cases-title">
                        <div className="dh-section-head">
                            <div>
                                <h2 id="dh-cases-title">Your cases</h2>
                                <p>Every question you ask is saved here with its answer and sources.</p>
                            </div>
                            <div className="dh-search">
                                <Search size={15} />
                                <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search cases" aria-label="Search cases" />
                                <kbd>/</kbd>
                            </div>
                        </div>

                        <div className="dh-cases">
                            <div className="dh-tabs" role="tablist" aria-label="Filter cases">
                                {FILTERS.map(([key, label]) => (
                                    <button key={key} type="button" role="tab" aria-selected={filter === key}
                                        className={`dh-tab dh-tab-${key}${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>
                                        {label} <span className="dh-tab-count">{loading ? '–' : counts[key]}</span>
                                    </button>
                                ))}
                            </div>

                            {error && (
                                <div className="form-alert form-alert-error dh-error">
                                    <AlertTriangle size={16} /> {error}
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={loadSessions}>Retry</button>
                                </div>
                            )}

                            {loading ? (
                                <ul className="dh-list">
                                    {[1, 2, 3].map(i => (
                                        <li key={i} className="dh-row dh-row-skeleton">
                                            <div style={{ flex: 1 }}>
                                                <div className="skeleton-box" style={{ width: '40%', height: 14, marginBottom: 8 }} />
                                                <div className="skeleton-box" style={{ width: '70%', height: 12 }} />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : groups.length === 0 ? (
                                <div className="dh-empty">
                                    <span className="dh-empty-icon"><MessagesSquare size={22} /></span>
                                    {list.length === 0 ? (
                                        <>
                                            <h3>No cases yet</h3>
                                            <p>Ask your first question above, or pick an Act below to start from.</p>
                                        </>
                                    ) : (
                                        <>
                                            <h3>Nothing matches</h3>
                                            <p>Try another search or filter.</p>
                                        </>
                                    )}
                                </div>
                            ) : (
                                groups.map(([label, items]) => (
                                    <div key={label} className="dh-group">
                                        <div className="dh-group-label">{label}</div>
                                        <ul className="dh-list">
                                            {items.map(s => (
                                                <li key={s._id} className={`dh-row ${s.isSolved ? 'is-resolved' : 'is-open'}`}
                                                    role="button" tabIndex={0}
                                                    onClick={() => navigate(`/chat/${s._id}`)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/chat/${s._id}`); }}>
                                                    <div className="dh-row-main">
                                                        <div className="dh-row-title">{s.title || 'New Legal Query'}</div>
                                                        <div className="dh-row-preview">{plainPreview(s.lastMessage) || 'No messages yet'}</div>
                                                    </div>
                                                    <div className="dh-row-meta">
                                                        <span className={`dh-pill ${s.isSolved ? 'resolved' : 'open'}`}>
                                                            {s.isSolved ? 'Resolved' : 'Open'}
                                                        </span>
                                                        <span className="dh-row-time">{timeLabel(s.updatedAt)}</span>
                                                    </div>
                                                    <div className="dh-row-actions">
                                                        <button type="button" className="btn-icon" title={s.isSolved ? 'Reopen' : 'Mark resolved'}
                                                            aria-label={s.isSolved ? 'Reopen' : 'Mark resolved'} onClick={(e) => toggleSolved(e, s)}>
                                                            {s.isSolved ? <RotateCcw size={15} /> : <CheckCircle2 size={15} />}
                                                        </button>
                                                        <button type="button" className="btn-icon btn-icon-danger" title="Delete" aria-label="Delete"
                                                            onClick={(e) => { e.stopPropagation(); setToDelete(s); }}>
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>

                    {/* 3. Browse by Act */}
                    <section className="dh-section" aria-labelledby="dh-acts-title">
                        <div className="dh-section-head">
                            <div>
                                <h2 id="dh-acts-title">Browse by Act</h2>
                                <p>123 Central Acts are searchable. These are the ones people ask about most.</p>
                            </div>
                        </div>
                        <ul className="dh-acts">
                            {LIBRARY.map(a => (
                                <li key={a.short}>
                                    <button type="button" className={`dh-act area-${a.area}`}
                                        onClick={() => focusComposer(`Under the ${a.name}, `)}>
                                        <span className="dh-act-top">
                                            <span className="dh-act-code">{a.short}</span>
                                            <span className="dh-act-area">{LAW_AREAS[a.area]}</span>
                                        </span>
                                        <strong className="dh-act-name">{a.name}</strong>
                                        <span className="dh-act-scope">{a.scope}</span>
                                        <span className="dh-act-go">Ask about this Act <ArrowRight size={13} /></span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>
            </div>

            <button type="button" className="dh-fab" onClick={() => focusComposer('')} aria-label="New question">
                <Plus size={22} />
            </button>

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
