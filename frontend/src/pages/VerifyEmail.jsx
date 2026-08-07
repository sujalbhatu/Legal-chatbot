import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { authService } from '../services/api';
import { AlertTriangle, MailCheck } from 'lucide-react';

function VerifyEmail() {
    const navigate = useNavigate();
    const location = useLocation();
    
    // We expect the email to be passed in location.state from Signup/Login
    const initialEmail = location.state?.email || '';

    const [email, setEmail] = useState(initialEmail);
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState(location.state?.message || '');

    const handleVerify = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!email || !otp) {
            setError('Please enter your email and the 6-digit code.');
            return;
        }

        setLoading(true);

        try {
            await authService.verifyEmail({ email, otp });
            // Successfully verified and token set in localstorage
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.error || 'Verification failed. Please check your code.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
            <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '3rem', position: 'relative' }}>
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--accent-emerald-transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto', border: '1px solid var(--accent-emerald)' }}>
                        <MailCheck size={32} color="var(--accent-emerald)" />
                    </div>
                    <h2 style={{ marginBottom: '0.5rem' }}>Verify Your Email</h2>
                    <p style={{ margin: 0, color: 'var(--text-muted)' }}>We sent a 6-digit code to your inbox.</p>
                    <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}><em>(Note: Please check your Spam/Junk folder if you don't see it!)</em></p>
                </div>

                {successMsg && (
                    <div style={{ padding: '1rem', backgroundColor: 'var(--accent-emerald-transparent)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-md)', color: 'var(--accent-emerald)', marginBottom: '1.5rem', textAlign: 'center' }}>
                        {successMsg}
                    </div>
                )}

                {error && (
                    <div style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)', color: '#ef4444', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <AlertTriangle size={18} /> {error}
                    </div>
                )}

                <form onSubmit={handleVerify}>
                    {!initialEmail && (
                        <div className="input-group">
                            <label className="input-label">Email Address</label>
                            <input
                                type="email"
                                className="input-field"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                                required
                            />
                        </div>
                    )}

                    <div className="input-group">
                        <label className="input-label">6-Digit Verification Code</label>
                        <input
                            type="text"
                            className="input-field"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            placeholder="e.g. 123456"
                            maxLength="6"
                            style={{ letterSpacing: '0.2em', fontSize: '1.25rem', textAlign: 'center' }}
                            required
                        />
                    </div>

                    <button 
                        type="submit" 
                        className="btn btn-primary" 
                        style={{ width: '100%', marginTop: '2rem' }}
                        disabled={loading}
                    >
                        {loading ? (
                            <div className="animate-spin" style={{ width: '20px', height: '20px', border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%', margin: '0 auto' }}></div>
                        ) : (
                            'Verify Account'
                        )}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <Link to="/login" className="auth-link">Back to Login</Link>
                </div>
            </div>
        </div>
    );
}

export default VerifyEmail;
