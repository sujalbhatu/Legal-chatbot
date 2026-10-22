import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { BookOpen, Languages, ShieldCheck, Sun, Moon, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { Logo, InkBackdrop } from './Brand';

const POINTS = [
    { icon: BookOpen, title: 'Answers with sources', text: 'Every answer shows the exact sections of the Act it is based on.' },
    { icon: Languages, title: 'In your language', text: 'Ask in English or 13 Indian languages, from Hindi to Santali.' },
    { icon: ShieldCheck, title: 'Private by default', text: 'Verified accounts, hashed passwords, chats visible only to you.' },
];

/** Split layout for sign-in, sign-up and password pages. */
export default function AuthLayout({ icon: Icon, title, subtitle, children, footer }) {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();

    return (
        <div className="auth">
            <section className="auth-brand ink" aria-hidden="false">
                <InkBackdrop />
                <Logo size={36} onClick={() => navigate('/')} className="brand-inverse" />
                <div className="auth-brand-body">
                    <h2>Indian law, explained clearly.<br />With the sections to prove it.</h2>
                    <ul className="auth-points">
                        {POINTS.map(({ icon: PIcon, title: t, text }) => (
                            <li key={t}>
                                <span className="auth-point-icon"><PIcon size={18} /></span>
                                <span><strong>{t}</strong><span>{text}</span></span>
                            </li>
                        ))}
                    </ul>
                </div>
                <p className="auth-brand-foot">General legal information, not legal advice.</p>
            </section>

            <section className="auth-panel">
                <div className="auth-panel-top">
                    <Logo size={30} onClick={() => navigate('/')} className="auth-mobile-logo" />
                    <button type="button" className="btn-icon" onClick={toggleTheme} aria-label="Toggle theme">
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                </div>
                <div className="auth-card animate-fade-in">
                    {Icon && <div className="auth-icon"><Icon size={24} /></div>}
                    <h1 className="auth-title">{title}</h1>
                    {subtitle && <p className="auth-subtitle">{subtitle}</p>}
                    {children}
                    {footer && <div className="auth-footer">{footer}</div>}
                </div>
                <Link to="/try" className="auth-guest">
                    Just want to ask a question? Continue as guest <ArrowRight size={15} />
                </Link>
            </section>
        </div>
    );
}

/** Labelled input with a leading icon. */
export function Field({ id, label, icon: Icon, aside, className = '', ...inputProps }) {
    return (
        <div className="input-group">
            <div className="field-label-row">
                <label className="input-label" htmlFor={id}>{label}</label>
                {aside}
            </div>
            <div className="field-control">
                {Icon && <Icon size={17} className="field-icon" />}
                {inputProps.type === 'password'
                    ? <PasswordInput id={id} className={`input-field ${Icon ? 'has-icon' : ''} ${className}`} {...inputProps} />
                    : <input id={id} className={`input-field ${Icon ? 'has-icon' : ''} ${className}`} {...inputProps} />}
            </div>
        </div>
    );
}

/** Password input with a show/hide button. Needs a positioned parent (.field-control). */
export function PasswordInput({ className = '', ...inputProps }) {
    const [show, setShow] = useState(false);
    return (
        <>
            <input {...inputProps} type={show ? 'text' : 'password'} className={`${className} has-toggle`} />
            <button type="button" className="pw-toggle" onClick={() => setShow(s => !s)} tabIndex={-1}
                aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} title={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
        </>
    );
}

export function FormError({ children }) {
    if (!children) return null;
    return <div className="form-alert form-alert-error" role="alert">{children}</div>;
}

export function FormSuccess({ children }) {
    if (!children) return null;
    return <div className="form-alert form-alert-success" role="status">{children}</div>;
}
