import { defineStore } from 'pinia';
import { ref } from 'vue';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './auth';

export const useSocketStore = defineStore('socket', () => {
  const socket = ref<Socket | null>(null);
  const connected = ref(false);

  function connect() {
    const authStore = useAuthStore();
    if (socket.value?.connected) return;

    socket.value = io('/admin', {
      auth: { token: authStore.accessToken },
    });

    socket.value.on('connect', () => {
      connected.value = true;
    });

    socket.value.on('disconnect', () => {
      connected.value = false;
    });
  }

  function disconnect() {
    socket.value?.disconnect();
    socket.value = null;
    connected.value = false;
  }

  function on(event: string, callback: (...args: any[]) => void) {
    socket.value?.on(event, callback);
  }

  function off(event: string, callback?: (...args: any[]) => void) {
    socket.value?.off(event, callback);
  }

  return {
    socket,
    connected,
    connect,
    disconnect,
    on,
    off,
  };
});
