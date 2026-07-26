import { Position } from '@poker-bot/shared-types';
import { resolvePosition, resolveFoldedPlayers } from '../state-derivation';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function seats(pairs: Array<[seatIndex: number, isDealer: boolean]>) {
  return pairs.map(([seatIndex, isDealer]) => ({ seatIndex, isDealer }));
}

function testHeadsUp(): void {
  const table = seats([[0, true], [1, false]]);
  assert(resolvePosition(table, 0) === Position.BTN, 'heads-up: dealer seat should be BTN');
  assert(resolvePosition(table, 1) === Position.BB, 'heads-up: non-dealer seat should be BB');
}

function testThreeMax(): void {
  const table = seats([[0, false], [1, true], [2, false]]);
  assert(resolvePosition(table, 1) === Position.BTN, '3-max: dealer should be BTN');
  assert(resolvePosition(table, 2) === Position.SB, '3-max: seat after dealer should be SB');
  assert(resolvePosition(table, 0) === Position.BB, '3-max: seat two after dealer should be BB');
}

function testSixMax(): void {
  // Seats 0..5, dealer at seat 2. Clockwise from dealer: 2=BTN,3=SB,4=BB,5=UTG,0=HJ,1=CO.
  const table = seats([[0, false], [1, false], [2, true], [3, false], [4, false], [5, false]]);
  assert(resolvePosition(table, 2) === Position.BTN, '6-max: dealer seat should be BTN');
  assert(resolvePosition(table, 3) === Position.SB, '6-max: seat+1 from dealer should be SB');
  assert(resolvePosition(table, 4) === Position.BB, '6-max: seat+2 from dealer should be BB');
  assert(resolvePosition(table, 5) === Position.UTG, '6-max: seat+3 from dealer should be UTG');
  assert(resolvePosition(table, 0) === Position.HJ, '6-max: seat+4 from dealer (wrapped) should be HJ');
  assert(resolvePosition(table, 1) === Position.CO, '6-max: seat+5 from dealer (wrapped) should be CO');
}

function testEightMax(): void {
  // Seats 0..7, dealer at seat 0. Clockwise: 0=BTN,1=SB,2=BB,3=UTG,4=UTG1,5=MP,6=HJ,7=CO.
  const table = seats([
    [0, true], [1, false], [2, false], [3, false],
    [4, false], [5, false], [6, false], [7, false],
  ]);
  assert(resolvePosition(table, 4) === Position.UTG1, '8-max: seat+4 from dealer should be UTG1');
  assert(resolvePosition(table, 5) === Position.MP, '8-max: seat+5 from dealer should be MP');
}

function testFallbacksOnUnreadableTable(): void {
  const noDealer = seats([[0, false], [1, false]]);
  assert(resolvePosition(noDealer, 0) === Position.BTN, 'no dealer found: should fall back to BTN');

  const table = seats([[0, true], [1, false]]);
  assert(resolvePosition(table, 99) === Position.BTN, 'hero seat not found: should fall back to BTN');

  assert(resolvePosition([], 0) === Position.BTN, 'empty table: should fall back to BTN');
}

function testResolveFoldedPlayers(): void {
  const history = [
    { playerName: 'Alice', action: 'fold' },
    { playerName: 'Bob', action: 'call 20' },
    { playerName: 'Carol', action: 'Folds' },
    { playerName: 'Bob', action: 'raise 40' },
  ];
  const folded = resolveFoldedPlayers(history);
  assert(folded.has('Alice'), 'Alice folded and should be in the set');
  assert(folded.has('Carol'), 'Carol folded (capitalized action text) and should be in the set');
  assert(!folded.has('Bob'), 'Bob never folded and should not be in the set');
}

function testResolveFoldedPlayersEmptyHistory(): void {
  const folded = resolveFoldedPlayers([]);
  assert(folded.size === 0, 'empty history should produce an empty set');
}

export function runAll(): number {
  const tests: Array<{ name: string; fn: () => void }> = [
    { name: 'resolvePosition: heads-up', fn: testHeadsUp },
    { name: 'resolvePosition: 3-max', fn: testThreeMax },
    { name: 'resolvePosition: 6-max', fn: testSixMax },
    { name: 'resolvePosition: 8-max', fn: testEightMax },
    { name: 'resolvePosition: fallbacks', fn: testFallbacksOnUnreadableTable },
    { name: 'resolveFoldedPlayers: basic', fn: testResolveFoldedPlayers },
    { name: 'resolveFoldedPlayers: empty history', fn: testResolveFoldedPlayersEmptyHistory },
  ];

  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      fn();
      console.log(`  PASS  ${name}`);
      passed++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  FAIL  ${name}: ${msg}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  return failed;
}
