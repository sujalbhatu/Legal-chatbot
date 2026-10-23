import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    MessagesSquare, CircleDot, CheckCircle2, BookOpenCheck, Search, ArrowRight, Trash2,
    RotateCcw, CornerDownLeft, AlertTriangle, Sparkles
} from 'lucide-react';
import { chatService, authService } from '../services/api';
import AppShell from '../components/AppShell';
import ConfirmDialog from '../components/ConfirmDialog';
import CommandPalette from '../components/CommandPalette';
import { TopicIcon } from '../components/Brand';
import { TOPICS, LIBRARY } from '../data/content';
import { actInfo, citationLabel, uniqueCitations } from '../utils/acts';
import { plainPreview } from '../utils/preview';

const FILTERS = [['all', 'All'], ['active', 'Active'], ['solved', 'Solved']];

function greeting() {
    const h = new Date().getHours();
    if (h < 5) return 'Good evening';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

function timeAgo(dateString) {
    const diff = (Date.now() - new Date(dateString).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} d ago`;
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(dateString));
}

/** Today / Yesterday / Earlier, newest first. */
function groupByDay(sessions) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const groups = [['Today', []], ['Yesterday', []], ['Earlier', []]];
    for (const s of sessions) {
        const t = new Date(s.updatedAt).getTime();
        groups[t >= startOfToday ? 0 : t >= startOfToday - 86400000 ? 1 : 2][1].push(s);
    }
    return groups.filter(([, items]) => items.length);
}

export default function Dashboard() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [sessions, setSessions] = useState(null);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [question, setQuestion] = useState('');
    const [starting, setStarting] = useState(false);
    const [toDelete, setToDelete] = useState(null);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const askRef = useRef(null);
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

    // Ctrl/Cmd+K (or "/" when not typing) opens search
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

    // Grow the question box with its content (up to ~5 lines)
    useEffect(() => {
        const el = askRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }, [question]);

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

    const focusAsk = useCallback((text) => {
        if (text !== undefined) setQuestion(text);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        requestAnimationFrame(() => {
            const el = askRef.current;
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
            setError('Could not delete that conversation.');
        }
    };

    const list = useMemo(() => (sessions || []).map(s => ({ ...s, cites: uniqueCitations(s.citations) })), [sessions]);

    const stats = useMemo(() => {
        const sections = new Set();
        const acts = new Set();
        for (const s of list) {
            for (const c of s.cites) {
                sections.add(`${c.act}|${c.section}`);
                acts.add(actInfo(c.act).short);
            }
        }
        const weekAgo = Date.now() - 7 * 86400000;
        return {
            total: list.length,
            active: list.filter(s => !s.isSolved).length,
            solved: list.filter(s => s.isSolved).length,
            questions: list.reduce((n, s) => n + Math.floor((s.messageCount || 0) / 2), 0),
            thisWeek: list.filter(s => new Date(s.createdAt).getTime() >= weekAgo).length,
            sections: sections.size,
            acts: acts.size,
        };
    }, [list]);

    const groups = useMemo(() => {
        const q = search.trim().toLowerCase();
        return groupByDay(list.filter(s => {
            if (filter === 'active' && s.isSolved) return false;
            if (filter === 'solved' && !s.isSolved) return false;
            if (!q) return true;
            return `${s.title} ${s.lastMessage} ${s.cites.map(citationLabel).join(' ')}`.toLowerCase().includes(q);
        }));
    }, [list, filter, search]);

    const paletteItems = useMemo(() => [
        ...list.map(s => ({
            id: s._id, kind: 'case', title: s.title || 'New Legal Query',
            hint: [s.isSolved ? 'Solved' : 'Active', ...s.cites.slice(0, 2).map(citationLabel)].join(' · '),
            run: () => navigate(`/chat/${s._id}`),
        })),
        ...LIBRARY.map(a => ({
            id: `act-${a.short}`, kind: 'act', title: a.name, hint: a.scope,
            run: () => focusAsk(`Under the ${a.name}, `),
        })),
    ], [list, navigate, focusAsk]);

    const n = (v) => (loading ? '–' : v);
    const STAT_CARDS = [
        { label: 'Conversations', value: n(stats.total), note: loading ? '' : `${stats.thisWeek} started this week`, icon: MessagesSquare, tone: 'navy' },
        { label: 'Active', value: n(stats.active), note: loading ? '' : stats.active ? 'Waiting for a follow-up' : 'Nothing open', icon: CircleDot, tone: 'gold' },
        { label: 'Solved', value: n(stats.solved), note: loading ? '' : stats.total ? `${Math.round((stats.solved / stats.total) * 100)}% of all` : 'Mark one solved when done', icon: CheckCircle2, tone: 'green' },
        { label: 'Sections cited', value: n(stats.sections), note: loading ? '' : `from ${stats.acts} ${stats.acts === 1 ? 'Act' : 'Acts'}, ${stats.questions} answers`, icon: BookOpenCheck, tone: 'navy' },
    ];
    const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

    return (
        <AppShell sessions={sessions || undefined} onNewChat={() => focusAsk('')} newChatBusy={starting}>
            <div className="page db">
                <header className="db-head">
                    <div>
                        <p className="dash-date">{today}</p>
                        <h1 className="page-title">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
                        <p className="page-subtitle">What would you like to understand about Indian law today?</p>
                    </div>
                    <button type="button" className="db-search-btn" onClick={() => setPaletteOpen(true)}>
                        <Search size={15} /> <span>Search</span> <kbd>Ctrl</kbd><kbd>K</kbd>
                    </button>
                </header>

                <form className="db-ask" onSubmit={submit}>
                    <Sparkles size={18} className="db-ask-icon" />
                    <textarea ref={askRef} rows={1} value={question} maxLength={2000}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
                        }}
                        placeholder="Describe your situation or ask about a law…" aria-label="Ask a new question" />
                    <button type="submit" className="btn btn-primary" disabled={!question.trim() || starting}>
                        {starting ? 'Starting…' : <>Ask <CornerDownLeft size={16} /></>}
                    </button>
                </form>

                <div className="dash-topics">
                    {TOPICS.map(t => (
                        <button key={t.key} type="button" className="chip chip-icon" onClick={() => startChat(t.questions[0])}
                            title={t.questions[0]} disabled={starting}>
                            <TopicIcon name={t.icon} size={15} /> {t.label}
                        </button>
                    ))}
                </div>

                <section className="stat-grid" aria-label="Your activity">
                    {STAT_CARDS.map(({ label, value, note, icon: Icon, tone }) => (
                        <div key={label} className={`stat-card tone-${tone}`}>
                            <div className="stat-top">
                                <span className="stat-label">{label}</span>
                                <span className="stat-icon"><Icon size={17} /></span>
                            </div>
                            <div className="stat-value">{value}</div>
                            <div className="stat-note">{note || ' '}</div>
                        </div>
                    ))}
                </section>

                <section className="card list-card">
                    <div className="list-toolbar">
                        <h2 className="section-title">Your conversations</h2>
                        <div className="list-controls">
                            <div className="search-box">
                                <Search size={16} />
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations"
                                    aria-label="Search conversations" />
                            </div>
                            <div className="segmented" role="tablist" aria-label="Filter">
                                {FILTERS.map(([key, label]) => (
                                    <button key={key} type="button" role="tab" aria-selected={filter === key}
                                        className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
                                        {label}
                                        <span className="segmented-count">
                                            {n(key === 'all' ? stats.total : key === 'active' ? stats.active : stats.solved)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="form-alert form-alert-error list-error">
                            <AlertTriangle size={16} /> {error}
                            <button type="button" className="btn btn-secondary btn-sm" onClick={loadSessions}>Retry</button>
                        </div>
                    )}

                    {loading ? (
                        <div className="conv-list">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="conv-row conv-skeleton">
                                    <div className="skeleton-box" style={{ width: 38, height: 38, borderRadius: 11 }} />
                                    <div style={{ flex: 1 }}>
                                        <div className="skeleton-box" style={{ width: '45%', height: 14, marginBottom: 8 }} />
                                        <div className="skeleton-box" style={{ width: '70%', height: 12 }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : groups.length === 0 ? (
                        <div className="empty">
                            <span className="empty-icon"><MessagesSquare size={26} /></span>
                            {list.length === 0 ? (
                                <>
                                    <h3>No conversations yet</h3>
                                    <p>Ask your first question above, or start with one of these:</p>
                                    <div className="empty-suggestions">
                                        {TOPICS.slice(0, 3).map(t => (
                                            <button key={t.key} type="button" className="chip" onClick={() => startChat(t.questions[0])}>
                                                {t.questions[0]}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h3>Nothing matches</h3>
                                    <p>Try a different search or filter.</p>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="conv-list">
                            {groups.map(([label, items]) => (
                                <div key={label} className="conv-group">
                                    <div className="conv-group-label">{label}</div>
                                    <ul>
                                        {items.map(s => (
                                            <li key={s._id}>
                                                <div className="conv-row" role="button" tabIndex={0}
                                                    onClick={() => navigate(`/chat/${s._id}`)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/chat/${s._id}`); }}>
                                                    <span className={`conv-status ${s.isSolved ? 'solved' : 'active'}`}>
                                                        {s.isSolved ? <CheckCircle2 size={18} /> : <MessagesSquare size={18} />}
                                                    </span>
                                                    <div className="conv-main">
                                                        <div className="conv-title">{s.title || 'New Legal Query'}</div>
                                                        <div className="conv-preview">{plainPreview(s.lastMessage) || 'No messages yet'}</div>
                                                        {s.cites.length > 0 && (
                                                            <div className="conv-cites">
                                                                {s.cites.slice(0, 3).map(c => (
                                                                    <span key={`${c.act}${c.section}`} className="conv-cite">{citationLabel(c)}</span>
                                                                ))}
                                                                {s.cites.length > 3 && <span className="conv-cite conv-cite-more">+{s.cites.length - 3}</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="conv-meta">
                                                        <span className={`badge ${s.isSolved ? 'badge-success' : 'badge-warning'}`}>
                                                            {s.isSolved ? 'Solved' : 'Active'}
                                                        </span>
                                                        <span className="conv-time">{timeAgo(s.updatedAt)}</span>
                                                    </div>
                                                    <div className="conv-actions">
                                                        <button type="button" className="btn-icon" title={s.isSolved ? 'Reopen' : 'Mark as solved'}
                                                            aria-label={s.isSolved ? 'Reopen' : 'Mark as solved'} onClick={(e) => toggleSolved(e, s)}>
                                                            {s.isSolved ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}
                                                        </button>
                                                        <button type="button" className="btn-icon btn-icon-danger" title="Delete" aria-label="Delete"
                                                            onClick={(e) => { e.stopPropagation(); setToDelete(s); }}>
                                                            <Trash2 size={16} />
                                                        </button>
                                                        <ArrowRight size={16} className="conv-arrow" />
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems}
                onAsk={(q) => startChat(q)} />

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
