import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MessageSquarePlus, UserRound, LogOut, Sun, Moon, Menu, X, BookOpen } from 'lucide-react';
import { authService } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { Logo } from './Brand';

/**
 * Signed-in layout: sidebar on desktop, top bar + drawer on phones.
 * `onNewChat` is the sidebar's primary action.
 */
export default function AppShell({ children, onNewChat, newChatBusy = false }) {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const [open, setOpen] = useState(false);
    const user = authService.getCurrentUser();
    const initial = (user?.name || 'U').trim().charAt(0).toUpperCase();

    const logout = () => {
        authService.logout();
        navigate('/');
    };

    const nav = (
        <>
            <button type="button" className="btn btn-primary shell-new" onClick={() => { setOpen(false); onNewChat?.(); }}
                disabled={newChatBusy}>
                <MessageSquarePlus size={18} /> New question
            </button>
            <nav className="shell-nav" aria-label="Main">
                <NavLink to="/dashboard" className="shell-link" onClick={() => setOpen(false)}>
                    <LayoutDashboard size={18} /> Dashboard
                </NavLink>
                <NavLink to="/profile" className="shell-link" onClick={() => setOpen(false)}>
                    <UserRound size={18} /> Profile & settings
                </NavLink>
                <a className="shell-link" href="/#faq" onClick={() => setOpen(false)}>
                    <BookOpen size={18} /> How it works
                </a>
            </nav>
            <div className="shell-note">
                General information from Indian Acts, with sources. Not legal advice.
            </div>
            <div className="shell-user">
                <button type="button" className="shell-user-card" onClick={() => { setOpen(false); navigate('/profile'); }}>
                    <span className="avatar">{initial}</span>
                    <span className="shell-user-text">
                        <span className="shell-user-name">{user?.name || 'Your account'}</span>
                        <span className="shell-user-email">{user?.email || ''}</span>
                    </span>
                </button>
                <div className="shell-user-actions">
                    <button type="button" className="btn-icon" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
                        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                    </button>
                    <button type="button" className="btn-icon" onClick={logout} aria-label="Sign out" title="Sign out">
                        <LogOut size={17} />
                    </button>
                </div>
            </div>
        </>
    );

    return (
        <div className="shell">
            <aside className="shell-sidebar">
                <div className="shell-brand"><Logo size={34} onClick={() => navigate('/')} /></div>
                {nav}
            </aside>

            <header className="shell-topbar">
                <Logo size={30} onClick={() => navigate('/')} />
                <button type="button" className="btn-icon" onClick={() => setOpen(true)} aria-label="Open menu">
                    <Menu size={22} />
                </button>
            </header>
            {open && (
                <div className="shell-drawer-backdrop" onClick={() => setOpen(false)}>
                    <aside className="shell-drawer" onClick={(e) => e.stopPropagation()}>
                        <div className="shell-drawer-head">
                            <Logo size={30} />
                            <button type="button" className="btn-icon" onClick={() => setOpen(false)} aria-label="Close menu">
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
