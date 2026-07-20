export interface PokerMavensSelectors {
  login: {
    usernameInput: string;
    passwordInput: string;
    submitButton: string;
    loginError: string;
  };

  lobby: {
    tableRows: string;
    tableName: string;
    openTableButton: string;
  };

  table: {
    seats: string;
    emptySeat: string;
    heroSeat: string;
    pot: string;
    boardCards: string;
    heroCards: string;
    heroStack: string;
    dealerButton: string;
    activePlayer: string;
    playerNames: string;
    playerStacks: string;
    actionHistory: string;
  };

  actions: {
    foldButton: string;
    checkButton: string;
    callButton: string;
    betButton: string;
    raiseButton: string;
    allInButton: string;
    amountInput: string;
    actionTimer: string;
  };

  buyIn: {
    amountInput: string;
    confirmButton: string;
    cancelButton: string;
  };
}

export const defaultSelectors: PokerMavensSelectors = {
  login: {
    usernameInput: '#username',
    passwordInput: '#password',
    submitButton: 'button[type="submit"]',
    loginError: '.error-message',
  },
  lobby: {
    tableRows: '.lobby-table-row',
    tableName: '.table-name',
    openTableButton: '.open-table-btn',
  },
  table: {
    seats: '.seat-position',
    emptySeat: '.seat-position.empty',
    heroSeat: '.seat-position.hero',
    pot: '.pot-amount',
    boardCards: '.board-cards .card',
    heroCards: '.hero-cards .card',
    heroStack: '.hero-stack',
    dealerButton: '.dealer-button',
    activePlayer: '.player.active-turn',
    playerNames: '.player-name',
    playerStacks: '.player-stack',
    actionHistory: '.action-history .action-entry',
  },
  actions: {
    foldButton: '.action-btn.fold',
    checkButton: '.action-btn.check',
    callButton: '.action-btn.call',
    betButton: '.action-btn.bet',
    raiseButton: '.action-btn.raise',
    allInButton: '.action-btn.all-in',
    amountInput: '.bet-amount-input',
    actionTimer: '.action-timer',
  },
  buyIn: {
    amountInput: '.buy-in-amount',
    confirmButton: '.buy-in-confirm',
    cancelButton: '.buy-in-cancel',
  },
};
