/* ═══════════════════════════════════════════════════════════════════
   Mock Poker Mavens UI - Application Logic
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────
  let appState = {
    sessionId: null,
    username: null,
    currentTableId: null,
    pollingInterval: null,
    timerInterval: null,
    timerSeconds: 0,
  };

  // ── DOM References ─────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Views
  const loginView = $('#login-view');
  const lobbyView = $('#lobby-view');
  const tableView = $('#table-view');

  // Login
  const loginForm = $('#login-form');
  const usernameInput = $('#username');
  const passwordInput = $('#password');
  const errorMessage = $('.error-message');

  // Lobby
  const lobbyTableBody = $('#lobby-table-body');
  const lobbyUsername = $('.lobby-username');
  const logoutBtn = $('#logout-btn');

  // Table
  const tableNameHeader = $('#table-name-header');
  const lobbyBtn = $('#lobby-btn');
  const disconnectBtn = $('#disconnect-btn');
  const seats = $$('.seat');
  const potAmount = $('.pot-amount');
  const boardCards = $$('.board-cards .card');
  const heroCards = $$('.hero-cards .card');
  const heroStack = $('.hero-stack');
  const dealerButton = $('.dealer-button');
  const streetLabel = $('.street-label');
  const actionHistory = $('.action-history');
  const actionTimer = $('.action-timer');

  // Action buttons
  const foldBtn = $('.action-btn.fold');
  const checkBtn = $('.action-btn.check');
  const callBtn = $('.action-btn.call');
  const betBtn = $('.action-btn.bet');
  const raiseBtn = $('.action-btn.raise');
  const allInBtn = $('.action-btn.all-in');
  const betAmountInput = $$('.bet-amount-input');

  // Buy-in modal
  const buyinModal = $('#buyin-modal');
  const buyinAmount = $('.buy-in-amount');
  const buyinConfirm = $('.buy-in-confirm');
  const buyinCancel = $('.buy-in-cancel');

  // ── View Management ─────────────────────────────────────────────────
  function showView(viewName) {
    $$('.view').forEach(v => v.classList.remove('active'));
    if (viewName === 'login') {
      loginView.classList.add('active');
      $('#login-view').style.display = 'flex';
    } else if (viewName === 'lobby') {
      lobbyView.classList.add('active');
    } else if (viewName === 'table') {
      tableView.classList.add('active');
    }
  }

  // ── Login ───────────────────────────────────────────────────────────
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    errorMessage.textContent = '';

    if (!username || !password) {
      errorMessage.textContent = 'Please enter username and password';
      return;
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        appState.sessionId = data.sessionId;
        appState.username = data.username;
        lobbyUsername.textContent = 'Logged in as: ' + data.username;
        showView('lobby');
        loadLobby();
      } else {
        errorMessage.textContent = data.error || 'Login failed';
      }
    } catch (err) {
      errorMessage.textContent = 'Connection error';
    }
  });

  // ── Logout ──────────────────────────────────────────────────────────
  logoutBtn.addEventListener('click', () => {
    stopPolling();
    stopTimer();
    if (appState.currentTableId) {
      leaveTable();
    }
    appState.sessionId = null;
    appState.username = null;
    appState.currentTableId = null;
    usernameInput.value = '';
    passwordInput.value = '';
    showView('login');
  });

  // ── Lobby ───────────────────────────────────────────────────────────
  async function loadLobby() {
    try {
      const res = await fetch('/api/lobby/tables');
      const data = await res.json();
      lobbyTableBody.innerHTML = '';
      data.tables.forEach(table => {
        const row = document.createElement('tr');
        row.className = 'lobby-table-row';
        row.innerHTML = `
          <td class="table-name">${escapeHtml(table.name)}</td>
          <td>${escapeHtml(table.gameType)}</td>
          <td>${escapeHtml(table.blinds)}</td>
          <td>${table.players}/${table.maxPlayers}</td>
          <td>${escapeHtml(table.status)}</td>
          <td><button class="open-table-btn" data-table-id="${escapeHtml(table.id)}">Open Table</button></td>
        `;
        lobbyTableBody.appendChild(row);
      });

      // Attach open table handlers
      $$('.open-table-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const tableId = btn.getAttribute('data-table-id');
          openTable(tableId);
        });
      });
    } catch (err) {
      console.error('Failed to load lobby', err);
    }
  }

  // ── Open Table ──────────────────────────────────────────────────────
  async function openTable(tableId) {
    appState.currentTableId = tableId;
    tableNameHeader.textContent = 'Table: ' + tableId;
    showView('table');
    resetTableUI();
    // Fetch initial state
    await pollGameState();
    startPolling();
  }

  // ── Leave Table / Lobby Button ──────────────────────────────────────
  lobbyBtn.addEventListener('click', async () => {
    await leaveTable();
    showView('lobby');
    loadLobby();
  });

  async function leaveTable() {
    if (!appState.currentTableId || !appState.sessionId) return;
    try {
      await fetch(`/api/table/${appState.currentTableId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: appState.sessionId }),
      });
    } catch (e) { /* ignore */ }
    stopPolling();
    stopTimer();
    appState.currentTableId = null;
  }

  // ── Seat Selection ──────────────────────────────────────────────────
  seats.forEach(seat => {
    seat.addEventListener('click', () => {
      if (!appState.currentTableId || !appState.sessionId) return;
      const seatNum = parseInt(seat.getAttribute('data-seat'));
      const playerEl = seat.querySelector('.seat-player');
      // If seat shows "Empty", trigger buy-in
      if (!playerEl.textContent || playerEl.textContent === 'Empty' || seat.classList.contains('empty')) {
        showBuyinModal(seatNum);
      }
    });
  });

  // ── Buy-In Modal ────────────────────────────────────────────────────
  let selectedSeat = null;

  function showBuyinModal(seatNum) {
    selectedSeat = seatNum;
    buyinAmount.value = '1000';
    buyinModal.classList.add('active');
  }

  buyinConfirm.addEventListener('click', async () => {
    const amount = parseInt(buyinAmount.value) || 1000;
    if (amount < 20) return;
    buyinModal.classList.remove('active');
    await takeSeat(selectedSeat, amount);
  });

  buyinCancel.addEventListener('click', () => {
    buyinModal.classList.remove('active');
    selectedSeat = null;
  });

  // Close modal on overlay click
  buyinModal.addEventListener('click', (e) => {
    if (e.target === buyinModal) {
      buyinModal.classList.remove('active');
      selectedSeat = null;
    }
  });

  async function takeSeat(seatNum, buyIn) {
    try {
      const res = await fetch(`/api/table/${appState.currentTableId}/seat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: appState.sessionId, seatNumber: seatNum, buyIn }),
      });
      const data = await res.json();
      if (data.success) {
        await pollGameState();
      }
    } catch (err) {
      console.error('Failed to take seat', err);
    }
  }

  // ── Game State Polling ──────────────────────────────────────────────
  function startPolling() {
    stopPolling();
    appState.pollingInterval = setInterval(pollGameState, 2000);
  }

  function stopPolling() {
    if (appState.pollingInterval) {
      clearInterval(appState.pollingInterval);
      appState.pollingInterval = null;
    }
  }

  async function pollGameState() {
    if (!appState.currentTableId || !appState.sessionId) return;
    try {
      const res = await fetch(`/api/table/${appState.currentTableId}/state/${appState.sessionId}`);
      const data = await res.json();
      updateTableUI(data);
    } catch (err) {
      console.error('Poll failed', err);
    }
  }

  // ── Update Table UI ─────────────────────────────────────────────────
  function resetTableUI() {
    potAmount.textContent = '0';
    streetLabel.textContent = '';
    boardCards.forEach(c => { c.textContent = ''; c.className = 'card-space card'; });
    heroCards.forEach(c => { c.textContent = ''; c.className = 'card-space card'; });
    heroStack.textContent = 'Stack: --';
    dealerButton.style.display = 'none';
    actionHistory.innerHTML = '';
    resetActionsUI();
  }

  function updateTableUI(state) {
    // Pot
    potAmount.textContent = state.pot || 0;

    // Street
    streetLabel.textContent = state.currentStreet ? state.currentStreet.toUpperCase() : '';

    // Board cards
    boardCards.forEach((cardEl, i) => {
      const cardData = state.board && state.board[i];
      if (cardData) {
        cardEl.textContent = cardData.display || '';
        cardEl.className = 'card-space card';
        cardEl.classList.add(isRedSuit(cardData.suit) ? 'suit-red' : 'suit-black');
        cardEl.classList.add('card-deal');
        setTimeout(() => cardEl.classList.remove('card-deal'), 400);
      } else {
        cardEl.textContent = '';
        cardEl.className = 'card-space card';
      }
    });

    // Hero cards
    heroCards.forEach((cardEl, i) => {
      const cardData = state.cards && state.cards[i];
      if (cardData) {
        cardEl.textContent = cardData.display || '';
        cardEl.className = 'card-space card';
        cardEl.classList.add(isRedSuit(cardData.suit) ? 'suit-red' : 'suit-black');
        cardEl.classList.add('card-deal');
        setTimeout(() => cardEl.classList.remove('card-deal'), 400);
      } else {
        cardEl.textContent = '';
        cardEl.className = 'card-space card';
      }
    });

    // Hero stack
    heroStack.textContent = 'Stack: ' + (state.myStack !== undefined ? state.myStack : '--');

    // Seats
    seats.forEach(seat => {
      const seatNum = parseInt(seat.getAttribute('data-seat'));
      const seatData = state.seats && state.seats[seatNum];
      const playerEl = seat.querySelector('.seat-player');
      const labelEl = seat.querySelector('.seat-label');

      seat.className = 'seat seat-position seat-' + seatNum;
      labelEl.textContent = 'Seat ' + (seatNum + 1);

      if (seatData && !seatData.empty) {
        seat.classList.remove('empty');
        playerEl.textContent = seatData.username || '';
        // Show stack under player name
        if (seatData.stack !== null) {
          playerEl.textContent = (seatData.username || '') + ' ($' + seatData.stack + ')';
        }
        // Hero highlight
        if (state.mySeat === seatNum) {
          seat.classList.add('hero');
        }
        // Active turn highlight
        const playerState = state.players && state.players.find(p => p.seatNumber === seatNum);
        if (playerState && playerState.isActiveTurn) {
          seat.classList.add('active-turn');
        }
      } else {
        seat.classList.add('empty');
        playerEl.textContent = 'Empty';
      }
    });

    // Dealer button - position it at the dealer seat
    if (state.dealer !== undefined && state.dealer >= 0 && state.dealer < 9) {
      dealerButton.style.display = 'flex';
      // Position dealer button near the dealer seat
      const dealerSeat = document.querySelector('.seat-' + state.dealer);
      if (dealerSeat) {
        const rect = dealerSeat.getBoundingClientRect();
        const table = document.querySelector('.poker-table');
        const tableRect = table.getBoundingClientRect();
        // Position relative to table
        const left = ((rect.left - tableRect.left) / tableRect.width) * 100;
        const top = ((rect.top - tableRect.top) / tableRect.height) * 100;
        dealerButton.style.left = (left + 12) + '%';
        dealerButton.style.top = (top + 8) + '%';
      }
    } else {
      dealerButton.style.display = 'none';
    }

    // Allowed actions
    updateActionsUI(state.allowedActions || [], state.isMyTurn, state.isConnected);

    // Action history
    if (state.actionHistory) {
      actionHistory.innerHTML = '';
      state.actionHistory.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'action-entry';
        div.innerHTML = `<span class="action-player">${escapeHtml(entry.player)}</span> ${escapeHtml(entry.action)}`;
        actionHistory.appendChild(div);
      });
      actionHistory.scrollTop = actionHistory.scrollHeight;
    }

    // Connection status
    if (state.isConnected === false) {
      // Show disconnected state visually
      document.querySelector('.action-bar').style.opacity = '0.4';
    } else {
      document.querySelector('.action-bar').style.opacity = '1';
    }

    // Timer: start if it's hero's turn
    if (state.isMyTurn && state.isHandActive) {
      startTimer();
    } else {
      stopTimer();
      actionTimer.textContent = '--';
    }
  }

  // ── Actions UI ──────────────────────────────────────────────────────
  function resetActionsUI() {
    foldBtn.disabled = true;
    checkBtn.disabled = true;
    callBtn.disabled = true;
    betBtn.disabled = true;
    raiseBtn.disabled = true;
    allInBtn.disabled = true;
    betAmountInput.forEach(inp => inp.disabled = true);
  }

  function updateActionsUI(allowedActions, isMyTurn, isConnected) {
    const enabled = isMyTurn && isConnected !== false;

    foldBtn.disabled = !enabled || !allowedActions.includes('fold');
    checkBtn.disabled = !enabled || !allowedActions.includes('check');
    callBtn.disabled = !enabled || !allowedActions.includes('call');
    betBtn.disabled = !enabled || !allowedActions.includes('bet');
    betAmountInput[0].disabled = !enabled || !allowedActions.includes('bet');
    raiseBtn.disabled = !enabled || !allowedActions.includes('raise');
    betAmountInput[1].disabled = !enabled || !allowedActions.includes('raise');
    allInBtn.disabled = !enabled || !allowedActions.includes('all-in');

    // Show action labels with amounts when available
    if (enabled) {
      if (allowedActions.includes('call') && allowedActions.includes('check')) {
        callBtn.textContent = 'Call';
      }
    }
  }

  // ── Action Execution ────────────────────────────────────────────────
  async function executeAction(action, amount) {
    if (!appState.currentTableId || !appState.sessionId) return;
    try {
      const body = { sessionId: appState.sessionId, action };
      if (amount !== undefined) body.amount = amount;
      const res = await fetch(`/api/table/${appState.currentTableId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        stopTimer();
        actionTimer.textContent = '--';
        await pollGameState();
      }
    } catch (err) {
      console.error('Action failed', err);
    }
  }

  foldBtn.addEventListener('click', () => executeAction('fold'));
  checkBtn.addEventListener('click', () => executeAction('check'));
  callBtn.addEventListener('click', () => executeAction('call'));
  betBtn.addEventListener('click', () => {
    const amt = betAmountInput[0].value;
    executeAction('bet', amt);
    betAmountInput[0].value = '';
  });
  raiseBtn.addEventListener('click', () => {
    const amt = betAmountInput[1].value;
    executeAction('raise', amt);
    betAmountInput[1].value = '';
  });
  allInBtn.addEventListener('click', () => executeAction('all-in'));

  // ── Timer ───────────────────────────────────────────────────────────
  function startTimer() {
    stopTimer();
    appState.timerSeconds = 0;
    actionTimer.textContent = '0s';
    appState.timerInterval = setInterval(() => {
      appState.timerSeconds++;
      actionTimer.textContent = appState.timerSeconds + 's';
    }, 1000);
  }

  function stopTimer() {
    if (appState.timerInterval) {
      clearInterval(appState.timerInterval);
      appState.timerInterval = null;
    }
  }

  // ── Disconnect Button ───────────────────────────────────────────────
  disconnectBtn.addEventListener('click', async () => {
    if (!appState.sessionId) return;
    try {
      await fetch(`/api/control/disconnect/${appState.sessionId}`, { method: 'POST' });
      await pollGameState();
    } catch (err) {
      console.error('Disconnect toggle failed', err);
    }
  });

  // ── Helpers ─────────────────────────────────────────────────────────
  function isRedSuit(suit) {
    return suit === '♥' || suit === '♦';
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
