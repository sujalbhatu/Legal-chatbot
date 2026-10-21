import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Send, ArrowLeft, CheckCircle, Scale, BookOpen, AlertTriangle, FileText, ChevronDown, ChevronRight,
    Loader2, User, Sun, Moon, RotateCcw, ThumbsUp, ThumbsDown, Languages, SearchX, Sparkles
} from 'lucide-react';
import { chatService } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { formatAssistantMessage, formatUserMessage } from '../utils/formatMessage';

const LANGUAGES = [
    ['auto', 'Auto-detect'], ['en', 'English'], ['hi', 'हिन्दी'], ['bn', 'বাংলা'], ['mr', 'मराठी'],
    ['ta', 'தமிழ்'], ['te', 'తెలుగు'], ['gu', 'ગુજરાતી'], ['kn', 'ಕನ್ನಡ'], ['ml', 'മലയാളം'],
    ['pa', 'ਪੰਜਾਬੀ'], ['or', 'ଓଡ଼ିଆ'], ['as', 'অসমীয়া'], ['sat', 'ᱥᱟᱱᱛᱟᱲᱤ'], ['ur', 'اردو'],
];

const EXAMPLES = [
    'Someone stole my bike. What offence is this under the BNS?',
    'How do I file an RTI application and how long do they have to reply?',
    'My husband and in-laws harass me for dowry. What can I do?',
    'Someone made a fake Instagram account with my photos.',
];

const readLanguage = () => {
    try { return localStorage.getItem('legal_lang') || 'auto'; } catch { return 'auto'; }
};

