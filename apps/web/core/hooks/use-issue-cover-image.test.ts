import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { API_BASE_URL } from "@plane/constants";
import type { TIssueAttachment } from "@plane/types";
import { useIssueCoverImage } from "./use-issue-cover-image";

// The hook resolves URLs through getFileURL, which prefixes API_BASE_URL.
// Mirror that here so assertions hold regardless of the env's base URL.
const assetUrl = (path: string) => `${API_BASE_URL}${path}`;
const explicitCoverUrl = (attachmentId: string) =>
  assetUrl(
    `/api/assets/v2/workspaces/${WORKSPACE_SLUG}/projects/${PROJECT_ID}/issues/${ISSUE_ID}/attachments/${attachmentId}/`
  );

const mockGetIssueAttachments = vi.fn();

vi.mock("@/services/issue", () => ({
  IssueAttachmentService: class {
    getIssueAttachments = mockGetIssueAttachments;
  },
}));

const WORKSPACE_SLUG = "workspace-1";
const PROJECT_ID = "project-1";
const ISSUE_ID = "issue-1";

const makeAttachment = (name: string, overrides: Partial<TIssueAttachment> = {}): TIssueAttachment =>
  ({
    id: `att-${name}`,
    attributes: { name, size: 1024 },
    asset_url: `/api/assets/legacy/${name}`,
    issue_id: ISSUE_ID,
    ...overrides,
  }) as TIssueAttachment;

describe("useIssueCoverImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the URL deterministically from an explicit cover attachment id without fetching", () => {
    const { result } = renderHook(() =>
      useIssueCoverImage(WORKSPACE_SLUG, PROJECT_ID, ISSUE_ID, 3, undefined, "att-explicit")
    );

    expect(result.current.coverImageUrl).toBe(explicitCoverUrl("att-explicit"));
    expect(result.current.isLoading).toBe(false);
    expect(mockGetIssueAttachments).not.toHaveBeenCalled();
  });

  it("returns null and does not fetch when there is no explicit cover and no attachments", () => {
    const { result } = renderHook(() => useIssueCoverImage(WORKSPACE_SLUG, PROJECT_ID, ISSUE_ID, 0));

    expect(result.current.coverImageUrl).toBeNull();
    expect(mockGetIssueAttachments).not.toHaveBeenCalled();
  });

  it("falls back to scanning attachments for a cover-named file when no explicit id is set", async () => {
    mockGetIssueAttachments.mockResolvedValue([
      makeAttachment("diagram.png"),
      makeAttachment("cover.png"),
      makeAttachment("notes.pdf"),
    ]);

    const { result } = renderHook(() => useIssueCoverImage(WORKSPACE_SLUG, PROJECT_ID, ISSUE_ID, 3));

    await waitFor(() => expect(result.current.coverImageUrl).toBe(assetUrl("/api/assets/legacy/cover.png")));
    expect(mockGetIssueAttachments).toHaveBeenCalledWith(WORKSPACE_SLUG, PROJECT_ID, ISSUE_ID);
  });

  it("matches cover filenames case-insensitively", async () => {
    mockGetIssueAttachments.mockResolvedValue([makeAttachment("COVER-IMAGE.JPG")]);

    const { result } = renderHook(() => useIssueCoverImage(WORKSPACE_SLUG, PROJECT_ID, ISSUE_ID, 1));

    await waitFor(() => expect(result.current.coverImageUrl).toBe(assetUrl("/api/assets/legacy/COVER-IMAGE.JPG")));
  });

  it("resolves to null when no attachment matches a cover filename", async () => {
    mockGetIssueAttachments.mockResolvedValue([makeAttachment("cover-red.png"), makeAttachment("screenshot.png")]);

    const { result } = renderHook(() => useIssueCoverImage(WORKSPACE_SLUG, PROJECT_ID, ISSUE_ID, 2));

    await waitFor(() => expect(mockGetIssueAttachments).toHaveBeenCalled());
    expect(result.current.coverImageUrl).toBeNull();
  });

  it("prefers the explicit cover id over the filename fallback (no fetch)", () => {
    const { result } = renderHook(() =>
      useIssueCoverImage(WORKSPACE_SLUG, PROJECT_ID, ISSUE_ID, 5, undefined, "att-explicit")
    );

    expect(result.current.coverImageUrl).toBe(explicitCoverUrl("att-explicit"));
    expect(mockGetIssueAttachments).not.toHaveBeenCalled();
  });

  it("returns null when workspaceSlug is missing", () => {
    const { result } = renderHook(() =>
      useIssueCoverImage(undefined, PROJECT_ID, ISSUE_ID, 3, undefined, "att-explicit")
    );

    expect(result.current.coverImageUrl).toBeNull();
    expect(mockGetIssueAttachments).not.toHaveBeenCalled();
  });

  it("ignores a stale fetch that resolves after an explicit cover supersedes it", async () => {
    // First render starts a filename-scan fetch that we hold open.
    let resolveStaleFetch!: (value: TIssueAttachment[]) => void;
    mockGetIssueAttachments.mockImplementationOnce(
      () =>
        new Promise<TIssueAttachment[]>((resolve) => {
          resolveStaleFetch = resolve;
        })
    );

    const { result, rerender } = renderHook(
      ({ coverId }: { coverId?: string }) =>
        useIssueCoverImage(WORKSPACE_SLUG, PROJECT_ID, ISSUE_ID, 2, undefined, coverId),
      { initialProps: {} }
    );

    // An explicit cover id arrives (e.g. "Make cover image"), re-running the effect
    // and tearing down the in-flight scan via its cleanup guard.
    rerender({ coverId: "att-explicit" });
    expect(result.current.coverImageUrl).toBe(explicitCoverUrl("att-explicit"));

    // The now-stale scan resolves late; the guard must prevent it from clobbering.
    resolveStaleFetch([makeAttachment("cover.png")]);
    await Promise.resolve();

    expect(result.current.coverImageUrl).toBe(explicitCoverUrl("att-explicit"));
  });
});
