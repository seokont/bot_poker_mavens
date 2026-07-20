import apiClient from './client';

export const strategiesApi = {
  list(params?: Record<string, any>) {
    return apiClient.get('/strategies', { params });
  },
  get(id: string) {
    return apiClient.get(`/strategies/${id}`);
  },
  create(data: Record<string, any>) {
    return apiClient.post('/strategies', data);
  },
  update(id: string, data: Record<string, any>) {
    return apiClient.patch(`/strategies/${id}`, data);
  },
  remove(id: string) {
    return apiClient.delete(`/strategies/${id}`);
  },
  clone(id: string) {
    return apiClient.post(`/strategies/${id}/clone`);
  },
};
