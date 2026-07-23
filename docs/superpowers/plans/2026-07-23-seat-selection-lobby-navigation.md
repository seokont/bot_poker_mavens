# Seat Selection + Lobby Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin operator pick a specific seat number for a bot to sit in, and switch the bot's table-open step from a direct `TableName`/`TableType` auto-jump link to opening the table from the lobby's own HTML table list — while keeping session-key auto-login.

**Architecture:** Backend gains a login-only link generator (session key, no table params) alongside the existing direct-table-link generator, which stays in place unused by the new flow. The Redis-list job relay (`QueueService.addJob`) gets `preferredSeat`/`waitForBigBlind` added to the fields it forwards to bot-worker — they already flow correctly through the BullMQ/controller/service layer, this is the one missing hop. Bot-worker's `joinTable()` swaps its navigation step (login-only URL → new `openTableFromLobby()` DOM interaction) and threads an optional `preferredSeat` into `clickEmptySeat()`, which resolves a seat number to a `.sp_seat` DOM index via each seat's `.tooltip` text, falling back to today's "first empty seat" behavior when no seat is requested or the requested one can't be resolved/is taken. Admin-web adds a seat-number field to both the per-bot join dialog and the existing bulk "Join Table (Random Order)" dialog, and passes it through the `botsApi` wrappers.

**Tech Stack:** NestJS (backend), Playwright + ioredis (bot-worker), Vue 3 + Vuetify (admin-web). No unit test framework exists in this repo (`backend`/`bot-worker` `package.json` `test` scripts are stub echoes) — verification is `tsc --noEmit` / `vue-tsc --noEmit` per task plus, for the two DOM interactions marked below as empirically unverified, a live deploy + debug-snapshot check (`apps/bot-worker/storage/debug/<botId>/*.png` + `.html`).

## Global Constraints

- Keep `generateDirectTableLink` and the internal `bots/direct-link` endpoint unchanged and in place — only `WorkerService.joinTable()` stops calling it. (spec: "Out of scope")
- `preferredSeat` is 1-indexed, matching the number the site displays. (spec: "Seat selection end-to-end")
- If the requested seat can't be resolved or is taken, fall back to "first empty seat" rather than aborting the join. (spec: "Seat selection end-to-end")
- The lobby-row-open interaction (double-click, first guess) and the tooltip-based seat-number mapping are unverified against the live site — ship the best-guess implementation, then confirm/correct via a live debug snapshot after deploy. (spec: "Risk / rollout")
- Do not touch buy-in, ready-button, or ground-truth-check logic in `joinTable()` — only the navigation step and the `clickEmptySeat` call change.

---

### Task 1: Backend — login-only link generation in `PokerMavensApiService`

**Files:**
- Modify: `apps/backend/src/modules/tables/poker-mavens-api.service.ts:316` (insert new method right before the closing class brace, after `generateDirectTableLink`)

**Interfaces:**
- Consumes: existing private `getSessionKey(playerName: string): Promise<string>` (poker-mavens-api.service.ts:181), existing `this.siteUrl` field (poker-mavens-api.service.ts:37)
- Produces: `generateLoginOnlyLink(nickname: string): Promise<{ url: string; sessionKey: string }>` — used by Task 2's `InternalService.generateLoginOnlyLink`

- [ ] **Step 1: Add the method**

Insert immediately after the closing `}` of `generateDirectTableLink` (currently ending at line 316), still inside the class (before the final `}` that closes the class at line 317):

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `cd apps/backend && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/tables/poker-mavens-api.service.ts
git commit -m "feat: add login-only Poker Mavens link generator"
```

---

### Task 2: Backend — `InternalService`/`InternalController` login-link endpoint

**Files:**
- Modify: `apps/backend/src/modules/internal/internal.service.ts:315` (add sibling method after `generateDirectLink`, which ends at line 334)
- Modify: `apps/backend/src/modules/internal/internal.controller.ts:222` (add sibling endpoint after `bots/direct-link`, which ends at line 231)

**Interfaces:**
- Consumes: `PokerMavensApiService.generateLoginOnlyLink(nickname)` from Task 1; existing `this.prisma.bot` lookup pattern already used by `generateDirectLink`
- Produces: `InternalService.generateLoginOnlyLink(botIdOrLogin: string): Promise<{ url: string; sessionKey: string }>`; `POST /api/v1/internal/bots/login-link` taking `{ botId: string }` — consumed by Task 5's bot-worker fetch call

- [ ] **Step 1: Add `InternalService.generateLoginOnlyLink`**

Insert right after `generateDirectLink` (ends at line 334, before `getPmTableNames` at line 336) in `internal.service.ts`:

