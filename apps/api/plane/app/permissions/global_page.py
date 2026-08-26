# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework.permissions import BasePermission, SAFE_METHODS

from plane.db.models import Page, WorkspaceMember
from plane.app.permissions.base import ROLE


# Permission Mappings for workspace members
ADMIN = ROLE.ADMIN.value
MEMBER = ROLE.MEMBER.value
GUEST = ROLE.GUEST.value


class GlobalPagePermission(BasePermission):
    """
    Custom permission to control access to global (workspace-wide) pages.

    This is a brand new, additive code path for pages that belong to no
    project (Page.is_global=True, zero linked projects). It is completely
    separate from ProjectPagePermission (plane/app/permissions/page.py),
    which was hardened against GHSA-g49r / GHSA-ghcr, and must never be used
    as a substitute for it or weaken it in any way.

    Unlike project pages, global pages are not readable by workspace GUESTs:
    there is no per-project scoping hatch to limit a guest's exposure at the
    workspace level, so read access is restricted to ADMIN and MEMBER.
    """

    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        user_id = request.user.id
        slug = view.kwargs.get("slug")
        page_id = view.kwargs.get("page_id")

        role = self._get_workspace_role(request, slug)
        if role is None:
            return False

        if page_id:
            # Scope the page to the workspace in the URL, and require it to
            # actually be a global page. This is the core isolation boundary:
            # a member of workspace A must never be able to reach a page that
            # belongs to workspace B, regardless of what page_id is in the URL.
            page = Page.objects.filter(id=page_id, workspace__slug=slug, is_global=True).first()
            if page is None:
                return False

            # Fail-closed re-check: never trust the is_global flag alone. A
            # page must not be reachable through the wiki routes if it is
            # actually linked to a project, regardless of what its is_global
            # flag says (it could theoretically be stale/corrupted).
            if page.project_pages.filter(deleted_at__isnull=True).exists():
                return False

            # Allow access if the user is the owner of the page
            if page.owned_by_id == user_id:
                return True

            # Handle private page access: only the owner can access it.
            if page.access == Page.PRIVATE_ACCESS:
                return False

        return self._check_role_action_access(request, role)

    def _get_workspace_role(self, request, slug):
        """
        Resolve the requester's active WorkspaceMember role for the workspace
        named by `slug`. Returns None if there is no active membership.
        """
        return (
            WorkspaceMember.objects.filter(member=request.user, workspace__slug=slug, is_active=True)
            .values_list("role", flat=True)
            .first()
        )

    def _check_role_action_access(self, request, role):
        method = request.method

        # POST: Admins and members can create pages
        if method == "POST":
            return role in [ADMIN, MEMBER]

        # Safe methods (GET, HEAD, OPTIONS): Admins and members only.
        # Deliberately excludes GUEST (see class docstring).
        if method in SAFE_METHODS:
            return role in [ADMIN, MEMBER]

        # PUT/PATCH: Admins and members can update
        if method in ["PUT", "PATCH"]:
            return role in [ADMIN, MEMBER]

        # DELETE: Only admins can delete
        if method == "DELETE":
            return role == ADMIN

        # Deny by default
        return False
