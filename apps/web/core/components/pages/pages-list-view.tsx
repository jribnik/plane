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
import { PagesListHeaderRoot } from "./header";
import { PagesListMainContent } from "./pages-list-main-content";

type TPageView = {
  children: React.ReactNode;
  pageType: TPageNavigationTabs;
  projectId: string;
  // Narrowed to PROJECT (rather than the general EPageStoreType) since this component is
  // inherently project-scoped: it requires `projectId` and calls the 3-arg
  // `fetchPagesList(workspaceSlug, projectId, pageType)`. The workspace-wiki equivalent is
  // WikiListView (core/components/pages/wiki/list-view.tsx), not a parameterization of this one.
  storeType: EPageStoreType.PROJECT;
  workspaceSlug: string;
};

export const PagesListView = observer(function PagesListView(props: TPageView) {
  const { children, pageType, projectId, storeType, workspaceSlug } = props;
  // store hooks
  const { isAnyPageAvailable, fetchPagesList } = usePageStore(storeType);
  // fetching pages list
  useSWR(
    workspaceSlug && projectId && pageType ? `PROJECT_PAGES_${projectId}` : null,
    workspaceSlug && projectId && pageType ? () => fetchPagesList(workspaceSlug, projectId, pageType) : null
  );

  // pages loader
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* tab header */}
      {isAnyPageAvailable && (
        <PagesListHeaderRoot
          pageType={pageType}
          projectId={projectId}
          storeType={storeType}
          workspaceSlug={workspaceSlug}
        />
      )}
      <PagesListMainContent pageType={pageType} storeType={storeType}>
        {children}
      </PagesListMainContent>
    </div>
  );
});
