import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface SyncTableData {
  externalTableId: string;
  name: string;
  gameType: string;
  limitType: string;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxPlayers: number;
  isAllowedForBots: boolean;
}

export interface DirectTableLinkParams {
  /** Player nickname on the Poker Mavens server */
  nickname: string;
  /** Session key for one-time auto-login */
  sessionKey: string;
  /** URL-encoded table name */
  encodedName: string;
  /** Table type: 'R' for ring game, 'T' for tournament */
  tableType: string;
}

@Injectable()
export class PokerMavensApiService {
  private readonly logger = new Logger(PokerMavensApiService.name);
  private readonly password: string;
  // PM API endpoint - e.g. http://12.34.56.789:8087/api
  private readonly apiUrl: string;
  // PM site base URL (e.g. https://iqpoker88.com)
  private readonly siteUrl: string;

  constructor(private configService: ConfigService) {
    this.password = this.configService.get<string>('pokerMavens.adminApiPassword') || '';
    // API URL is configured directly (e.g. https://iqpoker88.com/api)
    this.apiUrl = this.configService.get<string>('pokerMavens.adminApiUrl') || 'https://localhost:8087/api';
    this.siteUrl = this.configService.get<string>('pokerMavens.url') || 'https://localhost';
  }

  private async callApi(params: Record<string, string | number>): Promise<any> {
    try {
      // Build query parameters
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        queryParams.append(key, String(value));
      });

      this.logger.debug(`Calling PM API: ${this.apiUrl}`);

