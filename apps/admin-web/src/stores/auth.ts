import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi } from '../api/auth';

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const refreshToken = ref<string | null>(null);
  const admin = ref<{ id: string; email: string; name: string; role: string } | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => !!accessToken);
  const isAdmin = computed(() => admin.value?.role === 'SUPER_ADMIN' || admin.value?.role === 'ADMIN');

  function setTokens(access: string, refresh: string) {
    accessToken.value = access;
    refreshToken.value = refresh;
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
  }

  function restoreTokens() {
    const access = localStorage.getItem('accessToken');
    const refresh = localStorage.getItem('refreshToken');
    if (access && refresh) {
      accessToken.value = access;
      refreshToken.value = refresh;
    }
  }

  async function login(email: string, password: string) {
    loading.value = true;
    error.value = null;
    try {
      const response = await authApi.login(email, password);
      setTokens(response.data.accessToken, response.data.refreshToken);
      admin.value = response.data.admin;
      return true;
    } catch (err: any) {
      error.value = err.response?.data?.message || 'Login failed';
      return false;
    } finally {
      loading.value = false;
    }
  }

  function logout() {
    try {
      authApi.logout();
    } catch {
      // ignore
    }
    accessToken.value = null;
    refreshToken.value = null;
    admin.value = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  async function loadProfile() {
    try {
      const response = await authApi.getProfile();
      admin.value = response.data;
    } catch {
      logout();
    }
  }

  return {
    accessToken,
    refreshToken,
    admin,
    loading,
    error,
    isAuthenticated,
    isAdmin,
    login,
    logout,
    loadProfile,
    setTokens,
    restoreTokens,
  };
});
