<template>
  <div>
    <h2 class="text-h4 mb-4">Bot Management</h2>
    <v-card>
      <v-card-title>
        <v-text-field
          v-model="search"
          prepend-inner-icon="mdi-magnify"
          label="Search bots..."
          density="compact"
          hide-details
          class="mb-2"
        ></v-text-field>
        <v-row class="mt-2">
          <v-col cols="auto">
            <v-btn color="primary" prepend-icon="mdi-plus" @click="showCreateDialog = true">
              Create Bot
            </v-btn>
          </v-col>
          <v-col cols="auto">
            <v-btn color="success" prepend-icon="mdi-play" @click="bulkStart">
              Start All Selected
            </v-btn>
          </v-col>
          <v-col cols="auto">
            <v-btn color="error" prepend-icon="mdi-stop" @click="bulkStop">
              Stop All Selected
            </v-btn>
          </v-col>
          <v-col cols="auto">
            <v-btn color="primary" variant="tonal" prepend-icon="mdi-shuffle-variant" @click="showBulkJoinDialog = true">
              Join Table (Random Order)
            </v-btn>
          </v-col>
          <v-col cols="auto">
            <v-btn color="error" variant="elevated" prepend-icon="mdi-alert-octagon" @click="showEmergencyDialog = true">
              🚨 Emergency Stop All Bots
            </v-btn>
          </v-col>
        </v-row>
      </v-card-title>
      <v-data-table-server
        v-model="selected"
        v-model:items-per-page="itemsPerPage"
        :headers="headers"
        :items="bots"
        :items-length="total"
        :loading="loading"
        :search="search"
        item-value="id"
        @update:options="loadBots"
        @click:row="handleRowClick"
        show-select
      >
        <template v-slot:item.name="{ item }">
          <a href="#" @click.prevent="$router.push({ name: 'bot-detail', params: { id: item.id } })" class="text-decoration-none">
            {{ item.name }}
          </a>
        </template>
        <template v-slot:item.status="{ item }">
          <v-chip :color="statusColor(item.status)" size="small">
            {{ item.status }}
          </v-chip>
        </template>
        <template v-slot:item.actions="{ item }">
          <v-btn icon size="small" @click.stop="$router.push({ name: 'bot-detail', params: { id: item.id } })">
            <v-icon>mdi-eye</v-icon>
          </v-btn>
          <v-btn icon size="small" color="success" @click.stop="startBot(item.id)">
            <v-icon>mdi-play</v-icon>
          </v-btn>
          <v-btn icon size="small" color="error" @click.stop="stopBot(item.id)">
            <v-icon>mdi-stop</v-icon>
          </v-btn>
          <v-btn icon size="small" color="warning" @click.stop="restartBot(item.id)">
            <v-icon>mdi-restart</v-icon>
          </v-btn>
          <v-btn icon size="small" color="success" @click.stop="openAddBalance(item)">
            <v-icon>mdi-cash-plus</v-icon>
          </v-btn>
          <v-btn icon size="small" color="error" @click.stop="confirmDelete(item)">
            <v-icon>mdi-delete</v-icon>
          </v-btn>
        </template>
      </v-data-table-server>
    </v-card>

    <v-dialog v-model="showCreateDialog" max-width="500">
      <v-card>
        <v-card-title>Create Bot</v-card-title>
        <v-card-text>
          <v-text-field v-model="newBot.name" label="Name" required></v-text-field>
          <v-text-field v-model="newBot.login" label="Login" required></v-text-field>
          <v-text-field v-model="newBot.password" label="Password" type="password" required></v-text-field>
          <v-text-field v-model.number="newBot.defaultBuyIn" label="Default Buy In" type="number"></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="showCreateDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="createBot">Create</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showAddBalanceDialog" max-width="440">
      <v-card>
        <v-card-title>Add Balance</v-card-title>
        <v-card-text>
          Add chips to "{{ addBalanceBot?.name }}" ({{ addBalanceBot?.login }}) on the poker server.
          <v-text-field
            v-model.number="addBalanceAmount"
            label="Amount"
            type="number"
            min="1"
            class="mt-4"
            autofocus
          ></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="showAddBalanceDialog = false">Cancel</v-btn>
          <v-btn color="success" @click="addBalance">Add</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showBulkJoinDialog" max-width="480">
      <v-card>
        <v-card-title>Join Table (Random Order)</v-card-title>
        <v-card-text>
          Seats the {{ selected.length }} selected bot(s) at the given table in a shuffled order, with a random
          4-25s pause between each one - looks like separate players sitting down over time instead of a bot
          script joining them all in a row.
          <v-text-field v-model="bulkJoinTableId" label="Table ID (external table name)" class="mt-4"></v-text-field>
          <v-text-field v-model.number="bulkJoinBuyIn" label="Buy In" type="number" min="1"></v-text-field>
          <v-text-field
            v-model.number="bulkJoinPreferredSeat"
            label="Preferred seat number (optional - each bot falls back to any empty seat)"
            type="number"
            min="1"
            clearable
          ></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="showBulkJoinDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :disabled="!selected.length || !bulkJoinTableId || !bulkJoinBuyIn"
            :loading="bulkJoining"
            @click="bulkJoinTable"
          >
            Seat Them Randomly
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showEmergencyDialog" max-width="480">
      <v-card>
        <v-card-title class="text-error">🚨 Emergency Stop All Bots</v-card-title>
        <v-card-text>
          This immediately stops <strong>every bot on every worker</strong> and closes all of their open browser
          sessions, then marks all bots OFFLINE - including ones currently seated or mid-hand. Use this only if bots
          are misbehaving and need to be pulled from the tables right now.
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="showEmergencyDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="emergencyStopping" @click="emergencyStopAll">Stop Everything Now</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showDeleteDialog" max-width="440">
      <v-card>
        <v-card-title>Delete Bot</v-card-title>
        <v-card-text>
          Delete "{{ deletingBot?.name }}"? This disables the bot (it stops being selectable/startable) but does
          not stop it if it's currently running or seated at a table - stop and remove it from any table first.
          <div v-if="deletingBot && deletingBot.status !== 'OFFLINE'" class="text-error mt-2">
            This bot's status is "{{ deletingBot.status }}", not OFFLINE - consider stopping it first.
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="showDeleteDialog = false">Cancel</v-btn>
          <v-btn color="error" @click="deleteBot">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, inject } from 'vue';
