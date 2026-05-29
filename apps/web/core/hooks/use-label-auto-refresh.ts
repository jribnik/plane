/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { useLabel } from "@/hooks/store/use-label";

interface UseLabelAutoRefreshOptions {
  workspaceSlug: string | undefined;
  projectId: string | null | undefined;
  enabled?: boolean;
  intervalMs?: number;
}

/**
 * Hook that automatically refreshes project labels at a specified interval
 * This is useful for picking up changes made by webhook automations without requiring a page reload
 *
 * @param options Configuration options
 * @param options.workspaceSlug The workspace slug
 * @param options.projectId The project ID to refresh labels for
 * @param options.enabled Whether auto-refresh is enabled (default: true)
 * @param options.intervalMs Refresh interval in milliseconds (default: 30000 = 30 seconds)
 *
 * @example
 * useLabelAutoRefresh({
 *   workspaceSlug: "my-workspace",
 *   projectId: "project-123",
 *   enabled: isDropdownOpen, // Only refresh when dropdown is open
 *   intervalMs: 15000 // Refresh every 15 seconds
 * });
 */
export const useLabelAutoRefresh = ({
  workspaceSlug,
  projectId,
  enabled = true,
  intervalMs = 30000,
}: UseLabelAutoRefreshOptions) => {
  const { refreshProjectLabels } = useLabel();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled || !workspaceSlug || !projectId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      refreshProjectLabels(workspaceSlug, projectId).catch((error) => {
        console.error("Failed to auto-refresh labels:", error);
      });
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [workspaceSlug, projectId, enabled, intervalMs, refreshProjectLabels]);
};
