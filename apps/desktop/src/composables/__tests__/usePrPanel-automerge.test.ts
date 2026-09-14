// @vitest-environment jsdom
/**
 * Task 8 (v3.11.0, forge-side auto-merge): the offer rule and the two
 * actions the PR detail panel wires to it.
 *
 * `computeAutoMergeOffer` is the load-bearing piece: the panel must never
 * offer to *arm* auto-merge on a PR that is already mergeable (a
 * `gh pr merge --auto` against an already-clean PR may merge immediately),
 * so that branch is exercised on its own below. See usePrPanel.ts:78
 * (`isMergeConflict`) for the precedent of exporting a free helper from this
 * file so it can be unit-tested directly, without instantiating the whole
 * composable.
 *
 * See usePrPanel-cli-missing.test.ts for why `vi.hoisted()` is required for
 * the mock factories (usePrPanel.ts's import chain evaluates them first).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";

const { gitRemoteInfo } = vi.hoisted(() => ({
  gitRemoteInfo: vi.fn(),
}));

vi.mock("../../utils/backend", () => ({
  gitRemoteInfo: (...args: unknown[]) => gitRemoteInfo(...args),
  gitFileCount: vi.fn(async () => 0),
  ghForkInfo: vi.fn(async () => ({ isFork: false, origin: "", parent: "" })),
  ghPrFreshnessSignal: vi.fn(),
  detectClaudeCli: vi.fn(async () => ({
    found: false, path: "", version: "", logged_in: false, status: "not_found",
  })),
}));

const forgeStub = vi.hoisted(() => ({
  current: {
    name: "github",
    listPRs: (..._a: unknown[]) => Promise.resolve([]),
    getPR: (..._a: unknown[]) => Promise.resolve(null),
    listComments: (..._a: unknown[]) => Promise.resolve([]),
    listReviews: (..._a: unknown[]) => Promise.resolve([]),
    enableAutoMerge: (..._a: unknown[]) => Promise.resolve(),
    disableAutoMerge: (..._a: unknown[]) => Promise.resolve(),
  },
}));
vi.mock("../forge/useForge", () => ({
  forgeFromRemoteInfo: vi.fn(() => forgeStub.current),
  githubProvider: { name: "github", listPRs: vi.fn(async () => []) },
}));

import { usePrPanel, computeAutoMergeOffer } from "../usePrPanel";
import { _resetPrCacheForTesting } from "../usePrCache";

const armed = { armed: true, available: true, reason: null };
const open = { armed: false, available: true, reason: null };
const blocked = { armed: false, available: false, reason: "No pipeline is running." };
const supported = { supported: true, reason: null };

describe("computeAutoMergeOffer", () => {
  it("offers arming on a PR that is not yet mergeable", () => {
    expect(computeAutoMergeOffer(supported, open, { ready: false, reason: "" }))
      .toEqual({ kind: "arm" });
  });

  it("does NOT offer arming when the PR is already mergeable", () => {
    // The rule that removes the entire "I asked for later and it merged now"
    // class of failure: when the PR can merge, the immediate merge next to
    // this button is what the user wants, and gh pr merge --auto against an
    // already-mergeable PR may merge immediately.
    expect(computeAutoMergeOffer(supported, open, { ready: true, reason: "" }))
      .toEqual({ kind: "none" });
  });

  it("offers cancelling whenever one is armed, mergeable or not", () => {
    expect(computeAutoMergeOffer(supported, armed, { ready: true, reason: "" }))
      .toEqual({ kind: "disarm" });
  });

  it("explains instead of offering when the forge cannot do it", () => {
    expect(
      computeAutoMergeOffer(
        { supported: false, reason: "Bitbucket has no equivalent." },
        open,
        { ready: false, reason: "" },
      ),
    ).toEqual({ kind: "explain", reason: "Bitbucket has no equivalent." });
  });

  it("explains instead of offering when the PR fails a precondition", () => {
    expect(computeAutoMergeOffer(supported, blocked, { ready: false, reason: "" }))
      .toEqual({ kind: "explain", reason: "No pipeline is running." });
  });

  it("offers nothing when readiness is still unknown", () => {
    expect(computeAutoMergeOffer(supported, open, null)).toEqual({ kind: "none" });
  });

  it("explains instead of offering when the viewer cannot merge (canMerge === false)", () => {
    expect(
      computeAutoMergeOffer(supported, open, { ready: false, reason: "" }, false),
    ).toEqual({ kind: "explain", reason: "" });
  });

  it("still offers arming when canMerge is unknown (null/undefined, not strictly false)", () => {
    // GitLab, Azure and Bitbucket never populate canMerge, and a failed gh
    // permission lookup also leaves it null/undefined — none of that means
    // "no permission", so the button must not disappear on its own.
    expect(computeAutoMergeOffer(supported, open, { ready: false, reason: "" }, null))
      .toEqual({ kind: "arm" });
    expect(computeAutoMergeOffer(supported, open, { ready: false, reason: "" }, undefined))
      .toEqual({ kind: "arm" });
  });
});

const fakePr = { number: 42, title: "Sample PR", author: "octocat", branch: "feature/x", base: "main" } as any;

describe("usePrPanel: armAutoMerge / disarmAutoMerge", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetPrCacheForTesting();
    gitRemoteInfo.mockReset();
    gitRemoteInfo.mockResolvedValue({ name: "origin", url: "https://github.com/o/r", provider: "github", owner: "o", repo: "r" });
    forgeStub.current = {
      name: "github",
      listPRs: vi.fn(async () => []),
      getPR: vi.fn(async () => ({ ...fakePr, autoMerge: { armed: false, available: true, reason: null } })),
      listComments: vi.fn(async () => []),
      listReviews: vi.fn(async () => []),
      enableAutoMerge: vi.fn(async () => {}),
      disableAutoMerge: vi.fn(async () => {}),
    };
  });

  it("armAutoMerge() calls the provider and clears a stale error on success", async () => {
    const panel = usePrPanel(ref("/repo"));
    await panel.loadRemote();
    panel.selectedPr.value = fakePr;
    panel.error.value = "stale error";

    await panel.armAutoMerge();

    expect(forgeStub.current.enableAutoMerge).toHaveBeenCalledWith("/repo", 42, "merge");
    expect(panel.error.value).toBeNull();
  });

  it("armAutoMerge() surfaces the forge's message and re-fetches the PR on failure", async () => {
    forgeStub.current.enableAutoMerge = vi.fn(async () => {
      throw new Error("required check has not run yet");
    });
    const panel = usePrPanel(ref("/repo"));
    await panel.loadRemote();
    panel.selectedPr.value = fakePr;

    await panel.armAutoMerge();

    expect(panel.error.value).toBe("required check has not run yet");
    // The descriptor is re-fetched so a stale refusal doesn't linger.
    expect(forgeStub.current.getPR).toHaveBeenCalled();
  });

  it("disarmAutoMerge() calls the provider and clears a stale error on success", async () => {
    const panel = usePrPanel(ref("/repo"));
    await panel.loadRemote();
    panel.selectedPr.value = fakePr;
    panel.error.value = "stale error";

    await panel.disarmAutoMerge();

    expect(forgeStub.current.disableAutoMerge).toHaveBeenCalledWith("/repo", 42);
    expect(panel.error.value).toBeNull();
  });

  it("disarmAutoMerge() surfaces the forge's message on failure", async () => {
    forgeStub.current.disableAutoMerge = vi.fn(async () => {
      throw new Error("nothing armed");
    });
    const panel = usePrPanel(ref("/repo"));
    await panel.loadRemote();
    panel.selectedPr.value = fakePr;

    await panel.disarmAutoMerge();

    expect(panel.error.value).toBe("nothing armed");
  });
});
