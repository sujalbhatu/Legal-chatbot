// One-line previews of answers for lists.

export const PREVIEW_CHARS = 240;  // the sessions API sends at most this much of the last message

/** The last message as one plain line: the short answer itself, without greeting, markdown or [n]. */
export function plainPreview(text) {
    const t = text || '';
    const short = t.search(/\*\*Short answer\*\*/i);
    const plain = (short >= 0 ? t.slice(short).replace(/^\*\*Short answer\*\*/i, '') : t)
        .replace(/\[(\d+)\]/g, '')
        .replace(/[*_`#>]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    // cut by the API: end on a whole word
    return t.length >= PREVIEW_CHARS ? `${plain.replace(/\s+\S*$/, '')}…` : plain;
}