// Legal disclaimer component
const LegalDisclaimer = () => (
    <div style={{ backgroundColor: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <AlertTriangle size={20} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--accent-gold)' }}>AI Disclaimer:</strong> Answers are generated from 18 Indian Acts
            (Constitution, BNS, BNSS, BSA, CPC, Contract, Property, Marriage, Domestic Violence, POCSO, IT, Motor Vehicles,
            GST, RTI, Aadhaar and more) and cite the exact sections used. This is general information, NOT legal advice.
        </div>
    </div>
);

const relevanceLabel = (score) => {
    if (score === null || score === undefined) return null;
    if (score >= 0.7) return 'High relevance';
    if (score >= 0.3) return 'Medium relevance';
    return 'Low relevance';
};

// One retrieved section. `open` is controlled so a [n] chip in the answer can open it.
const SourceCard = ({ source, n, open, onToggle, anchorId }) => {
    const relevance = relevanceLabel(source.similarity);
    return (
        <div id={anchorId} className={`source-card${open ? ' source-card-open' : ''}`}>
            <button type="button" className="source-card-head" onClick={onToggle} aria-expanded={open}>
                <span className="source-num">{n}</span>
                <span className="source-title">
                    <span className="source-act">{source.act_name}</span>
                    {source.section && (
                        <span className="source-section">
                            {source.source_file?.startsWith('constitution') ? 'Article' : 'Section'} {source.section}
                            {source.section_title ? `: ${source.section_title}` : ''}
                        </span>
                    )}
                </span>
                <span className="source-badges">
                    {source.cited && <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Cited</span>}
                    {relevance && <span className="badge badge-neutral mobile-hide" style={{ fontSize: '0.65rem' }}>{relevance}</span>}
                    {open ? <ChevronDown size={16} color="var(--text-muted)" /> : <ChevronRight size={16} color="var(--text-muted)" />}
                </span>
            </button>
            {open && (
                <div className="source-card-body">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <FileText size={16} color="var(--accent-emerald)" />
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Text of the section</span>
                    </div>
                    <p className="source-text">{source.text}</p>
                </div>
            )}
        </div>
    );
};

// Sources, follow-ups and feedback under an assistant answer
const AnswerExtras = ({ msg, msgKey, openSource, setOpenSource, onFollowUp, onFeedback, isLast, busy }) => {
    const sources = msg.sources || [];
    const cited = sources.filter(s => s.cited).length;
    return (
        <>
            {msg.grounded === false && (
                <div className="answer-note">
                    <SearchX size={15} /> No section in the indexed Acts matched this question closely.
                </div>
            )}
            {msg.unsupportedCitations?.length > 0 && (
                <div className="answer-note answer-note-warn">
                    <AlertTriangle size={15} />
                    Could not verify {msg.unsupportedCitations.map(s => `Section/Article ${s}`).join(', ')} against the
                    retrieved text. Check it before relying on it.
                </div>
            )}

            {sources.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                    <div className="sources-heading">
                        <BookOpen size={16} /> Sources ({cited ? `${cited} cited, ` : ''}{sources.length} retrieved)
                    </div>
                    {sources.map((source, i) => {
                        const n = source.n || i + 1;
                        return (
                            <SourceCard key={n} source={source} n={n}
                                anchorId={`src-${msgKey}-${n}`}
                                open={openSource?.msgKey === msgKey && openSource?.n === n}
                                onToggle={() => setOpenSource(prev =>
                                    prev?.msgKey === msgKey && prev?.n === n ? null : { msgKey, n })} />
                        );
                    })}
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

            {msg._id && !String(msg._id).startsWith('temp') && (
                <div className="feedback-row">
                    <span>Was this helpful?</span>
                    <button type="button" className={`btn-icon feedback-btn${msg.feedback?.rating === 'up' ? ' active' : ''}`}
                        aria-label="Helpful" onClick={() => onFeedback(msg, 'up')}>
                        <ThumbsUp size={15} />
                    </button>
                    <button type="button" className={`btn-icon feedback-btn${msg.feedback?.rating === 'down' ? ' active' : ''}`}
                        aria-label="Not helpful" onClick={() => onFeedback(msg, 'down')}>
                        <ThumbsDown size={15} />
                    </button>
                </div>
            )}
        </>
    );
};

export default function Chat() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [messages, setMessages] = useState([]);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [streaming, setStreaming] = useState(null);   // { text, sources, grounded } while an answer streams
    const [error, setError] = useState('');
    const [language, setLanguage] = useState(readLanguage);
    const [openSource, setOpenSource] = useState(null); // { msgKey, n }
    const messagesEndRef = useRef(null);
    const abortRef = useRef(null);
    const { theme, toggleTheme } = useTheme();

    useEffect(() => {
        loadSession();
        return () => abortRef.current?.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages.length, sending, streaming?.text?.length]);

    useEffect(() => {
        try { localStorage.setItem('legal_lang', language); } catch { /* private mode */ }
    }, [language]);

    const loadSession = async () => {
        try {
            setLoading(true);
            const data = await chatService.getSession(id);
            setSession(data.session);
            setMessages(data.session.messages);
        } catch (err) {
            console.error('Failed to load session', err);
            navigate('/dashboard');
        } finally {
            setLoading(false);
        }
    };

    const send = useCallback(async (text) => {
        const userQuery = text.trim();
        if (!userQuery || sending || session?.isSolved) return;
        setQuery('');
        setError('');
        setSending(true);
        setOpenSource(null);

        const tempUser = { _id: `temp-${Date.now()}`, role: 'user', content: userQuery, sources: [] };
        setMessages(prev => [...prev, tempUser]);
        setStreaming({ text: '', sources: [], grounded: true });

        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const data = await chatService.streamQuery(id, userQuery, language === 'auto' ? undefined : language, {
                onMeta: (meta) => setStreaming(s => ({ ...s, sources: meta.sources || [], grounded: meta.grounded })),
                onToken: (t) => setStreaming(s => ({ ...s, text: s.text + t })),
            }, controller.signal);
            setMessages(prev => [...prev.filter(m => m._id !== tempUser._id), ...data.messages]);
            if (data.session?.title) setSession(prev => ({ ...prev, title: data.session.title }));
        } catch (err) {
            if (controller.signal.aborted) return;
            console.error('Failed to send query', err);
            setMessages(prev => prev.filter(m => m._id !== tempUser._id));
            setError(err.message || 'Failed to send query. Please try again.');
            setQuery(userQuery);
        } finally {
            setStreaming(null);
            setSending(false);
        }
    }, [id, language, sending, session?.isSolved]);

    const handleSubmit = (e) => {
        e.preventDefault();
        send(query);
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

    const markAsSolved = async () => {
        try {
            await chatService.solveSession(id);
            setSession(prev => ({ ...prev, isSolved: true }));
        } catch (err) {
            console.error('Failed to mark as solved', err);
        }
    };

    const reopenSession = async () => {
        try {
            await chatService.reopenSession(id);
            setSession(prev => ({ ...prev, isSolved: false }));
        } catch (err) {
            console.error('Failed to reopen session', err);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <Loader2 size={40} color="var(--accent-gold)" className="animate-pulse" />
            </div>
        );
    }

    const lastAssistantIndex = messages.map(m => m.role).lastIndexOf('assistant');

    return (
        <div className="app-layout chat-layout">
            <div className="main-content chat-main">

                {/* Chat Header */}
                <header className="chat-header" style={{ padding: '1rem 2rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', backgroundColor: 'var(--bg-panel)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                        <button className="btn-icon" onClick={() => navigate('/dashboard')} aria-label="Back to dashboard">
                            <ArrowLeft size={20} />
                        </button>
                        <div style={{ minWidth: 0 }}>
                            <h3 className="chat-title">{session?.title || 'Legal Query'}</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                                <span className={`badge ${session?.isSolved ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.65rem' }}>
                                    {session?.isSolved ? 'Solved' : 'Active Session'}
                                </span>
                                <span className="mobile-hide" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {messages.length} messages
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        {!session?.isSolved && (
                            <button className="btn btn-secondary header-action" onClick={markAsSolved} title="Mark as solved">
                                <CheckCircle size={16} color="var(--accent-emerald)" /> <span className="mobile-hide">Mark as Solved</span>
                            </button>
                        )}
                        {session?.isSolved && (
                            <button className="btn btn-secondary header-action" onClick={reopenSession} title="Reopen">
                                <RotateCcw size={16} color="var(--accent-gold)" /> <span className="mobile-hide">Reopen</span>
                            </button>
                        )}
                        <button className="btn-icon" onClick={toggleTheme} title="Toggle Theme" aria-label="Toggle theme">
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                        <button type="button" className="profile-btn mobile-hide" onClick={() => navigate('/profile')} title="View Profile" aria-label="View profile">
                            <User size={18} />
                        </button>
                    </div>
                </header>

                {/* Chat Messages */}
                <div className="chat-scroll" style={{ flexGrow: 1, overflowY: 'auto', padding: '2rem 1rem' }}>
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>

                        <LegalDisclaimer />

                        {messages.length === 0 && !streaming ? (
                            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: '1.5rem' }}>
                                    <Scale size={32} />
                                </div>
                                <h2>How can I help you today?</h2>
                                <p style={{ maxWidth: '520px', margin: '0 auto 2rem' }}>
                                    Ask about Indian law in English or your own language. Every answer cites the exact
                                    sections it is based on — tap a number like <span className="cite-chip cite-chip-static">1</span> to read the section.
                                </p>
                                <div className="followups" style={{ justifyContent: 'center' }}>
                                    {EXAMPLES.map(ex => (
                                        <button key={ex} type="button" className="followup-chip" onClick={() => send(ex)} disabled={sending || session?.isSolved}>
                                            {ex}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {messages.map((msg, index) => {
                                    const msgKey = msg._id || index;
                                    return (
                                        <div key={msgKey} className={`chat-row ${msg.role === 'user' ? 'chat-row-user' : ''}`}>
                                            <div className={`chat-avatar ${msg.role === 'user' ? '' : 'chat-avatar-ai'}`}>
                                                {msg.role === 'user' ? <User size={20} color="var(--text-secondary)" /> : <Scale size={20} color="var(--accent-gold)" />}
                                            </div>
                                            <div className="chat-bubble-wrap">
                                                <div className="glass-card" style={{
                                                    padding: '1.25rem 1.5rem',
                                                    backgroundColor: msg.role === 'user' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-panel)',
                                                    borderTopRightRadius: msg.role === 'user' ? '4px' : 'var(--radius-lg)',
                                                    borderTopLeftRadius: msg.role === 'assistant' ? '4px' : 'var(--radius-lg)',
                                                }}>
                                                    <div
                                                        className={msg.role === 'user' ? 'msg-user-text' : 'msg-ai-text'}
                                                        onClick={msg.role === 'assistant' ? (e) => handleAnswerClick(e, msgKey) : undefined}
                                                        dangerouslySetInnerHTML={{
                                                            __html: msg.role === 'user' ? formatUserMessage(msg.content) : formatAssistantMessage(msg.content)
                                                        }}
                                                    />
                                                </div>
                                                {msg.role === 'assistant' && (
                                                    <AnswerExtras msg={msg} msgKey={msgKey} openSource={openSource} setOpenSource={setOpenSource}
                                                        onFollowUp={send} onFeedback={handleFeedback} isLast={index === lastAssistantIndex}
                                                        busy={sending || session?.isSolved} />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* The answer being streamed */}
                                {streaming && (
                                    <div className="chat-row">
                                        <div className="chat-avatar chat-avatar-ai">
                                            <Scale size={20} color="var(--accent-gold)" />
                                        </div>
                                        <div className="chat-bubble-wrap">
                                            <div className="glass-card" style={{ padding: '1.25rem 1.5rem', borderTopLeftRadius: '4px', backgroundColor: 'var(--bg-panel)' }}>
                                                {streaming.text ? (
                                                    <div className="msg-ai-text streaming"
                                                        onClick={(e) => handleAnswerClick(e, 'streaming')}
                                                        dangerouslySetInnerHTML={{ __html: formatAssistantMessage(streaming.text) }} />
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <Loader2 size={18} color="var(--accent-primary)" className="animate-spin" />
                                                        <span style={{ color: 'var(--accent-primary)', fontSize: '0.875rem', fontWeight: 500 }} className="animate-pulse">
                                                            {streaming.sources.length
                                                                ? `Found ${streaming.sources.length} relevant sections, writing the answer…`
                                                                : 'Searching the Acts…'}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            {streaming.sources.length > 0 && (
                                                <AnswerExtras msg={{ sources: streaming.sources, grounded: streaming.grounded }} msgKey="streaming"
                                                    openSource={openSource} setOpenSource={setOpenSource} onFollowUp={send}
                                                    onFeedback={() => {}} isLast={false} busy />
                                            )}
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Input Area */}
                <div className="chat-footer" style={{ padding: '1.25rem 2rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        {error && <div className="chat-error" role="alert">{error}</div>}
                        <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
                            <input
                                type="text"
                                value={query}
                                maxLength={2000}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={session?.isSolved ? 'This session is marked as solved. Reopen it to continue.' : 'Ask a legal question, in any Indian language…'}
                                disabled={sending || session?.isSolved}
                                aria-label="Your question"
                                className="chat-input"
                            />
                            <button
                                type="submit"
                                aria-label="Send"
                                disabled={!query.trim() || sending || session?.isSolved}
                                className={`chat-send${query.trim() && !sending && !session?.isSolved ? ' chat-send-ready' : ''}`}
                            >
                                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} style={{ marginLeft: '2px' }} />}
                            </button>
                        </form>
                        <div className="chat-footer-row">
                            <label className="lang-picker">
                                <Languages size={14} />
                                <span className="mobile-hide">Answer in</span>
                                <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Answer language">
                                    {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                                </select>
                            </label>
                            <span>Can make mistakes. Check the cited sections before relying on them.</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
