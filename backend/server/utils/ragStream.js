const axios = require('axios');
const { StringDecoder } = require('string_decoder');
const { SSEParser } = require('./sse');

const RAG_API_URL = process.env.RAG_API_URL || 'http://localhost:5000';

/**
 * Proxy the RAG service's answer stream to the browser as Server-Sent Events.
 * Forwards `meta` and `token` events as they arrive; when the answer is complete,
 * calls onDone(result) and sends whatever it returns as the `done` event.
 * Aborts the upstream request if the browser goes away.
 * Returns true if an answer was completed.
 */
async function proxyRagStream(req, res, payload, onDone) {
    res.set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no' // tell Nginx not to buffer the stream
    });
    res.flushHeaders();
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const upstream = new AbortController();
    let finished = false;
    res.on('close', () => { if (!finished) upstream.abort(); });

    let completed = false;
    try {
        const response = await axios.post(`${RAG_API_URL}/api/query/stream`, payload, {
            responseType: 'stream', timeout: 120000, signal: upstream.signal
        });
        const parser = new SSEParser();
        const decoder = new StringDecoder('utf8'); // a Hindi character can straddle two chunks
        let result = null;
        let failed = null;
        for await (const chunk of response.data) {
            for (const { event, data } of parser.push(decoder.write(chunk))) {
                if (event === 'meta' || event === 'token') send(event, data);
                else if (event === 'done') result = data;
                else if (event === 'error') failed = data;
            }
        }
        if (failed || !result) {
            send('error', { error: (failed && failed.error) || 'The AI service did not finish the answer.' });
        } else {
            send('done', await onDone(result));
            completed = true;
        }
    } catch (err) {
        if (!upstream.signal.aborted) {
            console.error('RAG stream error:', err.message);
            send('error', { error: 'The AI service is currently unavailable. Please try again later.' });
        }
    } finally {
        finished = true;
        res.end();
    }
    return completed;
}

module.exports = { proxyRagStream, RAG_API_URL };
