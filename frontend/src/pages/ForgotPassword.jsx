import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { KeyRound, Mail, Lock, Hash, ArrowRight } from 'lucide-react';
import { authService } from '../services/api';
import AuthLayout, { Field, FormError, FormSuccess } from '../components/AuthLayout';

export default function ForgotPassword() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState('');
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
            setSuccess('Password reset. Taking you to sign in…');
            setTimeout(() => navigate('/login'), 2000);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to reset password. Check your code.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout icon={KeyRound} title="Reset your password"
            subtitle={step === 1 ? 'Enter your email and we will send you a reset code.'
                : 'Enter the 6-digit code from your email (check Spam too) and a new password.'}
            footer={<>Remembered it? <Link to="/login">Back to sign in</Link></>}>
            <div className="steps-indicator" aria-label={`Step ${step} of 2`}>
                <span className={step >= 1 ? 'on' : ''} /><span className={step >= 2 ? 'on' : ''} />
            </div>
            <FormError>{error}</FormError>
            <FormSuccess>{success}</FormSuccess>
            {step === 1 ? (
                <form onSubmit={handleRequestReset}>
                    <Field id="email" label="Email address" icon={Mail} type="email" placeholder="you@example.com"
                        autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                        {loading ? 'Sending…' : <>Send reset code <ArrowRight size={17} /></>}
                    </button>
                </form>
            ) : (
                <form onSubmit={handleResetPassword}>
                    <Field id="otp" label="Reset code" icon={Hash} inputMode="numeric" maxLength={6} placeholder="123456"
                        autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required />
                    <Field id="new-password" label="New password" icon={Lock} type="password" placeholder="6+ characters"
                        autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                    <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                        {loading ? 'Resetting…' : <>Reset password <ArrowRight size={17} /></>}
                    </button>
                    <button type="button" className="btn-link" onClick={() => { setStep(1); setSuccess(''); }}>
                        Use a different email
                    </button>
                </form>
            )}
        </AuthLayout>
    );
}
