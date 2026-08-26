/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
import type { TPageNavigationTabs } from "@plane/types";
// components
import { PageHead } from "@/components/core/page-title";
import { WikiListView } from "@/components/pages/wiki";
import { PagesListRoot } from "@/components/pages/list/root";
// plane web hooks
import { EPageStoreType } from "@/hooks/store";
import type { Route } from "./+types/page";

const getPageType = (pageType?: string | null): TPageNavigationTabs => {
  if (pageType === "private") return "private";
  if (pageType === "archived") return "archived";
  return "public";
};

function WorkspaceWikiPage({ params }: Route.ComponentProps) {
  const searchParams = useSearchParams();
  const type = searchParams.get("type");
  const { workspaceSlug } = params;
  // derived values
  const pageType = getPageType(type);

  return (
    <>
      <PageHead title="Wiki" />
      <WikiListView pageType={pageType} workspaceSlug={workspaceSlug}>
        <PagesListRoot pageType={pageType} storeType={EPageStoreType.WORKSPACE} />
      </WikiListView>
    </>
  );
}

export default observer(WorkspaceWikiPage);
