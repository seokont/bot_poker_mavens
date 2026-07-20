const express = require('express');
const path = require('path');
const app = express();
const PORT = 3080;

app.use(express.json());
app.use(express.static(__dirname));

// ── State Management ──────────────────────────────────────────────
// Bot sessions: sessionId -> { username, loggedIn, tableId, seatNumber, stack, buyIn, handId, turnId, cards, connected }
const sessions = new Map();

// Table state: tableId -> { seats: [], pot, board, players, handId, turnId, currentStreet, dealer }
const tables = {
  'table-1': {
    id: 'table-1',
    name: 'Texas Hold\'em',
    gameType: 'Texas Hold\'em',
    blinds: '1/2',
    maxPlayers: 9,
    status: 'running',
    pot: 0,
    board: [],
    handId: null,
    turnId: null,
    currentStreet: 'preflop',
    dealer: 0,
    seats: Array(9).fill(null).map(() => ({ empty: true })),
    players: [],
    actionHistory: [],
    allowedActions: ['fold', 'check', 'call', 'bet', 'raise', 'all-in'],
  },
  'table-2': {
    id: 'table-2',
    name: 'Omaha',
    gameType: 'Omaha',
    blinds: '2/5',
    maxPlayers: 9,
    status: 'running',
    pot: 0,
    board: [],
    handId: null,
    turnId: null,
    currentStreet: 'preflop',
    dealer: 0,
    seats: Array(9).fill(null).map(() => ({ empty: true })),
    players: [],
    actionHistory: [],
    allowedActions: ['fold', 'check', 'call', 'bet', 'raise', 'all-in'],
  },
  'table-3': {
    id: 'table-3',
    name: 'Sit & Go',
    gameType: 'Sit & Go',
    blinds: '5/10',
    maxPlayers: 9,
    status: 'waiting',
    pot: 0,
    board: [],
    handId: null,
    turnId: null,
    currentStreet: 'preflop',
    dealer: 0,
    seats: Array(9).fill(null).map(() => ({ empty: true })),
    players: [],
    actionHistory: [],
    allowedActions: ['fold', 'check', 'call', 'bet', 'raise', 'all-in'],
  },
};

// ── State Endpoints ───────────────────────────────────────────────

// POST /api/state/set - Set state for testing
app.post('/api/state/set', (req, res) => {
  const { sessionId, key, value } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { username: sessionId, loggedIn: false, tableId: null, seatNumber: null, stack: 1000, buyIn: 0, handId: null, turnId: null, cards: [], connected: true });
  }
  const session = sessions.get(sessionId);
  session[key] = value;
  sessions.set(sessionId, session);
  res.json({ success: true, session });
});

// GET /api/state/:sessionId - Get bot state
app.get('/api/state/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (!sessions.has(sessionId)) {
    return res.json({ exists: false });
  }
  res.json({ exists: true, session: sessions.get(sessionId) });
});

// POST /api/state/reset - Reset all state
app.post('/api/state/reset', (req, res) => {
  sessions.clear();
  Object.keys(tables).forEach(tid => {
    const t = tables[tid];
    t.pot = 0;
    t.board = [];
    t.handId = null;
    t.turnId = null;
    t.currentStreet = 'preflop';
    t.dealer = 0;
    t.seats = Array(9).fill(null).map(() => ({ empty: true }));
    t.players = [];
    t.actionHistory = [];
    t.allowedActions = ['fold', 'check', 'call', 'bet', 'raise', 'all-in'];
  });
  res.json({ success: true });
});

// ── Auth Simulation ───────────────────────────────────────────────
// Since this is a mock, any username/password combo works
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
  sessions.set(sessionId, {
    username,
    loggedIn: true,
    tableId: null,
    seatNumber: null,
    stack: 1000,
    buyIn: 0,
    handId: null,
    turnId: null,
    cards: [],
    connected: true,
  });
  res.json({ success: true, sessionId, username });
});

// ── Lobby Endpoints ───────────────────────────────────────────────

// GET /api/lobby/tables - Returns 3 mock tables
app.get('/api/lobby/tables', (req, res) => {
  const tableList = Object.values(tables).map(t => ({
    id: t.id,
    name: t.name,
    gameType: t.gameType,
    blinds: t.blinds,
    maxPlayers: t.maxPlayers,
    players: t.players.length,
    status: t.status,
  }));
  res.json({ tables: tableList });
});

// ── Table Endpoints ───────────────────────────────────────────────

