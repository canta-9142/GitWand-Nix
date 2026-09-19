import { describe, it, expect, beforeEach } from "vitest";
import {
  diffLaunchpad,
  isBotAuthor,
  _resetLaunchpadSnapshot,
} from "../useLaunchpadNotifications";
import type { PrWithRepo } from "../useLaunchpadPrs";
import { CLOSED_AUTO_MERGE } from "../../utils/backend";

/** Build a PrWithRepo with sensible defaults; override what each test needs. */
function mk(overrides: Partial<PrWithRepo> & { url: string }): PrWithRepo {
  return {
    number: 1,
    title: "PR title",
    state: "OPEN",
    author: "alice",
    branch: "feat/x",
    base: "main",
    draft: false,
    createdAt: "2026-05-01T10:00:00Z",
    updatedAt: "2026-05-01T10:00:00Z",
    additions: 0,
    deletions: 0,
    labels: [],
    assignees: [],
    reviewRequested: [],
    reviewDecision: "",
    mergeStateStatus: "",
    checksRollup: "",
    commentCount: 0,
    autoMerge: CLOSED_AUTO_MERGE,
    repoName: "alpha",
    repoPath: "/repo/a",
    ...overrides,
  };
}

describe("useLaunchpadNotifications — diff layer", () => {
  beforeEach(() => _resetLaunchpadSnapshot());

  it("first call only seeds the snapshot (no boot burst)", () => {
    const events = diffLaunchpad([mk({ url: "u1" }), mk({ url: "u2" })]);
    expect(events).toEqual([]);
  });

  it("emits new-pr for a URL not seen before", () => {
    diffLaunchpad([mk({ url: "u1" })]);
    const events = diffLaunchpad([mk({ url: "u1" }), mk({ url: "u2", number: 2 })]);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("new-pr");
    expect(events[0].prNumber).toBe(2);
  });

  it("emits ci-flip only on a terminal rollup change", () => {
    diffLaunchpad([mk({ url: "u1", checksRollup: "PENDING" })]);
    // PENDING → FAILURE is terminal → flip
    let events = diffLaunchpad([mk({ url: "u1", checksRollup: "FAILURE" })]);
    expect(events.map((e) => e.kind)).toContain("ci-flip");
    expect(events.find((e) => e.kind === "ci-flip")?.detail).toBe("FAILURE");

    // FAILURE → PENDING is NOT terminal → no flip
    events = diffLaunchpad([mk({ url: "u1", checksRollup: "PENDING" })]);
    expect(events.map((e) => e.kind)).not.toContain("ci-flip");
  });

  it("emits review-requested when a reviewer is added", () => {
    diffLaunchpad([mk({ url: "u1", reviewRequested: [] })]);
    const events = diffLaunchpad([mk({ url: "u1", reviewRequested: ["bob"] })]);
    const ev = events.find((e) => e.kind === "review-requested");
    expect(ev).toBeTruthy();
    expect(ev?.detail).toBe("bob");
  });

  it("emits new-comment when commentCount increases", () => {
    diffLaunchpad([mk({ url: "u1", commentCount: 2 })]);
    const events = diffLaunchpad([mk({ url: "u1", commentCount: 5 })]);
    expect(events.map((e) => e.kind)).toContain("new-comment");
  });

  it("emits review-decided on APPROVED / CHANGES_REQUESTED", () => {
    diffLaunchpad([mk({ url: "u1", reviewDecision: "REVIEW_REQUIRED" })]);
    const events = diffLaunchpad([mk({ url: "u1", reviewDecision: "APPROVED" })]);
    const ev = events.find((e) => e.kind === "review-decided");
    expect(ev?.detail).toBe("APPROVED");
  });

  it("emits closed when a previously-open PR disappears", () => {
    diffLaunchpad([mk({ url: "u1" }), mk({ url: "u2", number: 2 })]);
    const events = diffLaunchpad([mk({ url: "u1" })]);
    const ev = events.find((e) => e.kind === "closed");
    expect(ev?.prNumber).toBe(2);
  });

  it("does not emit when nothing changed", () => {
    diffLaunchpad([mk({ url: "u1", checksRollup: "SUCCESS" })]);
    const events = diffLaunchpad([mk({ url: "u1", checksRollup: "SUCCESS" })]);
    expect(events).toEqual([]);
  });

  it("isBotAuthor flags automation accounts", () => {
    expect(isBotAuthor("dependabot[bot]")).toBe(true);
    expect(isBotAuthor("github-actions")).toBe(true);
    expect(isBotAuthor("renovate[bot]")).toBe(true);
    expect(isBotAuthor("alice")).toBe(false);
    expect(isBotAuthor("")).toBe(false);
  });
});
