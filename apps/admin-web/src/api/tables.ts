import apiClient from './client';

export const tablesApi = {
  list(params?: Record<string, any>) {
    return apiClient.get('/tables', { params });
  },
  get(id: string) {
    return apiClient.get(`/tables/${id}`);
  },
  update(id: string, data: Record<string, any>) {
    return apiClient.patch(`/tables/${id}`, data);
  },
  sync(tables: Record<string, any>[]) {
    return apiClient.post('/tables/sync', { tables });
  },
  syncFromMavens() {
    return apiClient.post('/tables/sync-from-mavens');
  },
};
