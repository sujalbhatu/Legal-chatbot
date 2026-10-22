import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, KeyRound, SlidersHorizontal, UserRound, LogOut, Sun, Moon, Languages } from 'lucide-react';
import { authService, chatService } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import AppShell from '../components/AppShell';
import { FormError, FormSuccess } from '../components/AuthLayout';
import { LANGUAGES } from '../data/content';

const readLang = () => { try { return localStorage.getItem('legal_lang') || 'auto'; } catch { return 'auto'; } };

export default function Profile() {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const [user, setUser] = useState(() => authService.getCurrentUser());
    const [name, setName] = useState(user?.name || '');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [savingName, setSavingName] = useState(false);
    const [savingPw, setSavingPw] = useState(false);
    const [nameMsg, setNameMsg] = useState({ error: '', success: '' });
    const [pwMsg, setPwMsg] = useState({ error: '', success: '' });
    const [language, setLanguage] = useState(readLang);

    useEffect(() => { if (!user) navigate('/login'); }, [user, navigate]);
    useEffect(() => { try { localStorage.setItem('legal_lang', language); } catch { /* private mode */ } }, [language]);

    const saveName = async (e) => {
        e.preventDefault();
        setNameMsg({ error: '', success: '' });
        if (name.trim().length < 2) { setNameMsg({ error: 'Name must be at least 2 characters.', success: '' }); return; }
        if (name.trim() === user.name) return;
        setSavingName(true);
        try {
            const res = await authService.updateProfile({ name: name.trim() });
            setUser(res.user);
            setNameMsg({ error: '', success: 'Name updated.' });
        } catch (err) {
            setNameMsg({ error: err.response?.data?.error || 'Could not update your name.', success: '' });
        } finally {
            setSavingName(false);
        }
    };

    const savePassword = async (e) => {
        e.preventDefault();
        setPwMsg({ error: '', success: '' });
        if (password.length < 6) { setPwMsg({ error: 'Password must be at least 6 characters.', success: '' }); return; }
        if (password !== confirmPassword) { setPwMsg({ error: 'Passwords do not match.', success: '' }); return; }
        setSavingPw(true);
        try {
            await authService.updateProfile({ password });
            setPassword('');
            setConfirmPassword('');
            setPwMsg({ error: '', success: 'Password changed. Other devices have been signed out.' });
        } catch (err) {
            setPwMsg({ error: err.response?.data?.error || 'Could not change your password.', success: '' });
        } finally {
            setSavingPw(false);
        }
    };

    const newChat = async () => {
        const data = await chatService.createSession('New Legal Query');
        navigate(`/chat/${data.session._id}`);
    };

    if (!user) return null;
    const initial = (user.name || 'U').trim().charAt(0).toUpperCase();
    const joined = user.createdAt
        ? new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(user.createdAt))
        : null;

    return (
        <AppShell onNewChat={newChat}>
            <div className="page page-narrow">
                <header className="profile-head">
                    <span className="avatar avatar-lg">{initial}</span>
                    <div>
                        <h1 className="page-title">{user.name}</h1>
                        <p className="page-subtitle">{user.email}{joined ? ` · Member since ${joined}` : ''}</p>
                    </div>
                </header>

                <section className="card settings-card">
                    <div className="settings-head">
                        <span className="settings-icon"><UserRound size={18} /></span>
                        <div><h2>Account</h2><p>Your name as shown in the app.</p></div>
                    </div>
                    <form onSubmit={saveName} className="settings-body">
                        <FormError>{nameMsg.error}</FormError>
                        <FormSuccess>{nameMsg.success}</FormSuccess>
                        <div className="field-row">
                            <div className="input-group">
                                <label className="input-label" htmlFor="p-name">Full name</label>
                                <input id="p-name" className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
                            </div>
                            <div className="input-group">
                                <label className="input-label" htmlFor="p-email">Email</label>
                                <input id="p-email" className="input-field" value={user.email} disabled />
                            </div>
                        </div>
                        <div className="settings-actions">
                            <button type="submit" className="btn btn-primary" disabled={savingName || name.trim() === user.name}>
                                <Save size={16} /> {savingName ? 'Saving…' : 'Save name'}
                            </button>
                        </div>
                    </form>
                </section>

                <section className="card settings-card">
                    <div className="settings-head">
                        <span className="settings-icon"><KeyRound size={18} /></span>
                        <div><h2>Password</h2><p>Changing it signs you out on all other devices.</p></div>
                    </div>
                    <form onSubmit={savePassword} className="settings-body">
                        <FormError>{pwMsg.error}</FormError>
                        <FormSuccess>{pwMsg.success}</FormSuccess>
                        <div className="field-row">
                            <div className="input-group">
                                <label className="input-label" htmlFor="p-pw">New password</label>
                                <input id="p-pw" type="password" className="input-field" value={password} autoComplete="new-password"
                                    onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
                            </div>
                            <div className="input-group">
                                <label className="input-label" htmlFor="p-pw2">Confirm new password</label>
                                <input id="p-pw2" type="password" className="input-field" value={confirmPassword} autoComplete="new-password"
                                    onChange={(e) => setConfirmPassword(e.target.value)} />
                            </div>
                        </div>
                        <div className="settings-actions">
                            <button type="submit" className="btn btn-primary" disabled={savingPw || !password}>
                                <KeyRound size={16} /> {savingPw ? 'Changing…' : 'Change password'}
                            </button>
                        </div>
                    </form>
                </section>

                <section className="card settings-card">
                    <div className="settings-head">
                        <span className="settings-icon"><SlidersHorizontal size={18} /></span>
                        <div><h2>Preferences</h2><p>Saved on this device.</p></div>
                    </div>
                    <div className="settings-body">
                        <div className="pref-row">
                            <div>
                                <div className="pref-title">{theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />} Appearance</div>
                                <div className="pref-text">{theme === 'dark' ? 'Dark theme' : 'Light theme'}</div>
                            </div>
                            <button type="button" role="switch" aria-checked={theme === 'dark'} className={`switch ${theme === 'dark' ? 'on' : ''}`}
                                onClick={toggleTheme} aria-label="Dark theme"><span /></button>
                        </div>
                        <div className="pref-row">
                            <div>
                                <div className="pref-title"><Languages size={16} /> Answer language</div>
                                <div className="pref-text">Auto-detect answers in the language you write in.</div>
                            </div>
                            <select className="input-field pref-select" value={language} onChange={(e) => setLanguage(e.target.value)}
                                aria-label="Answer language">
                                {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                            </select>
                        </div>
                    </div>
                </section>

                <div className="profile-signout">
                    <button type="button" className="btn btn-secondary" onClick={() => { authService.logout(); navigate('/'); }}>
                        <LogOut size={16} /> Sign out
                    </button>
                </div>
            </div>
        </AppShell>
    );
}
