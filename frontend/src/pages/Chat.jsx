import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft, CheckCircle, Scale, Building2, BookOpen, AlertTriangle, FileText, ChevronDown, ChevronRight, Loader2, User, Sun, Moon, RotateCcw } from 'lucide-react';
import { chatService } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Custom renderer for interactive follow-up questions
const FollowUpQuestions = ({ children }) => {
    return (
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {children}
        </div>
    );
};

// Markdown components mapping for custom CSS classes
const markdownComponents = {
    p: ({node, ...props}) => <p className="msg-para" {...props} />,
    strong: ({node, ...props}) => <strong className="msg-bold" {...props} />,
    em: ({node, ...props}) => <em className="msg-italic" {...props} />,
    ul: ({node, className, ...props}) => {
        // Detect if this is the follow-up questions list
        if (className === 'follow-up-list') {
            return <FollowUpQuestions {...props} />;
        }
        return <ul className="msg-list" {...props} />;
    },
    ol: ({node, ...props}) => <ol className="msg-list" {...props} />,
    li: ({node, className, children, ...props}) => {
        if (className === 'follow-up-item') {
            // Extract the text content from the list item
            let textContent = '';
            React.Children.forEach(children, child => {
                if (typeof child === 'string') textContent += child;
                else if (child?.props?.children) textContent += child.props.children;
            });
            
            return (
                <button 
                    className="msg-follow-up-btn"
                    onClick={() => {
                        // We will handle this click event in the main component
                        // by passing a custom event or letting the parent handle it
                        const event = new CustomEvent('followUpClick', { detail: textContent.trim() });
                        window.dispatchEvent(event);
                    }}
                >
                    <span style={{ marginRight: '0.5rem' }}>✨</span>
                    {children}
                </button>
            );
        }
        return <li {...props}>{children}</li>;
    },
    blockquote: ({node, ...props}) => <blockquote className="msg-blockquote" {...props} />,
    h3: ({node, ...props}) => <h3 className="msg-h3" {...props} />,
    h4: ({node, ...props}) => <h4 className="msg-h4" {...props} />,
    table: ({node, ...props}) => (
        <div className="msg-table-container">
            <table className="msg-table" {...props} />
        </div>
    ),
    th: ({node, ...props}) => <th className="msg-th" {...props} />,
    td: ({node, ...props}) => <td className="msg-td" {...props} />,
};

// Pre-processor to format act names and section references before markdown parsing
const preProcessMarkdown = (text) => {
    if (!text) return '';
    let s = text;
    
    // Tag the follow-up questions list so the renderer can intercept it
    // The LLM was instructed to output "### Follow-up Questions:"
    if (s.includes('### Follow-up Questions:')) {
        const parts = s.split('### Follow-up Questions:');
        const mainContent = parts[0];
        let followUps = parts[1].trim();
        
        // Convert the bullet points into our custom classes
        followUps = followUps.replace(/^- (.*)$/gm, '<li class="follow-up-item">$1</li>');
        
        s = mainContent + '\n\n<ul class="follow-up-list">\n' + followUps + '\n</ul>';
    }

    // Specific Act names with year (e.g. Aadhaar Act, 2016)
    s = s.replace(/\b([A-Z][a-zA-Z\s]+(?:Act|Code|Bill|Ordinance|Rules|Regulation|Sanhita|Adhiniyam),?\s\d{4})\b/g,
        '<span class="msg-act-pill">$1</span>');

    // Section / Article / Clause references
    s = s.replace(/\b(Section|Article|Clause|Chapter|Rule|Order)\s+(\d+[a-zA-Z]*(?:\(\d+\))?(?:\([a-z]\))?)\b/gi,
        '<span class="msg-section-ref">$1 $2</span>');

    return s;
};


