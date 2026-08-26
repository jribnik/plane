# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import Page, PageLabel

from .page import PageSerializer


class WorkspacePageSerializer(PageSerializer):
    """
    Serializer for global (workspace-wide) pages: pages that belong to no
    project. Mirrors PageSerializer's create() but never creates a
    ProjectPage link, and always marks the created page as global.
    """

    def create(self, validated_data):
        labels = validated_data.pop("labels", None)
        # A global page is never linked to a project.
        validated_data.pop("project_ids", None)

        workspace_id = self.context["workspace_id"]
        owned_by_id = self.context["owned_by_id"]
        description_json = self.context["description_json"]
        description_binary = self.context["description_binary"]
        description_html = self.context["description_html"]

        # Create the page. is_global is set explicitly here (and only here) -
        # it is read-only on the serializer and never settable via the API.
        page = Page.objects.create(
            **validated_data,
            description_json=description_json,
            description_binary=description_binary,
            description_html=description_html,
            owned_by_id=owned_by_id,
            workspace_id=workspace_id,
            is_global=True,
        )

        # Create page labels
        if labels is not None:
            PageLabel.objects.bulk_create(
                [
                    PageLabel(
                        label=label,
                        page=page,
                        workspace_id=page.workspace_id,
                        created_by_id=page.created_by_id,
                        updated_by_id=page.updated_by_id,
                    )
                    for label in labels
                ],
                batch_size=10,
            )
        return page


class WorkspacePageDetailSerializer(WorkspacePageSerializer):
    description_html = serializers.CharField()

    class Meta(WorkspacePageSerializer.Meta):
        fields = WorkspacePageSerializer.Meta.fields + ["description_html"]
