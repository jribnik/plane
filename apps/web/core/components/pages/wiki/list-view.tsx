/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
import type { TPageNavigationTabs } from "@plane/types";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
// local imports
import { WikiListHeaderRoot } from "./header-root";
import { WikiListMainContent } from "./main-content";

type TWikiListView = {
  children: React.ReactNode;
  pageType: TPageNavigationTabs;
  workspaceSlug: string;
};

// Workspace-wiki equivalent of core/components/pages/pages-list-view.tsx (PagesListView).
// Forked locally because the shared component requires a `projectId` prop and hardcodes a
// `PROJECT_PAGES_${projectId}` SWR key plus a 3-arg `fetchPagesList(workspaceSlug, projectId, ...)`
// call. This mirrors its structure with the project scoping removed.
export const WikiListView = observer(function WikiListView(props: TWikiListView) {
  const { children, pageType, workspaceSlug } = props;
  // store hooks
  const { isAnyPageAvailable, fetchPagesList } = usePageStore(EPageStoreType.WORKSPACE);
  // fetching pages list
  useSWR(
    workspaceSlug && pageType ? `WORKSPACE_PAGES_${workspaceSlug}` : null,
    workspaceSlug && pageType ? () => fetchPagesList(workspaceSlug, pageType) : null
  );

  // pages loader
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* tab header */}
      {isAnyPageAvailable && <WikiListHeaderRoot pageType={pageType} workspaceSlug={workspaceSlug} />}
      <WikiListMainContent pageType={pageType}>{children}</WikiListMainContent>
    </div>
  );
});
