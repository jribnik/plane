# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone

# Django imports
from django.db import models
from django.db.models import Q

# Module imports
from plane.utils.html_processor import strip_tags

from .base import BaseModel


def get_view_props():
    return {"full_width": False}


class Page(BaseModel):
    PRIVATE_ACCESS = 1
    PUBLIC_ACCESS = 0
    DEFAULT_SORT_ORDER = 65535

    ACCESS_CHOICES = ((PRIVATE_ACCESS, "Private"), (PUBLIC_ACCESS, "Public"))

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="pages")
    name = models.TextField(blank=True)
    description_json = models.JSONField(default=dict, blank=True)
    description_binary = models.BinaryField(null=True)
    description_html = models.TextField(blank=True, default="<p></p>")
    description_stripped = models.TextField(blank=True, null=True)
    owned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="pages")
    access = models.PositiveSmallIntegerField(choices=((0, "Public"), (1, "Private")), default=0)
    color = models.CharField(max_length=255, blank=True)
    labels = models.ManyToManyField("db.Label", blank=True, related_name="pages", through="db.PageLabel")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="child_page",
    )
    archived_at = models.DateField(null=True)
    is_locked = models.BooleanField(default=False)
    view_props = models.JSONField(default=get_view_props)
    logo_props = models.JSONField(default=dict)
    is_global = models.BooleanField(default=False)
    projects = models.ManyToManyField("db.Project", related_name="pages", through="db.ProjectPage")
    moved_to_page = models.UUIDField(null=True, blank=True)
    moved_to_project = models.UUIDField(null=True, blank=True)
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER)

    external_id = models.CharField(max_length=255, null=True, blank=True)
    external_source = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = "Page"
        verbose_name_plural = "Pages"
        db_table = "pages"
        ordering = ("-created_at",)
        indexes = [
            models.Index(
                fields=["workspace", "is_global"],
                condition=Q(is_global=True),
                name="page_workspace_global_idx",
            ),
        ]

    def __str__(self):
        """Return owner email and page name"""
        return f"{self.owned_by.email} <{self.name}>"

    @classmethod
    def from_db(cls, db, field_names, values):
        instance = super().from_db(db, field_names, values)
        # Stash the parent as loaded from the database so save() can cheaply
        # tell whether `parent` actually changed on this instance, without
        # requiring a query on every autosave.
        instance._loaded_parent_id = instance.parent_id
        return instance

    def save(self, *args, **kwargs):
        # A page's parent must live in the same scope: a global page can only
        # be parented under another global page, and a project page can only
        # be parented under another project page. Only re-check when `parent`
        # is actually changing (new page with a parent, or an existing page
        # whose parent field changed) since save() runs on every editor
        # autosave via the description-update path and must stay fast.
        if self.parent_id is not None:
            if self.parent_id == self.pk:
                raise ValidationError("A page cannot be set as its own parent.")

            if self._state.adding or self.parent_id != getattr(self, "_loaded_parent_id", None):
                parent_is_global = (
                    Page.objects.filter(pk=self.parent_id).values_list("is_global", flat=True).first()
                )
                if parent_is_global is not None and parent_is_global != self.is_global:
                    raise ValidationError(
                        "A page's parent must be in the same scope: a global page cannot be "
                        "parented under a project page, and a project page cannot be parented "
                        "under a global page."
                    )

        # Strip the html tags using html parser
        self.description_stripped = (
            None
            if (self.description_html == "" or self.description_html is None)
            else strip_tags(self.description_html)
        )
        super(Page, self).save(*args, **kwargs)


class PageLog(BaseModel):
    TYPE_CHOICES = (
        ("to_do", "To Do"),
        ("issue", "issue"),
        ("image", "Image"),
        ("video", "Video"),
        ("file", "File"),
        ("link", "Link"),
        ("cycle", "Cycle"),
        ("module", "Module"),
        ("back_link", "Back Link"),
        ("forward_link", "Forward Link"),
        ("page_mention", "Page Mention"),
        ("user_mention", "User Mention"),
    )
    transaction = models.UUIDField(default=uuid.uuid4)
    page = models.ForeignKey(Page, related_name="page_log", on_delete=models.CASCADE)
    entity_identifier = models.UUIDField(null=True, blank=True)
    entity_name = models.CharField(max_length=30, verbose_name="Transaction Type")
    entity_type = models.CharField(max_length=30, verbose_name="Entity Type", null=True, blank=True)
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="workspace_page_log")

    class Meta:
        unique_together = ["page", "transaction"]
        verbose_name = "Page Log"
        verbose_name_plural = "Page Logs"
        db_table = "page_logs"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["entity_type"], name="pagelog_entity_type_idx"),
            models.Index(fields=["entity_identifier"], name="pagelog_entity_id_idx"),
            models.Index(fields=["entity_name"], name="pagelog_entity_name_idx"),
            models.Index(fields=["entity_type", "entity_identifier"], name="pagelog_type_id_idx"),
            models.Index(fields=["entity_name", "entity_identifier"], name="pagelog_name_id_idx"),
        ]

    def __str__(self):
        return f"{self.page.name} {self.entity_name}"


class PageLabel(BaseModel):
    label = models.ForeignKey("db.Label", on_delete=models.CASCADE, related_name="page_labels")
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="page_labels")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="workspace_page_label")

    class Meta:
        verbose_name = "Page Label"
        verbose_name_plural = "Page Labels"
        db_table = "page_labels"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.page.name} {self.label.name}"


class ProjectPage(BaseModel):
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="project_pages")
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="project_pages")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="project_pages")

    class Meta:
        unique_together = ["project", "page", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "page"],
                condition=models.Q(deleted_at__isnull=True),
                name="project_page_unique_project_page_when_deleted_at_null",
            )
        ]
        verbose_name = "Project Page"
        verbose_name_plural = "Project Pages"
        db_table = "project_pages"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.project.name} {self.page.name}"


class PageVersion(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="page_versions")
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="page_versions")
    last_saved_at = models.DateTimeField(default=timezone.now)
    owned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="page_versions")
    description_binary = models.BinaryField(null=True)
    description_html = models.TextField(blank=True, default="<p></p>")
    description_stripped = models.TextField(blank=True, null=True)
    description_json = models.JSONField(default=dict, blank=True)
    sub_pages_data = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Page Version"
        verbose_name_plural = "Page Versions"
        db_table = "page_versions"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        # Strip the html tags using html parser
        self.description_stripped = (
            None
            if (self.description_html == "" or self.description_html is None)
            else strip_tags(self.description_html)
        )
        super(PageVersion, self).save(*args, **kwargs)
