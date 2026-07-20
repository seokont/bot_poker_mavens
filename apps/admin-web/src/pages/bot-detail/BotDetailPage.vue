<template>
  <div v-if="loading">Loading...</div>
  <div v-else-if="bot">
    <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="$router.push({ name: 'bots' })" class="mb-2">
      Back to Bots
    </v-btn>

    <v-row class="mb-4">
      <v-col cols="12" md="8">
        <h2 class="text-h4">{{ bot.name }}</h2>
      </v-col>
      <v-col cols="12" md="4" class="text-right">
        <v-btn
          color="success"
          prepend-icon="mdi-play"
          class="mr-2"
          :loading="actionLoading"
          :disabled="bot.status === 'PLAYING' || bot.status === 'STARTING'"
          @click="startBot"
        >
          Start
        </v-btn>
        <v-btn
          color="error"
          prepend-icon="mdi-stop"
          class="mr-2"
          :loading="actionLoading"
          :disabled="bot.status === 'OFFLINE' || bot.status === 'STOPPING'"
          @click="stopBot"
        >
          Stop
        </v-btn>
        <v-btn
          color="warning"
          prepend-icon="mdi-restart"
          :loading="actionLoading"
          @click="restartBot"
        >
          Restart
        </v-btn>
      </v-col>
    </v-row>

    <v-card class="mb-4">
      <v-card-text>
        <v-row>
          <v-col cols="auto">
            <v-chip :color="statusColor(bot.status)" size="large">{{ bot.status }}</v-chip>
          </v-col>
          <v-col cols="auto">
            <strong>Login:</strong> {{ bot.login }}
          </v-col>
          <v-col cols="auto" style="min-width: 200px">
            <v-select
              v-model="selectedStrategyId"
              :items="strategyOptions"
              item-title="label"
              item-value="value"
              label="Strategy"
              density="compact"
              hide-details
              @update:model-value="updateStrategy"
            ></v-select>
          </v-col>
          <v-col cols="auto" style="min-width: 180px">
            <v-select
              v-model="selectedOperationMode"
              :items="['OBSERVER', 'ASSISTED', 'AUTONOMOUS']"
              label="Mode"
              density="compact"
              hide-details
              @update:model-value="updateOperationMode"
            ></v-select>
          </v-col>
          <v-col cols="auto">
            <strong>Buy In:</strong> ${{ bot.defaultBuyIn || 0 }}
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-tabs v-model="tab" class="mb-4">
      <v-tab value="overview">Overview</v-tab>
      <v-tab value="session">Session</v-tab>
      <v-tab value="hands">Hands</v-tab>
      <v-tab value="statistics">Statistics</v-tab>
      <v-tab value="limits">Limits</v-tab>
      <v-tab value="logs">Logs</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <v-window-item value="overview">
        <v-card v-if="liveState.handId" class="mb-4">
          <v-card-title class="d-flex align-center">
            <v-icon icon="mdi-cards-playing" class="mr-2" />
            Live Hand
            <v-chip size="small" class="ml-2" color="primary" variant="outlined">{{ liveState.street || '-' }}</v-chip>
          </v-card-title>
          <v-card-text>
            <v-row align="center">
              <v-col cols="auto">
                <div class="text-caption text-medium-emphasis mb-1">Hole Cards</div>
                <div class="d-flex">
                  <PlayingCard v-for="(c, i) in liveState.holeCards" :key="'h-' + i" :card="c" />
                  <div v-if="!liveState.holeCards?.length" class="text-caption text-medium-emphasis">-</div>
                </div>
              </v-col>
              <v-col cols="auto">
                <div class="text-caption text-medium-emphasis mb-1">Board</div>
                <div class="d-flex">
                  <PlayingCard v-for="(c, i) in liveState.boardCards" :key="'b-' + i" :card="c" />
                  <div v-if="!liveState.boardCards?.length" class="text-caption text-medium-emphasis">-</div>
                </div>
              </v-col>
              <v-col cols="auto">
                <div class="text-caption text-medium-emphasis mb-1">Pot</div>
                <div class="text-h6">{{ liveState.pot ?? 0 }}</div>
              </v-col>
              <v-col cols="auto">
                <div class="text-caption text-medium-emphasis mb-1">Stack</div>
                <div class="text-h6">{{ liveState.heroStack ?? 0 }}</div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <v-card>
          <v-card-text>
            <v-row>
              <v-col cols="12" md="6">
                <v-list>
                  <v-list-item>
                    <v-list-item-title>Status</v-list-item-title>
                    <v-list-item-subtitle>
                      <v-chip :color="statusColor(bot.status)" size="small">{{ bot.status }}</v-chip>
                    </v-list-item-subtitle>
                  </v-list-item>
                  <v-list-item>
                    <v-list-item-title>Current Table</v-list-item-title>
                    <v-list-item-subtitle>{{ bot.currentTableName || 'Not seated' }}</v-list-item-subtitle>
                  </v-list-item>
                  <v-list-item>
                    <v-list-item-title>Hands Played</v-list-item-title>
                    <v-list-item-subtitle>{{ bot.handsPlayed || 0 }}</v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </v-col>
              <v-col cols="12" md="6">
                <v-list>
                  <v-list-item>
                    <v-list-item-title>Session Profit/Loss</v-list-item-title>
                    <v-list-item-subtitle :class="(bot.sessionPL || 0) >= 0 ? 'text-success' : 'text-error'">
                      {{ bot.sessionPL != null ? '$' + bot.sessionPL : '$0' }}
                    </v-list-item-subtitle>
                  </v-list-item>
                  <v-list-item>
                    <v-list-item-title>Total Profit/Loss</v-list-item-title>
                    <v-list-item-subtitle :class="(bot.totalPL || 0) >= 0 ? 'text-success' : 'text-error'">
                      {{ bot.totalPL != null ? '$' + bot.totalPL : '$0' }}
                    </v-list-item-subtitle>
                  </v-list-item>
                  <v-list-item>
                    <v-list-item-title>Errors</v-list-item-title>
                    <v-list-item-subtitle>{{ bot.errorCount || 0 }}</v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </v-col>
            </v-row>
          </v-card-text>
          <v-card-actions>
            <v-btn
              color="primary"
              prepend-icon="mdi-table-plus"
              :disabled="bot.status === 'PLAYING' || bot.status === 'STARTING'"
              @click="showJoinTableDialog = true"
            >
              Join Table
            </v-btn>
            <v-btn
              color="error"
              prepend-icon="mdi-table-remove"
              :disabled="bot.status !== 'SEATED' && bot.status !== 'PLAYING'"
              @click="leaveTable"
            >
              Leave Table
            </v-btn>
            <v-btn
              color="warning"
              prepend-icon="mdi-chair-rolling"
              :disabled="bot.status !== 'PLAYING'"
              @click="sitOut"
            >
              Sit Out
            </v-btn>
            <v-btn
              color="success"
              prepend-icon="mdi-chair-school"
              :disabled="bot.status !== 'SEATED'"
              @click="sitIn"
            >
              Sit In
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-window-item>

      <v-window-item value="session">
        <v-card><v-card-text>Session history loading...</v-card-text></v-card>
      </v-window-item>
      <v-window-item value="hands">
        <v-card>
          <v-data-table-server
            v-model:items-per-page="handsItemsPerPage"
            :headers="handsHeaders"
            :items="hands"
            :items-length="handsTotal"
            :loading="handsLoading"
            @update:options="loadHands"
          >
            <template v-slot:item.startedAt="{ item }">
              {{ new Date(item.startedAt).toLocaleString() }}
            </template>
            <template v-slot:item.table="{ item }">
              {{ item.table?.name || '-' }}
            </template>
            <template v-slot:item.result="{ item }">
              <v-chip size="small" :color="handResultColor(item)">{{ handResult(item) }}</v-chip>
            </template>
            <template v-slot:item.profitLoss="{ item }">
              <span :class="(handProfitLoss(item) ?? 0) >= 0 ? 'text-success' : 'text-error'">
                {{ handProfitLoss(item) != null ? '$' + handProfitLoss(item) : '-' }}
              </span>
            </template>
          </v-data-table-server>
        </v-card>
      </v-window-item>
      <v-window-item value="statistics">
        <v-card>
          <v-card-text v-if="statsLoading">Loading...</v-card-text>
          <v-card-text v-else-if="!stats">No statistics yet.</v-card-text>
          <v-row v-else class="ma-0">
            <v-col cols="6" sm="4" md="3" v-for="stat in statsCards" :key="stat.label">
              <v-card variant="tonal">
                <v-card-text class="text-center">
                  <div class="text-h5">{{ stat.value }}</div>
                  <div class="text-caption">{{ stat.label }}</div>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-card>
      </v-window-item>
      <v-window-item value="limits">
        <v-card><v-card-text>Risk limits loading...</v-card-text></v-card>
      </v-window-item>
      <v-window-item value="logs">
        <v-card><v-card-text>Bot logs loading...</v-card-text></v-card>
      </v-window-item>
    </v-window>

    <!-- Join Table Dialog -->
    <v-dialog v-model="showJoinTableDialog" max-width="500">
      <v-card>
        <v-card-title>Select Table</v-card-title>
        <v-card-text>
          <v-select
            v-model="selectedTableName"
            :items="tables"
            item-title="name"
            item-value="name"
            label="Table"
            density="compact"
          ></v-select>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="showJoinTableDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="joinTable" :disabled="!selectedTableName">Join</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
  <div v-else>Bot not found</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { botsApi } from '../../api/bots';
