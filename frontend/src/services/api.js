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

    sendQuery: async (id, query) => {
        const response = await api.post(`/chat/sessions/${id}/query`, { query });
        return response.data;
    }
};

export default api;
