import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Sparkles, MessageSquareText, BookMarked, CornerDownLeft } from 'lucide-react';

/**
 * Ctrl/Cmd+K palette: ask a question, open a case or start from an Act.
 * `items` are { id, kind: 'case' | 'act', title, hint, run } and are filtered by the query;
 * a non-empty query always offers "Ask" first.
 */
export default function CommandPalette({ open, onClose, items, onAsk }) {
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        setQuery('');
        setActive(0);
        requestAnimationFrame(() => inputRef.current?.focus());
    }, [open]);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        const matched = items.filter(it => !q || `${it.title} ${it.hint || ''}`.toLowerCase().includes(q));
        const cases = matched.filter(it => it.kind === 'case').slice(0, 5);
        const acts = matched.filter(it => it.kind === 'act').slice(0, q ? 5 : 4);
        const ask = q ? [{ id: 'ask', kind: 'ask', title: query.trim(), run: () => onAsk(query.trim()) }] : [];
        return [...ask, ...cases, ...acts];
    }, [items, query, onAsk]);

    useEffect(() => { setActive(0); }, [query]);
    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    if (!open) return null;

    const choose = (it) => { onClose(); it.run(); };
    const onKeyDown = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter' && results[active]) { e.preventDefault(); choose(results[active]); }
    };

    let lastKind = null;
    const heading = { ask: 'Ask', case: 'Your cases', act: 'Start from an Act' };
    const icon = { ask: Sparkles, case: MessageSquareText, act: BookMarked };

    return (
        <div className="cp-backdrop" onMouseDown={onClose}>
            <div className="cp" role="dialog" aria-modal="true" aria-label="Search or ask" onMouseDown={(e) => e.stopPropagation()}>
                <div className="cp-input">
                    <Search size={18} />
                    <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
                        placeholder="Ask a question, find a case or an Act…" aria-label="Search or ask" />
                    <kbd>Esc</kbd>
                </div>
                <ul className="cp-list" ref={listRef} role="listbox">
                    {results.length === 0 && <li className="cp-empty">Type a question to ask it.</li>}
                    {results.map((it, i) => {
                        const Icon = icon[it.kind];
                        const head = it.kind !== lastKind ? heading[it.kind] : null;
                        lastKind = it.kind;
                        return (
                            <li key={it.id} role="presentation">
                                {head && <div className="cp-heading">{head}</div>}
                                <button type="button" role="option" aria-selected={i === active} data-index={i}
                                    className={`cp-item cp-${it.kind}${i === active ? ' active' : ''}`}
                                    onMouseEnter={() => setActive(i)} onClick={() => choose(it)}>
                                    <span className="cp-icon"><Icon size={16} /></span>
                                    <span className="cp-text">
                                        <span className="cp-title">{it.kind === 'ask' ? <>Ask OpenForge: <em>“{it.title}”</em></> : it.title}</span>
                                        {it.hint && <span className="cp-hint">{it.hint}</span>}
                                    </span>
                                    {i === active && <CornerDownLeft size={14} className="cp-enter" />}
                                </button>
                            </li>
                        );
                    })}
                </ul>
                <div className="cp-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Ctrl</kbd><kbd>K</kbd> toggle</span></div>
            </div>
        </div>
    );
}
