<template>
  <v-app>
    <router-view />
    <v-snackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="3000"
      location="top right"
    >
      {{ snackbar.message }}
    </v-snackbar>
  </v-app>
</template>

<script setup lang="ts">
import { provide, reactive, ref } from 'vue';

const snackbar = reactive({
  show: false,
  message: '',
  color: 'info' as string,
});

provide('snackbar', snackbar);
</script>