```ts
  async generateLoginOnlyLink(botIdOrLogin: string) {
    let bot = await this.prisma.bot.findUnique({
      where: { id: botIdOrLogin },
      select: { login: true },
    });

    if (!bot) {
      bot = await this.prisma.bot.findUnique({
        where: { login: botIdOrLogin },
        select: { login: true },
      });
    }

    if (!bot) {
      throw new NotFoundException(`Bot with ID or login "${botIdOrLogin}" not found`);
    }

    return this.pokerMavensApi.generateLoginOnlyLink(bot.login);
  }
```

- [ ] **Step 2: Add the controller endpoint**

Insert right after the `generateDirectLink` endpoint (ends at line 231, before `pm-table-names` at line 233) in `internal.controller.ts`:

```ts
  @Post('bots/login-link')
  async generateLoginLink(
    @Body()
    body: {
      botId: string;
    },
  ) {
    return this.internalService.generateLoginOnlyLink(body.botId);
  }
```

- [ ] **Step 3: Type-check**

Run: `cd apps/backend && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/internal/internal.service.ts apps/backend/src/modules/internal/internal.controller.ts
git commit -m "feat: add internal login-link endpoint for lobby-based table navigation"
```

---

### Task 3: Backend — relay `preferredSeat`/`waitForBigBlind` through `QueueService.addJob`

**Files:**
- Modify: `apps/backend/src/modules/queue/queue.service.ts:101-112`

**Interfaces:**
- Consumes: `data.preferredSeat`, `data.waitForBigBlind` — already present in the `data` object passed by `BotCommandsService.joinTable()`/`bulkJoinTable()` (bot-commands.service.ts:139-147), just not read here yet
- Produces: `workerMsg` JSON now includes `preferredSeat` and `waitForBigBlind` — consumed by Task 4's bot-worker `JobData`

- [ ] **Step 1: Add the two fields to `workerMsg`**

Change:

```ts
    const workerMsg = JSON.stringify({
      type: jobType,
      botId: data.botId || null,
      login: data.login || null,
      password: data.password || null,
      tableId: data.tableId || null,
      buyIn: data.buyIn || null,
      amount: data.amount || null,
      handId: data.handId || null,
      turnId: data.turnId || null,
      action: data.action || null,
    });
```

to:

```ts
    const workerMsg = JSON.stringify({
      type: jobType,
      botId: data.botId || null,
      login: data.login || null,
      password: data.password || null,
      tableId: data.tableId || null,
      buyIn: data.buyIn || null,
      amount: data.amount || null,
      handId: data.handId || null,
      turnId: data.turnId || null,
      action: data.action || null,
      preferredSeat: data.preferredSeat ?? null,
      waitForBigBlind: data.waitForBigBlind ?? null,
    });
```

- [ ] **Step 2: Type-check**

Run: `cd apps/backend && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/queue/queue.service.ts
git commit -m "fix: relay preferredSeat/waitForBigBlind to bot-worker via Redis list"
```

---

### Task 4: Bot-worker — `JobData` interface + `handleJob()` pass-through

**Files:**
- Modify: `apps/bot-worker/src/worker/worker.service.ts:25-36` (`JobData` interface)
- Modify: `apps/bot-worker/src/worker/worker.service.ts:1339-1341` (`handleJob()` `'joinTable'` case)

**Interfaces:**
- Consumes: `workerMsg` JSON produced by Task 3, parsed via `JSON.parse(rawData)` at worker.service.ts:1295
- Produces: `job.preferredSeat: number | null` available inside `handleJob()`, threaded into `this.joinTable(...)` — consumed by Task 5's new `joinTable()` signature

- [ ] **Step 1: Add `preferredSeat` to `JobData`**

Change:

```ts
interface JobData {
  type: string;
  botId: string | null;
  login?: string;
  password?: string;
  tableId?: string;
  buyIn?: number;
  amount?: number;
  handId?: string;
  turnId?: string;
  action?: string;
}
```

to:

```ts
interface JobData {
  type: string;
  botId: string | null;
  login?: string;
  password?: string;
  tableId?: string;
  buyIn?: number;
  amount?: number;
  handId?: string;
  turnId?: string;
  action?: string;
  preferredSeat?: number | null;
}
```

- [ ] **Step 2: Pass `job.preferredSeat` into the `joinTable` call**

Change (worker.service.ts:1339-1341):

```ts
        case 'joinTable':
          await this.joinTable(botId!, job.tableId!, job.buyIn, job.login, job.password);
          break;
```

to:

```ts
        case 'joinTable':
          await this.joinTable(botId!, job.tableId!, job.buyIn, job.login, job.password, job.preferredSeat);
          break;
```

