/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { PageIcon } from "@plane/propel/icons";
// components
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useUserPermissions } from "@/hooks/store/user";

type Props = {
  workspaceSlug: string;
};

// Standalone workspace-level nav item for the global wiki. Rendered directly in the sidebar
// tree (see apps/web/app/(all)/[workspaceSlug]/(projects)/sidebar.tsx) rather than through the
// WORKSPACE_SIDEBAR_*_NAVIGATION_ITEMS data-driven mechanism (packages/constants/src/workspace.ts
// + the icon switch in components/workspace/sidebar/helper.tsx + i18n JSON), since that would
// require touching several shared files for a single link. Gated to workspace ADMIN/MEMBER,
// matching the backend's GlobalPagePermission (read access excludes GUEST).
export const WikiMenuItem = observer(function WikiMenuItem(props: Props) {
  const { workspaceSlug } = props;
  const pathname = usePathname();
  const { allowPermissions } = useUserPermissions();
  const { toggleSidebar, isExtendedSidebarOpened, toggleExtendedSidebar } = useAppTheme();

  const canAccessWiki = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE,
    workspaceSlug
  );

  if (!canAccessWiki) return null;

  const href = `/${workspaceSlug}/wiki`;
  const isActive = pathname?.startsWith(href) ?? false;

  const handleLinkClick = () => {
    if (window.innerWidth < 768) toggleSidebar();
    if (isExtendedSidebarOpened) toggleExtendedSidebar(false);
  };

  return (
    <Link href={href} onClick={handleLinkClick}>
      <SidebarNavItem isActive={isActive}>
        <div className="flex items-center gap-1.5">
          <PageIcon className="size-4 flex-shrink-0" />
          <span className="text-13 font-medium">Wiki</span>
        </div>
      </SidebarNavItem>
    </Link>
  );
});