import { tablesApi } from '../../api/tables';
import { strategiesApi } from '../../api/strategies';
import { handsApi } from '../../api/hands';
import { statsApi } from '../../api/stats';
import { useSocketStore } from '../../stores/socket';
import PlayingCard from '../../components/PlayingCard.vue';

const route = useRoute();
const bot = ref<any>(null);
const loading = ref(true);
const actionLoading = ref(false);
const tab = ref('overview');

type CardCode = { rank: string; suit: string };

const socketStore = useSocketStore();
const liveState = ref<{
  handId?: string | null;
  street?: string;
  holeCards?: CardCode[];
  boardCards?: CardCode[];
  pot?: number;
  heroStack?: number;
}>({});

function onLiveState(payload: { data: { botId: string } & typeof liveState.value }) {
  const data = payload?.data;
  if (!data || data.botId !== route.params.id) return;
  liveState.value = data;
}

async function loadLiveState() {
  try {
    const response = await botsApi.getLiveState(route.params.id as string);
    liveState.value = response.data || {};
  } catch (err) {
    console.error('Failed to load live state:', err);
  }
}

const showJoinTableDialog = ref(false);
const selectedTableName = ref<string | null>(null);

const tables = ref<any[]>([]);

function statusColor(status: string): string {
  const colors: Record<string, string> = {
    OFFLINE: 'grey', STARTING: 'info', PLAYING: 'success',
    SEATED: 'primary', ERROR: 'error', RECONNECTING: 'warning', STOPPING: 'warning',
  };
  return colors[status] || 'grey';
}

