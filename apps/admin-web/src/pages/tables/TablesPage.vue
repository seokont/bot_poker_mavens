<template>
  <div>
    <h2 class="text-h4 mb-4">Tables</h2>
    <v-card>
      <v-card-title>
        <v-btn color="primary" @click="syncTables" :loading="syncing">
          <v-icon left>mdi-sync</v-icon> Sync Tables
        </v-btn>
      </v-card-title>
      <v-data-table
        :headers="headers"
        :items="tables"
        :loading="loading"
      >
        <template v-slot:item.isAllowedForBots="{ item }">
          <v-chip :color="item.isAllowedForBots ? 'success' : 'error'" size="small">
            {{ item.isAllowedForBots ? 'Allowed' : 'Blocked' }}
          </v-chip>
        </template>
        <template v-slot:item.actions="{ item }">
          <v-btn icon size="small" @click="toggleBotAccess(item)">
            <v-icon>{{ item.isAllowedForBots ? 'mdi-lock-open' : 'mdi-lock' }}</v-icon>
          </v-btn>
        </template>
      </v-data-table>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { tablesApi } from '../../api/tables';

const tables = ref<any[]>([]);
const loading = ref(false);
const syncing = ref(false);

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Game Type', key: 'gameType' },
  { title: 'Blinds', key: 'smallBlind', value: (item: any) => `${item.smallBlind}/${item.bigBlind}` },
  { title: 'Players', key: 'maxPlayers' },
  { title: 'Min Buy In', key: 'minBuyIn' },
  { title: 'Max Buy In', key: 'maxBuyIn' },
  { title: 'Bots Allowed', key: 'isAllowedForBots' },
  { title: 'Actions', key: 'actions', sortable: false },
];

onMounted(async () => {
  await loadTables();
});

async function loadTables() {
  loading.value = true;
  try {
    const response = await tablesApi.list();
    tables.value = response.data.data || response.data;
  } catch (err) {
    console.error('Failed to load tables:', err);
  } finally {
    loading.value = false;
  }
}

async function syncTables() {
  syncing.value = true;
  try {
    await tablesApi.syncFromMavens();
    await loadTables();
  } catch (err) {
    console.error('Failed to sync tables:', err);
  } finally {
    syncing.value = false;
  }
}

async function toggleBotAccess(item: any) {
  try {
    await tablesApi.update(item.id, { isAllowedForBots: !item.isAllowedForBots });
    item.isAllowedForBots = !item.isAllowedForBots;
  } catch (err) {
    console.error('Failed to update table:', err);
  }
}
</script>
