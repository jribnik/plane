/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useParams, useRouter } from "next/navigation";
import { EUserPermissionsLevel, EPageAccess, EUserPermissions } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPage, TPageNavigationTabs } from "@plane/types";
// components
import { PageLoader } from "@/components/pages/loaders/page-loader";
import { useUserPermissions } from "@/hooks/store/user";
// plane web hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";

type Props = {
  children: React.ReactNode;
  pageType: TPageNavigationTabs;
};

// Workspace-wiki equivalent of core/components/pages/pages-list-main-content.tsx
// (PagesListMainContent). Forked locally because the shared component hardcodes
// `useProject()`, `EPageStoreType.PROJECT` for page creation, project-level roles
// (EUserProjectRoles) and a project-scoped redirect href. Everything else (loader,
// empty states) mirrors the shared component's structure.
export const WikiListMainContent = observer(function WikiListMainContent(props: Props) {
  const { children, pageType } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const {
    isAnyPageAvailable,
    getCurrentProjectFilteredPageIdsByTab,
    getCurrentProjectPageIdsByTab,
    loader,
    createPage,
  } = usePageStore(EPageStoreType.WORKSPACE);
  const { allowPermissions } = useUserPermissions();
  // states
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  // router
  const router = useRouter();
  const { workspaceSlug } = useParams();
  // derived values
  const pageIds = getCurrentProjectPageIdsByTab(pageType);
  const filteredPageIds = getCurrentProjectFilteredPageIdsByTab(pageType);
  const canPerformEmptyStateActions = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  // handle page create
  const handleCreatePage = async () => {
    setIsCreatingPage(true);

    const payload: Partial<TPage> = {
      access: pageType === "private" ? EPageAccess.PRIVATE : EPageAccess.PUBLIC,
    };

    await createPage(payload)
      // oxlint-disable-next-line promise/always-return
      .then((res) => {
        const pageId = `/${workspaceSlug}/wiki/${res?.id}`;
        router.push(pageId);
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

  if (loader === "init-loader") return <PageLoader />;
  // if no pages exist in the active page type
  if (!isAnyPageAvailable || pageIds?.length === 0) {
    if (!isAnyPageAvailable) {
      return (
        <EmptyStateDetailed
          assetKey="page"
          title={t("project_empty_state.pages.title")}
          description={t("project_empty_state.pages.description")}
          actions={[
            {
              label: t("project_empty_state.pages.cta_primary"),
              onClick: () => {
                handleCreatePage();
              },
              variant: "primary",
              disabled: !canPerformEmptyStateActions || isCreatingPage,
            },
          ]}
        />
      );
    }
    if (pageType === "public")
      return (
        <EmptyStateDetailed
          assetKey="page"
          title={t("project_empty_state.pages.title")}
          description={t("project_empty_state.pages.description")}
          actions={[
            {
              label: t("project_empty_state.pages.cta_primary"),
              onClick: () => {
                handleCreatePage();
              },
              variant: "primary",
              disabled: !canPerformEmptyStateActions || isCreatingPage,
            },
          ]}
        />
      );
    if (pageType === "private")
      return (
        <EmptyStateDetailed
          assetKey="page"
          title={t("project_empty_state.pages.title")}
          description={t("project_empty_state.pages.description")}
          actions={[
            {
              label: t("project_empty_state.pages.cta_primary"),
              onClick: () => {
                handleCreatePage();
              },
              variant: "primary",
              disabled: !canPerformEmptyStateActions || isCreatingPage,
            },
          ]}
        />
      );
    if (pageType === "archived")
      return (
        <EmptyStateDetailed
          assetKey="page"
          title={t("project_empty_state.archive_pages.title")}
          description={t("project_empty_state.archive_pages.description")}
        />
      );
  }
  // if no pages match the filter criteria
  if (filteredPageIds?.length === 0)
    return (
      <EmptyStateDetailed
        assetKey="search"
        title={t("common_empty_state.search.title")}
        description={t("common_empty_state.search.description")}
      />
    );

  return <div className="h-full w-full overflow-hidden">{children}</div>;
});
