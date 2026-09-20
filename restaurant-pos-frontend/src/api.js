import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config || {};
    const isAuthRequest = String(originalRequest.url || '').includes('/auth/login') || String(originalRequest.url || '').includes('/auth/refresh');
    const refreshToken = localStorage.getItem('refreshToken');

    if (err.response?.status === 401 && !originalRequest._retry && refreshToken && !isAuthRequest) {
      originalRequest._retry = true;
      try {
        const refreshResponse = await refreshClient.post('/auth/refresh', { refreshToken });
        localStorage.setItem('token', refreshResponse.data.token);
        if (refreshResponse.data.user) localStorage.setItem('user', JSON.stringify(refreshResponse.data.user));
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${refreshResponse.data.token}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.clear();
        window.location.href = '/';
        return Promise.reject(refreshError);
      }
    }

    if (err.response?.status === 401 && !isAuthRequest) {
      localStorage.clear();
      window.location.href = '/';
    }

    return Promise.reject(err);
  }
);
