/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { layout, route } from "@react-router/dev/routes";
import type { RouteConfigEntry } from "@react-router/dev/routes";

// Routes added here are deep-merged into the matching core.ts layout (by file path) via
// mergeRoutes (see ./helper.ts) - the wrapper layout() calls below exist only to locate the
// correct nesting point (`(projects)/layout.tsx`, i.e. the workspace-scoped app shell that
// renders the sidebar) without editing core.ts directly.
export const extendedRoutes: RouteConfigEntry[] = [
  layout("./(all)/layout.tsx", [
    layout("./(all)/[workspaceSlug]/layout.tsx", [
      layout("./(all)/[workspaceSlug]/(projects)/layout.tsx", [
        // Wiki - global (workspace-wide) pages
        layout("./(all)/[workspaceSlug]/(projects)/wiki/layout.tsx", [
          route(":workspaceSlug/wiki", "./(all)/[workspaceSlug]/(projects)/wiki/page.tsx"),
          route(":workspaceSlug/wiki/:pageId", "./(all)/[workspaceSlug]/(projects)/wiki/[pageId]/page.tsx"),
        ]),
      ]),
    ]),
  ]),
];