(This depends on Task 5 adding `preferredSeat` as `joinTable`'s 6th parameter — do Task 5 in the same session before type-checking, or expect a transient arg-count error until then.)

- [ ] **Step 3: Type-check** (after Task 5 is also done)

Run: `cd apps/bot-worker && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/bot-worker/src/worker/worker.service.ts
git commit -m "feat: thread preferredSeat from job payload into joinTable"
```

(Commit together with Task 5's changes to the same file if working file-by-file rather than task-by-task — both touch `worker.service.ts` and are easiest reviewed as one diff. If using subagent-driven execution, still land Task 5 first or in the same commit so the file compiles at each commit boundary.)

---

### Task 5: Bot-worker — switch `joinTable()` navigation to lobby-based table open

**Files:**
- Modify: `apps/bot-worker/src/worker/worker.service.ts:192-198` (signature)
- Modify: `apps/bot-worker/src/worker/worker.service.ts:251-273` (navigation step)
- Modify: `apps/bot-worker/src/worker/worker.service.ts:304` (`clickEmptySeat` call)
- Add: new private method `openTableFromLobby` (insert after `joinTable`, i.e. after the current line 440, before `leaveTable` at line 442)

**Interfaces:**
- Consumes: `POST ${this.backendUrl}/api/v1/internal/bots/login-link` from Task 2, `X-Internal-Api-Key` header pattern already used at worker.service.ts:252-259; `job.preferredSeat` from Task 4
- Produces: `joinTable(botId, tableId, buyIn?, login?, password?, preferredSeat?)`; `openTableFromLobby(page: Page, tableId: string): Promise<boolean>` — used only internally by `joinTable`; `clickEmptySeat(page, preferredSeat?)` call site — signature itself is defined in Task 6

- [ ] **Step 1: Add `preferredSeat` to the signature**

Change (worker.service.ts:192-198):

```ts
  async joinTable(
    botId: string,
    tableId: string,
    buyIn?: number,
    login?: string,
    password?: string,
  ): Promise<boolean> {
```

to:

```ts
  async joinTable(
    botId: string,
    tableId: string,
    buyIn?: number,
    login?: string,
    password?: string,
    preferredSeat?: number | null,
  ): Promise<boolean> {
```

- [ ] **Step 2: Replace the direct-link navigation with login-only + lobby-open**

Change (worker.service.ts:251-275):

```ts
      // 1. Get direct table link from backend (internal API)
      const response = await fetch(`${this.backendUrl}/api/v1/internal/bots/direct-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': this.internalApiKey,
        },
        body: JSON.stringify({ botId, tableName: tableId }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to get direct link: ${response.status} ${errText}`);
      }

      const linkData = await response.json() as { url: string; params: Record<string, string> };
      const directUrl: string = linkData.url;

      console.log(`[Worker] joinTable: direct link obtained, navigating to: ${directUrl}`);

      // 2. Navigate directly to the table via the link (auto-login with SessionKey)
      await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      console.log(`[Worker] joinTable: navigated to table "${tableId}"`);
```

to:

```ts
      // 1. Get login-only link from backend (internal API) - auto-login via
      // SessionKey, but no TableName/TableType so the bot lands in the
      // lobby and opens the table itself via the lobby's HTML.
      const response = await fetch(`${this.backendUrl}/api/v1/internal/bots/login-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': this.internalApiKey,
        },
        body: JSON.stringify({ botId }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to get login-only link: ${response.status} ${errText}`);
      }

      const linkData = await response.json() as { url: string; sessionKey: string };
      const loginUrl: string = linkData.url;

      console.log(`[Worker] joinTable: login-only link obtained, navigating to lobby: ${loginUrl}`);

      // 2. Navigate to the lobby via the link (auto-login with SessionKey)
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      console.log(`[Worker] joinTable: navigated to lobby, opening table "${tableId}"`);

      // 3. Open the target table from the lobby's own HTML table list
      const tableOpened = await this.openTableFromLobby(page, tableId);
      if (!tableOpened) {
        throw new Error(`Could not find/open table "${tableId}" from the lobby`);
      }
      await page.waitForTimeout(3000);
```

- [ ] **Step 3: Update the `clickEmptySeat` call to pass `preferredSeat`**

Change (worker.service.ts:304):

```ts
      const emptySeatClicked = await this.clickEmptySeat(page);
```

to:

```ts
      const emptySeatClicked = await this.clickEmptySeat(page, preferredSeat);
```

- [ ] **Step 4: Add `openTableFromLobby`**

Insert this new private method right after `joinTable`'s closing `}` (currently at line 440), before `leaveTable` (currently at line 442):

```ts
  // Finds the target table's row in the lobby's Ring Games grid (#RingGrid)
  // by matching the name column against `tableId` (same string used
  // previously as the direct-link TableName), then opens it.
  //
  // UNVERIFIED against the live site: double-click is a best-guess first
  // implementation (typical grid-open convention). If this doesn't open the
  // table, capture a debug snapshot at the lobby stage and inspect
  // #RingGrid's real interaction (separate button, single click, etc.) -
  // per this codebase's established live-iterate pattern, do not guess
  // further blind.
  private async openTableFromLobby(page: Page, tableId: string): Promise<boolean> {
    try {
      await page.waitForSelector('#RingGrid .grid_data', { timeout: 15000 }).catch(() => null);

      const rowIndex: number = await page.evaluate((wantedName: string) => {
        const doc = (globalThis as any).document;
        const grid = doc.querySelector('#RingGrid .grid_data');
        if (!grid) return -1;
        // First column div holds the table-name cells, one per row, stacked
        // as children - not one div per row.
        const nameColumn = grid.children[0];
        if (!nameColumn) return -1;
        const cells = Array.from(nameColumn.children) as any[];
        for (let i = 0; i < cells.length; i++) {
          const text = (cells[i].textContent || '').trim();
          if (text === wantedName) return i;
        }
        return -1;
      }, tableId).catch(() => -1);

      if (rowIndex < 0) {
        console.warn(`[Worker] openTableFromLobby: table "${tableId}" not found in #RingGrid`);
        return false;
      }

      const nameColumn = page.locator('#RingGrid .grid_data > div').first();
      const cellLocator = nameColumn.locator('> *').nth(rowIndex);
      await cellLocator.dblclick({ force: true, timeout: 5000 }).catch(async () => {
        await page.evaluate((idx: number) => {
          const doc = (globalThis as any).document;
          const grid = doc.querySelector('#RingGrid .grid_data');
          const nameCol = grid ? grid.children[0] : null;
          const cell: any = nameCol ? nameCol.children[idx] : null;
          if (cell) {
            cell.dispatchEvent(new Event('dblclick', { bubbles: true }));
          }
        }, rowIndex);
      });

      console.log(`[Worker] openTableFromLobby: opened table "${tableId}" (row ${rowIndex})`);
      return true;
    } catch (err) {
      console.warn(`[Worker] openTableFromLobby error:`, err);
      return false;
    }
  }
