# Augur

A portable, in-product feedback module. One well-timed question, three answers, an
optional line. Copy this folder into any React app.

**Two props:** `<Augur userId={string} store={AugurStore} config={{ triggers }} />`.
**Emit** after a real action — two lines, the whole integration:

```ts
// 1. declare the trigger in your config          2. emit where the action completes
"checkout.done": { enabled: true, version: 1,     await placeOrder(cart)
  delayMs: 3000, maxAsks: 1, dismissKill: 2,       augur.emit("checkout.done")
  question: "Did that go through as expected?" }
```

**Store** (`store.ts`) is the one persistence seam — `logShown` · `logOutcome` ·
`logNote` · `logUnconfigured` · `readConfig`, plus optional admin reads. Pick one:
`LocalStore` (zero backend), `SupabaseStore(client)` (run the migrations), or
`HttpStore({endpoint})` — or write your own to the interface.

**Response types:** `choice3` (default, the only one that rolls into the summary),
`choice` (custom options), `text`. **Caps are local** (per-device, best-effort);
analytics stay exact. Adding/removing a trigger is a code change, not an admin action.

**Admin (optional):** mount `<AugurAdminSection store hostConfig />` behind your own
route + guard. Skip the import and collection still works. **Remove Augur:** delete
the folder, the one `<Augur/>`, your `emit` calls, and drop the tables.

**Attribution:** the "by Augur" byline at the foot of each prompt must stay visible
(free-license requirement — removing it needs a commercial license). Your own
"Feedback" button and its icon are yours to restyle. See the repo's LICENSE.
