import { ref } from 'vue';

export function useConfirm() {
  const show = ref(false);
  const message = ref('');
  const title = ref('');
  let resolveCallback: ((value: boolean) => void) | null = null;

  function confirm(msg: string, ttl = 'Confirm'): Promise<boolean> {
    message.value = msg;
    title.value = ttl;
    show.value = true;
    return new Promise((resolve) => {
      resolveCallback = resolve;
    });
  }

  function onConfirm() {
    show.value = false;
    resolveCallback?.(true);
  }

  function onCancel() {
    show.value = false;
    resolveCallback?.(false);
  }

  return {
    show,
    message,
    title,
    confirm,
    onConfirm,
    onCancel,
  };
}