```

- [ ] **Step 5: Type-check** (with Task 4's and Task 6's changes also applied)

Run: `cd apps/bot-worker && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/bot-worker/src/worker/worker.service.ts
git commit -m "feat: navigate to table via lobby HTML instead of direct table-jump link"
```

---

### Task 6: Bot-worker — seat-number-aware `clickEmptySeat()`

**Files:**
- Modify: `apps/bot-worker/src/worker/worker.service.ts:705-742` (signature + targetIndex resolution)

**Interfaces:**
- Consumes: `preferredSeat?: number | null` from Task 5's call site
- Produces: `clickEmptySeat(page: Page, preferredSeat?: number | null): Promise<boolean>` — same return contract as before, callers elsewhere in the file (if any) that call it with zero args still compile since the new param is optional

- [ ] **Step 1: Add the parameter and seat-number resolution**

Change (worker.service.ts:705-742):

```ts
  private async clickEmptySeat(page: Page): Promise<boolean> {
    try {
      // `.sp_seat` (the clickable seat area) exists for EVERY seat position,
      // occupied or not - Poker Mavens uses it both to open the buy-in
      // dialog on an empty seat and to open a player-profile popup on an
      // occupied one. Blindly clicking `.first()` eventually hits an
      // occupied seat as more real players join the table, which was
      // confirmed live (it opened a player's info dialog instead of
      // seating the bot). Each seat position wraps `.sp_seat` plus, when
      // occupied (including just "sitting out" - confirmed live with a
      // real player, name shown, seat still held), a `.sp_name` sibling
      // with the player's name - skip any seat whose `.sp_name` has real
      // text. The outer wrapper's own class is NOT reliably ".seatplate" -
      // confirmed live it's sometimes bare ".hide" instead - so query
      // `.sp_seat` directly (a stable 1-per-seat-position element) and look
      // at its own parent for the name, rather than starting from
      // ".seatplate" and missing seats whose wrapper lacks that class.
      // Find which `.sp_seat` (by index) is the right one to click via JS,
      // but perform the actual click through Playwright's real mouse-event
      // API rather than the element's own `.click()` method. A JS-level
      // `.click()` dispatches an untrusted synthetic event (isTrusted:
      // false); a real seat-reservation flow is exactly the kind of
      // sensitive action a site might gate on genuine user input, so
      // clicking through Playwright (which drives real OS/CDP mouse events)
      // is the more robust choice here.
      const targetIndex: number = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const seatEls = Array.from(doc.querySelectorAll('.sp_seat'));
        for (let i = 0; i < seatEls.length; i++) {
          const seatEl: any = seatEls[i];
          const parent = seatEl.parentElement;
          const nameEl = parent ? parent.querySelector('.sp_name') : null;
          const occupied = nameEl && nameEl.textContent && nameEl.textContent.trim().length > 0;
          if (occupied) continue;
          if (seatEl.offsetParent !== null) return i;
        }
        return -1;
      }).catch(() => -1);
