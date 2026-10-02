// A complete integration in one file. Copy the augur/ folder into your src/, then:

import { useEffect, useState } from "react";
import { Augur, augur, SupabaseStore, type HostConfig } from "../augur";
// @ts-expect-error -- placeholder: point this at your app's own Supabase client
import { supabase } from "./your-supabase-client"; // your app's client

// 1) Your config lives here — never inside the module. Reword/tune later in admin.
export const MY_AUGUR: HostConfig = {
  // Triggered prompts: one question right after a real action completes.
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

  // The feedback button's panel. Omit `categories` for the defaults (Something
  // broke / confusing / missing), or [] for plain free text.
  categories: [
    { key: "bug",   label: "Something broke", placeholder: "The total didn’t update after I removed an item…" },
    { key: "idea",  label: "I have an idea" },
    { key: "other", label: "Something else" },
  ],
  moreLink: { label: "Say more", href: "https://example.com/feedback-form" },   // optional

  // Use your own button instead of Augur's (see FeedbackButton below).
  persistentButton: false,
};

const store = new SupabaseStore(supabase as never);   // or LocalStore / HttpStore

// 2) Mount once, high in the tree, with the signed-in user's id. appVersion is
//    attached to feedback people send from the button, so reports are fixable.
export function Root({ userId }: { userId: string }) {
  return (
    <>
      {/* …your app… */}
      <FeedbackButton />
      <Augur userId={userId} store={store} config={MY_AUGUR} appVersion="1.4.2" />
    </>
  );
}

// 3) Your own button opens Augur's panel, and hides while Augur is on screen.
function FeedbackButton() {
  const [augurOpen, setAugurOpen] = useState(false);
  useEffect(() => augur.onPanelState(setAugurOpen), []);
  if (augurOpen) return null;
  return <button className="feedback" onClick={() => augur.open("fab")}>Feedback</button>;
}

// 4) Emit where the action completes — fire-and-forget; caps decide if it shows.
export async function onCheckout() {
  // await placeOrder(cart)
  augur.emit("checkout.done");
}

// 5) Friction: label the controls that matter. Three presses within a second on a
//    labelled control are recorded quietly (label, page path, count; no prompt).
export function PayButton({ onPay }: { onPay: () => void }) {
  return <button data-augur="pay" onClick={onPay}>Pay now</button>;
}
