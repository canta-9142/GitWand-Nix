import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WorkspaceRepo } from "../../utils/backend";

vi.mock("../../utils/backend", () => ({
  workspacePrsAll: vi.fn(),
  workspaceWipAll: vi.fn(),
  ghCurrentUser: vi.fn(),
  ghPrFiles: vi.fn(),
}));

import {
  workspacePrsAll,
  workspaceWipAll,
  ghCurrentUser,
  ghPrFiles,
} from "../../utils/backend";
import { useLaunchpadTeam, _resetTeamForTesting } from "../useLaunchpadTeam";

const mockPrsAll = vi.mocked(workspacePrsAll);
const mockWipAll = vi.mocked(workspaceWipAll);
const mockCurrentUser = vi.mocked(ghCurrentUser);
const mockPrFiles = vi.mocked(ghPrFiles);

const REPOS: WorkspaceRepo[] = [{ path: "/repo/a", name: "alpha" }];

const BASE_PR = {
  number: 1,
  title: "PR title",
  state: "OPEN",
  branch: "feat/x",
  base: "main",
  draft: false,
  createdAt: "2026-05-01T10:00:00Z",
  updatedAt: "2026-05-02T10:00:00Z",
  url: "https://github.com/org/alpha/pull/1",
  additions: 5,
  deletions: 2,
  labels: [],
  assignees: [],
  reviewRequested: [],
  reviewDecision: "",
  mergeStateStatus: "CLEAN",
  checksRollup: "SUCCESS",
  commentCount: 0,
  // Not imported from "../../utils/backend" (mocked above): inline the same
  // closed-descriptor shape as CLOSED_AUTO_MERGE.
  autoMerge: { armed: false, available: false, reason: null },
};

const EMPTY_WIP = [
  {
    path: "/repo/a",
    name: "alpha",
    branch: "main",
    ahead: 0,
    behind: 0,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    lastCommitAt: "2026-05-01T10:00:00Z",
    hasNoUpstream: false,
    error: null,
    changedFiles: [],
  },
];

beforeEach(() => {
  _resetTeamForTesting();
  mockCurrentUser.mockResolvedValue("me");
  mockWipAll.mockResolvedValue(EMPTY_WIP);
  mockPrsAll.mockResolvedValue([]);
  mockPrFiles.mockResolvedValue([]);
});

