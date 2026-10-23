import { describe, it, expect, vi, afterEach } from 'vitest';
import { streamSSE } from './api';

// A fetch Response whose body arrives in the given pieces
function streamResponse(pieces, { status = 200 } = {}) {
    const enc = new TextEncoder();
    const body = new ReadableStream({
        start(controller) {
            pieces.forEach(p => controller.enqueue(enc.encode(p)));
            controller.close();
        },
    });
    return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

const run = (handlers = {}) => streamSSE('/api/x', { query: 'q' }, handlers, undefined, false);

afterEach(() => vi.unstubAllGlobals());

describe('streamSSE', () => {
    it('passes meta and tokens on and resolves with the done payload', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => streamResponse([
            'event: meta\ndata: {"sources":[{"n":1}],"grounded":true}\n\n',
            'event: token\ndata: {"text":"Hel"}\n\nevent: token\ndata: {"text":"lo"}\n\n',
            'event: done\ndata: {"message":{"content":"Hello"}}\n\n',
        ])));
        const tokens = [];
        const meta = vi.fn();
        const result = await run({ onMeta: meta, onToken: t => tokens.push(t) });
        expect(meta).toHaveBeenCalledWith({ sources: [{ n: 1 }], grounded: true });
        expect(tokens.join('')).toBe('Hello');
        expect(result).toEqual({ message: { content: 'Hello' } });
    });

    it('handles events split across network chunks and CRLF line endings', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => streamResponse([
            'event: tok', 'en\r\ndata: {"text":"a"}\r', '\n\r\nevent: done\r\ndata: {"ok":tr', 'ue}\r\n\r\n',
        ])));
        const tokens = [];
        const result = await run({ onToken: t => tokens.push(t) });
        expect(tokens).toEqual(['a']);
        expect(result).toEqual({ ok: true });
    });

    it('turns an error event into a rejected promise', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => streamResponse([
            'event: error\ndata: {"error":"The AI service is busy."}\n\n',
        ])));
        await expect(run()).rejects.toThrow('The AI service is busy.');
    });

    it('rejects when the stream ends without a done event', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => streamResponse(['event: token\ndata: {"text":"a"}\n\n'])));
        await expect(run()).rejects.toThrow('The answer was interrupted.');
    });

    it("shows the server's message for the guest limit (429)", async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ error: 'Guest limit reached for today.' }), { status: 429 })));
        await expect(run()).rejects.toThrow('Guest limit reached for today.');
    });
});
