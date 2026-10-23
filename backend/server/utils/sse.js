// Incremental parser for a Server-Sent Events stream: feed it text as it arrives,
// get back the complete events ({ event, data }) seen so far.
class SSEParser {
    constructor() {
        this.buffer = '';
    }

    push(text) {
        this.buffer += text.replace(/\r\n/g, '\n');
        const events = [];
        let sep;
        while ((sep = this.buffer.indexOf('\n\n')) !== -1) {
            const block = this.buffer.slice(0, sep);
            this.buffer = this.buffer.slice(sep + 2);
            let event = 'message';
            const dataLines = [];
            for (const line of block.split('\n')) {
                if (line.startsWith('event:')) event = line.slice(6).trim();
                else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
            }
            if (!dataLines.length) continue;
            const raw = dataLines.join('\n');
            let data;
            try {
                data = JSON.parse(raw);
            } catch {
                data = raw;
            }
            events.push({ event, data });
        }
        return events;
    }
}

module.exports = { SSEParser };
