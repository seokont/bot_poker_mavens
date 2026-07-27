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

function testNonContiguousSeatIndices(): void {
  // Occupied seats at indices 0, 3, 7 (not 0..n-1) - dealer at seatIndex 3.
  // Sorted order: [0, 3(dealer), 7]. n=3 -> TABLE_SIZE_ORDER[3] = [BTN, SB, BB].
  // If the code mistakenly used raw seatIndex arithmetic instead of sorted
  // position, these offsets would come out wrong.
  const table = seats([[0, false], [3, true], [7, false]]);
  assert(resolvePosition(table, 3) === Position.BTN, 'non-contiguous: dealer seat should be BTN');
  assert(resolvePosition(table, 7) === Position.SB, 'non-contiguous: seat after dealer (sorted) should be SB');
  assert(resolvePosition(table, 0) === Position.BB, 'non-contiguous: seat two after dealer (sorted, wrapped) should be BB');
}

function testNineMaxFallsBackToBtn(): void {
  // 9 occupied seats exceeds TABLE_SIZE_ORDER's 8-max coverage, so the
  // Finding 2 guard should kick in and return BTN for every hero seat,
  // not just the dealer's own seat.
  const table = seats([
    [0, false], [1, false], [2, false], [3, false], [4, true],
    [5, false], [6, false], [7, false], [8, false],
  ]);
  for (let heroSeatIndex = 0; heroSeatIndex < 9; heroSeatIndex++) {
    assert(
      resolvePosition(table, heroSeatIndex) === Position.BTN,
      `9-max: hero at seat ${heroSeatIndex} should fall back to BTN (table too large)`,
    );
  }
}

function testAmbiguousDoubleDealerDoesNotThrow(): void {
  // Malformed input: two seats both flagged isDealer. findIndex resolves to
  // whichever comes first in sorted-by-seatIndex order - seatIndex 0 here -
  // so offsets are computed from that seat.
  const table = seats([[0, true], [1, false], [2, true]]);
  assert(resolvePosition(table, 0) === Position.BTN, 'double dealer: first dealer in sorted order treated as BTN');
  assert(resolvePosition(table, 1) === Position.SB, 'double dealer: seat after first dealer should be SB');
  assert(resolvePosition(table, 2) === Position.BB, 'double dealer: seat two after first dealer should be BB');
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

function testResolveFoldedPlayersUnknownPlayerName(): void {
  // resolveFoldedPlayers never looks at a players list - it just reads the
  // action history - so a fold entry for a name that isn't at the table
  // anymore (e.g. someone who left) should still land in the returned set
  // without erroring. Cross-referencing against a players list happens at
  // the call site, not inside this function.
  const history = [{ playerName: 'Ghost', action: 'fold' }];
  const folded = resolveFoldedPlayers(history);
  assert(folded.has('Ghost'), 'fold entry for a player not at the table should still appear in the set');
}

export function runAll(): number {
  const tests: Array<{ name: string; fn: () => void }> = [
    { name: 'resolvePosition: heads-up', fn: testHeadsUp },
    { name: 'resolvePosition: 3-max', fn: testThreeMax },
    { name: 'resolvePosition: 6-max', fn: testSixMax },
    { name: 'resolvePosition: 8-max', fn: testEightMax },
    { name: 'resolvePosition: fallbacks', fn: testFallbacksOnUnreadableTable },
    { name: 'resolvePosition: non-contiguous seat indices', fn: testNonContiguousSeatIndices },
    { name: 'resolvePosition: 9-max falls back to BTN', fn: testNineMaxFallsBackToBtn },
    { name: 'resolvePosition: ambiguous double dealer does not throw', fn: testAmbiguousDoubleDealerDoesNotThrow },
    { name: 'resolveFoldedPlayers: basic', fn: testResolveFoldedPlayers },
    { name: 'resolveFoldedPlayers: empty history', fn: testResolveFoldedPlayersEmptyHistory },
    { name: 'resolveFoldedPlayers: unknown player name', fn: testResolveFoldedPlayersUnknownPlayerName },
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