const strategyOptions = ref<{ label: string; value: string | null }[]>([{ label: 'None', value: null }]);
const selectedStrategyId = ref<string | null>(null);
const selectedOperationMode = ref<string>('AUTONOMOUS');

async function loadBot() {
  try {
    const response = await botsApi.get(route.params.id as string);
    bot.value = response.data;
    selectedStrategyId.value = bot.value.strategyProfileId ?? null;
    selectedOperationMode.value = bot.value.operationMode ?? 'AUTONOMOUS';
  } catch (err) {
    console.error('Failed to load bot:', err);
  }
}

async function loadTables() {
  try {
    const response = await tablesApi.list();
    tables.value = response.data.data || [];
  } catch (err) {
    console.error('Failed to load tables:', err);
  }
}

async function loadStrategies() {
  try {
    const response = await strategiesApi.list({ limit: 100 });
    const items = response.data.data || response.data || [];
    strategyOptions.value = [
      { label: 'None', value: null },
      ...items.map((s: any) => ({ label: `${s.name} (${s.difficulty})`, value: s.id })),
    ];
  } catch (err) {
    console.error('Failed to load strategies:', err);
  }
}

async function updateStrategy(value: string | null) {
  try {
    await botsApi.update(bot.value.id, { strategyProfileId: value });
    await loadBot();
  } catch (err) {
    console.error('Failed to update strategy:', err);
  }
}

async function updateOperationMode(value: string) {
  try {
    await botsApi.update(bot.value.id, { operationMode: value });
    await loadBot();
  } catch (err) {
    console.error('Failed to update operation mode:', err);
  }
}

const hands = ref<any[]>([]);
const handsTotal = ref(0);
const handsLoading = ref(false);
const handsItemsPerPage = ref(20);
const lastHandsOptions = ref<{ page: number; itemsPerPage: number }>({ page: 1, itemsPerPage: 20 });

const handsHeaders = [
  { title: 'Date', key: 'startedAt' },
  { title: 'Table', key: 'table' },
  { title: 'Pot', key: 'pot' },
  { title: 'Result', key: 'result', sortable: false },
  { title: 'P/L', key: 'profitLoss', sortable: false },
];

function botHandFor(item: any) {
  return item.botHands?.find((bh: any) => bh.botId === (route.params.id as string));
}

function handResult(item: any): string {
  return botHandFor(item)?.result || (item.finishedAt ? 'DONE' : 'IN PROGRESS');
}

function handResultColor(item: any): string {
  const pl = handProfitLoss(item);
  if (pl == null) return 'grey';
  return pl >= 0 ? 'success' : 'error';
}

function handProfitLoss(item: any): number | null {
  const bh = botHandFor(item);
  return bh?.profitLoss ?? null;
}