import { useRouter } from 'vue-router';
import { botsApi } from '../../api/bots';

const router = useRouter();
const snackbar = inject('snackbar') as any;

const bots = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const search = ref('');
const itemsPerPage = ref(20);
const selected = ref<any[]>([]);
const showCreateDialog = ref(false);
const newBot = ref({ name: '', login: '', password: '', defaultBuyIn: 1000 });

const showDeleteDialog = ref(false);
const deletingBot = ref<any>(null);

const showEmergencyDialog = ref(false);
const emergencyStopping = ref(false);

const showBulkJoinDialog = ref(false);
const bulkJoinTableId = ref('');
const bulkJoinBuyIn = ref(1000);
const bulkJoinPreferredSeat = ref<number | null>(null);
const bulkJoining = ref(false);

const showAddBalanceDialog = ref(false);
const addBalanceBot = ref<any>(null);
const addBalanceAmount = ref(1000);
const lastLoadOptions = ref<{ page: number; itemsPerPage: number; sortBy?: any[] }>({ page: 1, itemsPerPage: 20 });

const headers = [
  { title: 'Name', key: 'name', sortable: true },
  { title: 'Login', key: 'login' },
  { title: 'Status', key: 'status' },
  { title: 'Strategy', key: 'strategyProfileId' },
  { title: 'Current Table', key: 'currentTable' },
  { title: 'Session P/L', key: 'sessionPL' },
  { title: 'Hands', key: 'handsPlayed' },
  { title: 'Actions', key: 'actions', sortable: false },
];

function statusColor(status: string): string {
  const colors: Record<string, string> = {
    OFFLINE: 'grey',
    STARTING: 'info',
    PLAYING: 'success',
    SEATED: 'primary',
    ERROR: 'error',
    RECONNECTING: 'warning',
    STOPPING: 'warning',
  };
  return colors[status] || 'grey';
}

function handleRowClick(event: any, { item }: any) {
  router.push({ name: 'bot-detail', params: { id: item.id } });
}

async function loadBots(options?: { page: number; itemsPerPage: number; sortBy?: any[] }) {
  if (options) lastLoadOptions.value = options;
  const { page, itemsPerPage, sortBy } = lastLoadOptions.value;
  loading.value = true;
  try {
    const response = await botsApi.list({
      page,
      limit: itemsPerPage,
      sortBy: sortBy?.[0]?.key,
      sortOrder: sortBy?.[0]?.order,
      search: search.value,
      isEnabled: true,
    });
    bots.value = response.data.data || response.data;
    total.value = response.data.meta?.total || 0;
  } catch (err) {
    console.error('Failed to load bots:', err);
  } finally {
    loading.value = false;
  }
}

async function startBot(id: string) {
  try {
    await botsApi.start(id);
    snackbar.show = true;
    snackbar.message = 'Bot start command sent';
    snackbar.color = 'success';
  } catch (err: any) {
    snackbar.show = true;
    snackbar.message = err.response?.data?.message || 'Failed to start bot';
    snackbar.color = 'error';
  }
}

