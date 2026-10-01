// A complete integration in one file. Copy the augur/ folder into your src/, then:

import { Augur, augur, SupabaseStore, type HostConfig } from "../augur";
// @ts-expect-error -- placeholder: point this at your app's own Supabase client
import { supabase } from "./your-supabase-client"; // your app's client

// 1) Your triggers live here — never inside the module. Reword/tune later in admin.
export const MY_AUGUR: HostConfig = {
  manualQuestion: "What’s one thing that would make this better?",
  triggers: {
    "checkout.done": {
      enabled: true, version: 1, delayMs: 3000, maxAsks: 1, dismissKill: 2,
      question: "Did checkout go through the way you expected?",
      // responseType defaults to "choice3" (Yes · Not really · Not sure).
    },
    "onboarding.done": {
      enabled: true, version: 1, delayMs: 2000, maxAsks: 1, dismissKill: 1,
      question: "How did setting up go?",
      responseType: "choice",
      options: [{ key: "smooth", label: "Smooth" }, { key: "confusing", label: "Confusing" }],
    },
  },
};

const store = new SupabaseStore(supabase as never);   // or LocalStore / HttpStore

// 2) Mount once, high in the tree, with the signed-in user's id.
export function Root({ userId }: { userId: string }) {
  return (
    <>
      {/* …your app… */}
      <Augur userId={userId} store={store} config={MY_AUGUR} />
    </>
  );
}

// 3) Emit where the action completes — fire-and-forget; caps decide if it shows.
export async function onCheckout() {
  // await placeOrder(cart)
  augur.emit("checkout.done");
}
