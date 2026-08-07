import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../services/api';
import { User, Mail, Lock, Save, ArrowLeft, CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

function Profile() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const currentUser = authService.getCurrentUser();
        if (currentUser) {
            setUser(currentUser);
            setName(currentUser.name || '');
            setEmail(currentUser.email || '');
        } else {
            navigate('/login');
        }
    }, [navigate]);

    const handleUpdate = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (password && password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);

        try {
            const updateData = {};
            if (name !== user.name) updateData.name = name;
            if (password) updateData.password = password;

            if (Object.keys(updateData).length === 0) {
                setLoading(false);
                return;
            }

            const res = await authService.updateProfile(updateData);
            setUser(res.user);
            setSuccess('Profile updated successfully!');
            setPassword(''); // clear password field on success
            setConfirmPassword('');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to update profile.');
        } finally {
            setLoading(false);
        }
    };

    if (!user) return null;

    return (
        <div className="app-layout">
            <header style={{ padding: '1rem 2rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-panel)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 10 }}>
                <Link to="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                    <ArrowLeft size={20} /> Back to Dashboard
                </Link>
            </header>

            <div className="main-content" style={{ overflowY: 'auto', padding: '2rem 1rem' }}>
                <div className="container" style={{ maxWidth: '600px', margin: '0 auto' }}>
                    
                    <div className="glass-card animate-fade-in" style={{ padding: '2.5rem' }}>
                    <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                        <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--accent-primary-transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto', border: '1px solid var(--accent-primary)' }}>
                            <User size={40} color="var(--accent-primary)" />
                        </div>
                        <h2 style={{ marginBottom: '0.5rem' }}>Your Profile</h2>
                        <p style={{ margin: 0 }}>Update your personal information and security settings.</p>
                    </div>

                    {error && (
                        <div style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)', color: '#ef4444', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <AlertTriangle size={18} /> {error}
                        </div>
                    )}

                    {success && (
                        <div style={{ padding: '1rem', backgroundColor: 'var(--accent-secondary-transparent)', border: '1px solid var(--accent-secondary-transparent)', borderRadius: 'var(--radius-md)', color: 'var(--accent-secondary)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <CheckCircle size={18} /> {success}
                        </div>
                    )}

                    <form onSubmit={handleUpdate}>
                        <div className="input-group">
                            <label className="input-label">Email Address (Read-Only)</label>
                            <div style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                                    <Mail size={18} />
                                </div>
                                <input
                                    type="email"
                                    className="input-field"
                                    style={{ paddingLeft: '2.75rem', backgroundColor: 'rgba(0,0,0,0.5)', color: 'var(--text-muted)', cursor: 'not-allowed' }}
                                    value={email}
                                    disabled
                                />
                            </div>
                        </div>

                        <div className="input-group" style={{ marginTop: '1.5rem' }}>
                            <label className="input-label">Full Name</label>
                            <div style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                                    <User size={18} />
                                </div>
                                <input
                                    type="text"
                                    className="input-field"
                                    style={{ paddingLeft: '2.75rem' }}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Enter your full name"
                                    required
                                    minLength="2"
                                />
                            </div>
                        </div>

                        <div className="input-group" style={{ marginTop: '1.5rem' }}>
                            <label className="input-label">New Password (Optional)</label>
                            <div style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                                    <Lock size={18} />
                                </div>
                                <input
                                    type="password"
                                    className="input-field"
                                    style={{ paddingLeft: '2.75rem' }}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Leave blank to keep current password"
                                    minLength="6"
                                />
                            </div>
                        </div>

                        {password && (
                            <div className="input-group" style={{ marginTop: '1.5rem' }}>
                                <label className="input-label">Confirm New Password</label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                                        <Lock size={18} />
                                    </div>
                                    <input
                                        type="password"
                                        className="input-field"
                                        style={{ paddingLeft: '2.75rem' }}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Confirm your new password"
                                        required
                                    />
                                </div>
                            </div>
                        )}

                        <button 
                            type="submit" 
                            className="btn btn-primary" 
                            style={{ width: '100%', marginTop: '2rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
                            disabled={loading || (name === user.name && !password)}
                        >
                            {loading ? (
                                <div className="animate-spin" style={{ width: '20px', height: '20px', border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%' }}></div>
                            ) : (
                                <><Save size={18} /> Save Changes</>
                            )}
                        </button>
                    </form>
                </div>
                
                <div style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--text-muted)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <ShieldCheck size={16} /> Your data is securely encrypted.
                </div>
            </div>
            </div>
        </div>
    );
}

export default Profile;
