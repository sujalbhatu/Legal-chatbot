import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MessageSquare, Clock, CheckCircle, ArrowRight, LogOut, Scale, Sun, Moon, Trash2 } from 'lucide-react';
import { chatService, authService } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';

export default function Dashboard() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('all'); // all, active, solved
    const [user, setUser] = useState(null);
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();

    useEffect(() => {
        setUser(authService.getCurrentUser());
        loadSessions();
    }, []);

    const loadSessions = async () => {
        try {
            setError('');
            const data = await chatService.getSessions();
            setSessions(data.sessions);
        } catch (err) {
            console.error('Failed to load sessions', err);
            setError('Failed to load your queries. Please check your connection or log in again.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSession = async () => {
        try {
            setError('');
            const data = await chatService.createSession('New Legal Query');
            navigate(`/chat/${data.session._id}`);
        } catch (err) {
            console.error('Failed to create session', err);
            setError('Failed to create a new session. Please try again.');
        }
    };

    const handleLogout = () => {
        authService.logout();
        navigate('/login');
    };

    const handleDeleteSession = async (e, sessionId) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this query? This cannot be undone.')) return;
        try {
            await chatService.deleteSession(sessionId);
            setSessions(prev => prev.filter(s => s._id !== sessionId));
        } catch (err) {
            console.error('Failed to delete session', err);
        }
    };

    const filteredSessions = sessions.filter(s => {
        if (filter === 'active') return !s.isSolved;
        if (filter === 'solved') return s.isSolved;
        return true;
    });

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    return (
        <div className="app-layout">
            {/* Sidebar */}
            <div className="sidebar">
                <div 
                    style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
                    onClick={() => navigate('/')}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(16, 185, 129, 0.1))', border: '1px solid var(--border-focus)' }}>
                        <Scale size={18} color="var(--accent-gold)" />
                    </div>
                    <span className="mobile-hide" style={{ fontWeight: 600, fontSize: '1.1rem', letterSpacing: '-0.01em' }}>OpenForge</span>
                </div>

                <div className="sidebar-middle" style={{ padding: '1.5rem', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <button
                        className="btn btn-primary new-query-btn"
                        style={{ width: '100%', marginBottom: '2rem' }}
                        onClick={handleCreateSession}
                    >
                        <Plus size={18} /> <span className="mobile-hide">New Query</span>
                    </button>

                    <div className="filters-section" style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.75rem' }}>
                            Filters
                        </div>

                        <button
                            className={`btn ${filter === 'all' ? 'btn-secondary' : 'btn-icon'}`}
                            style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem', marginBottom: '0.25rem', border: filter === 'all' ? '1px solid var(--border-color)' : '1px solid transparent' }}
                            onClick={() => setFilter('all')}
                        >
                            <MessageSquare size={16} /> All Queries
                        </button>
                        <button
                            className={`btn ${filter === 'active' ? 'btn-secondary' : 'btn-icon'}`}
                            style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem', marginBottom: '0.25rem', border: filter === 'active' ? '1px solid var(--border-color)' : '1px solid transparent' }}
                            onClick={() => setFilter('active')}
                        >
                            <Clock size={16} color="var(--accent-gold)" /> Active
                        </button>
                        <button
                            className={`btn ${filter === 'solved' ? 'btn-secondary' : 'btn-icon'}`}
                            style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem', border: filter === 'solved' ? '1px solid var(--border-color)' : '1px solid transparent' }}
                            onClick={() => setFilter('solved')}
                        >
                            <CheckCircle size={16} color="var(--accent-emerald)" /> Solved
                        </button>
                    </div>
                </div>

                <div className="sidebar-bottom" style={{ padding: '1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => navigate('/profile')}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--accent-primary-transparent)', border: '1px solid var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', color: 'var(--accent-primary)' }}>
                            {user?.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="mobile-hide" style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.2, color: 'var(--text-primary)' }}>{user?.name || 'User'}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)' }}>View Profile</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn-icon" onClick={toggleTheme} title="Toggle Theme">
                            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                        </button>
                        <button className="btn-icon" onClick={handleLogout} title="Sign Out">
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="main-content" style={{ overflowY: 'auto' }}>
                <div style={{ padding: '3rem 4rem', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem' }}>
                        <div>
                            <h1 style={{ marginBottom: '0.5rem' }}>Your Queries</h1>
                            <p style={{ margin: 0, fontSize: '1.1rem' }}>Review past answers or start a new legal research session.</p>
                        </div>
                    </div>

                    {error && (
                        <div style={{ padding: '1rem 1.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)', color: '#ef4444', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span>⚠️</span>
                                <span>{error}</span>
                            </div>
                            <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.875rem' }} onClick={loadSessions}>
                                Retry
                            </button>
                        </div>
                    )}

                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {[1, 2, 3].map(i => (
                                <div key={i} className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center' }}>
                                    <div className="skeleton-box" style={{ width: '40px', height: '40px', borderRadius: '8px', marginRight: '1rem' }}></div>
                                    <div style={{ flexGrow: 1 }}>
                                        <div className="skeleton-box" style={{ width: '40%', height: '1.2rem', marginBottom: '0.5rem' }}></div>
                                        <div className="skeleton-box" style={{ width: '20%', height: '0.8rem' }}></div>
                                    </div>
                                    <div className="skeleton-box" style={{ width: '80px', height: '30px', borderRadius: '16px' }}></div>
                                </div>
                            ))}
                        </div>
                    ) : filteredSessions.length === 0 ? (
                        <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: '1.5rem' }}>
                                <MessageSquare size={32} color="var(--text-muted)" />
                            </div>
                            <h3 style={{ marginBottom: '0.5rem' }}>No queries found</h3>
                            <p style={{ marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2rem' }}>
                                {filter === 'all'
                                    ? "You haven't started any legal queries yet. Start a new session to get AI-powered legal assistance."
                                    : `You don't have any ${filter} queries right now.`}
                            </p>
                            {filter === 'all' && (
                                <button className="btn btn-primary" onClick={handleCreateSession}>
                                    Start New Session
                                </button>
                            )}
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                            {filteredSessions.map(session => (
                                <div
                                    key={session._id}
                                    className="glass-card animate-fade-in"
                                    style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem', cursor: 'pointer', height: '220px' }}
                                    onClick={() => navigate(`/chat/${session._id}`)}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                        <div className={`badge ${session.isSolved ? 'badge-success' : 'badge-warning'}`}>
                                            {session.isSolved ? 'Solved' : 'Active'}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {formatDate(session.updatedAt)}
                                        </div>
                                    </div>

                                    <h4 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', flexGrow: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        {session.title}
                                    </h4>

                                    <p style={{ fontSize: '0.875rem', flexGrow: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: 0, opacity: 0.8 }}>
                                        {session.lastMessage || 'No messages yet...'}
                                    </p>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                        <span>{session.messageCount} messages</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <button
                                                className="btn-icon"
                                                title="Delete query"
                                                onClick={(e) => handleDeleteSession(e, session._id)}
                                                style={{ padding: '0.3rem', borderRadius: '6px' }}
                                            >
                                                <Trash2 size={14} color="var(--text-muted)" />
                                            </button>
                                            <ArrowRight size={16} className="text-muted" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