async function stopBot(id: string) {
  try {
    await botsApi.stop(id);
    snackbar.show = true;
    snackbar.message = 'Bot stop command sent';
    snackbar.color = 'success';
  } catch (err: any) {
    snackbar.show = true;
    snackbar.message = err.response?.data?.message || 'Failed to stop bot';
    snackbar.color = 'error';
  }
}

async function restartBot(id: string) {
  try {
    await botsApi.restart(id);
    snackbar.show = true;
    snackbar.message = 'Bot restart command sent';
    snackbar.color = 'success';
  } catch (err: any) {
    snackbar.show = true;
    snackbar.message = err.response?.data?.message || 'Failed to restart bot';
    snackbar.color = 'error';
  }
}

async function createBot() {
  try {
    await botsApi.create(newBot.value);
    showCreateDialog.value = false;
    snackbar.show = true;
    snackbar.message = 'Bot created successfully';
    snackbar.color = 'success';
    await loadBots({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] });
  } catch (err: any) {
    snackbar.show = true;
    snackbar.message = err.response?.data?.message || 'Failed to create bot';
    snackbar.color = 'error';
  }
}

function confirmDelete(item: any) {
  deletingBot.value = item;
  showDeleteDialog.value = true;
}

function openAddBalance(item: any) {
  addBalanceBot.value = item;
  addBalanceAmount.value = 1000;
  showAddBalanceDialog.value = true;
}

async function addBalance() {
  if (!addBalanceBot.value || !addBalanceAmount.value || addBalanceAmount.value <= 0) return;
  try {
    const response = await botsApi.addBalance(addBalanceBot.value.id, addBalanceAmount.value);
    showAddBalanceDialog.value = false;
    snackbar.show = true;
    snackbar.message = `Balance updated - new balance: ${response.data.newBalance}`;
    snackbar.color = 'success';
  } catch (err: any) {
    snackbar.show = true;
    snackbar.message = err.response?.data?.message || 'Failed to add balance';
    snackbar.color = 'error';
  }
}

async function deleteBot() {
  if (!deletingBot.value) return;
  try {
    await botsApi.remove(deletingBot.value.id);
    showDeleteDialog.value = false;
    snackbar.show = true;
    snackbar.message = 'Bot deleted';
    snackbar.color = 'success';
    await loadBots();
  } catch (err: any) {
    snackbar.show = true;
    snackbar.message = err.response?.data?.message || 'Failed to delete bot';
    snackbar.color = 'error';
  }
}

async function bulkStart() {
  try {
    await botsApi.bulkStart(selected.value);
    snackbar.show = true;
    snackbar.message = 'Bulk start command sent';
    snackbar.color = 'success';
  } catch (err: any) {
    snackbar.show = true;
    snackbar.message = 'Failed to bulk start';
    snackbar.color = 'error';
  }
}

async function bulkStop() {
  try {
    await botsApi.bulkStop(selected.value);
    snackbar.show = true;
    snackbar.message = 'Bulk stop command sent';
    snackbar.color = 'success';
  } catch (err: any) {
    snackbar.show = true;
    snackbar.message = 'Failed to bulk stop';
    snackbar.color = 'error';
  }
}

async function bulkJoinTable() {
  if (!selected.value.length || !bulkJoinTableId.value || !bulkJoinBuyIn.value) return;
  bulkJoining.value = true;
  try {
    const response = await botsApi.bulkJoinTable(
      selected.value,
      bulkJoinTableId.value,
      bulkJoinBuyIn.value,
      bulkJoinPreferredSeat.value,
    );
    snackbar.show = true;
    snackbar.message = response.data?.message || 'Randomized join sequence started';
    snackbar.color = 'success';
    showBulkJoinDialog.value = false;
  } catch (err: any) {
    snackbar.show = true;
    snackbar.message = err.response?.data?.message || 'Failed to start bulk join';
    snackbar.color = 'error';
  } finally {
    bulkJoining.value = false;
  }
}

async function emergencyStopAll() {
  emergencyStopping.value = true;
  try {
    const response = await botsApi.emergencyStopAll();
    snackbar.show = true;
    snackbar.message = response.data?.message || 'Emergency stop sent to all workers';
    snackbar.color = 'success';
    showEmergencyDialog.value = false;
    await loadBots();
  } catch (err: any) {
    snackbar.show = true;
    snackbar.message = err.response?.data?.message || 'Failed to send emergency stop';
    snackbar.color = 'error';
  } finally {
    emergencyStopping.value = false;
  }
}
</script>
