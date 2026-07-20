import { ref, reactive } from 'vue';

export function usePagination(fetchFn: (params: any) => Promise<void>, defaultPageSize = 20) {
  const items = ref<any[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const page = ref(1);
  const pageSize = ref(defaultPageSize);

  async function load(options?: { page?: number; sortBy?: string; sortOrder?: string }) {
    loading.value = true;
    try {
      await fetchFn({
        page: options?.page || page.value,
        limit: pageSize.value,
        sortBy: options?.sortBy,
        sortOrder: options?.sortOrder,
      });
    } finally {
      loading.value = false;
    }
  }

  return {
    items,
    total,
    loading,
    page,
    pageSize,
    load,
  };
}
