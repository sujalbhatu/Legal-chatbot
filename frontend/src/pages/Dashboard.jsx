import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    MessagesSquare, CircleDot, CheckCircle2, MessageCircleQuestion, Search, ArrowRight, Trash2,
    RotateCcw, CornerDownLeft, Clock, AlertTriangle, Sparkles
} from 'lucide-react';
import { chatService, authService } from '../services/api';
import AppShell from '../components/AppShell';
import ConfirmDialog from '../components/ConfirmDialog';
import { TopicIcon } from '../components/Brand';
import { TOPICS } from '../data/content';

const FILTERS = [['all', 'All'], ['active', 'Active'], ['solved', 'Solved']];

function greeting() {
    const h = new Date().getHours();
    if (h < 5) return 'Good evening';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

/** The last message as one plain line (answers are markdown with [n] citations). */
function plainPreview(text) {
    return (text || '')
        .replace(/\[(\d+)\]/g, '')
        .replace(/[*_`#>]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function timeAgo(dateString) {
    const diff = (Date.now() - new Date(dateString).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} d ago`;
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(dateString));
}

export default function Dashboard() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [question, setQuestion] = useState('');
    const [starting, setStarting] = useState(false);
    const [toDelete, setToDelete] = useState(null);
    const user = authService.getCurrentUser();
    const firstName = (user?.name || '').trim().split(/\s+/)[0];
    const handledAsk = useRef(false);

    const loadSessions = useCallback(async () => {
        try {
            setError('');
            const data = await chatService.getSessions();
            setSessions(data.sessions);
        } catch (err) {
            console.error('Failed to load sessions', err);
            setError('Could not load your conversations. Check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadSessions(); }, [loadSessions]);

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

    const stats = useMemo(() => ({
        total: sessions.length,
        active: sessions.filter(s => !s.isSolved).length,
        solved: sessions.filter(s => s.isSolved).length,
        questions: sessions.reduce((n, s) => n + Math.floor((s.messageCount || 0) / 2), 0),
    }), [sessions]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return sessions.filter(s => {
            if (filter === 'active' && s.isSolved) return false;
            if (filter === 'solved' && !s.isSolved) return false;
            if (!q) return true;
            return (s.title || '').toLowerCase().includes(q) || (s.lastMessage || '').toLowerCase().includes(q);
        });
    }, [sessions, filter, search]);

    const STAT_CARDS = [
        { label: 'Conversations', value: stats.total, icon: MessagesSquare },
        { label: 'Active', value: stats.active, icon: CircleDot },
        { label: 'Solved', value: stats.solved, icon: CheckCircle2 },
        { label: 'Questions asked', value: stats.questions, icon: MessageCircleQuestion },
    ];

    return (
        <AppShell onNewChat={() => startChat()} newChatBusy={starting}>
            <div className="page">
                <header className="dash-hero">
                    <div>
                        <p className="dash-date">{new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
                        <h1 className="page-title">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
                        <p className="page-subtitle">What would you like to understand about Indian law today?</p>
                    </div>
                </header>

                <form className="dash-ask" onSubmit={(e) => { e.preventDefault(); if (question.trim()) startChat(question); }}>
                    <Sparkles size={18} className="dash-ask-icon" />
                    <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={2000}
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
                    {STAT_CARDS.map(({ label, value, icon: Icon }) => (
                        <div key={label} className="stat-card">
                            <span className="stat-icon"><Icon size={18} /></span>
                            <div>
                                <div className="stat-value">{loading ? '–' : value}</div>
                                <div className="stat-label">{label}</div>
                            </div>
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
                                            {key === 'all' ? stats.total : key === 'active' ? stats.active : stats.solved}
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
                                    <div className="skeleton-box" style={{ width: 36, height: 36, borderRadius: 10 }} />
                                    <div style={{ flex: 1 }}>
                                        <div className="skeleton-box" style={{ width: '45%', height: 14, marginBottom: 8 }} />
                                        <div className="skeleton-box" style={{ width: '70%', height: 12 }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="empty">
                            <span className="empty-icon"><MessagesSquare size={26} /></span>
                            {sessions.length === 0 ? (
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
                        <ul className="conv-list">
                            {visible.map(s => (
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
                                        </div>
                                        <div className="conv-meta">
                                            <span className={`badge ${s.isSolved ? 'badge-success' : 'badge-warning'}`}>
                                                {s.isSolved ? 'Solved' : 'Active'}
                                            </span>
                                            <span className="conv-time"><Clock size={12} /> {timeAgo(s.updatedAt)}</span>
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
                    )}
                </section>
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
