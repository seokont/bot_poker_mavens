import apiClient from './client';

export const authApi = {
  login(email: string, password: string) {
    return apiClient.post('/auth/login', { email, password });
  },
  refresh(refreshToken: string) {
    return apiClient.post('/auth/refresh', { refreshToken });
  },
  logout() {
    return apiClient.post('/auth/logout');
  },
  getProfile() {
    return apiClient.get('/auth/me');
  },
};
