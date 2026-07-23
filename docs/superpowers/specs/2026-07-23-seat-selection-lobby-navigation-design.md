# Seat Selection + Lobby-Based Table Navigation

## Problem

Two related gaps in the current join-table flow:

1. **No seat choice.** The admin operator cannot pick which physical seat a bot
   sits in. `WorkerService.clickEmptySeat()` always takes the first unoccupied
   `.sp_seat` it finds in DOM order.
2. **Direct-link navigation can't express a seat choice.** Today's join flow
   uses a Poker Mavens auto-login URL that includes `TableName`/`TableType`,
   dropping the bot straight into the table window without ever touching the
   lobby. There's no natural place in that flow to reason about "which seat,"
   and the operator asked to move off this link toward interacting with the
   table list in HTML instead.

The two problems are related but not the same fix: seat choice is a
same-page DOM interaction that doesn't depend on how the bot arrived at the
table. Session-key auto-login is worth keeping (it avoids automating the
login form, which is a separate source of fragility); only the "jump
straight to a specific table" part of the link is being dropped in favor of
opening the table from the lobby's own table list, matching what a real
player does.

## Decision

- **Keep session-key auto-login.** Generate a login-only URL
  (`?LoginName=...&SessionKey=...`, no `TableName`/`TableType`). The bot logs
  in automatically and lands in the lobby, same as today's real player
  experience post-login.
- **Open the table via the lobby's HTML**, not a URL parameter: find the
  target table's row in the Ring Games grid (`#RingGrid`) by matching its
  name column against the requested table ID, then interact with that row to
  open the table window.
- **Add seat selection** as an optional parameter threaded end-to-end from
  the admin UI down to `clickEmptySeat()`, which will target a specific seat
  number when one is given, falling back to "any empty seat" (today's
  behavior) if the requested seat is taken or can't be resolved.

## Architecture

### 1. Backend: login-only link generation

`PokerMavensApiService` gets a new method alongside the existing
`generateDirectTableLink`:

```ts
async generateLoginOnlyLink(nickname: string): Promise<{ url: string; sessionKey: string }>
```

Same session-key fetch (`AccountsSessionKey`) as today, but the returned URL
omits `TableName`/`TableType` entirely:
`${baseUrl}/?LoginName={nickname}&SessionKey={key}`.

`generateDirectTableLink` and the table-game-type lookup it uses stay in
place unchanged - only the code path used by `WorkerService.joinTable()`
switches to the new method. Anything else calling the old direct-link
internal endpoint is unaffected.

The internal `/api/v1/internal/bots/direct-link` endpoint response gains a
`sessionOnlyUrl` field (or a new endpoint is added - implementation detail
for the plan) so the bot-worker can request the login-only variant instead
of the table-jump variant.

### 2. Bot-worker: lobby navigation + table open

`WorkerService.joinTable()` changes its navigation step:

1. Navigate to the login-only URL (auto-login, lands in lobby).
2. New private method `openTableFromLobby(page, tableId): Promise<boolean>`:
   - Wait for `#RingGrid .grid_data` rows to render.
   - Find the row whose name-column text matches `tableId` (exact match,
     same string used today as the direct-link `TableName`).
   - Open it. Best-guess first implementation: double-click the row (typical
     grid-open convention). This is unverified against the live site and
     **must be confirmed via a debug snapshot after first deploy**, following
     the same live-iterate pattern used for every other Playwright
     interaction in this codebase (e.g. `dismissFullScreenPrompt`,
     `clickReadyButton`). If double-click doesn't open the table, the plan's
     first live-test step captures a screenshot/HTML snapshot to determine
     the real interaction (single click + separate button, etc.) and the
     code is adjusted in a follow-up commit, not guessed further blind.
3. Everything downstream of "table window is open" (`clickEmptySeat`,
   `performBuyIn`, ready-button clicks, the post-buy-in ground-truth check)
   is unchanged.

### 3. Seat selection end-to-end

New optional parameter `preferredSeat?: number` (1-indexed, matching the
number the site itself displays) threaded through:

- Admin UI: a seat-number field/dropdown (1..`maxPlayers` from the table's
  known metadata) in the join-table dialog (both the single per-bot join
  action and the existing "Join Table (Random Order)" bulk dialog).
- `JoinTableBody` / `BulkJoinTableBody` DTOs (`apps/backend/.../bot-commands.controller.ts`).
- `BotCommandsService.joinTable()` / `bulkJoinTable()` - pass through into
  the queued job payload.
- Bot-worker `handleJob()` - pass through into `WorkerService.joinTable()`.
- `WorkerService.clickEmptySeat(page, preferredSeat？)`:
  - If no `preferredSeat` given, behaves exactly as today (first empty seat).
  - If given, first builds an index → on-screen-seat-number map by reading
    each `.sp_seat`'s hover tooltip (confirmed live in an earlier debug
    capture to read `מושב #N` / "Seat #N"), then clicks the `.sp_seat` whose
    resolved number matches `preferredSeat`.
  - If the requested seat isn't found unoccupied (already taken, or the
    tooltip text couldn't be parsed for some seat), fall back to the
    existing "first empty seat" behavior rather than aborting the join -
    a bot that can't get its exact preferred seat should still play,
    not sit out entirely.

## Risk / rollout

Both new interactions (double-click to open a lobby row, tooltip-based seat
numbering) are unverified against the live site. Per this project's
established pattern, ship a reasonable first implementation, deploy, and use
the existing debug-snapshot mechanism
(`apps/bot-worker/storage/debug/<botId>/*.png` + `.html`) to confirm or
correct the exact interaction - not a design update, a small follow-up fix
based on live evidence, same as every previous Playwright selector fix in
this codebase.

## Out of scope

- Live seat-occupancy display in the admin UI (would need a new
  peek-at-table round trip to the bot-worker; not requested).
- Removing or deprecating `generateDirectTableLink` / the old table-jump
  link entirely - it stays in place, just unused by `joinTable()`.