// Legal disclaimer component
const LegalDisclaimer = () => (
    <div style={{ backgroundColor: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <AlertTriangle size={20} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--accent-gold)' }}>AI Disclaimer:</strong> This assistant provides information based on the provided statutory corpus (like the Aadhaar Act) using AI. While it quotes precise legal sections, it is NOT formal legal advice. Please consult a qualified legal professional for personal situations.
        </div>
    </div>
);

// Source citation component
const CitationSource = ({ source, index }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', marginBottom: '0.5rem', overflow: 'hidden' }}>
            <div
                onClick={() => setExpanded(!expanded)}
                style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', backgroundColor: expanded ? 'rgba(255,255,255,0.03)' : 'transparent' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexGrow: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'var(--accent-gold-transparent)', color: 'var(--accent-gold)', fontSize: '0.75rem', fontWeight: 'bold' }}>
                        {index + 1}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {source.act_name} {source.year && `(${source.year})`}
                        </span>
                        {source.section && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Section {source.section}: {source.section_title}
                            </span>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                    <div className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                        {Math.round(source.similarity * 100)}% match
                    </div>
                    {expanded ? <ChevronDown size={16} color="var(--text-muted)" /> : <ChevronRight size={16} color="var(--text-muted)" />}
                </div>
            </div>

            {expanded && (
                <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <FileText size={16} color="var(--accent-emerald)" style={{ marginTop: '2px', flexShrink: 0 }} />
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Clause Text:</span>
                    </div>
                    <p style={{ whiteSpace: 'pre-wrap', margin: 0, pl: '1.5rem', borderLeft: '2px solid var(--border-color)', paddingLeft: '1rem' }}>
                        {source.text}
                    </p>
                </div>
            )}
        </div>
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
    const messagesEndRef = useRef(null);
    const { theme, toggleTheme } = useTheme();

    useEffect(() => {
        const handleFollowUp = (e) => {
            const followUpText = e.detail;
            setQuery(followUpText);
            // Wait for state to update, then click the submit button
            setTimeout(() => {
                const submitBtn = document.getElementById('chat-submit-btn');
                if (submitBtn && !submitBtn.disabled) {
                    submitBtn.click();
                }
            }, 100);
        };
        
        window.addEventListener('followUpClick', handleFollowUp);
        return () => window.removeEventListener('followUpClick', handleFollowUp);
    }, []);

    useEffect(() => {
        loadSession();
    }, [id]);

    const isInitialLoad = useRef(true);

    useEffect(() => {
        if (isInitialLoad.current && messages.length > 0) {
            scrollToBottom();
            isInitialLoad.current = false;
        } else if (sending) {
            scrollToBottom();
        }
    }, [messages, sending]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

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

    const handleSend = async (e) => {
        e.preventDefault();
        if (!query.trim() || sending) return;

        const userQuery = query.trim();
        setQuery('');
        setSending(true);

        // Optimistically add user message
        const tempUserMessage = { _id: Date.now().toString(), role: 'user', content: userQuery, sources: [] };
        setMessages(prev => [...prev, tempUserMessage]);

        try {
            const data = await chatService.sendQuery(id, userQuery);
            // Replace with actual messages from server
            setMessages(prev => {
                const withoutTemp = prev.filter(m => m._id !== tempUserMessage._id);
                return [...withoutTemp, ...data.messages];
            });

            // Update session title if it changed
            if (session.title === 'New Legal Query' && data.session.title !== 'New Legal Query') {
                setSession(prev => ({ ...prev, title: data.session.title }));
            }
        } catch (err) {
            console.error('Failed to send query', err);
            // Remove temp message and show error (simplified)
            setMessages(prev => prev.filter(m => m._id !== tempUserMessage._id));
            alert('Failed to send query. Please try again.');
            setQuery(userQuery); // Restore input
        } finally {
            setSending(false);
        }
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

    return (
        <div className="app-layout chat-layout">
            <div className="main-content chat-main">

                {/* Chat Header */}
                <header className="chat-header" style={{ padding: '1rem 2rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--bg-panel)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button className="btn-icon" onClick={() => navigate('/dashboard')}>
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{session?.title || 'Legal Query'}</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                                <span className={`badge ${session?.isSolved ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.65rem' }}>
                                    {session?.isSolved ? 'Solved' : 'Active Session'}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {messages.length} messages
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {!session?.isSolved && (
                            <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={markAsSolved}>
                                <CheckCircle size={16} color="var(--accent-emerald)" /> Mark as Solved
                            </button>
                        )}
                        {session?.isSolved && (
                            <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={reopenSession}>
                                <RotateCcw size={16} color="var(--accent-gold)" /> Reopen
                            </button>
                        )}
                        <button className="btn-icon" onClick={toggleTheme} title="Toggle Theme" style={{ marginLeft: '0.5rem', marginRight: '0.5rem' }}>
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--accent-primary-transparent)', border: '1px solid var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', color: 'var(--accent-primary)', cursor: 'pointer' }} onClick={() => navigate('/profile')} title="View Profile">
                            <User size={18} />
                        </div>
                    </div>
                </header>

                {/* Chat Messages */}
                <div style={{ flexGrow: 1, overflowY: 'auto', padding: '2rem 1rem' }}>
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>

                        <LegalDisclaimer />

                        {messages.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: '1.5rem' }}>
                                    <Scale size={32} />
                                </div>
                                <h2>How can I help you today?</h2>
                                <p style={{ maxWidth: '500px', margin: '0 auto 2rem' }}>
                                    Ask any question about Indian statutory laws. I will retrieve exact sections and cite the specific clause text in my response.
                                </p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center' }}>
                                    <button className="btn btn-secondary" onClick={() => setQuery("What is the penalty for impersonation under the Aadhaar Act?")}>
                                        Aadhaar Impersonation Penalty
                                    </button>
                                    <button className="btn btn-secondary" onClick={() => setQuery("Can biometric information be shared under the Aadhaar Act?")}>
                                        Biometric Sharing Rules
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {messages.map((msg, index) => (
                                    <div key={msg._id || index} style={{ display: 'flex', gap: '1.5rem', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>

                                        {/* Avatar */}
                                        <div style={{ flexShrink: 0 }}>
                                            <div style={{
                                                width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                backgroundColor: msg.role === 'user' ? 'var(--bg-tertiary)' : 'var(--accent-gold-transparent)',
                                                border: '1px solid',
                                                borderColor: msg.role === 'user' ? 'var(--border-color)' : 'var(--accent-gold)'
                                            }}>
                                                {msg.role === 'user' ? <User size={20} color="var(--text-secondary)" /> : <Scale size={20} color="var(--accent-gold)" />}
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div style={{ maxWidth: '85%', minWidth: 0 }}>
                                            <div className="glass-card" style={{
                                                padding: '1.5rem',
                                                backgroundColor: msg.role === 'user' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-panel)',
                                                borderTopRightRadius: msg.role === 'user' ? '4px' : 'var(--radius-lg)',
                                                borderTopLeftRadius: msg.role === 'assistant' ? '4px' : 'var(--radius-lg)',
                                            }}>
                                                {msg.role === 'user' ? (
                                                    <div className="msg-user-text">{msg.content}</div>
                                                ) : (
                                                    <div className="msg-ai-text">
                                                        <ReactMarkdown 
                                                            remarkPlugins={[remarkGfm]} 
                                                            components={markdownComponents}
                                                        >
                                                            {preProcessMarkdown(msg.content)}
                                                        </ReactMarkdown>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Sources (only for assistant) */}
                                            {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                                                <div style={{ marginTop: '1rem' }}>
                                                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <BookOpen size={16} /> Legal Sources Cited ({msg.sources.length})
                                                    </div>
                                                    <div>
                                                        {msg.sources.map((source, i) => (
                                                            <CitationSource key={i} source={source} index={i} />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {/* Typing indicator */}
                                {sending && (
                                    <div style={{ display: 'flex', gap: '1.5rem' }}>
                                        <div style={{ flexShrink: 0 }}>
                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-primary-transparent)', border: `1px solid var(--accent-primary)` }}>
                                                <Loader2 size={20} color="var(--accent-primary)" className="animate-spin" />
                                            </div>
                                        </div>
                                        <div className="glass-card" style={{ padding: '1.25rem 1.5rem', borderTopLeftRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                <div className="animate-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-primary)' }}></div>
                                                <div className="animate-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-primary)', animationDelay: '200ms' }}></div>
                                                <div className="animate-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-primary)', animationDelay: '400ms' }}></div>
                                            </div>
                                            <span style={{ color: 'var(--accent-primary)', fontSize: '0.875rem', fontWeight: 500, letterSpacing: '0.02em' }} className="animate-pulse">
                                                AI is analyzing legal corpus...
                                            </span>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Input Area */}
                <div className="chat-footer" style={{ padding: '1.5rem 2rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <form onSubmit={handleSend} style={{ position: 'relative' }}>
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={session?.isSolved ? "This session is marked as solved. Start a new query to continue." : "Ask a legal question (e.g., 'What is the punishment for impersonation?')"}
                                disabled={sending || session?.isSolved}
                                style={{
                                    width: '100%',
                                    padding: '1.25rem 4rem 1.25rem 1.5rem',
                                    backgroundColor: 'var(--bg-tertiary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 'var(--radius-xl)',
                                    color: 'var(--text-primary)',
                                    fontSize: '1rem',
                                    fontFamily: 'inherit',
                                    outline: 'none',
                                    boxShadow: 'var(--shadow-lg)'
                                }}
                            />
                            <button
                                id="chat-submit-btn"
                                type="submit"
                                disabled={!query.trim() || sending || session?.isSolved}
                                style={{
                                    position: 'absolute',
                                    right: '0.75rem',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '50%',
                                    backgroundColor: query.trim() && !sending && !session?.isSolved ? 'var(--accent-gold)' : 'var(--bg-secondary)',
                                    color: query.trim() && !sending && !session?.isSolved ? '#000' : 'var(--text-muted)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: 'none',
                                    cursor: query.trim() && !sending && !session?.isSolved ? 'pointer' : 'not-allowed',
                                    transition: 'all 0.2s ease',
                                    boxShadow: query.trim() && !sending && !session?.isSolved ? '0 0 15px rgba(251, 191, 36, 0.4)' : 'none',
                                }}
                            >
                                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} style={{ marginLeft: '2px' }} />}
                            </button>
                        </form>
                        <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Legal Query Assistant can make mistakes. Verify important legal citations before use.
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
