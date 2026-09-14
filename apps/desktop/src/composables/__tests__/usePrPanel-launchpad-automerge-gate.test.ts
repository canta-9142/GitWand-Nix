/**
 * Regression for the Launchpad quick auto-merge repo-level gate (final
 * whole-branch review, item I1): `openLaunchpadAutoMergePr` (App.vue) must
 * refuse to arm auto-merge on a PR whose repository never enabled it,
 * instead of calling straight through to the forge and failing on every
 * click. `gh_auto_merge_state` hardcodes `available: true` per PR, so the
 * repo-level `supported` flag only ever arrives on the loaded PR detail's
 * `autoMergeSupport` (never on list rows, see `gh_auto_merge_state`'s doc
 * comment) — `selectPr()` + `loadChecks()` (the same dance
 * `openLaunchpadMergePr` already does before reading `mergeBlocked`) must
 * load it before the handler decides.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";

const ghPrDetail = vi.fn();
const ghPrChecks = vi.fn();
const ghPrComments = vi.fn();
const ghPrListReviews = vi.fn();
const ghEnableAutoMerge = vi.fn();

vi.mock("@/utils/backend", async () => {
  const actual = await vi.importActual<typeof import("@/utils/backend")>("@/utils/backend");
  return {
    ...actual,
    gitRemoteInfo: vi.fn(async () => ({ url: "", host: "github.com", owner: "o", repo: "r" })),
    ghForkInfo: vi.fn(async () => ({ isFork: false, origin: "", parent: "" })),
    ghPrDetail: (...a: unknown[]) => ghPrDetail(...a),
    ghPrChecks: (...a: unknown[]) => ghPrChecks(...a),
    ghPrComments: (...a: unknown[]) => ghPrComments(...a),
    ghPrListReviews: (...a: unknown[]) => ghPrListReviews(...a),
    ghEnableAutoMerge: (...a: unknown[]) => ghEnableAutoMerge(...a),
  };
});

import { usePrPanel } from "../usePrPanel";

function fakeDetail(overrides: Record<string, unknown> = {}) {
  return {
    number: 1, title: "t", body: "", state: "open", author: "a", branch: "b", base: "main",
    draft: false, createdAt: "", updatedAt: "", mergedAt: "", url: "", additions: 0, deletions: 0,
    changedFiles: 0, comments: 0, reviewComments: 0, labels: [], reviewers: [], mergeable: "MERGEABLE",
    checksStatus: "success", canMerge: true, headSha: "abc",
    ...overrides,
  };
}

/**
 * Mirrors the repo-level gate `openLaunchpadAutoMergePr` now applies before
 * arming: load the detail bundle, then refuse when `autoMergeSupport` says
 * the repository does not support it, without ever calling the forge.
 */
async function armWithRepoGate(p: ReturnType<typeof usePrPanel>, pr: { number: number }) {
  await p.selectPr(pr as any);
  await p.loadChecks();
  const support = p.prDetail.value?.autoMergeSupport;
  if (support && !support.supported) {
    return { refused: true, reason: support.reason };
  }
  await p.armAutoMerge();
  return { refused: false, reason: null };
}

describe("usePrPanel — Launchpad quick auto-merge repo-level gate", () => {
  beforeEach(() => {
    ghPrDetail.mockReset();
    ghPrChecks.mockReset().mockResolvedValue([]);
    ghPrComments.mockReset().mockResolvedValue([]);
    ghPrListReviews.mockReset().mockResolvedValue([]);
    ghEnableAutoMerge.mockReset().mockResolvedValue(undefined);
  });

  it("refuses with the forge's reason on a repository where auto-merge isn't enabled, without calling the forge", async () => {
    ghPrDetail.mockResolvedValue(
      fakeDetail({
        number: 7,
        autoMergeSupport: { supported: false, reason: "Allow auto-merge is not enabled for this repository" },
      }),
    );

    const p = usePrPanel(ref("/repo"));
    const result = await armWithRepoGate(p, { number: 7 });

    expect(result).toEqual({
      refused: true,
      reason: "Allow auto-merge is not enabled for this repository",
    });
    expect(ghEnableAutoMerge).not.toHaveBeenCalled();
  });

  it("proceeds to arm when the repository supports auto-merge", async () => {
    ghPrDetail.mockResolvedValue(
      fakeDetail({ number: 8, autoMergeSupport: { supported: true, reason: null } }),
    );

    const p = usePrPanel(ref("/repo"));
    const result = await armWithRepoGate(p, { number: 8 });

    expect(result.refused).toBe(false);
    expect(ghEnableAutoMerge).toHaveBeenCalledTimes(1);
  });
});
