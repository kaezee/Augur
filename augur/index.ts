// Augur — a portable, in-product feedback module. Copy this folder into any app.
// The whole public surface is here; nothing outside imports from deeper paths.
//
//   import { Augur, augur, SupabaseStore } from "./augur";
//   <Augur userId={session.user.id} store={new SupabaseStore(supabase)} config={MY_CONFIG} />
//   augur.emit("some.trigger");   // after a completed action
//
// Distribution = copy the folder. Backend = pick a store (or write one to the
// AugurStore interface). Remove = delete the folder + one mount + drop the tables.

export { Augur } from "./Augur";
export { augur } from "./emit";
export { AUGUR_BASE_DEFAULTS, mergeConfig, lockedInCode, responseTypeOf, effectiveCategories } from "./config";
export type { Answer, AugurConfig, HostConfig, ConfigOverrides, TriggerDef, Presentation, ResponseType, AnswerOption, Category, MoreLink, AugurStrings } from "./config";
export type { AugurStore, Summary, TriggerStat, AdminNote, DateRange, Unconfigured, Submission, SubmitContext, ErrorEntry, FrictionEvent, FrictionStat } from "./store";

// Stores — import the one your backend needs; unused ones tree-shake away.
export { SupabaseStore } from "./stores/supabase";
export type { SupabaseLike } from "./stores/supabase";
export { LocalStore } from "./stores/local";
export { HttpStore } from "./stores/http";

// Admin surface — optional, host-mounted behind the host's own route + guard.
export { AugurAdminSection, useAugurSummary, useAugurNotes } from "./admin";
export { AugurConsole } from "./console";
export { AugurMark, AugurWordmark, AugurByline } from "./mark";
