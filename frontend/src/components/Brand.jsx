import { Scale, Shield, Heart, Home, Smartphone, Landmark, Briefcase, Car } from 'lucide-react';

// The OpenForge mark: a scale in a rounded square, with optional wordmark
export function Logo({ size = 32, withText = true, onClick, className = '' }) {
    return (
        <div className={`brand ${onClick ? 'brand-link' : ''} ${className}`} onClick={onClick}
            role={onClick ? 'link' : undefined} tabIndex={onClick ? 0 : undefined}
            onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}>
            <span className="brand-mark" style={{ width: size, height: size }}>
                <Scale size={Math.round(size * 0.55)} />
            </span>
            {withText && <span className="brand-name">OpenForge</span>}
        </div>
    );
}

const TOPIC_ICONS = { Shield, Heart, Home, Smartphone, Landmark, Briefcase, Car };

export function TopicIcon({ name, size = 18 }) {
    const Icon = TOPIC_ICONS[name] || Scale;
    return <Icon size={size} />;
}

/** The ink surface's moving light and grain; place inside an element with class "ink". */
export function InkBackdrop() {
    return (
        <>
            <div className="ink-aurora" aria-hidden="true"><span /><span /><span /></div>
            <div className="ink-grain" aria-hidden="true" />
        </>
    );
}
