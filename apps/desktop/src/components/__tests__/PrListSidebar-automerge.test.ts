// @vitest-environment jsdom
/**
 * PrListSidebar.vue: auto-merge badge (v3.11.0, Task 9).
 *
 * NOTE ON TARGET FILE: the original brief for this task named
 * `PullRequestPanel.vue`, but that component is not imported/rendered
 * anywhere in the app (last touched 2026-07-10, superseded by
 * PrListSidebar.vue + PrDetailView.vue when the PR panel was split into a
 * sidebar + main-pane view). Badging dead code would be invisible to real
 * users, so this test targets PrListSidebar.vue, the PR list that is
 * actually rendered inside RepoSidebar.
 *
 * PrListSidebar injects the shared `usePrPanel` state via provide/inject
 * rather than owning it locally, so the mount helper below provides a
 * minimal stand-in for every field the template reads (mirroring the
 * per-composable ref/vi.fn() stubbing pattern used by
 * `LaunchpadView.test.ts`), not a real `usePrPanel()` instance.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createApp, ref, nextTick, type App } from "vue";
import PrListSidebar from "../PrListSidebar.vue";
import { PR_PANEL_KEY, type PrPanelState } from "../../composables/usePrPanel";

vi.mock("../../composables/useI18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

interface FakePr {
  number: number;
  title: string;
  state: string;
  author: string;
  branch: string;
  base: string;
  draft: boolean;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  reviewDecision: string;
  mergeStateStatus: string;
  checksRollup: string;
  autoMerge: { armed: boolean; available: boolean; reason: string | null };
}

function fakePr(overrides: Partial<FakePr> = {}): FakePr {
  return {
    number: 1,
    title: "Sample PR",
    state: "OPEN",
    author: "octocat",
    branch: "feature/x",
    base: "main",
    draft: false,
    createdAt: "2026-05-12T10:00:00Z",
    updatedAt: "2026-05-12T10:00:00Z",
    additions: 1,
    deletions: 1,
    reviewDecision: "",
    mergeStateStatus: "",
    checksRollup: "",
    autoMerge: { armed: false, available: false, reason: null },
    ...overrides,
  };
}

/** Minimal stand-in for `PrPanelState`: only the fields PrListSidebar reads. */
function fakePanel(prs: FakePr[]): PrPanelState {
  const panel = {
    loading: ref(false),
    refreshing: ref(false),
    displayedPrs: ref(prs),
    filterState: ref("open" as const),
    filterMode: ref("all" as const),
    error: ref<string | null>(null),
    errorAction: ref<string | null>(null),
    forgeWebUrl: ref<string | null>(null),
    forgeLabel: ref("GitHub"),
    success: ref<string | null>(null),
    currentUser: ref(""),
    currentUserLoading: ref(false),
    currentUserError: ref<string | null>(null),
    prSupported: ref(true),
    showCreateForm: ref(false),
    selectedPr: ref<FakePr | null>(null),
    hasMore: ref(false),
    loadingMore: ref(false),
    timeAgo: (s: string) => s,
    selectPr: vi.fn(),
    loadPrs: vi.fn(),
    loadCurrentUser: vi.fn(),
    refreshDockPrCount: vi.fn(),
    loadMorePrs: vi.fn(),
    init: vi.fn(),
  };
  return panel as unknown as PrPanelState;
}

function mountSidebar(prs: FakePr[]): { app: App; container: HTMLDivElement } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const app = createApp(PrListSidebar);
  app.provide(PR_PANEL_KEY, fakePanel(prs));
  app.mount(container);
  return { app, container };
}

function unmount({ app, container }: { app: App; container: HTMLDivElement }): void {
  app.unmount();
  if (container.parentNode) container.parentNode.removeChild(container);
}

afterEach(() => {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

describe("PrListSidebar, auto-merge badge", () => {
  it("badges only the PR whose auto-merge is armed", async () => {
    const mounted = mountSidebar([
      fakePr({ number: 1, title: "armed", autoMerge: { armed: true, available: true, reason: null } }),
      fakePr({ number: 2, title: "plain", autoMerge: { armed: false, available: true, reason: null } }),
    ]);
    await nextTick();

    const badges = mounted.container.querySelectorAll(".pls-automerge-chip");
    expect(badges).toHaveLength(1);
    expect(badges[0].closest(".pls-item")?.querySelector(".pls-num")?.textContent).toBe("#1");

    unmount(mounted);
  });

  it("shows no badge at all when no PR is armed", async () => {
    const mounted = mountSidebar([
      fakePr({ number: 1, autoMerge: { armed: false, available: true, reason: null } }),
    ]);
    await nextTick();

    expect(mounted.container.querySelectorAll(".pls-automerge-chip")).toHaveLength(0);

    unmount(mounted);
  });
});
