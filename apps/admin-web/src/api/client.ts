import axios from 'axios';
import { useAuthStore } from '../stores/auth';
import router from '../router';

const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const authStore = useAuthStore();
  if (authStore.accessToken) {
    config.headers.Authorization = `Bearer ${authStore.accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const authStore = useAuthStore();

      try {
        if (authStore.refreshToken) {
          const response = await axios.post('/api/v1/auth/refresh', {
            refreshToken: authStore.refreshToken,
          });
          authStore.setTokens(response.data.accessToken, response.data.refreshToken);
          originalRequest.headers.Authorization = `Bearer ${response.data.accessToken}`;
          return apiClient(originalRequest);
        }
      } catch {
        authStore.logout();
        router.push({ name: 'login' });
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
