# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for the ``Label`` model's workspace-scoped ("global") label support.

Regression coverage for the Phase 1 backend work that lets a ``Label`` live
directly on a ``Workspace`` (``project`` is NULL):

* The old unique constraint was scoped to ``fields=["name"]`` (with no
  workspace in it), so only one workspace on the whole deployment could ever
  have a workspace-scoped label named e.g. "Bug". The fix scopes it to
  ``fields=["workspace", "name"]``.
* A workspace-scoped label and a project-scoped label may share a name (no
  cross-scope uniqueness check).
* A label's ``parent`` must be in the same scope (workspace vs project) as
  the label itself.
"""

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from plane.db.models import Label, Project, Workspace


@pytest.fixture
def project(db, workspace, create_user):
    """A project in the fixture workspace."""
    return Project.objects.create(
        name="Test Project",
        identifier="TP",
        workspace=workspace,
        created_by=create_user,
    )


@pytest.fixture
def other_workspace(db, create_user):
    """A second, independent workspace."""
    return Workspace.objects.create(
        name="Other Workspace",
        slug="other-workspace",
        owner=create_user,
    )


@pytest.mark.unit
class TestLabelWorkspaceScopeUniqueness:
    """Regression coverage for the workspace+name unique constraint fix."""

    @pytest.mark.django_db
    def test_two_workspaces_can_each_have_a_bug_label(self, workspace, other_workspace):
        """Two different workspaces must independently be able to have a
        workspace-scoped label named "Bug" -- this is the core bug fix."""
        label_one = Label.objects.create(name="Bug", workspace=workspace)
        label_two = Label.objects.create(name="Bug", workspace=other_workspace)

        assert label_one.id != label_two.id
        assert label_one.project_id is None
        assert label_two.project_id is None
        assert label_one.workspace_id != label_two.workspace_id

    @pytest.mark.django_db
    def test_duplicate_workspace_label_name_within_same_workspace_rejected(self, workspace):
        """Within a single workspace, workspace-scoped label names still must be unique."""
        Label.objects.create(name="Bug", workspace=workspace)

        with pytest.raises(IntegrityError):
            with transaction.atomic():
                Label.objects.create(name="Bug", workspace=workspace)

    @pytest.mark.django_db
    def test_workspace_label_and_project_label_can_share_a_name(self, workspace, project):
        """A workspace-scoped label and a project-scoped label may share a name."""
        workspace_label = Label.objects.create(name="Bug", workspace=workspace)
        project_label = Label.objects.create(name="Bug", workspace=workspace, project=project)

        assert workspace_label.id != project_label.id
        assert workspace_label.project_id is None
        assert project_label.project_id == project.id


@pytest.mark.unit
class TestLabelSortOrder:
    """Regression coverage for the sort_order scoping fix in Label.save()."""

    @pytest.mark.django_db
    def test_workspace_label_sort_order_scoped_to_workspace(self, workspace, other_workspace, project):
        """Creating a workspace label must not be perturbed by labels in other
        workspaces/projects (the old code scanned every label on the deployment)."""
        # A project label with a very high sort_order in the same workspace,
        # and a workspace label in a completely different workspace.
        project_label_sort_order = 999999
        Label.objects.create(
            name="Project label", workspace=workspace, project=project, sort_order=project_label_sort_order
        )
        Label.objects.create(name="Other workspace label", workspace=other_workspace, sort_order=999999)

        first_workspace_label = Label.objects.create(name="First workspace label", workspace=workspace)

        # Should get the model default sort_order since there are no prior
        # *workspace-scoped* labels in this workspace, unaffected by the
        # unrelated project label or the other workspace's label.
        assert first_workspace_label.sort_order == 65535

        second_workspace_label = Label.objects.create(name="Second workspace label", workspace=workspace)
        assert second_workspace_label.sort_order == first_workspace_label.sort_order + 10000


@pytest.mark.unit
class TestLabelParentScopeGuard:
    """Regression coverage for the parent cross-scope guard."""

    @pytest.mark.django_db
    def test_workspace_label_parented_to_project_label_rejected(self, workspace, project):
        project_label = Label.objects.create(name="Parent", workspace=workspace, project=project)

        with pytest.raises(ValidationError):
            Label.objects.create(name="Child", workspace=workspace, parent=project_label)

    @pytest.mark.django_db
    def test_project_label_parented_to_workspace_label_rejected(self, workspace, project):
        workspace_label = Label.objects.create(name="Parent", workspace=workspace)

        with pytest.raises(ValidationError):
            Label.objects.create(name="Child", workspace=workspace, project=project, parent=workspace_label)

    @pytest.mark.django_db
    def test_same_scope_parent_allowed(self, workspace):
        parent = Label.objects.create(name="Parent", workspace=workspace)
        child = Label.objects.create(name="Child", workspace=workspace, parent=parent)

        assert child.parent_id == parent.id
