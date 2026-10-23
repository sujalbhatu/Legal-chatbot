// ─── Rich text renderer for chat messages ─────────────────────────────
// Turns the assistant's light markdown into HTML for dangerouslySetInnerHTML.
// EVERYTHING is HTML-escaped first, so neither a user's message nor text the
// model copies from a source can inject markup (the old renderer passed user
// messages through unescaped).

export const escapeHtml = (text) => String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Inline formatting on already-escaped text.
// withCitations: turn [1] markers into buttons that open source 1.
const inlineFormat = (escaped, withCitations) => {
    let s = escaped;

    // **bold**
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong class="msg-bold">$1</strong>');
    // *italic* and _italic_ (not inside words, so snake_case survives)
    s = s.replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[\s(])_(?!\s)(.+?)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');

    // Act names with a year, e.g. "Information Technology Act, 2000"
    s = s.replace(/\b([A-Z][a-zA-Z\s]+(?:Act|Code|Sanhita|Adhiniyam),?\s\d{4})\b/g,
        '<span class="msg-act-pill">$1</span>');

    // Section / Article references
    s = s.replace(/\b(Section|Article|Clause|Chapter|Rule|Order)\s+(\d+[A-Z]{0,2}(?:\(\d+\))?(?:\([a-z]\))?)/g,
        '<span class="msg-section-ref">$1 $2</span>');

    if (withCitations) {
        // [1], and the model's native 【1】 / 【1†L2】 while an answer is still streaming
        s = s.replace(/[[【［](\d{1,2})(?:†[^\]】］]*)?[\]】］]/g,
            '<button type="button" class="cite-chip" data-cite="$1" aria-label="Open source $1">$1</button>');
    }
    return s;
};

export const formatUserMessage = (text) => inlineFormat(escapeHtml(text), false);

export const formatAssistantMessage = (text) => {
    if (!text) return '';
    const lines = escapeHtml(text).split('\n');
    const blocks = [];
    let list = null;   // { type: 'ul'|'ol', items: [] }
    let quote = null;  // string[]

    const flushList = () => {
        if (!list) return;
        blocks.push(`<${list.type} class="msg-list">${list.items.map(i => `<li>${inlineFormat(i, true)}</li>`).join('')}</${list.type}>`);
        list = null;
    };
    const flushQuote = () => {
        if (!quote) return;
        blocks.push(`<blockquote class="msg-blockquote">${quote.map(l => inlineFormat(l, true)).join('<br/>')}</blockquote>`);
        quote = null;
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
            flushList();
            flushQuote();
            continue;
        }
        if (line.startsWith('&gt;')) {
            flushList();
            (quote = quote || []).push(line.replace(/^&gt;\s?/, ''));
            continue;
        }
        flushQuote();

        const heading = line.match(/^#{1,4}\s+(.+)$/);
        if (heading) {
            flushList();
            blocks.push(`<h4 class="msg-heading">${inlineFormat(heading[1], true)}</h4>`);
            continue;
        }
        const ul = line.match(/^[-*•]\s+(.+)$/);
        if (ul) {
            if (list && list.type !== 'ul') flushList();
            (list = list || { type: 'ul', items: [] }).items.push(ul[1]);
            continue;
        }
        const ol = line.match(/^(\d+)[.)]\s+(.+)$/);
        if (ol) {
            if (list && list.type !== 'ol') flushList();
            (list = list || { type: 'ol', items: [] }).items.push(ol[2]);
            continue;
        }
        flushList();

        // A line that is only bold text ("**Short answer**") reads as a section heading
        const boldOnly = line.match(/^\*\*(.+?)\*\*:?$/);
        if (boldOnly) {
            blocks.push(`<h4 class="msg-heading">${inlineFormat(boldOnly[1], true)}</h4>`);
            continue;
        }
        if (line.includes('⚠️') || /not legal advice|general information/i.test(line) && /^[_*]/.test(line)) {
            blocks.push(`<div class="msg-disclaimer">${inlineFormat(line, true)}</div>`);
            continue;
        }
        blocks.push(`<p class="msg-para">${inlineFormat(line, true)}</p>`);
    }
    flushList();
    flushQuote();
    return blocks.join('');
};