// POST /api/table/:tableId/seat - Take a seat
app.post('/api/table/:tableId/seat', (req, res) => {
  const { tableId } = req.params;
  const { sessionId, seatNumber, buyIn } = req.body;
  const table = tables[tableId];
  if (!table) return res.status(404).json({ error: 'Table not found' });
  if (!sessions.has(sessionId)) return res.status(400).json({ error: 'Invalid session' });

  const seatIdx = parseInt(seatNumber);
  if (isNaN(seatIdx) || seatIdx < 0 || seatIdx >= 9) return res.status(400).json({ error: 'Invalid seat' });
  if (!table.seats[seatIdx].empty) return res.status(400).json({ error: 'Seat taken' });

  const session = sessions.get(sessionId);
  table.seats[seatIdx] = { empty: false, sessionId, username: session.username, stack: parseInt(buyIn) || 1000 };
  table.players.push({ sessionId, username: session.username, stack: parseInt(buyIn) || 1000, seatNumber: seatIdx });
  session.tableId = tableId;
  session.seatNumber = seatIdx;
  session.stack = parseInt(buyIn) || 1000;
  session.buyIn = parseInt(buyIn) || 1000;

  // Generate hand ID and turn ID when seated
  session.handId = 'hand-' + Date.now();
  session.turnId = 'turn-' + Date.now();
  table.handId = session.handId;
  session.cards = generateCards(2);

  res.json({ success: true, session: { ...session, cards: undefined } });
});

// POST /api/table/:tableId/leave - Leave a seat
app.post('/api/table/:tableId/leave', (req, res) => {
  const { tableId } = req.params;
  const { sessionId } = req.body;
  const table = tables[tableId];
  if (!table) return res.status(404).json({ error: 'Table not found' });
  if (!sessions.has(sessionId)) return res.status(400).json({ error: 'Invalid session' });

  const session = sessions.get(sessionId);
  if (session.seatNumber !== null && table.seats[session.seatNumber]) {
    table.seats[session.seatNumber] = { empty: true };
  }
  table.players = table.players.filter(p => p.sessionId !== sessionId);
  session.tableId = null;
  session.seatNumber = null;

  res.json({ success: true });
});

// ── Game State ────────────────────────────────────────────────────

// GET /api/table/:tableId/state/:sessionId - Returns game state JSON
app.get('/api/table/:tableId/state/:sessionId', (req, res) => {
  const { tableId, sessionId } = req.params;
  const table = tables[tableId];
  if (!table) return res.status(404).json({ error: 'Table not found' });
  const session = sessions.get(sessionId);
  if (!session) return res.status(400).json({ error: 'Invalid session' });

  // Determine if it's this session's turn
  const isMyTurn = table.turnId === session.turnId && table.turnId !== null;
  const isHandActive = table.handId === session.handId && table.handId !== null;

  const gameState = {
    tableId: table.id,
    handId: table.handId,
    turnId: table.turnId,
    isMyTurn,
    isHandActive,
    pot: table.pot,
    board: table.board,
    currentStreet: table.currentStreet,
    dealer: table.dealer,
    cards: isHandActive ? session.cards : [],
    myStack: session.stack,
    mySeat: session.seatNumber,
    players: table.players.map(p => {
      const s = sessions.get(p.sessionId);
      return {
        username: p.username,
        stack: p.stack,
        seatNumber: p.seatNumber,
        isActiveTurn: table.turnId === (s ? s.turnId : null),
        sessionId: p.sessionId,
      };
    }),
    seats: table.seats.map((s, i) => ({
      seatNumber: i,
      empty: s.empty,
      username: s.username || null,
      stack: s.stack || null,
    })),
    allowedActions: session.connected ? table.allowedActions : [],
    actionHistory: table.actionHistory,
    isConnected: session.connected,
  };

  res.json(gameState);
});

// POST /api/table/:tableId/action - Execute an action
app.post('/api/table/:tableId/action', (req, res) => {
  const { tableId } = req.params;
  const { sessionId, action, amount } = req.body;
  const table = tables[tableId];
  if (!table) return res.status(404).json({ error: 'Table not found' });
  const session = sessions.get(sessionId);
  if (!session) return res.status(400).json({ error: 'Invalid session' });

  const actionStr = action + (amount ? ' ' + amount : '');
  table.actionHistory.push({
    player: session.username,
    action: actionStr,
    timestamp: Date.now(),
  });

  // Generate new turn ID (simulate action advancing)
  session.turnId = 'turn-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
  table.turnId = session.turnId;

  if (action === 'fold') {
    // Player folded - new hand for next round
    session.handId = 'hand-' + Date.now();
    session.cards = generateCards(2);
    table.handId = session.handId;
  }

  if (action === 'call' || action === 'bet' || action === 'raise') {
    const amt = parseInt(amount) || 0;
    table.pot += amt;
    session.stack -= amt;
    // Update player stack in table
    const playerData = table.players.find(p => p.sessionId === sessionId);
    if (playerData) playerData.stack = session.stack;
  }

  if (action === 'all-in') {
    const playerData = table.players.find(p => p.sessionId === sessionId);
    if (playerData) {
      table.pot += playerData.stack;
      session.stack = 0;
      playerData.stack = 0;
    }
  }

  res.json({
    success: true,
    pot: table.pot,
    stack: session.stack,
    turnId: table.turnId,
    handId: table.handId,
    actionHistory: table.actionHistory,
  });
});

