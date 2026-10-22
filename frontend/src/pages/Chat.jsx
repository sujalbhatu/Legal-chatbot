import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
    ArrowLeft, CheckCircle, BookOpen, AlertTriangle, Loader2, User,
    Sun, Moon, RotateCcw, ThumbsUp, ThumbsDown, Languages, Sparkles, ArrowUp, Square, Copy, Check, Trash2,
    UserPlus, Info, X
} from 'lucide-react';
import { chatService, authService } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { formatAssistantMessage, formatUserMessage } from '../utils/formatMessage';
import { Logo, TopicIcon } from '../components/Brand';
import { LANGUAGES, TOPICS } from '../data/content';

const GUEST_KEY = 'openforge_guest_chat';

const readLanguage = () => {
    try { return localStorage.getItem('legal_lang') || 'auto'; } catch { return 'auto'; }
};
const readGuestChat = () => {
    try { return JSON.parse(sessionStorage.getItem(GUEST_KEY) || '[]'); } catch { return []; }
};

const sectionLabel = (source) => {
    if (!source.section) return '';
    return `${source.source_file?.startsWith('constitution') ? 'Art.' : 'Sec.'} ${source.section}`;
};

// One retrieved section as a small chip; `open` is controlled so a [n] chip in the answer can open it.
const SourceChip = ({ source, n, open, onToggle, anchorId }) => (
    <button type="button" id={anchorId} onClick={onToggle} aria-expanded={open}
        className={`src-chip${source.cited ? ' src-chip-cited' : ''}${open ? ' src-chip-open' : ''}`}
        title={`${source.act_name}${source.section ? `, ${sectionLabel(source)}` : ''}${source.section_title ? `: ${source.section_title}` : ''}`}>
        <span className="src-chip-n">{n}</span>
        <span className="src-chip-act">{source.act_name}</span>
        {source.section && <span className="src-chip-sec">{sectionLabel(source)}</span>}
    </button>
);

// The text of the open section, under the chips.
const SourcePanel = ({ source, n, onClose }) => (
    <div className="src-panel">
        <div className="src-panel-head">
            <span className="src-chip-n">{n}</span>
            <span className="src-panel-title">
                <strong>{source.act_name}</strong>
                {source.section && <span>{sectionLabel(source)}{source.section_title ? `: ${source.section_title}` : ''}</span>}
            </span>
            <button type="button" className="btn-icon src-panel-close" onClick={onClose} aria-label="Close section">
                <X size={15} />
            </button>
        </div>
        <p className="src-panel-text">{source.text}</p>
    </div>
);

function CopyButton({ text }) {
    const [done, setDone] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
        } catch { /* clipboard blocked */ }
    };
    return (
        <button type="button" className="btn-icon feedback-btn" onClick={copy} aria-label="Copy answer" title="Copy answer">
            {done ? <Check size={15} /> : <Copy size={15} />}
        </button>
    );
}

