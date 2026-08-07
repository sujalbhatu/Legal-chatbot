import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../services/api';
import { AlertTriangle, KeyRound, CheckCircle } from 'lucide-react';

function ForgotPassword() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    
    // Step 1 State
    const [email, setEmail] = useState('');
    
    // Step 2 State
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const handleRequestReset = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!email) {
            setError('Please enter your email address.');
            return;
        }

        setLoading(true);

        try {
            const res = await authService.forgotPassword(email);
            setSuccess(res.message);
            setStep(2);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to send reset code.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError('');

        if (!otp || !newPassword) {
            setError('Please enter the code and your new password.');
            return;
        }

        setLoading(true);

        try {
            await authService.resetPassword({ email, otp, newPassword });
            setSuccess('Password successfully reset! Redirecting to login...');
            setTimeout(() => navigate('/login'), 2000);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to reset password. Check your code.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
            <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '3rem', position: 'relative' }}>
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--accent-primary-transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto', border: '1px solid var(--accent-primary)' }}>
                        <KeyRound size={32} color="var(--accent-primary)" />
                    </div>
                    <h2 style={{ marginBottom: '0.5rem' }}>Reset Password</h2>
                    <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                        {step === 1 ? "Enter your email to receive a reset code." : "Enter your reset code and new password."}
                    </p>
                    {step === 2 && (
                        <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}><em>(Note: Please check your Spam/Junk folder if you don't see it!)</em></p>
                    )}
                </div>

                {error && (
                    <div style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)', color: '#ef4444', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <AlertTriangle size={18} /> {error}
                    </div>
                )}

                {success && (
                    <div style={{ padding: '1rem', backgroundColor: 'var(--accent-emerald-transparent)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-md)', color: 'var(--accent-emerald)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <CheckCircle size={18} /> {success}
                    </div>
                )}

                {step === 1 ? (
                    <form onSubmit={handleRequestReset}>
                        <div className="input-group">
                            <label className="input-label">Email Address</label>
                            <input
                                type="email"
                                className="input-field"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@example.com"
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
                                'Send Reset Code'
                            )}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleResetPassword}>
                        <div className="input-group">
                            <label className="input-label">6-Digit Reset Code</label>
                            <input
                                type="text"
                                className="input-field"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                placeholder="123456"
                                maxLength="6"
                                style={{ letterSpacing: '0.2em', fontSize: '1.25rem', textAlign: 'center' }}
                                required
                            />
                        </div>
                        <div className="input-group" style={{ marginTop: '1.5rem' }}>
                            <label className="input-label">New Password</label>
                            <input
                                type="password"
                                className="input-field"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new password"
                                minLength="6"
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
                                'Reset Password'
                            )}
                        </button>
                    </form>
                )}

                <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <Link to="/login" className="auth-link">Back to Login</Link>
                </div>
            </div>
        </div>
    );
}

export default ForgotPassword;
