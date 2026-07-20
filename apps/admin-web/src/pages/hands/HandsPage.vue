<template>
  <div>
    <h2 class="text-h4 mb-4">Hand History</h2>
    <v-card>
      <v-card-title>
        <v-row>
          <v-col cols="4">
            <v-text-field v-model="filters.botId" label="Bot ID" density="compact" hide-details></v-text-field>
          </v-col>
          <v-col cols="4">
            <v-text-field v-model="filters.tableId" label="Table ID" density="compact" hide-details></v-text-field>
          </v-col>
          <v-col cols="4">
            <v-select v-model="filters.gameType" :items="['NLH', 'PLO4', 'PLO5', 'PLO6']" label="Game Type" density="compact" hide-details clearable></v-select>
          </v-col>
        </v-row>
      </v-card-title>
      <v-data-table-server
        v-model:items-per-page="itemsPerPage"
        :headers="headers"
        :items="hands"
        :items-length="total"
        :loading="loading"
        @update:options="loadHands"
      >
        <template v-slot:item.result="{ item }">
          <span v-if="item.botHands?.[0]">{{ item.botHands[0].result }}</span>
        </template>
        <template v-slot:item.profitLoss="{ item }">
          <span v-if="item.botHands?.[0]" :class="item.botHands[0].profitLoss >= 0 ? 'text-success' : 'text-error'">
            ${{ item.botHands[0].profitLoss?.toFixed(2) }}
          </span>
        </template>
        <template v-slot:item.actions="{ item }">
          <v-btn icon size="small" @click="viewHand(item.id)">
            <v-icon>mdi-eye</v-icon>
          </v-btn>
        </template>
      </v-data-table-server>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { handsApi } from '../../api/hands';

const hands = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const itemsPerPage = ref(20);
const filters = reactive({ botId: '', tableId: '', gameType: null });

const headers = [
  { title: 'Hand ID', key: 'id' },
  { title: 'Table', key: 'tableId' },
  { title: 'Game', key: 'gameType' },
  { title: 'Blinds', key: 'smallBlind', value: (item: any) => `${item.smallBlind}/${item.bigBlind}` },
  { title: 'Pot', key: 'pot', value: (item: any) => `$${item.pot}` },
  { title: 'Started', key: 'startedAt' },
  { title: 'Result', key: 'result' },
  { title: 'P/L', key: 'profitLoss' },
  { title: 'Actions', key: 'actions', sortable: false },
];

async function loadHands({ page, itemsPerPage, sortBy }: any) {
  loading.value = true;
  try {
    const response = await handsApi.list({
      page,
      limit: itemsPerPage,
      sortBy: sortBy?.[0]?.key,
      sortOrder: sortBy?.[0]?.order,
      ...filters,
    });
    hands.value = response.data.data || response.data;
    total.value = response.data.meta?.total || 0;
  } catch (err) {
    console.error('Failed to load hands:', err);
  } finally {
    loading.value = false;
  }
}

function viewHand(id: string) {
  console.log('View hand:', id);
}
</script>