describe("useLaunchpadTeam", () => {
  it("excludes PRs authored by the current user", async () => {
    mockPrsAll.mockResolvedValue([
      {
        repoPath: "/repo/a",
        repoName: "alpha",
        prs: [
          { ...BASE_PR, number: 1, author: "me", url: "https://github.com/org/alpha/pull/1" },
          { ...BASE_PR, number: 2, author: "alice", url: "https://github.com/org/alpha/pull/2" },
        ],
        error: null,
      },
    ]);

    const { teamActivity, refresh } = useLaunchpadTeam();
    await refresh(REPOS);

    expect(teamActivity.value).toHaveLength(1);
    expect(teamActivity.value[0].login).toBe("alice");
    expect(teamActivity.value[0].prs.every((pr) => pr.author !== "me")).toBe(true);
  });

  it("groups colleague PRs by author login, sorted by createdAt descending", async () => {
    mockPrsAll.mockResolvedValue([
      {
        repoPath: "/repo/a",
        repoName: "alpha",
        prs: [
          {
            ...BASE_PR,
            number: 1,
            author: "alice",
            createdAt: "2026-05-01T10:00:00Z",
            url: "https://github.com/org/alpha/pull/1",
          },
          {
            ...BASE_PR,
            number: 2,
            author: "alice",
            createdAt: "2026-05-03T10:00:00Z",
            url: "https://github.com/org/alpha/pull/2",
          },
          {
            ...BASE_PR,
            number: 3,
            author: "bob",
            createdAt: "2026-05-02T10:00:00Z",
            url: "https://github.com/org/alpha/pull/3",
          },
        ],
        error: null,
      },
    ]);

    const { teamActivity, refresh } = useLaunchpadTeam();
    await refresh(REPOS);

    const alice = teamActivity.value.find((m) => m.login === "alice")!;
    expect(alice.prs).toHaveLength(2);
    // PR#2 (2026-05-03) must come before PR#1 (2026-05-01)
    expect(alice.prs[0].number).toBe(2);
    expect(alice.prs[1].number).toBe(1);
    expect(teamActivity.value.find((m) => m.login === "bob")).toBeDefined();
  });

  it("detects overlap between WIP files and colleague PR files", async () => {
    mockWipAll.mockResolvedValue([
      { ...EMPTY_WIP[0], changedFiles: ["src/auth.ts", "src/utils.ts"] },
    ]);
    mockPrsAll.mockResolvedValue([
      {
        repoPath: "/repo/a",
        repoName: "alpha",
        prs: [
          { ...BASE_PR, number: 1, author: "alice", url: "https://github.com/org/alpha/pull/1" },
        ],
        error: null,
      },
    ]);
    mockPrFiles.mockResolvedValue(["src/auth.ts", "src/login.ts"]);

    const { teamActivity, refresh } = useLaunchpadTeam();
    await refresh(REPOS);

    const alice = teamActivity.value[0];
    expect(alice.overlappingPrs).toHaveLength(1);
    expect(alice.overlappingPrs[0].overlappingFiles).toEqual(["src/auth.ts"]);
    expect(alice.overlappingPrs[0].myContext).toBe("wip");
  });

  it("uses branch files when WIP is empty (myContext: 'branch')", async () => {
    // WIP empty; I have PR#1, colleague alice has PR#2
    mockPrsAll.mockResolvedValue([
      {
        repoPath: "/repo/a",
        repoName: "alpha",
        prs: [
          { ...BASE_PR, number: 1, author: "me", url: "https://github.com/org/alpha/pull/1" },
          { ...BASE_PR, number: 2, author: "alice", url: "https://github.com/org/alpha/pull/2" },
        ],
        error: null,
      },
    ]);
    // First ghPrFiles call = my PR#1, second = alice's PR#2
    mockPrFiles
      .mockResolvedValueOnce(["src/auth.ts"])
      .mockResolvedValueOnce(["src/auth.ts"]);

    const { teamActivity, refresh } = useLaunchpadTeam();
    await refresh(REPOS);

    const alice = teamActivity.value[0];
    expect(alice.overlappingPrs).toHaveLength(1);
    expect(alice.overlappingPrs[0].myContext).toBe("branch");
  });

  it("sorts members with overlaps before members without", async () => {
    mockWipAll.mockResolvedValue([
      { ...EMPTY_WIP[0], changedFiles: ["src/auth.ts"] },
    ]);
    mockPrsAll.mockResolvedValue([
      {
        repoPath: "/repo/a",
        repoName: "alpha",
        prs: [
          { ...BASE_PR, number: 1, author: "alice", url: "https://github.com/org/alpha/pull/1" },
          { ...BASE_PR, number: 2, author: "bob", url: "https://github.com/org/alpha/pull/2" },
        ],
        error: null,
      },
    ]);
    // alice's PR: no overlap; bob's PR: overlap
    mockPrFiles
      .mockResolvedValueOnce([])                // alice PR#1 — no overlap
      .mockResolvedValueOnce(["src/auth.ts"]);  // bob PR#2 — overlap

    const { teamActivity, refresh } = useLaunchpadTeam();
    await refresh(REPOS);

    // bob (overlap) must come before alice (no overlap)
    expect(teamActivity.value[0].login).toBe("bob");
    expect(teamActivity.value[1].login).toBe("alice");
  });

  it("calls ghCurrentUser only once across multiple refresh() calls", async () => {
    const { refresh } = useLaunchpadTeam();
    await refresh(REPOS);
    await refresh(REPOS);
    await refresh(REPOS);

    expect(mockCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("populates error and resets loading when workspacePrsAll throws", async () => {
    mockPrsAll.mockRejectedValue(new Error("network failure"));
    const { teamActivity, loading, error, refresh } = useLaunchpadTeam();
    await refresh(REPOS);
    expect(error.value).toBe("network failure");
    expect(loading.value).toBe(false);
    expect(teamActivity.value).toHaveLength(0);
  });
});
