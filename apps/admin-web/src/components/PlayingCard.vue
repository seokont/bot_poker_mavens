<template>
  <div class="playing-card" :class="{ 'playing-card--red': isRed }">
    <span class="playing-card__rank">{{ rank }}</span>
    <span class="playing-card__suit">{{ suitSymbol }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

// card is either a {rank, suit} object (the shared-types Card shape) or a
// 2-char string like "Ah" - accept both since either can show up depending
// on which layer serialized it.
const props = defineProps<{ card: { rank: string; suit: string } | string }>();

const SUIT_SYMBOLS: Record<string, string> = { h: '♥', d: '♦', c: '♣', s: '♠' };

const rank = computed(() => {
  const c = props.card;
  return typeof c === 'string' ? c.slice(0, -1) : c?.rank ?? '?';
});
const suitChar = computed(() => {
  const c = props.card;
  return (typeof c === 'string' ? c.slice(-1) : c?.suit ?? '').toLowerCase();
});
const suitSymbol = computed(() => SUIT_SYMBOLS[suitChar.value] ?? '?');
const isRed = computed(() => suitChar.value === 'h' || suitChar.value === 'd');
</script>

<style scoped>
.playing-card {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 50px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: #fff;
  color: #1a1a1a;
  font-weight: 700;
  margin-right: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  line-height: 1.1;
}

.playing-card--red {
  color: #d32f2f;
}

.playing-card__rank {
  font-size: 15px;
}

.playing-card__suit {
  font-size: 14px;
}
</style>