// Sources, follow-ups, copy and feedback under an assistant answer.
// (The reranker's score is kept in the data but not shown: it ranks well, yet gives
// correct sections for plain-language questions absolute scores near 0, so a
// "Low relevance" label would mislead.)
const AnswerExtras = ({ msg, msgKey, openSource, setOpenSource, onFollowUp, onFeedback, isLast, busy, live, allowFeedback }) => {
    const [showAll, setShowAll] = useState(false);
    const numbered = (msg.sources || []).map((source, i) => ({ source, n: source.n || i + 1 }));
    const cited = numbered.filter(x => x.source.cited);
    // A saved answer that cites nothing (small talk, "not found") shows no source list
    const all = live || cited.length ? numbered : [];
    const openN = openSource?.msgKey === msgKey ? openSource.n : null;
    // Cited sections first; the others only on request (or when a [n] chip opened one)
    const shown = live || showAll ? all : all.filter(x => x.source.cited || x.n === openN);
    const hidden = all.length - shown.length;
    const open = all.find(x => x.n === openN);
    const toggle = (n) => setOpenSource(prev => (prev?.msgKey === msgKey && prev?.n === n ? null : { msgKey, n }));
    return (
        <>
            {msg.stopped && <div className="answer-note"><Info size={15} /> You stopped this answer before the end; it was not saved.</div>}
            {msg.unsupportedCitations?.length > 0 && (
                <div className="answer-note answer-note-warn">
                    <AlertTriangle size={15} />
                    Could not verify {msg.unsupportedCitations.map(s => `Section/Article ${s}`).join(', ')} against the
                    retrieved text. Check it before relying on it.
                </div>
            )}

            {all.length > 0 && (
                <div className="src-block">
                    <div className="src-label">
                        <BookOpen size={14} />
                        {live ? `Reading ${all.length} sections` : `Sources · ${cited.length} cited`}
                    </div>
                    <div className="src-chips">
                        {shown.map(({ source, n }) => (
                            <SourceChip key={n} source={source} n={n} anchorId={`src-${msgKey}-${n}`}
                                open={openN === n} onToggle={() => toggle(n)} />
                        ))}
                        {!live && (hidden > 0 || showAll) && all.length > cited.length && (
                            <button type="button" className="src-more" onClick={() => setShowAll(v => !v)}>
                                {showAll ? 'Show cited only' : `+${hidden} more searched`}
                            </button>
                        )}
                    </div>
                    {open && <SourcePanel source={open.source} n={open.n} onClose={() => setOpenSource(null)} />}
                </div>
            )}

            {isLast && msg.followUps?.length > 0 && (
                <div className="followups">
                    {msg.followUps.map((f, i) => (
                        <button key={i} type="button" className="followup-chip" disabled={busy} onClick={() => onFollowUp(f)}>
                            <Sparkles size={13} /> {f}
                        </button>
                    ))}
                </div>
            )}

            {!live && (
                <div className="feedback-row">
                    <CopyButton text={msg.content || ''} />
                    {allowFeedback && (
                        <>
                            <span className="feedback-sep" />
                            <span>Helpful?</span>
                            <button type="button" className={`btn-icon feedback-btn${msg.feedback?.rating === 'up' ? ' active' : ''}`}
                                aria-label="Helpful" onClick={() => onFeedback(msg, 'up')}>
                                <ThumbsUp size={15} />
                            </button>
                            <button type="button" className={`btn-icon feedback-btn${msg.feedback?.rating === 'down' ? ' active' : ''}`}
                                aria-label="Not helpful" onClick={() => onFeedback(msg, 'down')}>
                                <ThumbsDown size={15} />
                            </button>
                        </>
                    )}
                </div>
            )}
        </>
    );
};