async function loadHands(options?: { page: number; itemsPerPage: number }) {
  if (options) lastHandsOptions.value = options;
  const { page, itemsPerPage } = lastHandsOptions.value;
  handsLoading.value = true;
  try {
    const response = await handsApi.list({ botId: route.params.id, page, limit: itemsPerPage });
    hands.value = response.data.data || [];
    handsTotal.value = response.data.meta?.total || 0;
  } catch (err) {
    console.error('Failed to load hands:', err);
  } finally {
    handsLoading.value = false;
  }
}

const stats = ref<any>(null);
const statsLoading = ref(false);
const statsCards = ref<{ label: string; value: string }[]>([]);

function buildStatsCards(s: any) {
  statsCards.value = [
    { label: 'Hands Played', value: String(s.handsPlayed ?? 0) },
    { label: 'Profit/Loss', value: `$${s.profitLoss ?? 0}` },
    { label: 'BB Won', value: String(s.bbWon ?? 0) },
    { label: 'BB / 100', value: String(s.bbPer100 ?? 0) },
    { label: 'VPIP', value: `${s.VPIP ?? 0}%` },
    { label: 'PFR', value: `${s.PFR ?? 0}%` },
    { label: '3-Bet', value: `${s.threeBet ?? 0}%` },
    { label: 'Fold to 3-Bet', value: `${s.foldToThreeBet ?? 0}%` },
    { label: 'C-Bet Flop', value: `${s.cBetFlop ?? 0}%` },
    { label: 'C-Bet Turn', value: `${s.cBetTurn ?? 0}%` },
    { label: 'Went to Showdown', value: `${s.wentToShowdown ?? 0}%` },
    { label: 'Won at Showdown', value: `${s.wonAtShowdown ?? 0}%` },
    { label: 'Aggression Factor', value: String(s.aggressionFactor ?? 0) },
    { label: 'Avg Pot', value: `$${s.averagePot ?? 0}` },
    { label: 'Avg Decision (ms)', value: String(s.averageDecisionTime ?? 0) },
    { label: 'Error Rate', value: `${s.errorRate ?? 0}%` },
  ];
}

async function loadStats() {
  statsLoading.value = true;
  try {
    const response = await statsApi.bot(route.params.id as string);
    stats.value = response.data;
    buildStatsCards(response.data);
  } catch (err) {
    console.error('Failed to load stats:', err);
  } finally {
    statsLoading.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadBot(), loadTables(), loadStrategies(), loadLiveState(), loadStats()]);
  loading.value = false;
  socketStore.connect();
  socketStore.on('bot.live.state', onLiveState);
});

onUnmounted(() => {
  socketStore.off('bot.live.state', onLiveState);
});

async function startBot() {
  actionLoading.value = true;
  try {
    await botsApi.start(bot.value.id);
    await loadBot();
  } catch (err: any) {
    console.error('Start failed:', err);
  } finally {
    actionLoading.value = false;
  }
}

async function stopBot() {
  actionLoading.value = true;
  try {
    await botsApi.stop(bot.value.id);
    await loadBot();
  } catch (err: any) {
    console.error('Stop failed:', err);
  } finally {
    actionLoading.value = false;
  }
}

async function restartBot() {
  actionLoading.value = true;
  try {
    await botsApi.restart(bot.value.id);
    await loadBot();
  } catch (err: any) {
    console.error('Restart failed:', err);
  } finally {
    actionLoading.value = false;
  }
}

async function joinTable() {
  if (!selectedTableName.value) return;
  actionLoading.value = true;
  try {
    await botsApi.joinTable(bot.value.id, { tableId: selectedTableName.value, buyIn: bot.value.defaultBuyIn || 1000 });
    showJoinTableDialog.value = false;
    await loadBot();
  } catch (err: any) {
    console.error('Join table failed:', err);
  } finally {
    actionLoading.value = false;
  }
}

async function leaveTable() {
  actionLoading.value = true;
  try {
    await botsApi.leaveTable(bot.value.id);
    await loadBot();
  } catch (err: any) {
    console.error('Leave table failed:', err);
  } finally {
    actionLoading.value = false;
  }
}

async function sitOut() {
  actionLoading.value = true;
  try {
    await botsApi.sitOut(bot.value.id);
    await loadBot();
  } catch (err: any) {
    console.error('Sit out failed:', err);
  } finally {
    actionLoading.value = false;
  }
}

async function sitIn() {
  actionLoading.value = true;
  try {
    await botsApi.sitIn(bot.value.id);
    await loadBot();
  } catch (err: any) {
    console.error('Sit in failed:', err);
  } finally {
    actionLoading.value = false;
  }
}
</script>
