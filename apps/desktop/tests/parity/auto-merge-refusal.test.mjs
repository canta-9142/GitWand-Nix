/**
 * Parity: the Rust command and the dev-server route must REFUSE identically.
 *
 * Following the read-file precedent (this suite's structure copies
 * read-file.test.mjs): no test arms an auto-merge on a live PR; what is
 * checkable, and what has historically drifted, is whether the two backends
 * agree on failure. A repository with no forge remote is the cheapest way to
 * make both refuse for the same reason.
 *
 * The two sides phrase the failure differently on purpose: Rust prefixes its
 * error ("gh pr merge --auto failed: ..."), the dev-server returns the bare
 * stderr, exactly like the two existing merge paths already do. What must
 * agree is the CLASS of failure, not the string, so the comparison below
 * normalises both sides before comparing.
 */
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { startDevServer } from "./dev-server-runner.mjs";
import { runProbe } from "./probe.mjs";
import { mkTempRepo } from "./fixtures.mjs";

/** POST /api/gh-enable-auto-merge, returning the same {ok, error} shape as runProbe. */
async function nodeEnableAutoMerge(dev, cwd, number, method) {
  const res = await dev.fetch("/api/gh-enable-auto-merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cwd, number, method }),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, value: data } : { ok: false, error: data.error };
}

/**
 * Collapse the parts that legitimately differ between the two backends down
 * to a single class. The dev-server route always shells out to `gh` CLI; the
 * Rust command instead goes through the GraphQL/REST path whenever a GitHub
 * token is configured locally (see `gh_enable_auto_merge_inner`), so the two
 * phrasings for "this repo has no forge remote" are NOT the same string even
 * on a machine with no network at all:
 *   - `gh` CLI:        "no git remotes found"
 *   - Rust token path: "No 'origin' remote found in this repo."
 * Both mention the missing remote, which is the class this test pins. It must
 * NOT collapse an unrelated failure (a real network/auth error) into the same
 * bucket, so the check stays specific to "remote" rather than "any error".
 */
function normalizeForgeError(msg) {
  const lower = String(msg).toLowerCase();
  return lower.includes("remote") ? "no-remote" : "other";
}

describe("parity: auto-merge refusal", () => {
  /** @type {Awaited<ReturnType<typeof startDevServer>>} */
  let dev;

  beforeAll(async () => {
    dev = await startDevServer();
  }, 15_000);

  afterAll(async () => {
    await dev?.stop();
  });

  it("both backends refuse enabling auto-merge on a repo with no forge remote", async () => {
    const cwd = mkTempRepo("gw-auto-merge-refusal-");
    const rust = runProbe("gh-enable-auto-merge", { cwd, number: 1, method: "squash" });
    const node = await nodeEnableAutoMerge(dev, cwd, 1, "squash");

    expect(rust.ok, "rust unexpectedly accepted a repo with no forge remote").toBe(false);
    expect(node.ok, "node unexpectedly accepted a repo with no forge remote").toBe(false);
    // Pin the actual reason, not just cross-side agreement: if both sides
    // failed for some unrelated cause (e.g. `gh` missing entirely), they'd
    // still agree with each other while never having exercised the missing
    // remote this test is named for.
    expect(normalizeForgeError(rust.error)).toBe("no-remote");
    expect(normalizeForgeError(node.error)).toBe(normalizeForgeError(rust.error));
  });

  it("both backends refuse disabling auto-merge on a repo with no forge remote", async () => {
    const cwd = mkTempRepo("gw-auto-merge-refusal-");
    const rust = runProbe("gh-disable-auto-merge", { cwd, number: 1 });
    const res = await dev.fetch("/api/gh-disable-auto-merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd, number: 1 }),
    });
    const nodeData = await res.json().catch(() => ({}));
    const node = res.ok ? { ok: true } : { ok: false, error: nodeData.error };

    expect(rust.ok, "rust unexpectedly accepted a repo with no forge remote").toBe(false);
    expect(node.ok, "node unexpectedly accepted a repo with no forge remote").toBe(false);
    expect(normalizeForgeError(rust.error)).toBe("no-remote");
    expect(normalizeForgeError(node.error)).toBe(normalizeForgeError(rust.error));
  });
});