```

to:

```ts
  private async clickEmptySeat(page: Page, preferredSeat?: number | null): Promise<boolean> {
    try {
      // `.sp_seat` (the clickable seat area) exists for EVERY seat position,
      // occupied or not - Poker Mavens uses it both to open the buy-in
      // dialog on an empty seat and to open a player-profile popup on an
      // occupied one. Blindly clicking `.first()` eventually hits an
      // occupied seat as more real players join the table, which was
      // confirmed live (it opened a player's info dialog instead of
      // seating the bot). Each seat position wraps `.sp_seat` plus, when
      // occupied (including just "sitting out" - confirmed live with a
      // real player, name shown, seat still held), a `.sp_name` sibling
      // with the player's name - skip any seat whose `.sp_name` has real
      // text. The outer wrapper's own class is NOT reliably ".seatplate" -
      // confirmed live it's sometimes bare ".hide" instead - so query
      // `.sp_seat` directly (a stable 1-per-seat-position element) and look
      // at its own parent for the name, rather than starting from
      // ".seatplate" and missing seats whose wrapper lacks that class.
      // Find which `.sp_seat` (by index) is the right one to click via JS,
      // but perform the actual click through Playwright's real mouse-event
      // API rather than the element's own `.click()` method. A JS-level
      // `.click()` dispatches an untrusted synthetic event (isTrusted:
      // false); a real seat-reservation flow is exactly the kind of
      // sensitive action a site might gate on genuine user input, so
      // clicking through Playwright (which drives real OS/CDP mouse events)
      // is the more robust choice here.
      //
      // When a specific seat number is requested, resolve it via each
      // seat's `.tooltip` sibling text (e.g. "מושב #3" / "Seat #3" -
      // confirmed live in an earlier debug capture) instead of DOM order.
      // UNVERIFIED for every seat position - if a requested seat is never
      // matched despite being visibly empty, capture a debug snapshot and
      // inspect the real `.tooltip` text for that position.
      let targetIndex = -1;
      if (preferredSeat != null) {
        targetIndex = await page.evaluate((wantedSeat: number) => {
          const doc = (globalThis as any).document;
          const seatEls = Array.from(doc.querySelectorAll('.sp_seat'));
          const tooltipEls = Array.from(doc.querySelectorAll('.tooltip'));
          for (let i = 0; i < seatEls.length; i++) {
            const seatEl: any = seatEls[i];
            const parent = seatEl.parentElement;
            const nameEl = parent ? parent.querySelector('.sp_name') : null;
            const occupied = nameEl && nameEl.textContent && nameEl.textContent.trim().length > 0;
            if (occupied) continue;
            if (seatEl.offsetParent === null) continue;
            const tooltipEl: any = tooltipEls[i];
            const tooltipText = tooltipEl ? (tooltipEl.textContent || '') : '';
            const match = tooltipText.match(/(\d+)/);
            if (match && parseInt(match[1], 10) === wantedSeat) return i;
          }
          return -1;
        }, preferredSeat).catch(() => -1);

        if (targetIndex < 0) {
          console.log(`[Worker] clickEmptySeat: preferred seat ${preferredSeat} not resolvable/unoccupied, falling back to first empty seat`);
        }
      }

      if (targetIndex < 0) {
        targetIndex = await page.evaluate(() => {
          const doc = (globalThis as any).document;
          const seatEls = Array.from(doc.querySelectorAll('.sp_seat'));
          for (let i = 0; i < seatEls.length; i++) {
            const seatEl: any = seatEls[i];
            const parent = seatEl.parentElement;
            const nameEl = parent ? parent.querySelector('.sp_name') : null;
            const occupied = nameEl && nameEl.textContent && nameEl.textContent.trim().length > 0;
            if (occupied) continue;
            if (seatEl.offsetParent !== null) return i;
          }
          return -1;
        }).catch(() => -1);
      }
```

Everything below this block (the `if (targetIndex >= 0) { ... }` click logic and the generic-selector fallback chain) stays exactly as-is — it already operates on whatever `targetIndex` was resolved.

- [ ] **Step 2: Type-check**

Run: `cd apps/bot-worker && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/bot-worker/src/worker/worker.service.ts
git commit -m "feat: resolve preferred seat number via tooltip text in clickEmptySeat"
```

---

### Task 7: Admin-web — `botsApi.joinTable`/`bulkJoinTable` wrappers

**Files:**
- Modify: `apps/admin-web/src/api/bots.ts:31-33` (`joinTable`)
- Modify: `apps/admin-web/src/api/bots.ts:55-57` (`bulkJoinTable`)

**Interfaces:**
- Consumes: nothing new
- Produces: `botsApi.joinTable(id, { tableId, buyIn, preferredSeat? })`; `botsApi.bulkJoinTable(botIds, tableId, buyIn, preferredSeat?)` — consumed by Tasks 8 and 9

- [ ] **Step 1: Update `joinTable`**

Change:

```ts
  joinTable(id: string, data: { tableId: string; buyIn: number }) {
    return apiClient.post(`/bots/${id}/join-table`, data);
  },
```

to:

```ts
  joinTable(id: string, data: { tableId: string; buyIn: number; preferredSeat?: number | null }) {
    return apiClient.post(`/bots/${id}/join-table`, data);
  },
```

- [ ] **Step 2: Update `bulkJoinTable`**

Change:

```ts
  bulkJoinTable(botIds: string[], tableId: string, buyIn: number) {
    return apiClient.post('/bots/bulk/join-table', { botIds, tableId, buyIn });
  },
```

to:

```ts
  bulkJoinTable(botIds: string[], tableId: string, buyIn: number, preferredSeat?: number | null) {
    return apiClient.post('/bots/bulk/join-table', { botIds, tableId, buyIn, preferredSeat });
  },
```

- [ ] **Step 3: Type-check**

Run: `cd apps/admin-web && npx vue-tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/admin-web/src/api/bots.ts
git commit -m "feat: pass preferredSeat through botsApi join-table wrappers"
```

---

### Task 8: Admin-web — seat picker in `BotDetailPage.vue`'s join dialog

**Files:**
- Modify: `apps/admin-web/src/pages/bot-detail/BotDetailPage.vue:262-281` (dialog template)
- Modify: `apps/admin-web/src/pages/bot-detail/BotDetailPage.vue:330-333` (refs)
- Modify: `apps/admin-web/src/pages/bot-detail/BotDetailPage.vue:531-543` (`joinTable()` function)

**Interfaces:**
- Consumes: `botsApi.joinTable(id, data)` from Task 7; `tables.value` items (each a DB `Table` record including `maxPlayers: number`, confirmed at `apps/backend/prisma/schema.prisma:86`) already loaded by `loadTables()`
- Produces: nothing consumed elsewhere

- [ ] **Step 1: Add a `preferredSeat` ref and a computed seat-count next to the existing refs**

Change (BotDetailPage.vue:330-333):

```ts
const showJoinTableDialog = ref(false);
const selectedTableName = ref<string | null>(null);

const tables = ref<any[]>([]);
```

to:

```ts
const showJoinTableDialog = ref(false);
const selectedTableName = ref<string | null>(null);
const preferredSeat = ref<number | null>(null);

const tables = ref<any[]>([]);

const selectedTableMaxPlayers = computed(() => {
  const table = tables.value.find((t) => t.name === selectedTableName.value);
  return table?.maxPlayers || 9;
});
```

`computed` must be added to the Vue import (BotDetailPage.vue:287):

```ts
import { ref, onMounted, onUnmounted } from 'vue';
```

becomes:

```ts
import { ref, computed, onMounted, onUnmounted } from 'vue';
```

- [ ] **Step 2: Add the seat-number field to the dialog template**

Change (BotDetailPage.vue:262-281):

```html
    <!-- Join Table Dialog -->
    <v-dialog v-model="showJoinTableDialog" max-width="500">
      <v-card>
        <v-card-title>Select Table</v-card-title>
        <v-card-text>
          <v-select
            v-model="selectedTableName"
            :items="tables"
            item-title="name"
            item-value="name"
            label="Table"
            density="compact"
          ></v-select>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="showJoinTableDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="joinTable" :disabled="!selectedTableName">Join</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
```

to:

```html
    <!-- Join Table Dialog -->
    <v-dialog v-model="showJoinTableDialog" max-width="500">
      <v-card>
        <v-card-title>Select Table</v-card-title>
        <v-card-text>
          <v-select
            v-model="selectedTableName"
            :items="tables"
            item-title="name"
            item-value="name"
            label="Table"
            density="compact"
          ></v-select>
          <v-select
            v-model="preferredSeat"
            :items="[{ label: 'Any empty seat', value: null }, ...Array.from({ length: selectedTableMaxPlayers }, (_, i) => ({ label: `Seat ${i + 1}`, value: i + 1 }))]"
            item-title="label"
            item-value="value"
            label="Seat"
            density="compact"
          ></v-select>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="showJoinTableDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="joinTable" :disabled="!selectedTableName">Join</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
```

- [ ] **Step 3: Pass `preferredSeat` through in `joinTable()`**

Change (BotDetailPage.vue:531-543):

```ts
async function joinTable() {
  if (!selectedTableName.value) return;
  actionLoading.value = true;
  try {
    await botsApi.joinTable(bot.value.id, { tableId: selectedTableName.value, buyIn: bot.value.defaultBuyIn || 1000 });
    showJoinTableDialog.value = false;
    await loadBot();
  } catch (err: any) {
    console.error('Join table failed:', err);
  } finally {
    actionLoading.value = false;
  }
}
```

to:

```ts
async function joinTable() {
  if (!selectedTableName.value) return;
  actionLoading.value = true;
  try {
    await botsApi.joinTable(bot.value.id, {
      tableId: selectedTableName.value,
      buyIn: bot.value.defaultBuyIn || 1000,
      preferredSeat: preferredSeat.value,
    });
    showJoinTableDialog.value = false;
    await loadBot();
  } catch (err: any) {
    console.error('Join table failed:', err);
  } finally {
    actionLoading.value = false;
  }
}
```

- [ ] **Step 4: Type-check**

Run: `cd apps/admin-web && npx vue-tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/pages/bot-detail/BotDetailPage.vue
git commit -m "feat: add seat-number picker to the per-bot join-table dialog"
```

---

### Task 9: Admin-web — seat-number field in `BotsListPage.vue`'s bulk join dialog

**Files:**
- Modify: `apps/admin-web/src/pages/bots/BotsListPage.vue:127-150` (dialog template)
- Modify: `apps/admin-web/src/pages/bots/BotsListPage.vue:211-214` (refs)
- Modify: `apps/admin-web/src/pages/bots/BotsListPage.vue:393-409` (`bulkJoinTable()` function)

**Interfaces:**
- Consumes: `botsApi.bulkJoinTable(botIds, tableId, buyIn, preferredSeat?)` from Task 7
- Produces: nothing consumed elsewhere. Per spec "Out of scope"/YAGNI, this is a single seat number applied per-bot (each bot in the batch independently attempts that seat with the existing per-bot fallback) - no per-bot seat assignment UI.

- [ ] **Step 1: Add a `bulkJoinPreferredSeat` ref**

Change (BotsListPage.vue:211-214):

```ts
const showBulkJoinDialog = ref(false);
const bulkJoinTableId = ref('');
const bulkJoinBuyIn = ref(1000);
const bulkJoining = ref(false);
```

to:

```ts
const showBulkJoinDialog = ref(false);
const bulkJoinTableId = ref('');
const bulkJoinBuyIn = ref(1000);
const bulkJoinPreferredSeat = ref<number | null>(null);
const bulkJoining = ref(false);
```

- [ ] **Step 2: Add the seat-number field to the dialog template**

Change (BotsListPage.vue:127-150):

```html
    <v-dialog v-model="showBulkJoinDialog" max-width="480">
      <v-card>
        <v-card-title>Join Table (Random Order)</v-card-title>
        <v-card-text>
          Seats the {{ selected.length }} selected bot(s) at the given table in a shuffled order, with a random
          4-25s pause between each one - looks like separate players sitting down over time instead of a bot
          script joining them all in a row.
          <v-text-field v-model="bulkJoinTableId" label="Table ID (external table name)" class="mt-4"></v-text-field>
          <v-text-field v-model.number="bulkJoinBuyIn" label="Buy In" type="number" min="1"></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="showBulkJoinDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :disabled="!selected.length || !bulkJoinTableId || !bulkJoinBuyIn"
            :loading="bulkJoining"
            @click="bulkJoinTable"
          >
            Seat Them Randomly
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
```

to:

```html
    <v-dialog v-model="showBulkJoinDialog" max-width="480">
      <v-card>
        <v-card-title>Join Table (Random Order)</v-card-title>
        <v-card-text>
          Seats the {{ selected.length }} selected bot(s) at the given table in a shuffled order, with a random
          4-25s pause between each one - looks like separate players sitting down over time instead of a bot
          script joining them all in a row.
          <v-text-field v-model="bulkJoinTableId" label="Table ID (external table name)" class="mt-4"></v-text-field>
          <v-text-field v-model.number="bulkJoinBuyIn" label="Buy In" type="number" min="1"></v-text-field>
          <v-text-field
            v-model.number="bulkJoinPreferredSeat"
            label="Preferred seat number (optional - each bot falls back to any empty seat)"
            type="number"
            min="1"
            clearable
          ></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="showBulkJoinDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :disabled="!selected.length || !bulkJoinTableId || !bulkJoinBuyIn"
            :loading="bulkJoining"
            @click="bulkJoinTable"
          >
            Seat Them Randomly
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
```

- [ ] **Step 3: Pass `bulkJoinPreferredSeat` through in `bulkJoinTable()`**

Change (BotsListPage.vue:393-409):

```ts
async function bulkJoinTable() {
  if (!selected.value.length || !bulkJoinTableId.value || !bulkJoinBuyIn.value) return;
  bulkJoining.value = true;
  try {
    const response = await botsApi.bulkJoinTable(selected.value, bulkJoinTableId.value, bulkJoinBuyIn.value);
    snackbar.show = true;
    snackbar.message = response.data?.message || 'Randomized join sequence started';
    snackbar.color = 'success';
    showBulkJoinDialog.value = false;
  } catch (err: any) {
    snackbar.show = true;
    snackbar.message = err.response?.data?.message || 'Failed to start bulk join';
    snackbar.color = 'error';
  } finally {
    bulkJoining.value = false;
  }
}
```

to:

```ts
async function bulkJoinTable() {
  if (!selected.value.length || !bulkJoinTableId.value || !bulkJoinBuyIn.value) return;
  bulkJoining.value = true;
  try {
    const response = await botsApi.bulkJoinTable(
      selected.value,
      bulkJoinTableId.value,
      bulkJoinBuyIn.value,
      bulkJoinPreferredSeat.value,
    );
    snackbar.show = true;
    snackbar.message = response.data?.message || 'Randomized join sequence started';
    snackbar.color = 'success';
    showBulkJoinDialog.value = false;
  } catch (err: any) {
    snackbar.show = true;
    snackbar.message = err.response?.data?.message || 'Failed to start bulk join';
    snackbar.color = 'error';
  } finally {
    bulkJoining.value = false;
  }
}
```

- [ ] **Step 4: Type-check**

Run: `cd apps/admin-web && npx vue-tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/pages/bots/BotsListPage.vue
git commit -m "feat: add optional preferred-seat field to bulk join-table dialog"
```

---

### Task 10: Deploy and live-verify the two unverified DOM interactions

**Files:** none (operational task)

**Interfaces:**
- Consumes: all prior tasks deployed together (backend, bot-worker, admin-web)
- Produces: confirmation (or a follow-up fix) for `openTableFromLobby`'s double-click guess and `clickEmptySeat`'s tooltip-based seat mapping

- [ ] **Step 1: Build and deploy all three apps**

```bash
git pull
pnpm --filter @poker-bot/backend build
pnpm --filter @poker-bot/bot-worker build
pnpm --filter @poker-bot/admin-web build
```

Copy `apps/admin-web/dist/*` to the nginx web root, then:

```bash
pm2 restart poker-backend poker-worker
```

- [ ] **Step 2: Join one bot with no preferred seat, via the admin UI**

Use the per-bot "Select Table" dialog (Task 8) with Seat left as "Any empty seat". Watch `apps/bot-worker/storage/debug/<botId>/*.png` + `.html` for the lobby-navigation stage.

Expected: a screenshot/HTML snapshot showing the lobby was reached (login-only URL, `#RingGrid` visible), followed by one showing the target table opened. If the table never opens (`openTableFromLobby` returns `false`, job errors with "Could not find/open table"), inspect the captured lobby HTML to determine the real open interaction (single click vs. double-click vs. separate button) and fix `openTableFromLobby` accordingly in a follow-up commit - do not guess again blind.

- [ ] **Step 3: Join a second bot with a specific preferred seat**

Pick a currently-empty seat number visible in a live debug screenshot of that table, enter it in the Seat field, and join.

Expected: the bot sits in the requested seat. If it sits in a different (or the first-available) seat instead, capture a fresh debug snapshot at the lobby/table stage, inspect the live `.tooltip` text for each `.sp_seat` index (`console.log` the mapping via `page.evaluate` if needed), and correct the regex/selector in `clickEmptySeat` in a follow-up commit.

- [ ] **Step 4: Run `graphify update .` after all commits land**

Run: `graphify update .`
Expected: graph node/edge counts update to reflect the new/changed methods (`generateLoginOnlyLink`, `openTableFromLobby`, updated `clickEmptySeat`/`joinTable` signatures), AST-only, no LLM cost.
