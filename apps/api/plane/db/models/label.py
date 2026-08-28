# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from .workspace import WorkspaceBaseModel


class Label(WorkspaceBaseModel):
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="parent_label",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=255, blank=True)
    sort_order = models.FloatField(default=65535)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        constraints = [
            # Enforce uniqueness of workspace and name when project is NULL and deleted_at is NULL
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=Q(project__isnull=True, deleted_at__isnull=True),
                name="unique_workspace_name_when_project_null_and_not_deleted",
            ),
            # Enforce uniqueness of project and name when project is not NULL and deleted_at is NULL
            models.UniqueConstraint(
                fields=["project", "name"],
                condition=Q(project__isnull=False, deleted_at__isnull=True),
                name="unique_project_name_when_not_deleted",
            ),
        ]
        verbose_name = "Label"
        verbose_name_plural = "Labels"
        db_table = "labels"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        # Guard against a label being parented to a label in a different scope
        # (workspace label parented under a project label, or vice versa).
        if self.parent_id and self.parent.project_id != self.project_id:
            raise ValidationError("Parent label must belong to the same scope (workspace or project) as this label")

        if self._state.adding:
            if self.project_id:
                # Get the maximum sequence value from the database
                last_id = Label.objects.filter(project=self.project).aggregate(largest=models.Max("sort_order"))[
                    "largest"
                ]
            else:
                # Workspace-scoped label: scope the sort_order query to the
                # workspace's own workspace-scoped labels instead of scanning
                # every workspace's labels.
                last_id = Label.objects.filter(workspace_id=self.workspace_id, project__isnull=True).aggregate(
                    largest=models.Max("sort_order")
                )["largest"]
            # if last_id is not None
            if last_id is not None:
                self.sort_order = last_id + 10000

        super(Label, self).save(*args, **kwargs)

    def __str__(self):
        return str(self.name)
