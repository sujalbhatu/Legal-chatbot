import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Search, Trash2, RotateCcw, CheckCircle2, CornerDownLeft, AlertTriangle, Plus, Languages, BookOpen,
    Library, Lightbulb, ArrowUpRight, MessageSquare, MessagesSquare
} from 'lucide-react';
import { chatService, authService } from '../services/api';
import AppShell from '../components/AppShell';
import ConfirmDialog from '../components/ConfirmDialog';
import { TOPICS, LANGUAGES, LIBRARY } from '../data/content';

const FILTERS = [['all', 'All'], ['open', 'Open'], ['resolved', 'Resolved']];
const STARTERS = [TOPICS[0].questions[1], TOPICS[2].questions[0], TOPICS[3].questions[0]];
const TIPS = [
    ['Give the facts', 'Who did what, when and where. Amounts and dates help.'],
    ['Name the Act if you know it', '"Under the BNS…" or "Section 138" narrows the search.'],
    ['Ask follow-ups', 'The conversation remembers your case, so "and if he is a minor?" works.'],
];

function greeting() {
    const h = new Date().getHours();
    if (h < 5) return 'Good evening';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

/** The last message as one plain line: the short answer itself, without greeting, markdown or [n]. */
function plainPreview(text) {
    const t = text || '';
    const short = t.search(/\*\*Short answer\*\*/i);
    return (short >= 0 ? t.slice(short).replace(/^\*\*Short answer\*\*/i, '') : t)
        .replace(/\[(\d+)\]/g, '')
        .replace(/[*_`#>]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
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
            setError('Could not load your conversations. Check your connection and try again.');
            setSessions(prev => prev || []);
        }
    }, []);

    useEffect(() => { loadSessions(); }, [loadSessions]);

    useEffect(() => {
        try { localStorage.setItem('legal_lang', language); } catch { /* private mode */ }
    }, [language]);

    // "/" jumps to the conversation search, as in most workspaces
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
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        requestAnimationFrame(() => {
            el.focus();
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
            setError('Could not delete that conversation.');
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
        <AppShell sessions={sessions || undefined} onNewChat={() => focusComposer()} newChatBusy={starting}>
            <div className="ws">
                <header className="ws-topbar">
                    <div className="ws-crumbs">Home</div>
                    <div className="ws-topbar-actions">
                        <button type="button" className="ws-search-trigger" onClick={() => searchRef.current?.focus()}>
                            <Search size={15} /> <span>Search conversations</span> <kbd>/</kbd>
                        </button>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => focusComposer()}>
                            <Plus size={15} /> New question
                        </button>
                    </div>
                </header>

                <div className="ws-body">
                    <section className="ws-head">
                        <div>
                            <p className="ws-date">{today}</p>
                            <h1 className="ws-title">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
                        </div>
                        <dl className="ws-summary" aria-label="Your activity">
                            <div><dt>Open</dt><dd>{loading ? '–' : counts.open}</dd></div>
                            <div><dt>Resolved</dt><dd>{loading ? '–' : counts.resolved}</dd></div>
                            <div><dt>Questions asked</dt><dd>{loading ? '–' : counts.questions}</dd></div>
                        </dl>
                    </section>

                    <form className="ws-composer" onSubmit={submit}>
                        <label htmlFor="ws-question" className="ws-composer-label">Ask about your situation</label>
                        <textarea id="ws-question" ref={composerRef} rows={3} value={question} maxLength={2000}
                            onChange={(e) => setQuestion(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
                            }}
                            placeholder="Describe what happened in your own words: who, what, when. For example, my landlord is keeping my ₹40,000 deposit after I moved out." />
                        <div className="ws-composer-bar">
                            <div className="ws-composer-tools">
                                <label className="ws-lang" title="Answer language">
                                    <Languages size={14} />
                                    <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Answer language">
                                        {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                                    </select>
                                </label>
                                <span className="ws-composer-hint"><BookOpen size={13} /> Every answer cites the exact sections</span>
                            </div>
                            <button type="submit" className="btn btn-primary ws-ask" disabled={!question.trim() || starting}>
                                {starting ? 'Starting…' : <>Ask <CornerDownLeft size={15} /></>}
                            </button>
                        </div>
                    </form>
                    <div className="ws-starters">
                        <span>Try</span>
                        {STARTERS.map(q => (
                            <button key={q} type="button" onClick={() => startChat(q)} disabled={starting}>{q}</button>
                        ))}
                    </div>

                    <div className="ws-grid">
                        <section className="ws-panel ws-conversations" aria-labelledby="ws-conv-title">
                            <div className="ws-panel-head">
                                <h2 id="ws-conv-title" className="ws-panel-title">Conversations</h2>
                                <div className="ws-search">
                                    <Search size={14} />
                                    <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search" aria-label="Search conversations" />
                                </div>
                            </div>
                            <div className="ws-tabs" role="tablist" aria-label="Filter conversations">
                                {FILTERS.map(([key, label]) => (
                                    <button key={key} type="button" role="tab" aria-selected={filter === key}
                                        className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
                                        {label} <span>{counts[key]}</span>
                                    </button>
                                ))}
                            </div>

                            {error && (
                                <div className="form-alert form-alert-error ws-error">
                                    <AlertTriangle size={16} /> {error}
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={loadSessions}>Retry</button>
                                </div>
                            )}

                            {loading ? (
                                <div className="ws-list">
                                    {[1, 2, 3, 4].map(i => (
                                        <div key={i} className="ws-row ws-row-skeleton">
                                            <div className="skeleton-box" style={{ width: 8, height: 8, borderRadius: 4 }} />
                                            <div style={{ flex: 1 }}>
                                                <div className="skeleton-box" style={{ width: '40%', height: 13, marginBottom: 7 }} />
                                                <div className="skeleton-box" style={{ width: '75%', height: 11 }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : groups.length === 0 ? (
                                <div className="ws-empty">
                                    <MessagesSquare size={22} />
                                    {list.length === 0 ? (
                                        <>
                                            <h3>No conversations yet</h3>
                                            <p>Your questions and answers are saved here, so you can come back to a case later.</p>
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => focusComposer()}>
                                                <Plus size={14} /> Ask your first question
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <h3>Nothing matches</h3>
                                            <p>Try another search or filter.</p>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="ws-list">
                                    {groups.map(([label, items]) => (
                                        <div key={label} className="ws-group">
                                            <div className="ws-group-label">{label}</div>
                                            <ul>
                                                {items.map(s => (
                                                    <li key={s._id} className="ws-row" role="button" tabIndex={0}
                                                        onClick={() => navigate(`/chat/${s._id}`)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/chat/${s._id}`); }}>
                                                        <span className={`status-dot ${s.isSolved ? 'resolved' : 'open'}`}
                                                            title={s.isSolved ? 'Resolved' : 'Open'} />
                                                        <div className="ws-row-main">
                                                            <div className="ws-row-title">{s.title || 'New Legal Query'}</div>
                                                            <div className="ws-row-preview">{plainPreview(s.lastMessage) || 'No messages yet'}</div>
                                                        </div>
                                                        <span className="ws-row-count" title="Messages">
                                                            <MessageSquare size={12} /> {s.messageCount || 0}
                                                        </span>
                                                        <span className="ws-row-time">{timeLabel(s.updatedAt)}</span>
                                                        <div className="ws-row-actions">
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
                                    ))}
                                </div>
                            )}
                        </section>

                        <aside className="ws-side">
                            <section className="ws-panel" aria-labelledby="ws-lib-title">
                                <div className="ws-panel-head">
                                    <h2 id="ws-lib-title" className="ws-panel-title"><Library size={15} /> Law library</h2>
                                    <span className="ws-panel-meta">123 Acts indexed</span>
                                </div>
                                <ul className="ws-library">
                                    {LIBRARY.map(a => (
                                        <li key={a.short}>
                                            <button type="button" onClick={() => focusComposer(`Under the ${a.name}, `)}
                                                title={`Ask about the ${a.name}`}>
                                                <span className="ws-act-mark">{a.short}</span>
                                                <span className="ws-act-text">
                                                    <strong>{a.name}</strong>
                                                    <span>{a.scope}</span>
                                                </span>
                                                <ArrowUpRight size={14} className="ws-act-go" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <section className="ws-panel ws-tips" aria-labelledby="ws-tips-title">
                                <h2 id="ws-tips-title" className="ws-panel-title"><Lightbulb size={15} /> Getting precise answers</h2>
                                <ol>
                                    {TIPS.map(([title, text]) => (
                                        <li key={title}><strong>{title}</strong><span>{text}</span></li>
                                    ))}
                                </ol>
                            </section>
                        </aside>
                    </div>
                </div>
            </div>

            <ConfirmDialog
                open={!!toDelete}
                title="Delete this conversation?"
                message={toDelete ? `"${toDelete.title}" and all its messages will be removed. This cannot be undone.` : ''}
                confirmLabel="Delete"
                danger
                onConfirm={confirmDelete}
                onCancel={() => setToDelete(null)}
            />
        </AppShell>
    );
}
