import { GameState, BotCredentials, LobbyTable, AllowedAction } from '@poker-bot/shared-types';

export interface PokerClientAdapter {
  launch(): Promise<void>;
  login(credentials: BotCredentials): Promise<void>;
  logout(): Promise<void>;

  getLobbyTables(): Promise<LobbyTable[]>;
  openTable(tableExternalId: string): Promise<void>;
  closeTable(tableExternalId: string): Promise<void>;

  getAvailableSeats(): Promise<number[]>;
  takeSeat(seatNumber: number): Promise<void>;
  buyIn(amount: number): Promise<void>;
  leaveSeat(): Promise<void>;

  sitOut(): Promise<void>;
  sitIn(): Promise<void>;

  readGameState(): Promise<GameState>;
  isHeroTurn(): Promise<boolean>;
  getAllowedActions(): Promise<AllowedAction[]>;

  fold(): Promise<void>;
  check(): Promise<void>;
  call(): Promise<void>;
  bet(amount: number): Promise<void>;
  raise(amount: number): Promise<void>;
  allIn(): Promise<void>;

  close(): Promise<void>;
}
