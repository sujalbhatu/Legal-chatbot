import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { MailCheck, Mail, Hash, ArrowRight } from 'lucide-react';
import { authService } from '../services/api';
import AuthLayout, { Field, FormError, FormSuccess } from '../components/AuthLayout';

export default function VerifyEmail() {
    const navigate = useNavigate();
    const location = useLocation();
    // The email is passed in location.state from Signup/Login
    const [email, setEmail] = useState(location.state?.email || '');
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const successMsg = location.state?.message || '';

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
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.error || 'Verification failed. Please check your code.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout icon={MailCheck} title="Verify your email"
            subtitle="We sent a 6-digit code to your inbox. If you don't see it, check Spam or Junk."
            footer={<>Wrong address? <Link to="/signup">Sign up again</Link></>}>
            <FormSuccess>{successMsg}</FormSuccess>
            <FormError>{error}</FormError>
            <form onSubmit={handleVerify}>
                <Field id="email" label="Email address" icon={Mail} type="email" placeholder="you@example.com"
                    value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Field id="otp" label="Verification code" icon={Hash} inputMode="numeric" maxLength={6} placeholder="123456"
                    autoComplete="one-time-code" className="otp-input" value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required />
                <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                    {loading ? 'Verifying…' : <>Verify and continue <ArrowRight size={17} /></>}
                </button>
            </form>
        </AuthLayout>
    );
}
