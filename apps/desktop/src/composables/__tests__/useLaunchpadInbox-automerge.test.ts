import { describe, it, expect } from "vitest";
import type { PrWithRepo } from "../useLaunchpadPrs";
import { classifyInboxPr } from "../useLaunchpadInbox";

/** Minimal PR factory: only the fields the inbox classifier reads matter. */
function pr(overrides: Partial<PrWithRepo>): PrWithRepo {
  return {
    number: 1,
    title: "PR",
    state: "OPEN",
    author: "laurent",
    branch: "feat/x",
    base: "main",
    draft: false,
    createdAt: "2026-06-01T10:00:00Z",
    updatedAt: "2026-06-01T10:00:00Z",
    url: "https://github.com/org/repo/pull/1",
    additions: 0,
    deletions: 0,
    labels: [],
    assignees: [],
    reviewRequested: [],
    reviewDecision: "",
    mergeStateStatus: "CLEAN",
    checksRollup: "",
    commentCount: 0,
    autoMerge: { armed: false, available: false, reason: null },
    repoName: "repo",
    repoPath: "/repo",
    ...overrides,
  };
}

const ME = "laurent";

describe("Today inbox, auto-merge action", () => {
  it("offers auto-merge on a PR that cannot merge yet but could be scheduled", () => {
    // My own PR, blocked on required checks/reviews, but the forge can queue
    // the merge for once they pass (Task 4/8's `available: true`).
    const r = classifyInboxPr(
      pr({
        author: ME,
        mergeStateStatus: "BLOCKED",
        autoMerge: { armed: false, available: true, reason: null },
      }),
      ME,
    );
    expect(r?.action).toBe("auto-merge");
  });

  it("keeps the immediate merge when the PR is ready now", () => {
    // computeAutoMergeOffer's rule carries over here: never offer auto-merge
    // on a PR that is already mergeable, the immediate merge sits right there.
    const r = classifyInboxPr(
      pr({
        author: ME,
        reviewDecision: "APPROVED",
        mergeStateStatus: "CLEAN",
        autoMerge: { armed: false, available: true, reason: null },
      }),
      ME,
    );
    expect(r?.action).toBe("merge");
  });

  it("keeps the immediate merge when the forge cannot schedule (dep-bump / Bitbucket)", () => {
    // The v3.10 comment at useLaunchpadInbox.ts:121 said this dep-bump action
    // is a merge and not an auto-merge because no forge auto-merge existed
    // anywhere in the app; it now exists for several forges, and one whose
    // descriptor reports `available: false` (Bitbucket has no equivalent
    // API at all) must keep the honest immediate merge rather than lose the
    // action entirely.
    const r = classifyInboxPr(
      pr({
        author: ME,
        labels: ["dependencies"],
        mergeStateStatus: "BLOCKED",
        autoMerge: { armed: false, available: false, reason: "no equivalent" },
      }),
      ME,
    );
    expect(r?.action).toBe("merge");
  });

  it("offers auto-merge on a dep-bump PR when the forge can schedule it", () => {
    const r = classifyInboxPr(
      pr({
        author: ME,
        labels: ["dependencies"],
        mergeStateStatus: "BLOCKED",
        autoMerge: { armed: false, available: true, reason: null },
      }),
      ME,
    );
    expect(r?.action).toBe("auto-merge");
  });

  it("offers nothing new when one is already armed", () => {
    const r = classifyInboxPr(
      pr({
        author: ME,
        mergeStateStatus: "BLOCKED",
        autoMerge: { armed: true, available: true, reason: null },
      }),
      ME,
    );
    expect(r?.action).not.toBe("auto-merge");
  });
});