export default function Chat({ guest = false }) {
    const { id } = useParams();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [session, setSession] = useState(null);
    const [messages, setMessages] = useState(() => (guest ? readGuestChat() : []));
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(!guest);
    const [sending, setSending] = useState(false);
    const [streaming, setStreaming] = useState(null);   // { text, sources, grounded } while an answer streams
    const [error, setError] = useState('');
    const [language, setLanguage] = useState(readLanguage);
    const [openSource, setOpenSource] = useState(null); // { msgKey, n }
    const [guestLeft, setGuestLeft] = useState(null);
    const scrollRef = useRef(null);
    const pinRef = useRef(null);        // id of a question to bring to the top of the view
    const abortRef = useRef(null);
    const inputRef = useRef(null);
    const askedRef = useRef(false);
    const streamingRef = useRef(null);
    const { theme, toggleTheme } = useTheme();
    const solved = !guest && session?.isSolved;

    useEffect(() => {
        if (guest) {
            chatService.guestStatus().then(s => setGuestLeft(s.remainingToday)).catch(() => {});
            return () => abortRef.current?.abort();
        }
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const data = await chatService.getSession(id);
                if (cancelled) return;
                setSession(data.session);
                setMessages(data.session.messages);
            } catch (err) {
                console.error('Failed to load session', err);
                navigate('/dashboard');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; abortRef.current?.abort(); };
    }, [id, guest, navigate]);

    // Opening a conversation shows its end
    useLayoutEffect(() => {
        if (!loading && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [loading]);

    // A new question moves to the top of the view and the answer is read from its start,
    // instead of following the stream down to the sources
    useLayoutEffect(() => {
        if (!pinRef.current) return;
        document.getElementById(`row-${pinRef.current}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        pinRef.current = null;
    }, [messages]);

    useEffect(() => {
        try { localStorage.setItem('legal_lang', language); } catch { /* private mode */ }
    }, [language]);

    useEffect(() => {
        if (!guest) return;
        try { sessionStorage.setItem(GUEST_KEY, JSON.stringify(messages.slice(-40))); } catch { /* full or blocked */ }
    }, [guest, messages]);

    // Grow the input with its content (up to ~6 lines)
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
    }, [query]);

    const send = useCallback(async (text) => {
        const userQuery = text.trim();
        if (!userQuery || sending || solved) return;
        setQuery('');
        setError('');
        setSending(true);
        setOpenSource(null);

        const stamp = Date.now();
        const tempUser = { _id: `temp-u-${stamp}`, role: 'user', content: userQuery, sources: [] };
        const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content, language: m.language }));
        pinRef.current = tempUser._id;
        setMessages(prev => [...prev, tempUser]);
        streamingRef.current = { text: '', sources: [], grounded: true };
        setStreaming(streamingRef.current);
        const update = (patch) => {
            streamingRef.current = { ...streamingRef.current, ...patch(streamingRef.current) };
            setStreaming(streamingRef.current);
        };

        const controller = new AbortController();
        abortRef.current = controller;
        const handlers = {
            onMeta: (meta) => update(() => ({ sources: meta.sources || [], grounded: meta.grounded })),
            onToken: (t) => update(s => ({ text: s.text + t })),
        };
        const lang = language === 'auto' ? undefined : language;
        try {
            if (guest) {
                const data = await chatService.streamGuest(userQuery, lang, history, handlers, controller.signal);
                setMessages(prev => [...prev, { ...data.message, _id: `guest-a-${stamp}` }]);
                if (typeof data.remainingToday === 'number') setGuestLeft(data.remainingToday);
            } else {
                const data = await chatService.streamQuery(id, userQuery, lang, handlers, controller.signal);
                setMessages(prev => [...prev.filter(m => m._id !== tempUser._id), ...data.messages]);
                if (data.session?.title) setSession(prev => ({ ...prev, title: data.session.title }));
            }
        } catch (err) {
            if (controller.signal.aborted) {
                // Stopped by the user: keep what was written so far
                const partial = streamingRef.current;
                if (partial?.text) {
                    setMessages(prev => [...prev, {
                        _id: `temp-stop-${stamp}`, role: 'assistant', content: partial.text,
                        sources: partial.sources, stopped: true,
                    }]);
                } else {
                    // Nothing was written yet: take the question back
                    setMessages(prev => prev.filter(m => m._id !== tempUser._id));
                    setQuery(userQuery);
                }
            } else {
                console.error('Failed to send query', err);
                setMessages(prev => prev.filter(m => m._id !== tempUser._id));
                setError(err.message || 'Failed to send your question. Please try again.');
                setQuery(userQuery);
            }
        } finally {
            streamingRef.current = null;
            setStreaming(null);
            setSending(false);
            abortRef.current = null;
        }
    }, [id, guest, language, messages, sending, solved]);

    // A question handed over from the landing page or dashboard (?ask=)
    // Deferred with a timer so React's dev double-mount (mount, unmount, mount) cancels
    // the first attempt instead of aborting a request already in flight.
    useEffect(() => {
        const ask = params.get('ask');
        if (!ask || askedRef.current || loading) return;
        const timer = setTimeout(() => {
            askedRef.current = true;
            setParams({}, { replace: true });
            send(ask);
        }, 0);
        return () => clearTimeout(timer);
    }, [params, setParams, loading, send]);

    const handleSubmit = (e) => {
        e.preventDefault();
        send(query);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send(query);
        }
    };

    const handleFeedback = async (msg, rating) => {
        const next = msg.feedback?.rating === rating ? null : rating;
        setMessages(prev => prev.map(m => m._id === msg._id ? { ...m, feedback: next ? { rating: next } : undefined } : m));
        try {
            await chatService.sendFeedback(id, msg._id, next);
        } catch (err) {
            console.error('Failed to save feedback', err);
        }
    };

    // [n] chips in an answer open source n of that answer
    const handleAnswerClick = (e, msgKey) => {
        const chip = e.target.closest('[data-cite]');
        if (!chip) return;
        const n = Number(chip.dataset.cite);
        setOpenSource({ msgKey, n });
        requestAnimationFrame(() =>
            document.getElementById(`src-${msgKey}-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    };

    const setSolved = async (value) => {
        try {
            if (value) await chatService.solveSession(id);
            else await chatService.reopenSession(id);
            setSession(prev => ({ ...prev, isSolved: value }));
        } catch (err) {
            console.error('Failed to update session', err);
        }
    };

    const clearGuestChat = () => {
        abortRef.current?.abort();
        setMessages([]);
        setError('');
    };

    if (loading) {
        return (
            <div className="page-loading">
                <Loader2 size={36} className="animate-spin" />
            </div>
        );
    }

    const lastAssistantIndex = messages.map(m => m.role).lastIndexOf('assistant');
    const isAuth = authService.isAuthenticated();

    return (
        <div className="chat-page">
            <header className="chat-topbar">
                <div className="chat-topbar-left">
                    {guest ? (
                        <Logo size={30} onClick={() => navigate('/')} />
                    ) : (
                        <button type="button" className="btn-icon" onClick={() => navigate('/dashboard')} aria-label="Back to dashboard">
                            <ArrowLeft size={20} />
                        </button>
                    )}
                    <div className="chat-topbar-title">
                        {guest ? (
                            <span className="badge badge-neutral guest-badge">
                                <span className="mobile-hide">Guest mode{guestLeft !== null ? ' · ' : ''}</span>
                                {guestLeft !== null ? `${guestLeft} left` : <span className="mobile-only">Guest</span>}
                                <span className="mobile-hide">{guestLeft !== null ? ' today' : ''}</span>
                            </span>
                        ) : (
                            <>
                                <h1 className="chat-title">{session?.title || 'Legal Query'}</h1>
                                <span className={`badge ${solved ? 'badge-success' : 'badge-warning'}`}>{solved ? 'Solved' : 'Active'}</span>
                            </>
                        )}
                    </div>
                </div>
                <div className="chat-topbar-actions">
                    {guest ? (
                        <>
                            {messages.length > 0 && (
                                <button type="button" className="btn btn-secondary btn-sm" onClick={clearGuestChat} title="Clear this chat">
                                    <Trash2 size={15} /> <span className="mobile-hide">Clear</span>
                                </button>
                            )}
                            {!isAuth && (
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/signup')}>
                                    <UserPlus size={15} /> <span className="mobile-hide">Save chats free</span>
                                </button>
                            )}
                        </>
                    ) : (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSolved(!solved)}>
                            {solved ? <RotateCcw size={15} /> : <CheckCircle size={15} />}
                            <span className="mobile-hide">{solved ? 'Reopen' : 'Mark solved'}</span>
                        </button>
                    )}
                    <button type="button" className="btn-icon" onClick={toggleTheme} aria-label="Toggle theme">
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                    {!guest && (
                        <button type="button" className="profile-btn mobile-hide" onClick={() => navigate('/profile')} aria-label="Profile">
                            <User size={17} />
                        </button>
                    )}
                </div>
            </header>

            <div className="chat-scroll" ref={scrollRef}>
                <div className="chat-column">
                    {messages.length === 0 && !streaming ? (
                        <div className="chat-empty">
                            <span className="chat-empty-mark"><Logo size={52} withText={false} /></span>
                            <h2>What would you like to know?</h2>
                            <p>
                                Describe your situation in your own words, in English or your language. Every answer cites
                                the exact sections it uses; tap a number like <span className="cite-chip cite-chip-static">1</span> to read one.
                            </p>
                            {guest && (
                                <p className="chat-empty-note">
                                    <Info size={14} /> Guest chats stay in this browser tab only.{' '}
                                    {!isAuth && <><Link to="/signup">Create a free account</Link> to save them.</>}
                                </p>
                            )}
                            <div className="chat-empty-grid">
                                {TOPICS.map(t => (
                                    <button key={t.key} type="button" className="chat-empty-card" onClick={() => send(t.questions[0])}
                                        disabled={sending || solved}>
                                        <span className="chat-empty-card-head"><TopicIcon name={t.icon} size={15} /> {t.label}</span>
                                        <span className="chat-empty-card-q">{t.questions[0]}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className={`chat-thread${sending ? ' chat-thread-pinned' : ''}`}>
                            {messages.map((msg, index) => {
                                const msgKey = msg._id || index;
                                const isUser = msg.role === 'user';
                                return (
                                    <div key={msgKey} id={`row-${msgKey}`} className={`chat-row ${isUser ? 'chat-row-user' : ''}`}>
                                        {!isUser && <div className="chat-avatar chat-avatar-ai"><Logo size={34} withText={false} /></div>}
                                        <div className="chat-bubble-wrap">
                                            <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-ai'}`}>
                                                <div
                                                    className={isUser ? 'msg-user-text' : 'msg-ai-text'}
                                                    onClick={!isUser ? (e) => handleAnswerClick(e, msgKey) : undefined}
                                                    dangerouslySetInnerHTML={{
                                                        __html: isUser ? formatUserMessage(msg.content) : formatAssistantMessage(msg.content)
                                                    }}
                                                />
                                            </div>
                                            {!isUser && (
                                                <AnswerExtras msg={msg} msgKey={msgKey} openSource={openSource} setOpenSource={setOpenSource}
                                                    onFollowUp={send} onFeedback={handleFeedback} isLast={index === lastAssistantIndex}
                                                    busy={sending || solved}
                                                    allowFeedback={!guest && !String(msg._id || '').startsWith('temp')} />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {streaming && (
                                <div className="chat-row">
                                    <div className="chat-avatar chat-avatar-ai"><Logo size={34} withText={false} /></div>
                                    <div className="chat-bubble-wrap">
                                        <div className="bubble bubble-ai">
                                            {streaming.text ? (
                                                <div className="msg-ai-text streaming"
                                                    onClick={(e) => handleAnswerClick(e, 'streaming')}
                                                    dangerouslySetInnerHTML={{ __html: formatAssistantMessage(streaming.text) }} />
                                            ) : (
                                                <div className="thinking">
                                                    <span className="thinking-dots"><span /><span /><span /></span>
                                                    {streaming.sources.length
                                                        ? `Found ${streaming.sources.length} relevant sections, writing the answer…`
                                                        : 'Searching the Acts…'}
                                                </div>
                                            )}
                                        </div>
                                        {streaming.sources.length > 0 && (
                                            <AnswerExtras msg={{ sources: streaming.sources, grounded: streaming.grounded }} msgKey="streaming"
                                                openSource={openSource} setOpenSource={setOpenSource} onFollowUp={send}
                                                onFeedback={() => {}} isLast={false} busy live />
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <footer className="chat-composer">
                <div className="chat-column">
                    {error && (
                        <div className="chat-error" role="alert">
                            {error}
                            {guest && /account/i.test(error) && <> <Link to="/signup">Create a free account</Link></>}
                        </div>
                    )}
                    <form onSubmit={handleSubmit} className={`composer ${solved ? 'composer-disabled' : ''}`}>
                        <textarea
                            ref={inputRef}
                            rows={1}
                            value={query}
                            maxLength={2000}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={solved ? 'This conversation is marked as solved. Reopen it to continue.' : 'Ask a legal question, in any Indian language…'}
                            disabled={solved}
                            aria-label="Your question"
                        />
                        {sending ? (
                            <button type="button" className="composer-btn composer-stop" onClick={() => abortRef.current?.abort()}
                                aria-label="Stop generating" title="Stop">
                                <Square size={14} fill="currentColor" />
                            </button>
                        ) : (
                            <button type="submit" className={`composer-btn ${query.trim() && !solved ? 'ready' : ''}`}
                                disabled={!query.trim() || solved} aria-label="Send">
                                <ArrowUp size={18} />
                            </button>
                        )}
                    </form>
                    <div className="chat-footer-row">
                        <label className="lang-picker">
                            <Languages size={14} />
                            <span className="mobile-hide">Answer in</span>
                            <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Answer language">
                                {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                            </select>
                        </label>
                        <span>General information from Indian Acts, not legal advice. Check the cited sections.</span>
                    </div>
                </div>
            </footer>
        </div>
    );
}
