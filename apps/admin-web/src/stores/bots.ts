import { defineStore } from 'pinia';
import { ref } from 'vue';
import { botsApi } from '../api/bots';

export const useBotsStore = defineStore('bots', () => {
  const bots = ref<any[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const currentBot = ref<any>(null);

  async function fetchBots(params?: Record<string, any>) {
    loading.value = true;
    try {
      const response = await botsApi.list(params);
      bots.value = response.data.data || response.data;
      total.value = response.data.meta?.total || 0;
    } catch (err) {
      console.error('Failed to fetch bots:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchBot(id: string) {
    loading.value = true;
    try {
      const response = await botsApi.get(id);
      currentBot.value = response.data;
    } catch (err) {
      console.error('Failed to fetch bot:', err);
    } finally {
      loading.value = false;
    }
  }

  return {
    bots,
    total,
    loading,
    currentBot,
    fetchBots,
    fetchBot,
  };
});
