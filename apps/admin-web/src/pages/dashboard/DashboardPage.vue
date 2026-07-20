<template>
  <div>
    <h2 class="text-h4 mb-4">Dashboard</h2>
    <v-row>
      <v-col cols="12" sm="6" md="3" v-for="card in statCards" :key="card.title">
        <v-card>
          <v-card-text class="text-center">
            <v-icon :color="card.color" size="40" class="mb-2">{{ card.icon }}</v-icon>
            <div class="text-h4">{{ card.value }}</div>
            <div class="text-caption">{{ card.title }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
    <v-row class="mt-4">
      <v-col cols="12" md="8">
        <v-card title="Profit / Loss Over Time">
          <v-card-text>
            <canvas ref="plChartRef" height="200"></canvas>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card title="Bot Activity">
          <v-card-text>
            <canvas ref="activityChartRef" height="200"></canvas>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { statsApi } from '../../api/stats';

const statCards = ref([
  { title: 'Total Bots', value: '0', icon: 'mdi-robot', color: 'primary' },
  { title: 'Active Bots', value: '0', icon: 'mdi-robot-happy', color: 'success' },
  { title: 'Playing Bots', value: '0', icon: 'mdi-cards-playing', color: 'info' },
  { title: 'Offline Bots', value: '0', icon: 'mdi-robot-off', color: 'grey' },
  { title: 'Bots with Errors', value: '0', icon: 'mdi-alert-circle', color: 'error' },
  { title: 'Current Tables', value: '0', icon: 'mdi-table', color: 'primary' },
  { title: 'Hands Today', value: '0', icon: 'mdi-cards', color: 'info' },
  { title: 'Total P/L', value: '$0', icon: 'mdi-currency-usd', color: 'success' },
]);

const plChartRef = ref<HTMLCanvasElement | null>(null);
const activityChartRef = ref<HTMLCanvasElement | null>(null);

onMounted(async () => {
  try {
    const response = await statsApi.dashboard();
    const data = response.data;
    if (data) {
      statCards.value = [
        { title: 'Total Bots', value: String(data.totalBots || 0), icon: 'mdi-robot', color: 'primary' },
        { title: 'Active Bots', value: String(data.activeBots || 0), icon: 'mdi-robot-happy', color: 'success' },
        { title: 'Playing Bots', value: String(data.playingBots || 0), icon: 'mdi-cards-playing', color: 'info' },
        { title: 'Offline Bots', value: String(data.offlineBots || 0), icon: 'mdi-robot-off', color: 'grey' },
        { title: 'Bots with Errors', value: String(data.errorBots || 0), icon: 'mdi-alert-circle', color: 'error' },
        { title: 'Current Tables', value: String(data.currentTables || 0), icon: 'mdi-table', color: 'primary' },
        { title: 'Hands Today', value: String(data.handsToday || 0), icon: 'mdi-cards', color: 'info' },
        { title: 'Total P/L', value: `$${data.totalPL || 0}`, icon: 'mdi-currency-usd', color: 'success' },
      ];
    }
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
});
</script>
