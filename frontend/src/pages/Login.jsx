import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Scale, Lock, Mail, ArrowRight } from 'lucide-react';
import { authService } from '../services/api';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await authService.login({ email, password });
            navigate('/dashboard');
        } catch (err) {
            const errorData = err.response?.data;
            if (errorData?.unverified) {
                navigate('/verify-email', { state: { email: errorData.email, message: errorData.message } });
            } else {
                setError(errorData?.error || 'Failed to login. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
            <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem', position: 'relative', overflow: 'hidden' }}>

                {/* Decorative background blur inside card */}
                <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '200px', height: '200px', background: 'var(--accent-gold)', borderRadius: '50%', filter: 'blur(100px)', opacity: '0.15', zIndex: 0 }}></div>

                <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(16, 185, 129, 0.1))', border: '1px solid var(--border-color)', marginBottom: '1.5rem', boxShadow: 'var(--shadow-glow)' }}>
                        <Scale size={32} color="var(--accent-gold)" />
                    </div>
                    <h1>Welcome Back</h1>
                    <p>Sign in to your Legal Query Assistant account</p>
                </div>

                {error && (
                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)', color: '#ef4444', marginBottom: '1.5rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center' }}>
                        <div style={{ marginRight: '0.5rem' }}>⚠️</div>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} style={{ position: 'relative', zIndex: 1 }}>
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

                    <div className="input-group" style={{ marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label className="input-label" htmlFor="password">Password</label>
                            <Link to="/forgot-password" style={{ color: 'var(--accent-gold)', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 500 }} onMouseOver={(e) => e.target.style.textDecoration = 'underline'} onMouseOut={(e) => e.target.style.textDecoration = 'none'}>Forgot password?</Link>
                        </div>
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

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginBottom: '1.5rem' }} disabled={loading}>
                        {loading ? 'Signing in...' : 'Sign In'}
                        <ArrowRight size={18} />
                    </button>
                </form>

                <p style={{ textAlign: 'center', margin: 0, fontSize: '0.875rem' }}>
                    Don't have an account? <Link to="/signup" style={{ color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 500 }}>Sign up</Link>
                </p>
            </div>
        </div>
    );
}
