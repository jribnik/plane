import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IIssueLabel } from "@plane/types";
import { LabelStore } from "./label.store";
import type { CoreRootStore } from "./root.store";

const mockGetProjectLabels = vi.fn();

vi.mock("@/services/issue", () => ({
  IssueLabelService: class {
    getProjectLabels = mockGetProjectLabels;
  },
}));

const PROJECT_ID = "project-1";
const WORKSPACE_SLUG = "workspace-1";

const makeLabel = (id: string, overrides: Partial<IIssueLabel> = {}): IIssueLabel =>
  ({
    id,
    name: `label-${id}`,
    project_id: PROJECT_ID,
    sort_order: 1,
    ...overrides,
  }) as IIssueLabel;

const makeRootStore = () =>
  ({
    router: { projectId: PROJECT_ID, workspaceSlug: WORKSPACE_SLUG },
    workspaceRoot: { currentWorkspace: undefined, getWorkspaceBySlug: () => undefined },
  }) as unknown as CoreRootStore;

describe("LabelStore.refreshProjectLabels", () => {
  let store: LabelStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new LabelStore(makeRootStore());
  });

  it("merges newly added labels into the store", async () => {
    mockGetProjectLabels.mockResolvedValue([makeLabel("a"), makeLabel("b")]);

    await store.refreshProjectLabels(WORKSPACE_SLUG, PROJECT_ID);

    expect(store.getProjectLabels(PROJECT_ID)?.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("prunes project labels missing from the server response", async () => {
    mockGetProjectLabels.mockResolvedValueOnce([makeLabel("a"), makeLabel("b")]);
    await store.refreshProjectLabels(WORKSPACE_SLUG, PROJECT_ID);

    // webhook removed label "b"
    mockGetProjectLabels.mockResolvedValueOnce([makeLabel("a")]);
    await store.refreshProjectLabels(WORKSPACE_SLUG, PROJECT_ID);

    expect(store.getProjectLabels(PROJECT_ID)?.map((l) => l.id)).toEqual(["a"]);
  });

  it("does not prune labels belonging to other projects", async () => {
    mockGetProjectLabels.mockResolvedValueOnce([makeLabel("a"), makeLabel("other", { project_id: "project-2" })]);
    await store.refreshProjectLabels(WORKSPACE_SLUG, PROJECT_ID);

    mockGetProjectLabels.mockResolvedValueOnce([makeLabel("a")]);
    await store.refreshProjectLabels(WORKSPACE_SLUG, PROJECT_ID);

    expect(store.getLabelById("other")).not.toBeNull();
  });

  it("never leaves the project label list empty mid-refresh (fetchedMap stays true)", async () => {
    mockGetProjectLabels.mockResolvedValueOnce([makeLabel("a")]);
    await store.refreshProjectLabels(WORKSPACE_SLUG, PROJECT_ID);

    let observedEmpty = false;
    mockGetProjectLabels.mockImplementationOnce(async () => {
      // simulate a consumer reading mid-flight, after invalidation would have run
      if ((store.getProjectLabels(PROJECT_ID)?.length ?? 0) === 0) observedEmpty = true;
      return [makeLabel("a"), makeLabel("b")];
    });
    await store.refreshProjectLabels(WORKSPACE_SLUG, PROJECT_ID);

    expect(observedEmpty).toBe(false);
    expect(store.getProjectLabels(PROJECT_ID)?.map((l) => l.id)).toEqual(["a", "b"]);
  });
});
