/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
// constants
import { EPageAccess } from "@plane/constants";
// plane types
import { Button } from "@plane/propel/button";
import { PageIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ICustomSearchSelectOption, TPage } from "@plane/types";
// plane ui
import { Breadcrumbs, Header, BreadcrumbNavigationSearchDropdown } from "@plane/ui";
import { getPageName } from "@plane/utils";
// helpers
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PageAccessIcon } from "@/components/common/page-access-icon";
import { SwitcherIcon, SwitcherLabel } from "@/components/common/switcher-label";
import { PageHeaderActions } from "@/components/pages/header/actions";
import { PageSyncingBadge } from "@/components/pages/header/syncing-badge";
// plane web imports
import { EPageStoreType, usePageStore } from "@/hooks/store";

const storeType = EPageStoreType.WORKSPACE;

// Combines the two project-scoped headers (PagesListHeader for the list route,
// PageDetailsHeader for the detail route) into a single header component that
// conditionally renders based on whether `pageId` is present, since the wiki routes
// share a single layout.tsx (see the `workspace-views` route for the same pattern).
export const WikiHeader = observer(function WikiHeader() {
  // states
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  // router
  const router = useRouter();
  const { workspaceSlug, pageId } = useParams();
  const searchParams = useSearchParams();
  const pageType = searchParams.get("type");
  // store hooks
  const { canCurrentUserCreatePage, createPage, getPageById, getAllPageIds, loader } = usePageStore(storeType);
  // Reading directly off the store (rather than the shared `usePage` hook, which throws
  // when `pageId` is empty) because this header is shared between the list route (no
  // pageId) and the detail route (pageId present).
  const page = pageId ? getPageById(pageId.toString()) : undefined;

  const handleCreatePage = async () => {
    setIsCreatingPage(true);

    const payload: Partial<TPage> = {
      access: pageType === "private" ? EPageAccess.PRIVATE : EPageAccess.PUBLIC,
    };

    await createPage(payload)
      // oxlint-disable-next-line promise/always-return
      .then((res) => {
        router.push(`/${workspaceSlug}/wiki/${res?.id}`);
      })
      .catch((err) => {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: err?.data?.error || "Page could not be created. Please try again.",
        });
      })
      .finally(() => setIsCreatingPage(false));
  };

  // detail mode
  if (pageId && page) {
    const pageIds = getAllPageIds();
    const switcherOptions = pageIds
      .map((id) => {
        const _page = id === pageId ? page : getPageById(id);
        if (!_page) return;
        return {
          value: _page.id,
          query: _page.name,
          content: (
            <div className="flex items-center justify-between gap-2">
              <SwitcherLabel logo_props={_page.logo_props} name={getPageName(_page.name)} LabelIcon={PageIcon} />
              <PageAccessIcon {..._page} />
            </div>
          ),
        };
      })
      .filter((option) => option !== undefined) as ICustomSearchSelectOption[];

    return (
      <Header>
        <Header.LeftItem>
          <div>
            <Breadcrumbs>
              <Breadcrumbs.Item
                component={
                  <BreadcrumbLink
                    label="Wiki"
                    href={`/${workspaceSlug}/wiki`}
                    icon={<PageIcon className="h-4 w-4 text-tertiary" />}
                  />
                }
              />
              <Breadcrumbs.Item
                component={
                  <BreadcrumbNavigationSearchDropdown
                    selectedItem={pageId?.toString() ?? ""}
                    navigationItems={switcherOptions}
                    onChange={(value: string) => {
                      router.push(`/${workspaceSlug}/wiki/${value}`);
                    }}
                    title={getPageName(page?.name)}
                    icon={
                      <Breadcrumbs.Icon>
                        <SwitcherIcon logo_props={page.logo_props} LabelIcon={PageIcon} size={16} />
                      </Breadcrumbs.Icon>
                    }
                    isLast
                  />
                }
              />
            </Breadcrumbs>
          </div>
        </Header.LeftItem>
        <Header.RightItem>
          <PageSyncingBadge syncStatus={page.isSyncingWithServer} />
          <PageHeaderActions page={page} storeType={storeType} />
        </Header.RightItem>
      </Header>
    );
  }

  // list mode
  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs isLoading={loader === "init-loader"}>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label="Wiki"
                href={`/${workspaceSlug}/wiki`}
                icon={<PageIcon className="h-4 w-4 text-tertiary" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
      {canCurrentUserCreatePage && (
        <Header.RightItem>
          <Button variant="primary" size="lg" onClick={handleCreatePage} loading={isCreatingPage}>
            {isCreatingPage ? "Adding" : "Add page"}
          </Button>
        </Header.RightItem>
      )}
    </Header>
  );
});
