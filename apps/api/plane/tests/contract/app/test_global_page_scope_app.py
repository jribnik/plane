# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Security-focused contract tests for global (workspace-wide) wiki pages.

Global pages are a brand new, additive code path (GlobalPagePermission,
WorkspacePageViewSet, workspaces/<slug>/wiki/...) that sits *next to* the
existing project-page path guarded by ProjectPagePermission (hardened after
GHSA-g49r / GHSA-ghcr). These tests verify:

  * A member of one workspace can never reach a global page belonging to a
    different workspace, through any of the new wiki endpoints.
  * An inactive WorkspaceMember row does not grant access.
  * The permission class never trusts a stale/corrupted `is_global` flag: a
    page with an active ProjectPage link must be denied via the wiki routes
    even if `is_global=True` in the database (the fail-closed invariant the
    whole feature rests on).
  * Global pages are not reachable via the old project-scoped page routes,
    proving the existing (GHSA-fixed) permission path was not weakened.
  * Private-page and role-matrix behavior matches the product decisions
    (workspace GUESTs cannot read/create; only ADMIN can delete; owners can
    always act on their own page).
  * The parent cross-scope guard rejects mixing global and project-linked
    pages as parent/child, with a clean 400.
"""

import uuid

import pytest
from rest_framework import status

from plane.db.models import (
    Page,
    Project,
    ProjectMember,
    ProjectPage,
    User,
    Workspace,
    WorkspaceMember,
)

ADMIN = 20
MEMBER = 15
GUEST = 5


def _wiki_pages_url(slug, page_id=None, suffix=""):
    base = f"/api/workspaces/{slug}/wiki/pages/"
    if page_id:
        base += f"{page_id}/"
    return f"{base}{suffix}"


def _project_pages_url(slug, project_id, page_id=None):
    base = f"/api/workspaces/{slug}/projects/{project_id}/pages/"
    return f"{base}{page_id}/" if page_id else base


def _make_workspace(owner, slug):
    return Workspace.objects.create(name=slug, slug=slug, owner=owner)


def _add_member(workspace, user, role, is_active=True):
    return WorkspaceMember.objects.create(workspace=workspace, member=user, role=role, is_active=is_active)


def _make_global_page(workspace, owner, access=Page.PUBLIC_ACCESS, name="Global page"):
    return Page.objects.create(workspace=workspace, owned_by=owner, access=access, name=name, is_global=True)


def _make_project_page(workspace, project, owner, access=Page.PUBLIC_ACCESS, name="Project page"):
    page = Page.objects.create(workspace=workspace, owned_by=owner, access=access, name=name)
    ProjectPage.objects.create(workspace=workspace, project=project, page=page)
    return page


def _victim(email="victim@plane.so"):
    return User.objects.create(email=email, username=f"victim_{uuid.uuid4().hex[:8]}")


@pytest.mark.contract
class TestGlobalPageCrossWorkspaceIsolation:
    """The attacker (session_client / create_user) is an active MEMBER-or-above
    of workspace A only. The target global page belongs to workspace B."""

    def _setup(self, workspace, attacker):
        workspace_b = _make_workspace(attacker, "workspace-b")
        victim = _victim()
        _add_member(workspace_b, victim, ADMIN)

        # Attacker is an active admin of workspace A (the `workspace` fixture
        # already made them one) but has *no* membership row in workspace B.
        page_b = _make_global_page(workspace_b, victim)
        return workspace_b, victim, page_b

    @pytest.mark.django_db
    def test_retrieve_denied(self, session_client, workspace, create_user):
        """Resolving a page by page_id via a workspace slug the attacker does
        belong to, but which does not own the page, must be denied - the
        page lookup is scoped to workspace__slug=<url slug>."""
        _, _, page_b = self._setup(workspace, create_user)

        response = session_client.get(_wiki_pages_url(workspace.slug, page_b.id))
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

    @pytest.mark.django_db
    def test_description_denied(self, session_client, workspace, create_user):
        _, _, page_b = self._setup(workspace, create_user)

        response = session_client.get(_wiki_pages_url(workspace.slug, page_b.id, "description/"))
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

    @pytest.mark.django_db
    def test_versions_denied(self, session_client, workspace, create_user):
        _, _, page_b = self._setup(workspace, create_user)

        response = session_client.get(_wiki_pages_url(workspace.slug, page_b.id, "versions/"))
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

    @pytest.mark.django_db
    def test_patch_denied(self, session_client, workspace, create_user):
        _, _, page_b = self._setup(workspace, create_user)

        response = session_client.patch(_wiki_pages_url(workspace.slug, page_b.id), data={"name": "Pwned"})
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

    @pytest.mark.django_db
    def test_archive_denied(self, session_client, workspace, create_user):
        _, _, page_b = self._setup(workspace, create_user)

        response = session_client.post(_wiki_pages_url(workspace.slug, page_b.id, "archive/"))
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

    @pytest.mark.django_db
    def test_lock_denied(self, session_client, workspace, create_user):
        _, _, page_b = self._setup(workspace, create_user)

        response = session_client.post(_wiki_pages_url(workspace.slug, page_b.id, "lock/"))
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

    @pytest.mark.django_db
    def test_destroy_denied(self, session_client, workspace, create_user):
        _, _, page_b = self._setup(workspace, create_user)

        response = session_client.delete(_wiki_pages_url(workspace.slug, page_b.id))
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

    @pytest.mark.django_db
    def test_never_returns_200(self, session_client, workspace, create_user):
        """Sanity headline assertion: never a 200, across the read path."""
        _, _, page_b = self._setup(workspace, create_user)

        response = session_client.get(_wiki_pages_url(workspace.slug, page_b.id))
        assert response.status_code != status.HTTP_200_OK


@pytest.mark.contract
class TestGlobalPageInactiveMembershipIsolation:
    @pytest.mark.django_db
    def test_inactive_member_denied(self, session_client, workspace, create_user):
        """The attacker has a WorkspaceMember row for workspace B, but it is
        inactive. Access must still be denied."""
        workspace_b = _make_workspace(create_user, "workspace-b-inactive")
        victim = _victim()
        _add_member(workspace_b, victim, ADMIN)
        # Attacker has an *inactive* membership in workspace B.
        _add_member(workspace_b, create_user, ADMIN, is_active=False)

        page_b = _make_global_page(workspace_b, victim)

        response = session_client.get(_wiki_pages_url(workspace_b.slug, page_b.id))
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

        response = session_client.get(_wiki_pages_url(workspace_b.slug))
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)


@pytest.mark.contract
class TestGlobalPageFailClosedInvariant:
    """The single most important test in this file: the permission class
    must not trust a stale/corrupted is_global flag. A page that has an
    active ProjectPage link must be denied via the wiki routes even if
    is_global=True in the database."""

    @pytest.mark.django_db
    def test_stale_is_global_flag_denied_for_owner(self, session_client, workspace, create_user):
        project = Project.objects.create(name="Project A", identifier="PRJA", workspace=workspace)
        ProjectMember.objects.create(workspace=workspace, project=project, member=create_user, role=ADMIN)

        # A normal, actively project-linked page, owned by the requester.
        page = Page.objects.create(workspace=workspace, owned_by=create_user, access=Page.PUBLIC_ACCESS, name="P")
        ProjectPage.objects.create(workspace=workspace, project=project, page=page)

        # Simulate a corrupted/stale flag: bypass Page.save() entirely (which
        # doesn't validate is_global against ProjectPage links) via update().
        Page.objects.filter(pk=page.id).update(is_global=True)
        page.refresh_from_db()
        assert page.is_global is True
        assert page.project_pages.filter(deleted_at__isnull=True).exists()

        # Even though the requester is the workspace admin AND the page
        # owner, the wiki routes must deny access because the page is still
        # actively linked to a project.
        response = session_client.get(_wiki_pages_url(workspace.slug, page.id))
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

        response = session_client.patch(_wiki_pages_url(workspace.slug, page.id), data={"name": "x"})
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

        response = session_client.delete(_wiki_pages_url(workspace.slug, page.id))
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

        # And it must still be reachable, as normal, via the real
        # project-scoped route (the fail-closed check must not break the
        # legitimate project-page path).
        response = session_client.get(_project_pages_url(workspace.slug, project.id, page.id))
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.contract
class TestGlobalPageNotReachableViaProjectRoutes:
    """Proves the existing (GHSA-fixed) ProjectPagePermission path was not
    weakened: a genuinely global page (zero ProjectPage links) must not be
    servable through the old project-scoped page routes."""

    @pytest.mark.django_db
    def test_global_page_denied_via_project_route(self, session_client, workspace, create_user):
        project = Project.objects.create(name="Project A", identifier="PRJA", workspace=workspace)
        ProjectMember.objects.create(workspace=workspace, project=project, member=create_user, role=ADMIN)

        page = _make_global_page(workspace, create_user)

        response = session_client.get(_project_pages_url(workspace.slug, project.id, page.id))
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)
        assert response.status_code != status.HTTP_200_OK


@pytest.mark.contract
class TestGlobalPagePrivateAccess:
    @pytest.mark.django_db
    def test_private_page_denied_for_non_owner_member(self, session_client, workspace, create_user):
        victim = _victim()
        _add_member(workspace, victim, MEMBER)
        page = _make_global_page(workspace, victim, access=Page.PRIVATE_ACCESS)

        # create_user is a workspace ADMIN (via the `workspace` fixture) but
        # not the owner of this private page.
        response = session_client.get(_wiki_pages_url(workspace.slug, page.id))
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

    @pytest.mark.django_db
    def test_private_page_allowed_for_owner(self, session_client, workspace, create_user):
        page = _make_global_page(workspace, create_user, access=Page.PRIVATE_ACCESS)

        response = session_client.get(_wiki_pages_url(workspace.slug, page.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["id"] == str(page.id)


@pytest.mark.contract
class TestGlobalPageRoleMatrix:
    @pytest.mark.django_db
    def test_guest_cannot_read_or_create(self, session_client, workspace, create_user):
        guest = User.objects.create(email="guest@plane.so", username=f"guest_{uuid.uuid4().hex[:8]}")
        _add_member(workspace, guest, GUEST)
        page = _make_global_page(workspace, create_user)

        session_client.force_authenticate(user=guest)

        response = session_client.get(_wiki_pages_url(workspace.slug, page.id))
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

        response = session_client.post(_wiki_pages_url(workspace.slug), data={"name": "New page"})
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_member_can_create_and_read_but_not_delete(self, session_client, workspace, create_user):
        member = User.objects.create(email="member@plane.so", username=f"member_{uuid.uuid4().hex[:8]}")
        _add_member(workspace, member, MEMBER)

        # A public page owned by someone else entirely (not the member, not
        # the admin) so the member's access goes through the role gate, not
        # the owner-bypass.
        victim = _victim()
        _add_member(workspace, victim, ADMIN)
        page = _make_global_page(workspace, victim)

        session_client.force_authenticate(user=member)

        response = session_client.post(_wiki_pages_url(workspace.slug), data={"name": "Member's page"})
        assert response.status_code == status.HTTP_201_CREATED

        response = session_client.get(_wiki_pages_url(workspace.slug, page.id))
        assert response.status_code == status.HTTP_200_OK

        response = session_client.delete(_wiki_pages_url(workspace.slug, page.id))
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_admin_can_do_everything_including_delete(self, session_client, workspace, create_user):
        # create_user is already a workspace ADMIN via the `workspace` fixture.
        victim = _victim()
        _add_member(workspace, victim, MEMBER)
        page = _make_global_page(workspace, victim)

        response = session_client.get(_wiki_pages_url(workspace.slug, page.id))
        assert response.status_code == status.HTTP_200_OK

        response = session_client.post(_wiki_pages_url(workspace.slug, page.id, "archive/"))
        assert response.status_code == status.HTTP_200_OK

        response = session_client.delete(_wiki_pages_url(workspace.slug, page.id))
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Page.objects.filter(pk=page.id).exists()


@pytest.mark.contract
class TestGlobalPageParentScopeGuard:
    @pytest.mark.django_db
    def test_global_page_parent_cannot_be_project_page(self, session_client, workspace, create_user):
        project = Project.objects.create(name="Project A", identifier="PRJA", workspace=workspace)
        ProjectMember.objects.create(workspace=workspace, project=project, member=create_user, role=ADMIN)

        project_page = _make_project_page(workspace, project, create_user)
        global_page = _make_global_page(workspace, create_user)

        response = session_client.patch(
            _wiki_pages_url(workspace.slug, global_page.id), data={"parent": str(project_page.id)}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_project_page_parent_cannot_be_global_page(self, session_client, workspace, create_user):
        project = Project.objects.create(name="Project A", identifier="PRJA", workspace=workspace)
        ProjectMember.objects.create(workspace=workspace, project=project, member=create_user, role=ADMIN)

        project_page = _make_project_page(workspace, project, create_user)
        global_page = _make_global_page(workspace, create_user)

        response = session_client.patch(
            _project_pages_url(workspace.slug, project.id, project_page.id),
            data={"parent": str(global_page.id)},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_global_page_cannot_be_its_own_parent(self, session_client, workspace, create_user):
        global_page = _make_global_page(workspace, create_user)

        response = session_client.patch(
            _wiki_pages_url(workspace.slug, global_page.id), data={"parent": str(global_page.id)}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
