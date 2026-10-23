import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Mail, User, ArrowRight, UserPlus } from 'lucide-react';
import { authService } from '../services/api';
import AuthLayout, { Field, FormError } from '../components/AuthLayout';

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
        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setLoading(true);
        try {
            const res = await authService.signup({ name, email, password });
            navigate('/verify-email', { state: { email, message: res.message } });
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to sign up.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout icon={UserPlus} title="Create your free account"
            subtitle="Save your conversations and come back to them anytime."
            footer={<>Already have an account? <Link to="/login">Sign in</Link></>}>
            <FormError>{error}</FormError>
            <form onSubmit={handleSignup}>
                <Field id="name" label="Full name" icon={User} placeholder="Your name" autoComplete="name"
                    value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
                <Field id="email" label="Email address" icon={Mail} type="email" placeholder="you@example.com"
                    autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <div className="field-row">
                    <Field id="password" label="Password" icon={Lock} type="password" placeholder="6+ characters"
                        autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    <Field id="confirm" label="Confirm" icon={Lock} type="password" placeholder="Repeat it"
                        autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                </div>
                <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                    {loading ? 'Creating account…' : <>Create account <ArrowRight size={17} /></>}
                </button>
                <p className="auth-fineprint">We will email you a 6-digit code to verify your address.</p>
            </form>
        </AuthLayout>
    );
}
