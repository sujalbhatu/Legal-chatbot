import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { House, Plus, UserRound, LogOut, Sun, Moon, Menu, X, BookOpen } from 'lucide-react';
import { authService, chatService } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { Logo } from './Brand';

const RECENT = 8;

/**
 * Signed-in layout: sidebar on desktop, top bar + drawer on phones.
 * `onNewChat` is the sidebar's primary action. Pages that already load the
 * conversations pass them as `sessions`; otherwise the sidebar loads them itself.
 */
export default function AppShell({ children, onNewChat, newChatBusy = false, sessions }) {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const [open, setOpen] = useState(false);
    const [ownSessions, setOwnSessions] = useState(null);
    const user = authService.getCurrentUser();
    const initial = (user?.name || 'U').trim().charAt(0).toUpperCase();

    useEffect(() => {
        if (sessions) return;
        let cancelled = false;
        chatService.getSessions()
            .then(data => { if (!cancelled) setOwnSessions(data.sessions); })
            .catch(() => { if (!cancelled) setOwnSessions([]); });
        return () => { cancelled = true; };
    }, [sessions]);

    const recent = (sessions || ownSessions || []).slice(0, RECENT);
    const close = () => setOpen(false);

    const logout = () => {
        authService.logout();
        navigate('/');
    };

    const nav = (
        <>
            <button type="button" className="shell-new" onClick={() => { close(); onNewChat ? onNewChat() : navigate('/dashboard'); }}
                disabled={newChatBusy}>
                <Plus size={16} /> New question
            </button>
            <nav className="shell-nav" aria-label="Main">
                <NavLink to="/dashboard" className="shell-link" onClick={close}>
                    <House size={16} /> Home
                </NavLink>
                <NavLink to="/profile" className="shell-link" onClick={close}>
                    <UserRound size={16} /> Profile & settings
                </NavLink>
                <a className="shell-link" href="/#faq" onClick={close}>
                    <BookOpen size={16} /> How it works
                </a>
            </nav>

            <div className="shell-recent">
                <div className="shell-section-label">Recent</div>
                {recent.length ? (
                    <ul>
                        {recent.map(s => (
                            <li key={s._id}>
                                <NavLink to={`/chat/${s._id}`} className="shell-recent-link" onClick={close} title={s.title}>
                                    <span className={`status-dot ${s.isSolved ? 'resolved' : 'open'}`} />
                                    <span className="shell-recent-title">{s.title || 'New Legal Query'}</span>
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="shell-recent-empty">{sessions || ownSessions ? 'Your conversations will appear here.' : ' '}</p>
                )}
            </div>

            <div className="shell-foot">
                <p className="shell-note">General information from Indian Acts, with sources. Not legal advice.</p>
                <div className="shell-user">
                    <button type="button" className="shell-user-card" onClick={() => { close(); navigate('/profile'); }}>
                        <span className="avatar">{initial}</span>
                        <span className="shell-user-text">
                            <span className="shell-user-name">{user?.name || 'Your account'}</span>
                            <span className="shell-user-email">{user?.email || ''}</span>
                        </span>
                    </button>
                    <div className="shell-user-actions">
                        <button type="button" className="btn-icon" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
                            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                        </button>
                        <button type="button" className="btn-icon" onClick={logout} aria-label="Sign out" title="Sign out">
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );

    return (
        <div className="shell">
            <aside className="shell-sidebar">
                <div className="shell-brand"><Logo size={30} onClick={() => navigate('/')} /></div>
                {nav}
            </aside>

            <header className="shell-topbar">
                <Logo size={30} onClick={() => navigate('/')} />
                <button type="button" className="btn-icon" onClick={() => setOpen(true)} aria-label="Open menu">
                    <Menu size={22} />
                </button>
            </header>
            {open && (
                <div className="shell-drawer-backdrop" onClick={close}>
                    <aside className="shell-drawer" onClick={(e) => e.stopPropagation()}>
                        <div className="shell-drawer-head">
                            <Logo size={30} />
                            <button type="button" className="btn-icon" onClick={close} aria-label="Close menu">
                                <X size={20} />
                            </button>
                        </div>
                        {nav}
                    </aside>
                </div>
            )}

            <main className="shell-main">{children}</main>
        </div>
    );
}
