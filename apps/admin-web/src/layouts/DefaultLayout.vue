<template>
  <v-layout>
    <v-app-bar color="primary" density="compact">
      <v-app-bar-nav-icon @click="drawer = !drawer"></v-app-bar-nav-icon>
      <v-app-bar-title>Poker Mavens Bot Platform</v-app-bar-title>
      <v-spacer></v-spacer>
      <v-chip class="mr-2" size="small" v-if="socketConnected" color="success">
        Live
      </v-chip>
      <v-chip class="mr-2" size="small" v-else color="error">
        Disconnected
      </v-chip>
      <v-btn icon @click="logout">
        <v-icon>mdi-logout</v-icon>
      </v-btn>
    </v-app-bar>

    <v-navigation-drawer v-model="drawer" temporary>
      <v-list>
        <v-list-item
          prepend-icon="mdi-view-dashboard"
          title="Dashboard"
          :to="{ name: 'dashboard' }"
        ></v-list-item>
        <v-list-item
          prepend-icon="mdi-robot"
          title="Bots"
          :to="{ name: 'bots' }"
        ></v-list-item>
        <v-list-item
          prepend-icon="mdi-table"
          title="Tables"
          :to="{ name: 'tables' }"
        ></v-list-item>
        <v-list-item
          prepend-icon="mdi-cards"
          title="Hands"
          :to="{ name: 'hands' }"
        ></v-list-item>
        <v-list-item
          prepend-icon="mdi-brain"
          title="Strategies"
          :to="{ name: 'strategies' }"
        ></v-list-item>
        <v-list-item
          prepend-icon="mdi-text-box-search"
          title="Logs"
          :to="{ name: 'logs' }"
        ></v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <v-container fluid>
        <router-view />
      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useSocketStore } from '../stores/socket';

const drawer = ref(false);
const router = useRouter();
const authStore = useAuthStore();
const socketStore = useSocketStore();
// Reactive binding to the store's own `connected` ref, rather than a
// manually-synced local copy - a local copy updated only via `.on('connect',
// ...)` misses the event if that listener is registered (as it is here,
// at setup time) before `connect()` has created the underlying socket
// (which happens later, in onMounted) - the indicator would then get stuck
// showing "Disconnected" forever after every page reload even though the
// socket connects fine underneath.
const socketConnected = computed(() => socketStore.connected);

onMounted(() => {
  socketStore.connect();
});

function logout() {
  authStore.logout();
  socketStore.disconnect();
  router.push({ name: 'login' });
}
</script>
