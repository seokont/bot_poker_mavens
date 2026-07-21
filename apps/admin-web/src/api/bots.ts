import apiClient from './client';

export const botsApi = {
  list(params?: Record<string, any>) {
    return apiClient.get('/bots', { params });
  },
  get(id: string) {
    return apiClient.get(`/bots/${id}`);
  },
  getLiveState(id: string) {
    return apiClient.get(`/bots/${id}/live-state`);
  },
  create(data: Record<string, any>) {
    return apiClient.post('/bots', data);
  },
  update(id: string, data: Record<string, any>) {
    return apiClient.patch(`/bots/${id}`, data);
  },
  remove(id: string) {
    return apiClient.delete(`/bots/${id}`);
  },
  start(id: string) {
    return apiClient.post(`/bots/${id}/start`);
  },
  stop(id: string) {
    return apiClient.post(`/bots/${id}/stop`);
  },
  restart(id: string) {
    return apiClient.post(`/bots/${id}/restart`);
  },
  joinTable(id: string, data: { tableId: string; buyIn: number }) {
    return apiClient.post(`/bots/${id}/join-table`, data);
  },
  leaveTable(id: string) {
    return apiClient.post(`/bots/${id}/leave-table`);
  },
  sitOut(id: string) {
    return apiClient.post(`/bots/${id}/sit-out`);
  },
  sitIn(id: string) {
    return apiClient.post(`/bots/${id}/sit-in`);
  },
  rebuy(id: string, amount?: number) {
    return apiClient.post(`/bots/${id}/rebuy`, { amount });
  },
  addBalance(id: string, amount: number) {
    return apiClient.post(`/bots/${id}/balance`, { amount });
  },
  bulkStart(botIds: string[]) {
    return apiClient.post('/bots/bulk/start', { botIds });
  },
  bulkStop(botIds: string[]) {
    return apiClient.post('/bots/bulk/stop', { botIds });
  },
  bulkJoinTable(botIds: string[], tableId: string, buyIn: number) {
    return apiClient.post('/bots/bulk/join-table', { botIds, tableId, buyIn });
  },
  bulkLeaveTable(botIds: string[]) {
    return apiClient.post('/bots/bulk/leave-table', { botIds });
  },
  emergencyStopAll() {
    return apiClient.post('/bots/emergency-stop-all');
  },
};
