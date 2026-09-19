/**
 * Task 4 (forge-side auto-merge, v3.11.0): the TS mapping layer must carry
 * the Task 3 Rust `autoMerge` / `autoMergeSupport` descriptors through every
 * PR/PR-detail construction site, defaulting to a closed descriptor when a
 * backend omits them so an older backend or an unwired path never offers an
 * auto-merge button it cannot honour.
 *
 * `mapGlPullRequest` is exported by `backend-gitlab.ts` (it was previously a
 * private, unexported function) specifically so this mapping can be tested
 * directly, without going through the `glListMrs`/`glCreateMr` Tauri wrappers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const tauriInvoke = vi.fn();

vi.mock("../backend-core", () => ({
  isTauri: () => true,
  tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
}));

import { mapGlPullRequest, glGetMr } from "../backend-gitlab";

describe("mapGlPullRequest, auto-merge passthrough", () => {
  it("carries the descriptor through the GitLab normalisation", () => {
    const raw = {
      number: 3,
      title: "t",
      autoMerge: { armed: true, available: true, reason: null },
    } as any;
    expect(mapGlPullRequest(raw).autoMerge).toEqual({
      armed: true,
      available: true,
      reason: null,
    });
  });

  it("defaults to a closed descriptor when the backend sent none", () => {
    // An older backend, or a path that has not been wired yet, must not make
    // the UI offer a button. Absent reads as unavailable, never as available.
    const raw = { number: 3, title: "t" } as any;
    expect(mapGlPullRequest(raw).autoMerge).toEqual({
      armed: false,
      available: false,
      reason: null,
    });
  });
});

describe("glGetMr, auto-merge support passthrough", () => {
  beforeEach(() => {
    tauriInvoke.mockReset();
  });

  it("carries autoMergeSupport through the MR detail mapping", async () => {
    tauriInvoke.mockResolvedValue({
      number: 3,
      title: "t",
      autoMergeSupport: { supported: true, reason: null },
    });
    const detail = await glGetMr("/repo", 3);
    expect(detail.autoMergeSupport).toEqual({ supported: true, reason: null });
  });

  it("defaults autoMergeSupport to unsupported when the backend sent none", async () => {
    tauriInvoke.mockResolvedValue({ number: 3, title: "t" });
    const detail = await glGetMr("/repo", 3);
    expect(detail.autoMergeSupport).toEqual({ supported: false, reason: null });
  });
});
