import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Scale, Lock, Mail, User, ArrowRight } from 'lucide-react';
import { authService } from '../services/api';

export default function Signup() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSignup = async (e) => {
        e.preventDefault();
        setError('');
        
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        
        setLoading(true);
        try {
            const res = await authService.signup({ name, email, password });
            navigate('/verify-email', { state: { email, message: res.message } });
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to sign up');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
            <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem', position: 'relative', overflow: 'hidden' }}>

                {/* Decorative background blur inside card */}
                <div style={{ position: 'absolute', top: '-100px', left: '-100px', width: '200px', height: '200px', background: 'var(--accent-secondary)', borderRadius: '50%', filter: 'blur(100px)', opacity: '0.15', zIndex: 0 }}></div>

                <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(59, 130, 246, 0.1))', border: '1px solid var(--border-color)', marginBottom: '1.5rem', boxShadow: 'var(--shadow-glow)' }}>
                        <Scale size={32} color="var(--accent-secondary)" />
                    </div>
                    <h1>Create Account</h1>
                    <p>Join Legal Query Assistant today</p>
                </div>

                {error && (
                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)', color: '#ef4444', marginBottom: '1.5rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center' }}>
                        <div style={{ marginRight: '0.5rem' }}>⚠️</div>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSignup} style={{ position: 'relative', zIndex: 1 }}>
                    <div className="input-group">
                        <label className="input-label" htmlFor="name">Full Name</label>
                        <div style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', top: '50%', left: '1rem', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                                <User size={18} />
                            </div>
                            <input
                                id="name"
                                type="text"
                                className="input-field"
                                placeholder="John Doe"
                                style={{ paddingLeft: '2.75rem' }}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label" htmlFor="email">Email Address</label>
                        <div style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', top: '50%', left: '1rem', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                                <Mail size={18} />
                            </div>
                            <input
                                id="email"
                                type="email"
                                className="input-field"
                                placeholder="you@example.com"
                                style={{ paddingLeft: '2.75rem' }}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label" htmlFor="password">Password</label>
                        <div style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', top: '50%', left: '1rem', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                                <Lock size={18} />
                            </div>
                            <input
                                id="password"
                                type="password"
                                className="input-field"
                                placeholder="••••••••"
                                style={{ paddingLeft: '2.75rem' }}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="input-group" style={{ marginBottom: '2rem' }}>
                        <label className="input-label" htmlFor="confirmPassword">Confirm Password</label>
                        <div style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', top: '50%', left: '1rem', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                                <Lock size={18} />
                            </div>
                            <input
                                id="confirmPassword"
                                type="password"
                                className="input-field"
                                placeholder="••••••••"
                                style={{ paddingLeft: '2.75rem' }}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginBottom: '1.5rem' }} disabled={loading}>
                        {loading ? 'Creating account...' : 'Create Account'}
                        <ArrowRight size={18} />
                    </button>
                </form>

                <p style={{ textAlign: 'center', margin: 0, fontSize: '0.875rem' }}>
                    Already have an account? <Link to="/login" style={{ color: 'var(--accent-emerald)', textDecoration: 'none', fontWeight: 500 }}>Sign in</Link>
                </p>
            </div>
        </div>
    );
}