// ── Control Endpoints ─────────────────────────────────────────────

// POST /api/control/disconnect/:sessionId - Simulate disconnect
app.post('/api/control/disconnect/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  session.connected = !session.connected;
  res.json({ success: true, connected: session.connected });
});

// POST /api/control/stale-turn/:sessionId - Simulate stale turn
app.post('/api/control/stale-turn/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  // Advance the table's turnId but not the session's turnId
  const table = tables[session.tableId];
  if (table) {
    table.turnId = 'stale-turn-' + Date.now();
  }
  res.json({ success: true, tableTurnId: table ? table.turnId : null, sessionTurnId: session.turnId });
});

// POST /api/control/stale-hand/:sessionId - Simulate stale hand
app.post('/api/control/stale-hand/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const table = tables[session.tableId];
  if (table) {
    table.handId = 'stale-hand-' + Date.now();
  }
  res.json({ success: true });
});

// POST /api/control/set-allowed-actions/:sessionId - Control action buttons
app.post('/api/control/set-allowed-actions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { actions } = req.body;
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const table = tables[session.tableId];
  if (table) {
    table.allowedActions = actions || ['fold', 'check', 'call', 'bet', 'raise', 'all-in'];
  }
  res.json({ success: true, allowedActions: table ? table.allowedActions : [] });
});

// POST /api/control/trigger-error/:sessionId - Simulate any error scenario
app.post('/api/control/trigger-error/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { errorType, message } = req.body;
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  // Store the error on the session for the UI to display
  session.lastError = { type: errorType || 'generic', message: message || 'Simulated error' };
  res.json({ success: true, error: session.lastError });
});

// POST /api/control/advance-street/:sessionId - Force street transition
app.post('/api/control/advance-street/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const table = tables[session.tableId];
  if (!table) return res.status(400).json({ error: 'Not at a table' });

  const streets = ['preflop', 'flop', 'turn', 'river'];
  const currentIdx = streets.indexOf(table.currentStreet);
  if (currentIdx < streets.length - 1) {
    table.currentStreet = streets[currentIdx + 1];
    // Generate board cards based on street
    if (table.currentStreet === 'flop') {
      table.board = generateCards(3);
    } else if (table.currentStreet === 'turn') {
      table.board = [...table.board.slice(0, 3), ...generateCards(1)];
    } else if (table.currentStreet === 'river') {
      table.board = [...table.board.slice(0, 4), ...generateCards(1)];
    }
    // Advance turn
    session.turnId = 'turn-' + Date.now();
    table.turnId = session.turnId;
    table.pot += 10; // Simulate more betting
  }

  res.json({ success: true, currentStreet: table.currentStreet, board: table.board, pot: table.pot });
});

// POST /api/control/set-hero-turn/:sessionId/:isTurn - Set whose turn it is
app.post('/api/control/set-hero-turn/:sessionId/:isTurn', (req, res) => {
  const { sessionId, isTurn } = req.params;
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const table = tables[session.tableId];
  if (!table) return res.status(400).json({ error: 'Not at a table' });

  if (isTurn === 'true' || isTurn === '1') {
    table.turnId = session.turnId;
  } else {
    table.turnId = 'other-turn-' + Date.now();
  }

  res.json({ success: true, isMyTurn: table.turnId === session.turnId });
});

// ── Helper ────────────────────────────────────────────────────────
function generateCards(count) {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const cards = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    let card;
    do {
      const suit = suits[Math.floor(Math.random() * suits.length)];
      const rank = ranks[Math.floor(Math.random() * ranks.length)];
      card = { suit, rank, display: rank + suit };
    } while (used.has(card.display));
    used.add(card.display);
    cards.push(card);
  }
  return cards;
}

app.listen(PORT, () => {
  console.log(`Mock Poker Mavens UI running at http://localhost:${PORT}`);
});
