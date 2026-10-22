import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add a request interceptor to inject the JWT token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('legal_token');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add a response interceptor to handle 401/403 (expired or invalid token)
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Only a signed-in user can have an expired session; a guest's 401 is just an error
        const hadSession = !!localStorage.getItem('legal_token');
        if (hadSession && error.response && (error.response.status === 401 || error.response.status === 403)) {
            // Clear invalid credentials
            localStorage.removeItem('legal_token');
            localStorage.removeItem('legal_user');

            // Redirect to login if not already there
            if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/signup')) {
                window.location.href = '/login?expired=true';
            }
        }
        return Promise.reject(error);
    }
);

/** POST `body` and read the Server-Sent Events answer stream (meta, token, done, error). */
async function streamSSE(url, body, handlers, signal, withAuth) {
    const token = withAuth ? localStorage.getItem('legal_token') : null;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body),
        signal
    });
    if (withAuth && response.status === 401) {
        localStorage.removeItem('legal_token');
        localStorage.removeItem('legal_user');
        window.location.href = '/login?expired=true';
        throw new Error('Session expired');
    }
    if (!response.ok || !response.body) {
        let message = response.status === 429 ? 'Too many questions right now.' : 'Failed to send your question.';
        try { message = (await response.json()).error || message; } catch { /* not JSON */ }
        throw new Error(message);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let sep;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const event = (block.match(/^event: ?(.*)$/m) || [])[1] || 'message';
            const dataLine = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
            if (!dataLine) continue;
            const data = JSON.parse(dataLine);
            if (event === 'meta') handlers.onMeta?.(data);
            else if (event === 'token') handlers.onToken?.(data.text);
            else if (event === 'done') result = data;
            else if (event === 'error') throw new Error(data.error || 'The AI service failed.');
        }
    }
    if (!result) throw new Error('The answer was interrupted.');
    return result;
}

// Auth services
export const authService = {
    login: async (credentials) => {
        const response = await api.post('/auth/login', credentials);
        if (response.data.token) {
            localStorage.setItem('legal_token', response.data.token);
            localStorage.setItem('legal_user', JSON.stringify(response.data.user));
        }
        return response.data;
    },

    signup: async (userData) => {
        const response = await api.post('/auth/signup', userData);
        // Signup no longer returns a token, it returns a success message to verify email
        return response.data;
    },

    verifyEmail: async (data) => {
        const response = await api.post('/auth/verify-email', data);
        if (response.data.token) {
            localStorage.setItem('legal_token', response.data.token);
            localStorage.setItem('legal_user', JSON.stringify(response.data.user));
        }
        return response.data;
    },

    forgotPassword: async (email) => {
        const response = await api.post('/auth/forgot-password', { email });
        return response.data;
    },

    resetPassword: async (data) => {
        const response = await api.post('/auth/reset-password', data);
        return response.data;
    },

    updateProfile: async (userData) => {
        const response = await api.put('/auth/profile', userData);
        if (response.data.token) {
            // a password change revokes old tokens and returns a new one for this device
            localStorage.setItem('legal_token', response.data.token);
        }
        if (response.data.user) {
            localStorage.setItem('legal_user', JSON.stringify(response.data.user));
        }
        return response.data;
    },

    logout: () => {
        localStorage.removeItem('legal_token');
        localStorage.removeItem('legal_user');
    },

    getCurrentUser: () => {
        const user = localStorage.getItem('legal_user');
        return user ? JSON.parse(user) : null;
    },

    isAuthenticated: () => {
        return !!localStorage.getItem('legal_token');
    }
};

// Chat services
export const chatService = {
    getSessions: async () => {
        const response = await api.get('/chat/sessions');
        return response.data;
    },

    getSession: async (id) => {
        const response = await api.get(`/chat/sessions/${id}`);
        return response.data;
    },

    createSession: async (title) => {
        const response = await api.post('/chat/sessions', { title });
        return response.data;
    },

    deleteSession: async (id) => {
        const response = await api.delete(`/chat/sessions/${id}`);
        return response.data;
    },

    solveSession: async (id) => {
        const response = await api.put(`/chat/sessions/${id}/solve`);
        return response.data;
    },

    reopenSession: async (id) => {
        const response = await api.put(`/chat/sessions/${id}/reopen`);
        return response.data;
    },

    sendQuery: async (id, query, language) => {
        const response = await api.post(`/chat/sessions/${id}/query`, { query, language });
        return response.data;
    },

    /**
     * Stream an answer. Calls handlers.onMeta({sources, language, grounded}),
     * handlers.onToken(text) for each piece, then resolves with the final
     * {messages, session} (or rejects with an Error). `signal` aborts it.
     */
    streamQuery: (id, query, language, handlers = {}, signal) =>
        streamSSE(`/api/chat/sessions/${id}/query/stream`, { query, language }, handlers, signal, true),

    /** Guest mode: same stream, nothing saved; resolves with {message, remainingToday}. */
    streamGuest: (query, language, history, handlers = {}, signal) =>
        streamSSE('/api/chat/guest/query/stream', { query, language, history }, handlers, signal, false),

    guestStatus: async () => {
        const response = await api.get('/chat/guest/status');
        return response.data;
    },

    sendFeedback: async (sessionId, messageId, rating) => {
        const response = await api.post(`/chat/sessions/${sessionId}/messages/${messageId}/feedback`, { rating });
        return response.data;
    }
};

export default api;
