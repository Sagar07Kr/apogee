import test from "node:test";
import assert from "node:assert/strict";
import { createExtensionApiMock } from "../helpers/extensionApiMock.js";
import { MAX_PASTED_CHARS } from "../../lib/extract/fileLimits.js";
import { loadViewState } from "../../lib/storage/viewState.js";

// --- #471: an oversized selection must be capped before it fans out ---
//
// Pasted text and files are bounded, but a selection reached
// runBackgroundSummarize with no ceiling and was copied whole into the
// saved view state, the finalize payload, and the model prompt.

// The Local provider gets the run past the offscreen-only WebLLM path to the
// view-state write. fetch rejects so the stream it starts fails fast without
// reaching a real loopback server. `node --test` runs each file in its own
// process, so neither stub leaks into other files.
const { chrome } = createExtensionApiMock({ settings: { provider: "local" } });
chrome.alarms = {
  create: () => {},
  clear: async () => {},
  onAlarm: { addListener: () => {} },
};
globalThis.chrome = chrome;
globalThis.fetch = async () => {
  throw new TypeError("fetch failed");
};

const { runBackgroundSummarize } =
  await import("../../background/service-worker.js");

const TAB = {
  id: 101,
  url: "https://example.com/article",
  title: "Example Article",
  windowId: 1,
};

test("runBackgroundSummarize caps an oversized selection with a note (#471)", async () => {
  await runBackgroundSummarize(TAB, {
    notifyOnFinish: false,
    selectionText: "word ".repeat(MAX_PASTED_CHARS),
  });

  const state = await loadViewState(TAB.id);
  assert.equal(state.isSelection, true);
  assert.ok(
    state.selectionText.length <= MAX_PASTED_CHARS,
    `selection kept ${state.selectionText.length} characters`,
  );
  assert.ok(state.selectionText.startsWith("word word word"));
  assert.match(
    state.selectionText,
    new RegExp(
      `\\[\\.\\.\\.selected content truncated to the first ${MAX_PASTED_CHARS} characters\\.\\.\\.\\]$`,
    ),
  );
});
