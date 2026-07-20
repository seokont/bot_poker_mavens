import { onMounted, onUnmounted } from 'vue';
import { useSocketStore } from '../stores/socket';

export function useSocketEvent(event: string, callback: (...args: any[]) => void) {
  const socketStore = useSocketStore();

  onMounted(() => {
    socketStore.on(event, callback);
  });

  onUnmounted(() => {
    socketStore.off(event, callback);
  });
}
