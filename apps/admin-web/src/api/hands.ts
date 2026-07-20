import apiClient from './client';

export const handsApi = {
  list(params?: Record<string, any>) {
    return apiClient.get('/hands', { params });
  },
  get(id: string) {
    return apiClient.get(`/hands/${id}`);
  },
  getActions(id: string) {
    return apiClient.get(`/hands/${id}/actions`);
  },
  getDecisions(id: string) {
    return apiClient.get(`/hands/${id}/decisions`);
  },
};
