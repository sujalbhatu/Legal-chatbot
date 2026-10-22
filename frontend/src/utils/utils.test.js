import { describe, it, expect } from 'vitest';
import { formatAssistantMessage, formatUserMessage, escapeHtml } from './formatMessage';
import { actInfo, citationLabel, uniqueCitations } from './acts';
import { plainPreview, PREVIEW_CHARS } from './preview';

describe('formatMessage', () => {
    it('escapes HTML in user and assistant text', () => {
        const evil = '<img src=x onerror=alert(1)>';
        expect(formatUserMessage(evil)).not.toContain('<img');
        expect(formatAssistantMessage(evil)).not.toContain('<img');
        expect(escapeHtml('a & "b"')).toBe('a &amp; &quot;b&quot;');
    });

    it('turns [n] in an answer into a clickable citation chip', () => {
        const html = formatAssistantMessage('Theft is punishable [1].');
        expect(html).toContain('data-cite="1"');
        expect(html).not.toContain('[1]');
    });

    it('does not make citation chips in user messages', () => {
        expect(formatUserMessage('see [1]')).not.toContain('data-cite');
    });
});

describe('acts', () => {
    it('shortens well-known Acts and keeps others readable', () => {
        expect(actInfo('Bharatiya Nagarik Suraksha Sanhita, 2023').short).toBe('BNSS');
        expect(actInfo('Right to Information Act, 2005').short).toBe('RTI Act');
        expect(actInfo('The Court-fees Act, 1870').short).toBe('Court-fees Act');
    });

    it('labels sections and Constitution articles', () => {
        expect(citationLabel({ act: 'Bharatiya Nyaya Sanhita, 2023', section: '303' })).toBe('BNS §303');
        expect(citationLabel({ act: 'Constitution of India', section: '21' })).toBe('Constitution Art. 21');
    });

    it('drops repeated and empty citations', () => {
        const c = { act: 'RTI', section: '6' };
        expect(uniqueCitations([c, { ...c }, { act: '', section: '1' }, { act: 'RTI', section: '7' }]))
            .toEqual([c, { act: 'RTI', section: '7' }]);
    });
});

describe('plainPreview', () => {
    it('shows the short answer, not the greeting, markdown or [n]', () => {
        const msg = "Hi! I'm sorry to hear that.\n\n**Short answer**\nIt is **theft** under BNS [1].";
        expect(plainPreview(msg)).toBe('It is theft under BNS .');
    });

    it('ends a preview the API cut short on a whole word', () => {
        const long = `**Short answer** ${'word '.repeat(60)}`.slice(0, PREVIEW_CHARS);
        const out = plainPreview(long);
        expect(out.endsWith('word…')).toBe(true);
    });
});
