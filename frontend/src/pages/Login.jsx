import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Lock, Mail, ArrowRight, LogIn } from 'lucide-react';
import { authService } from '../services/api';
import AuthLayout, { Field, FormError } from '../components/AuthLayout';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('expired') === 'true') {
            setError('Your session has expired. Please sign in again.');
        }
    }, [location]);

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
                setError(errorData?.error || 'Failed to sign in. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout icon={LogIn} title="Welcome back" subtitle="Sign in to continue your saved conversations."
            footer={<>New to OpenForge? <Link to="/signup">Create a free account</Link></>}>
            <FormError>{error}</FormError>
            <form onSubmit={handleLogin}>
                <Field id="email" label="Email address" icon={Mail} type="email" placeholder="you@example.com"
                    autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Field id="password" label="Password" icon={Lock} type="password" placeholder="••••••••"
                    autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required
                    aside={<Link to="/forgot-password" className="field-aside-link">Forgot password?</Link>} />
                <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                    {loading ? 'Signing in…' : <>Sign in <ArrowRight size={17} /></>}
                </button>
            </form>
        </AuthLayout>
    );
}
