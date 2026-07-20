import apiClient from './client';

export const statsApi = {
  dashboard() {
    return apiClient.get('/statistics/dashboard');
  },
  bots(params?: Record<string, any>) {
    return apiClient.get('/statistics/bots', { params });
  },
  bot(id: string) {
    return apiClient.get(`/statistics/bots/${id}`);
  },
  table(id: string) {
    return apiClient.get(`/statistics/tables/${id}`);
  },
  profitLoss(params?: Record<string, any>) {
    return apiClient.get('/statistics/profit-loss', { params });
  },
};
