<template>
  <div>
    <h2 class="text-h4 mb-4">System Logs</h2>
    <v-card>
      <v-card-title>
        <v-row>
          <v-col cols="3">
            <v-text-field v-model="filters.botId" label="Bot ID" density="compact" hide-details></v-text-field>
          </v-col>
          <v-col cols="3">
            <v-text-field v-model="filters.workerId" label="Worker ID" density="compact" hide-details></v-text-field>
          </v-col>
          <v-col cols="2">
            <v-select v-model="filters.level" :items="['info', 'warn', 'error', 'debug']" label="Level" density="compact" hide-details clearable></v-select>
          </v-col>
          <v-col cols="2">
            <v-text-field v-model="filters.handId" label="Hand ID" density="compact" hide-details></v-text-field>
          </v-col>
          <v-col cols="2">
            <v-btn color="primary" @click="loadLogs({ page: 1, itemsPerPage: 20, sortBy: [] })">
              <v-icon left>mdi-magnify</v-icon> Search
            </v-btn>
          </v-col>
        </v-row>
      </v-card-title>
      <v-data-table-server
        v-model:items-per-page="itemsPerPage"
        :headers="headers"
        :items="logs"
        :items-length="total"
        :loading="loading"
        @update:options="loadLogs"
      >
        <template v-slot:item.level="{ item }">
          <v-chip :color="levelColor(item.level)" size="x-small">{{ item.level }}</v-chip>
        </template>
      </v-data-table-server>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';

const logs = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const itemsPerPage = ref(50);
const filters = reactive({ botId: '', workerId: '', level: null, handId: '' });

const headers = [
  { title: 'Timestamp', key: 'timestamp' },
  { title: 'Level', key: 'level' },
  { title: 'Bot', key: 'botId' },
  { title: 'Worker', key: 'workerId' },
  { title: 'Hand', key: 'handId' },
  { title: 'Message', key: 'message' },
];

function levelColor(level: string): string {
  return { info: 'info', warn: 'warning', error: 'error', debug: 'grey' }[level] || 'grey';
}

async function loadLogs({ page, itemsPerPage }: any) {
  loading.value = true;
  try {
    // placeholder - will integrate with backend audit/logs API
    logs.value = [];
    total.value = 0;
  } catch (err) {
    console.error('Failed to load logs:', err);
  } finally {
    loading.value = false;
  }
}
</script>
