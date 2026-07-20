<template>
  <div>
    <h2 class="text-h4 mb-4">Strategies</h2>
    <v-card>
      <v-card-title>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="showCreateDialog = true">
          Create Strategy
        </v-btn>
      </v-card-title>
      <v-data-table-server
        v-model:items-per-page="itemsPerPage"
        :headers="headers"
        :items="strategies"
        :items-length="total"
        :loading="loading"
        @update:options="loadStrategies"
      >
        <template v-slot:item.difficulty="{ item }">
          <v-chip :color="difficultyColor(item.difficulty)" size="small">{{ item.difficulty }}</v-chip>
        </template>
        <template v-slot:item.isActive="{ item }">
          <v-chip :color="item.isActive ? 'success' : 'grey'" size="small">
            {{ item.isActive ? 'Active' : 'Inactive' }}
          </v-chip>
        </template>
        <template v-slot:item.actions="{ item }">
          <v-btn icon size="small" @click="editStrategy(item)">
            <v-icon>mdi-pencil</v-icon>
          </v-btn>
          <v-btn icon size="small" @click="cloneStrategy(item.id)">
            <v-icon>mdi-content-copy</v-icon>
          </v-btn>
          <v-btn icon size="small" @click="confirmDelete(item)">
            <v-icon>mdi-delete</v-icon>
          </v-btn>
        </template>
      </v-data-table-server>
    </v-card>
    <v-dialog v-model="showCreateDialog" max-width="500">
      <v-card>
        <v-card-title>Create Strategy</v-card-title>
        <v-card-text>
          <v-text-field v-model="newStrategy.name" label="Name"></v-text-field>
          <v-textarea v-model="newStrategy.description" label="Description"></v-textarea>
          <v-select v-model="newStrategy.difficulty" :items="['EASY', 'MEDIUM', 'HARD']" label="Difficulty"></v-select>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="showCreateDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="createStrategy">Create</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showEditDialog" max-width="500">
      <v-card>
        <v-card-title>Edit Strategy</v-card-title>
        <v-card-text>
          <v-text-field v-model="editingStrategy.name" label="Name"></v-text-field>
          <v-textarea v-model="editingStrategy.description" label="Description"></v-textarea>
          <v-select v-model="editingStrategy.difficulty" :items="['EASY', 'MEDIUM', 'HARD']" label="Difficulty"></v-select>
          <v-textarea
            v-model="editingStrategy.customInstructions"
            label="Custom Instructions (HARD/Groq only)"
            hint="Free-text guidance sent straight to the AI's prompt, e.g. 'bluff more on scary boards', 'play tight-aggressive', 'never slowplay sets'. Ignored by EASY/MEDIUM strategies."
            persistent-hint
            rows="3"
          ></v-textarea>
          <v-switch v-model="editingStrategy.isActive" label="Active" color="success" hide-details></v-switch>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="showEditDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="saveStrategy">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showDeleteDialog" max-width="420">
      <v-card>
        <v-card-title>Deactivate Strategy</v-card-title>
        <v-card-text>
          Deactivate "{{ deletingStrategy?.name }}"? Bots currently assigned to it will keep using it, but it
          won't be selectable for new assignments. This does not permanently erase the strategy.
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="showDeleteDialog = false">Cancel</v-btn>
          <v-btn color="error" @click="deleteStrategy">Deactivate</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { strategiesApi } from '../../api/strategies';
import { inject } from 'vue';

const snackbar = inject('snackbar') as any;
const strategies = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const itemsPerPage = ref(20);
const showCreateDialog = ref(false);
const newStrategy = ref({ name: '', description: '', difficulty: 'EASY' });

const showEditDialog = ref(false);
const editingStrategy = ref<{ id: string; name: string; description: string; difficulty: string; isActive: boolean; customInstructions: string }>({
  id: '', name: '', description: '', difficulty: 'EASY', isActive: true, customInstructions: '',
});
// Preserves any other configurationJson keys (aggression, betSizes, etc.)
// that aren't exposed in this edit dialog, so saving doesn't wipe them.
let editingConfigurationJson: Record<string, unknown> = {};

const showDeleteDialog = ref(false);
const deletingStrategy = ref<any>(null);

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Difficulty', key: 'difficulty' },
  { title: 'Active', key: 'isActive' },
  { title: 'Actions', key: 'actions', sortable: false },
];

function difficultyColor(difficulty: string): string {
  return { EASY: 'success', MEDIUM: 'warning', HARD: 'error' }[difficulty] || 'grey';
}

const lastOptions = ref<{ page: number; itemsPerPage: number }>({ page: 1, itemsPerPage: 20 });

async function loadStrategies(options?: { page: number; itemsPerPage: number }) {
  if (options) lastOptions.value = options;
  const { page, itemsPerPage } = lastOptions.value;
  loading.value = true;
  try {
    const response = await strategiesApi.list({ page, limit: itemsPerPage, isActive: true });
    strategies.value = response.data.data || response.data;
    total.value = response.data.meta?.total || 0;
  } catch (err) {
    console.error('Failed to load strategies:', err);
  } finally {
    loading.value = false;
  }
}

async function createStrategy() {
  try {
    await strategiesApi.create(newStrategy.value);
    showCreateDialog.value = false;
    newStrategy.value = { name: '', description: '', difficulty: 'EASY' };
    snackbar.show = true;
    snackbar.message = 'Strategy created';
    snackbar.color = 'success';
    await loadStrategies();
  } catch (err: any) {
    snackbar.show = true;
    snackbar.message = err.response?.data?.message || 'Failed to create strategy';
    snackbar.color = 'error';
  }
}

function editStrategy(item: any) {
  editingConfigurationJson = item.configurationJson || {};
  editingStrategy.value = {
    id: item.id,
    name: item.name,
    description: item.description || '',
    difficulty: item.difficulty,
    isActive: item.isActive,
    customInstructions: String(editingConfigurationJson.customInstructions ?? ''),
  };
  showEditDialog.value = true;
}

async function saveStrategy() {
  try {
    const { id, customInstructions, ...data } = editingStrategy.value;
    const configurationJson = { ...editingConfigurationJson, customInstructions };
    await strategiesApi.update(id, { ...data, configurationJson });
    showEditDialog.value = false;
    snackbar.show = true;
    snackbar.message = 'Strategy updated';
    snackbar.color = 'success';
    await loadStrategies();
  } catch (err: any) {
    snackbar.show = true;
    snackbar.message = err.response?.data?.message || 'Failed to update strategy';
    snackbar.color = 'error';
  }
}

function confirmDelete(item: any) {
  deletingStrategy.value = item;
  showDeleteDialog.value = true;
}

async function deleteStrategy() {
  if (!deletingStrategy.value) return;
  try {
    await strategiesApi.remove(deletingStrategy.value.id);
    showDeleteDialog.value = false;
    snackbar.show = true;
    snackbar.message = 'Strategy deactivated';
    snackbar.color = 'success';
    await loadStrategies();
  } catch (err: any) {
    snackbar.show = true;
    snackbar.message = err.response?.data?.message || 'Failed to deactivate strategy';
    snackbar.color = 'error';
  }
}

async function cloneStrategy(id: string) {
  try {
    await strategiesApi.clone(id);
    snackbar.show = true;
    snackbar.message = 'Strategy cloned';
    snackbar.color = 'success';
    await loadStrategies();
  } catch (err: any) {
    snackbar.show = true;
    snackbar.message = 'Failed to clone strategy';
    snackbar.color = 'error';
  }
}
</script>