      const response = await axios.post(this.apiUrl, queryParams.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      });

      this.logger.debug(`PM API raw response (first 1000 chars): ${JSON.stringify(response.data).substring(0, 1000)}`);

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(`PM API call failed: ${error.message}`, error.response?.data);
      }
      throw error;
    }
  }

  async fetchTables(): Promise<SyncTableData[]> {
    try {
      const data = await this.callApi({
        Password: this.password,
        Command: 'RingGamesList',
        Fields: 'Name,Game,Limit,Status,SmallBlind,BigBlind,Ante,BuyInMin,BuyInMax,Seats',
        JSON: 'Yes',
      });

      return this.parseRingGamesListResponse(data);
    } catch (error) {
      this.logger.error('Failed to fetch tables from Poker Mavens API');
      return [];
    }
  }

  private parseRingGamesListResponse(data: any): SyncTableData[] {
    const tables: SyncTableData[] = [];

    // Expected JSON response:
    // {"Result":"Ok","RingGames":3,"Name":["Game1","Game2","Game3"],"Game":["No Limit Hold'em",...],...}
    // or {"Result":"Error","Error":"..."}

    if (data?.Result === 'Error') {
      this.logger.error(`PM API error: ${data.Error}`);
      return [];
    }

    if (data?.Result !== 'Ok') {
      this.logger.warn(`Unexpected PM API response: ${JSON.stringify(data)}`);
      return [];
    }

    const count = data?.RingGames;
    if (!count || count === 0) {
      this.logger.log('No ring games found on Poker Mavens');
      return [];
    }

    // Normalize array fields — PM returns arrays or single values
    const names = this.normalizeArray(data.Name);
    const games = this.normalizeArray(data.Game);
    const limits = this.normalizeArray(data.Limit);
    const statuses = this.normalizeArray(data.Status);
    const smallBlinds = this.normalizeArray(data.SmallBlind);
    const bigBlinds = this.normalizeArray(data.BigBlind);
    const antes = this.normalizeArray(data.Ante);
    const buyInMins = this.normalizeArray(data.BuyInMin);
    const buyInMaxs = this.normalizeArray(data.BuyInMax);
    const seatCounts = this.normalizeArray(data.Seats);

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      if (!name) continue;

      // Include all tables regardless of status for debugging
      const status = statuses[i] || '';
      this.logger.debug(`Table #${i}: name="${name}" status="${status}" game="${games[i]}" limit="${limits[i]}"`);

      const gameRaw = games[i] || 'No Limit Hold\'em';
      const limitRaw = limits[i] || 'NL';

      tables.push({
        externalTableId: name,
        name,
        gameType: this.parseGameType(gameRaw),
        limitType: this.parseLimitType(limitRaw),
        smallBlind: Number(smallBlinds[i]) || 1,
        bigBlind: Number(bigBlinds[i]) || 2,
        ante: Number(antes[i]) || 0,
        minBuyIn: Number(buyInMins[i]) || 200,
        maxBuyIn: Number(buyInMaxs[i]) || 5000,
        maxPlayers: Number(seatCounts[i]) || 9,
        isAllowedForBots: true,
      });
    }

    this.logger.log(`Parsed ${tables.length} online ring games from Poker Mavens`);
    return tables;
  }

  private normalizeArray(value: any): any[] {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return value;
    return [value];
  }

  private parseGameType(raw: string): string {
    const upper = raw.toUpperCase();
    if (upper.includes('OMAHA')) return 'PLO';
    if (upper.includes('HOLDEM') || upper.includes('TEXAS')) return 'NLH';
    if (upper.includes('STUD')) return 'STUD';
    if (upper.includes('DRAW')) return 'DRAW';
    if (upper.includes('RAZZ')) return 'RAZZ';
    return 'NLH';
  }

  private parseLimitType(raw: string): string {
    const upper = raw.toUpperCase();
    if (upper.includes('POT LIMIT') || upper.includes('PL')) return 'PL';
    if (upper.includes('NO LIMIT') || upper.includes('NL') || upper.includes('NO')) return 'NL';
    if (upper.includes('FIXED LIMIT') || upper.includes('LIMIT') || upper.includes('FL')) return 'FL';
    return 'NL';
  }

  /**
   * Generate a session key for a player (one-time autologin password).
   * POST AccountsSessionKey command to PM API.
   */
  async getSessionKey(playerName: string): Promise<string> {
    const data = await this.callApi({
      Password: this.password,
      Command: 'AccountsSessionKey',
      Player: playerName,
      JSON: 'Yes',
    });

    if (data?.Result === 'Error') {
      throw new Error(`PM AccountsSessionKey error: ${data.Error}`);
    }
    if (data?.Result !== 'Ok') {
      throw new Error(`PM AccountsSessionKey unexpected response: ${JSON.stringify(data)}`);
    }

    return data.SessionKey as string;
  }

  /**
   * Adds chips to a player's primary account balance via AccountsIncBalance.
   * Safe to call even while the player is logged in/seated (per API docs).
   * Returns the new balance as reported by the server.
   */
  async incrementBalance(player: string, amount: number): Promise<number> {
    const data = await this.callApi({
      Password: this.password,
      Command: 'AccountsIncBalance',
      Player: player,
      Amount: amount,
      JSON: 'Yes',
    });

    if (data?.Result === 'Error') {
      throw new Error(`PM AccountsIncBalance error: ${data.Error}`);
    }
    if (data?.Result !== 'Ok') {
      throw new Error(`PM AccountsIncBalance unexpected response: ${JSON.stringify(data)}`);
    }

    return Number(data.Balance);
  }

  /**
   * Determine the table type for direct link: 'R' for ring game, 'T' for tournament.
   * Fetches the game info via RingGamesGet to verify the table exists.
   */
  async getTableGameType(tableName: string): Promise<{ type: 'R'; status: string }> {
    const data = await this.callApi({
      Password: this.password,
      Command: 'RingGamesGet',
      Name: tableName,
      JSON: 'Yes',
    });

    if (data?.Result === 'Error') {
      throw new Error(`PM RingGamesGet error: ${data.Error}`);
    }
    if (data?.Result !== 'Ok') {
      throw new Error(`PM table "${tableName}" not found or unexpected response`);
    }

    return { type: 'R', status: data.Status as string };
  }

  /**
   * Creates the real player account on the Poker Mavens server via
   * AccountsAdd, so a bot created in our admin panel actually has somewhere
   * to log in - required parameters per the API docs are Player, Location,
   * Email, and PW. Balance is intentionally omitted so the server applies
   * its own configured "Starting balance" rather than us guessing one.
   * "Account already exists" is treated as a non-fatal, expected case (the
   * operator may have pre-registered the account manually before adding it
   * here) rather than blocking bot creation.
   */
  async createPlayerAccount(
    player: string,
    password: string,
    email: string,
  ): Promise<{ created: boolean; alreadyExisted: boolean }> {
    const data = await this.callApi({
      Password: this.password,
      Command: 'AccountsAdd',
      Player: player,
      PW: password,
      Email: email,
      Location: '',
      Creator: 'poker-bot-platform',
      JSON: 'Yes',
    });

    if (data?.Result === 'Ok') {
      this.logger.log(`Created Poker Mavens player account "${player}"`);
      return { created: true, alreadyExisted: false };
    }

    const errorText = String(data?.Error ?? '');
    if (/exist/i.test(errorText)) {
      this.logger.warn(`Poker Mavens account "${player}" already exists - continuing`);
      return { created: false, alreadyExisted: true };
    }

    throw new Error(`PM AccountsAdd error: ${errorText || JSON.stringify(data)}`);
  }

  /**
   * Generate a direct table link for auto-login.
   * https://site.com/?LoginName={nickname}&SessionKey={key}&TableName={name}&TableType={type}
   */
  async generateDirectTableLink(
    nickname: string,
    tableName: string,
  ): Promise<{ url: string; params: DirectTableLinkParams }> {
    // 1. Get one-time session key
    const sessionKey = await this.getSessionKey(nickname);

    // 2. Get table info and determine type
    const { type } = await this.getTableGameType(tableName);

    // 3. URL-encode the table name
    const encodedName = encodeURIComponent(tableName);

    const params: DirectTableLinkParams = {
      nickname,
      sessionKey,
      encodedName,
      tableType: type,
    };

    // Build the direct link URL
    const baseUrl = this.siteUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/?LoginName=${encodeURIComponent(nickname)}&SessionKey=${sessionKey}&TableName=${encodedName}&TableType=${type}`;

    this.logger.log(`Generated direct table link for "${nickname}" -> "${tableName}"`);

    return { url, params };
  }

  /**
   * Generate a login-only URL (no TableName/TableType) - the bot lands in
   * the lobby, auto-logged-in, and opens a specific table itself via the
   * lobby's own HTML instead of jumping straight there.
   * https://site.com/?LoginName={nickname}&SessionKey={key}
   */
  async generateLoginOnlyLink(nickname: string): Promise<{ url: string; sessionKey: string }> {
    const sessionKey = await this.getSessionKey(nickname);
    const baseUrl = this.siteUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/?LoginName=${encodeURIComponent(nickname)}&SessionKey=${sessionKey}`;

    this.logger.log(`Generated login-only link for "${nickname}"`);

    return { url, sessionKey };
  }
}
