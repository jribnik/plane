import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useLabelAutoRefresh } from "./use-label-auto-refresh";

// Mock the useLabel hook - must return promises
const mockRefreshProjectLabels = vi.fn(() => Promise.resolve());
const mockRefreshWorkspaceLabels = vi.fn(() => Promise.resolve());

vi.mock("@/hooks/store/use-label", () => ({
  useLabel: () => ({
    refreshProjectLabels: mockRefreshProjectLabels,
    refreshWorkspaceLabels: mockRefreshWorkspaceLabels,
  }),
}));

describe("useLabelAutoRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should not refresh when disabled", () => {
    renderHook(() =>
      useLabelAutoRefresh({
        workspaceSlug: "workspace-1",
        projectId: "project-1",
        enabled: false,
      })
    );

    // Fast-forward time
    vi.advanceTimersByTime(35000);

    expect(mockRefreshProjectLabels).not.toHaveBeenCalled();
  });

  it("should refresh project labels when enabled", () => {
    renderHook(() =>
      useLabelAutoRefresh({
        workspaceSlug: "workspace-1",
        projectId: "project-1",
        enabled: true,
      })
    );

    // Fast-forward past the default interval (30 seconds)
    vi.advanceTimersByTime(30000);

    expect(mockRefreshProjectLabels).toHaveBeenCalledWith("workspace-1", "project-1");
  });

  it("should not refresh when projectId is undefined", () => {
    renderHook(() =>
      useLabelAutoRefresh({
        workspaceSlug: "workspace-1",
        projectId: undefined,
        enabled: true,
      })
    );

    vi.advanceTimersByTime(30000);

    // Should not refresh when projectId is missing
    expect(mockRefreshProjectLabels).not.toHaveBeenCalled();
    expect(mockRefreshWorkspaceLabels).not.toHaveBeenCalled();
  });

  it("should use custom interval when provided", () => {
    renderHook(() =>
      useLabelAutoRefresh({
        workspaceSlug: "workspace-1",
        projectId: "project-1",
        enabled: true,
        intervalMs: 10000, // 10 seconds
      })
    );

    // Before interval
    vi.advanceTimersByTime(9000);
    expect(mockRefreshProjectLabels).not.toHaveBeenCalled();

    // After interval
    vi.advanceTimersByTime(1000);
    expect(mockRefreshProjectLabels).toHaveBeenCalledTimes(1);
  });

  it("should refresh multiple times at the specified interval", () => {
    renderHook(() =>
      useLabelAutoRefresh({
        workspaceSlug: "workspace-1",
        projectId: "project-1",
        enabled: true,
        intervalMs: 10000,
      })
    );

    // First refresh
    vi.advanceTimersByTime(10000);
    expect(mockRefreshProjectLabels).toHaveBeenCalledTimes(1);

    // Second refresh
    vi.advanceTimersByTime(10000);
    expect(mockRefreshProjectLabels).toHaveBeenCalledTimes(2);

    // Third refresh
    vi.advanceTimersByTime(10000);
    expect(mockRefreshProjectLabels).toHaveBeenCalledTimes(3);
  });

  it("should stop refreshing when unmounted", () => {
    const { unmount } = renderHook(() =>
      useLabelAutoRefresh({
        workspaceSlug: "workspace-1",
        projectId: "project-1",
        enabled: true,
      })
    );

    unmount();

    // Advance time after unmount
    vi.advanceTimersByTime(60000);

    // Should not have been called since it was cleaned up
    expect(mockRefreshProjectLabels).not.toHaveBeenCalled();
  });

  it("should restart interval when enabled changes from false to true", () => {
    const { rerender } = renderHook(
      ({ enabled }) =>
        useLabelAutoRefresh({
          workspaceSlug: "workspace-1",
          projectId: "project-1",
          enabled,
        }),
      { initialProps: { enabled: false } }
    );

    // No refresh when disabled
    vi.advanceTimersByTime(30000);
    expect(mockRefreshProjectLabels).not.toHaveBeenCalled();

    // Enable it
    rerender({ enabled: true });

    // Should now refresh
    vi.advanceTimersByTime(30000);
    expect(mockRefreshProjectLabels).toHaveBeenCalledTimes(1);
  });

  it("should stop refreshing when enabled changes from true to false", () => {
    const { rerender } = renderHook(
      ({ enabled }) =>
        useLabelAutoRefresh({
          workspaceSlug: "workspace-1",
          projectId: "project-1",
          enabled,
        }),
      { initialProps: { enabled: true } }
    );

    // First refresh
    vi.advanceTimersByTime(30000);
    expect(mockRefreshProjectLabels).toHaveBeenCalledTimes(1);

    // Disable it
    rerender({ enabled: false });

    // Should not refresh anymore
    vi.advanceTimersByTime(60000);
    expect(mockRefreshProjectLabels).toHaveBeenCalledTimes(1); // Still 1
  });

  it("should not refresh when workspaceSlug is undefined", () => {
    renderHook(() =>
      useLabelAutoRefresh({
        workspaceSlug: undefined,
        projectId: "project-1",
        enabled: true,
      })
    );

    vi.advanceTimersByTime(30000);

    expect(mockRefreshProjectLabels).not.toHaveBeenCalled();
    expect(mockRefreshWorkspaceLabels).not.toHaveBeenCalled();
  });
});
