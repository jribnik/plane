# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for ``WorkspaceLabelViewSet`` (workspace-scoped "global" labels).

Covers the Phase 1+2 backend work that lets a ``Label`` live directly on a
``Workspace`` (no project):

* Only workspace admins may create workspace-scoped labels via
  ``/api/workspaces/<slug>/workspace-labels/``; other active members get 403.
* A workspace-scoped label can be assigned to an issue in any project within
  the workspace via ``PATCH .../issues/<pk>/``, and shows up when
  listing/filtering issues by label.
"""

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Issue,
    IssueLabel,
    Label,
    Project,
    ProjectMember,
    State,
    User,
    Workspace,
    WorkspaceMember,
)

WORKSPACE_LABELS_URL = "/api/workspaces/{slug}/workspace-labels/"
WORKSPACE_LABEL_DETAIL_URL = "/api/workspaces/{slug}/workspace-labels/{pk}/"
ISSUE_DETAIL_URL = "/api/workspaces/{slug}/projects/{project_id}/issues/{pk}/"
ISSUE_LIST_URL = "/api/workspaces/{slug}/projects/{project_id}/issues/"


@pytest.fixture
def project(db, workspace, create_user):
    """A project in the fixture workspace; ``create_user`` (workspace admin) is a member."""
    project = Project.objects.create(
        name="Test Project",
        identifier="TP",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    return project


@pytest.fixture
def other_project(db, workspace, create_user):
    """A second project in the same workspace."""
    project = Project.objects.create(
        name="Other Project",
        identifier="OP",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    return project


@pytest.fixture
def state(project, create_user):
    return State.objects.create(
        name="Todo",
        project=project,
        workspace=project.workspace,
        group="backlog",
        default=True,
        created_by=create_user,
    )


@pytest.fixture
def other_state(other_project, create_user):
    return State.objects.create(
        name="Todo",
        project=other_project,
        workspace=other_project.workspace,
        group="backlog",
        default=True,
        created_by=create_user,
    )


@pytest.fixture
def workspace_member_non_admin(db, workspace):
    """An active workspace MEMBER (role=15), not an admin."""
    unique_id = uuid4().hex[:8]
    user = User.objects.create(
        email=f"member-{unique_id}@plane.so",
        username=f"member_{unique_id}",
        first_name="Member",
        last_name="User",
    )
    user.set_password("test-password")
    user.save()
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    return user


@pytest.fixture
def non_admin_client(workspace_member_non_admin):
    client = APIClient()
    client.force_authenticate(user=workspace_member_non_admin)
    return client


@pytest.mark.contract
class TestWorkspaceLabelCreatePermissions:
    """Only workspace admins may create workspace-scoped labels."""

    @pytest.mark.django_db
    def test_non_admin_member_forbidden(self, non_admin_client, workspace):
        url = WORKSPACE_LABELS_URL.format(slug=workspace.slug)
        response = non_admin_client.post(url, {"name": "Bug"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN, (
            f"Got {response.status_code}: {getattr(response, 'data', None)!r}"
        )
        assert not Label.objects.filter(workspace=workspace, name="Bug").exists()

    @pytest.mark.django_db
    def test_admin_can_create(self, session_client, workspace):
        """``create_user`` is a workspace admin per the ``workspace`` fixture."""
        url = WORKSPACE_LABELS_URL.format(slug=workspace.slug)
        response = session_client.post(url, {"name": "Bug", "color": "#FF0000"}, format="json")

        assert response.status_code == status.HTTP_201_CREATED, (
            f"Got {response.status_code}: {getattr(response, 'data', None)!r}"
        )
        label = Label.objects.get(workspace=workspace, name="Bug")
        assert label.project_id is None

    @pytest.mark.django_db
    def test_admin_can_list(self, session_client, workspace):
        Label.objects.create(name="Bug", workspace=workspace)
        Label.objects.create(name="Feature", workspace=workspace)

        url = WORKSPACE_LABELS_URL.format(slug=workspace.slug)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        names = {row["name"] for row in response.data}
        assert names == {"Bug", "Feature"}

    @pytest.mark.django_db
    def test_non_admin_member_can_list(self, non_admin_client, workspace):
        """Any active workspace member may read workspace labels."""
        Label.objects.create(name="Bug", workspace=workspace)

        url = WORKSPACE_LABELS_URL.format(slug=workspace.slug)
        response = non_admin_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        names = {row["name"] for row in response.data}
        assert names == {"Bug"}

    @pytest.mark.django_db
    def test_non_admin_member_forbidden_from_delete(self, non_admin_client, session_client, workspace):
        label = Label.objects.create(name="Bug", workspace=workspace)
        url = WORKSPACE_LABEL_DETAIL_URL.format(slug=workspace.slug, pk=label.id)

        response = non_admin_client.delete(url)

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert Label.objects.filter(pk=label.id).exists()

    @pytest.mark.django_db
    def test_admin_can_delete(self, session_client, workspace):
        label = Label.objects.create(name="Bug", workspace=workspace)
        url = WORKSPACE_LABEL_DETAIL_URL.format(slug=workspace.slug, pk=label.id)

        response = session_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Label.objects.filter(pk=label.id).exists()


@pytest.mark.contract
class TestWorkspaceLabelAssignedToIssues:
    """A workspace-scoped label can be assigned to issues in any project of the workspace."""

    @pytest.mark.django_db
    def test_assign_workspace_label_to_issue_in_any_project(
        self, session_client, workspace, project, other_project, state, other_state
    ):
        workspace_label = Label.objects.create(name="Bug", workspace=workspace)

        issue_in_project = Issue.objects.create(
            name="Issue in project",
            project=project,
            workspace=workspace,
            state=state,
        )
        issue_in_other_project = Issue.objects.create(
            name="Issue in other project",
            project=other_project,
            workspace=workspace,
            state=other_state,
        )

        # Assign the workspace label to an issue in `project`.
        url = ISSUE_DETAIL_URL.format(slug=workspace.slug, project_id=project.id, pk=issue_in_project.id)
        response = session_client.patch(url, {"label_ids": [str(workspace_label.id)]}, format="json")
        assert response.status_code == status.HTTP_204_NO_CONTENT, (
            f"Got {response.status_code}: {getattr(response, 'data', None)!r}"
        )
        assert IssueLabel.objects.filter(issue=issue_in_project, label=workspace_label).exists(), (
            "Workspace label was not actually persisted on the issue in `project`"
        )

        # Assign the SAME workspace label to an issue in `other_project`.
        url = ISSUE_DETAIL_URL.format(slug=workspace.slug, project_id=other_project.id, pk=issue_in_other_project.id)
        response = session_client.patch(url, {"label_ids": [str(workspace_label.id)]}, format="json")
        assert response.status_code == status.HTTP_204_NO_CONTENT, (
            f"Got {response.status_code}: {getattr(response, 'data', None)!r}"
        )
        assert IssueLabel.objects.filter(issue=issue_in_other_project, label=workspace_label).exists(), (
            "Workspace label was not actually persisted on the issue in `other_project`"
        )

        # Filtering the first project's issue list by the workspace label
        # returns the issue.
        url = ISSUE_LIST_URL.format(slug=workspace.slug, project_id=project.id)
        response = session_client.get(url, {"labels": str(workspace_label.id)})
        assert response.status_code == status.HTTP_200_OK
        returned_ids = {str(row["id"]) for row in response.data["results"]}
        assert str(issue_in_project.id) in returned_ids

    @pytest.mark.django_db
    def test_out_of_scope_label_id_silently_dropped(self, db, session_client, workspace, project, state, create_user):
        """A label id that exists but belongs to neither the project nor the
        workspace (e.g. it's scoped to an unrelated workspace) is silently
        dropped, not turned into a hard validation error."""
        unrelated_workspace = Workspace.objects.create(
            name="Unrelated Workspace", slug="unrelated-workspace", owner=create_user
        )
        unrelated_label = Label.objects.create(name="Unrelated", workspace=unrelated_workspace)

        issue = Issue.objects.create(
            name="Issue",
            project=project,
            workspace=workspace,
            state=state,
        )

        url = ISSUE_DETAIL_URL.format(slug=workspace.slug, project_id=project.id, pk=issue.id)
        response = session_client.patch(url, {"label_ids": [str(unrelated_label.id)]}, format="json")

        assert response.status_code == status.HTTP_204_NO_CONTENT, (
            f"Got {response.status_code}: {getattr(response, 'data', None)!r}"
        )
        assert not IssueLabel.objects.filter(issue=issue).exists(), (
            "An out-of-scope label id should be silently dropped, not persisted"
        )
