# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
from datetime import datetime
from django.core.serializers.json import DjangoJSONEncoder

# Django imports
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Exists, OuterRef, Q, Value, UUIDField, Count, Case, When, IntegerField
from django.http import StreamingHttpResponse
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models.functions import Coalesce

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import allow_permission, ROLE, GlobalPagePermission
from plane.app.serializers import (
    WorkspacePageSerializer,
    WorkspacePageDetailSerializer,
    PageVersionSerializer,
    PageVersionDetailSerializer,
    PageBinaryUpdateSerializer,
)
from plane.db.models import (
    Page,
    PageLog,
    PageVersion,
    UserFavorite,
    UserRecentVisit,
    Workspace,
    WorkspaceMember,
)
from plane.utils.error_codes import ERROR_CODES

# Local imports
from ..base import BaseAPIView, BaseViewSet
from plane.bgtasks.page_transaction_task import page_transaction
from plane.bgtasks.page_version_task import track_page_version
from plane.bgtasks.recent_visited_task import recent_visited_task
from plane.bgtasks.copy_s3_object import copy_s3_objects_of_description_and_assets

# Reuse the pure, page-id-keyed helper from the project-page view rather than
# duplicating the recursive-descendant SQL.
from .base import unarchive_archive_page_and_descendants


class WorkspacePageViewSet(BaseViewSet):
    """
    Global (workspace-wide) pages: pages that belong to no project. This is a
    completely separate code path from PageViewSet (plane/app/views/page/base.py)
    scoped to workspace + is_global=True instead of workspace + project.
    """

    serializer_class = WorkspacePageSerializer
    model = Page
    permission_classes = [GlobalPagePermission]
    search_fields = ["name"]

    def get_queryset(self):
        subquery = UserFavorite.objects.filter(
            user=self.request.user,
            entity_type="page",
            entity_identifier=OuterRef("pk"),
            workspace__slug=self.kwargs.get("slug"),
        )
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(is_global=True)
            .filter(parent__isnull=True)
            .filter(Q(owned_by=self.request.user) | Q(access=0))
            .select_related("workspace")
            .select_related("owned_by")
            .annotate(is_favorite=Exists(subquery))
            .order_by(self.request.GET.get("order_by", "-created_at"))
            .prefetch_related("labels")
            .order_by("-is_favorite", "-created_at")
            .annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "page_labels__label_id",
                        distinct=True,
                        filter=~Q(page_labels__label_id__isnull=True),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                )
            )
            .distinct()
        )

    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = WorkspacePageSerializer(
            data=request.data,
            context={
                "workspace_id": workspace.id,
                "owned_by_id": request.user.id,
                "description_json": request.data.get("description_json", {}),
                "description_binary": request.data.get("description_binary", None),
                "description_html": request.data.get("description_html", "<p></p>"),
            },
        )

        if serializer.is_valid():
            serializer.save()
            # capture the page transaction
            page_transaction.delay(
                new_description_html=request.data.get("description_html", "<p></p>"),
                old_description_html=None,
                page_id=serializer.data["id"],
            )
            page = self.get_queryset().get(pk=serializer.data["id"])
            serializer = WorkspacePageDetailSerializer(page)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def partial_update(self, request, slug, page_id):
        try:
            page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)
        except Page.DoesNotExist:
            return Response(
                {"error": "Access cannot be updated since this page is owned by someone else"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page.is_locked:
            return Response({"error": "Page is locked"}, status=status.HTTP_400_BAD_REQUEST)

        parent = request.data.get("parent", None)
        if parent:
            # Self-parent guard: reject cleanly with a 400 rather than
            # feeding the recursive-descendant SQL an infinite loop.
            if str(parent) == str(page_id):
                return Response(
                    {"error": "A page cannot be set as its own parent"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Parent-scope guard: a global page can only be parented under
            # another global page in the same workspace. Checked here (in
            # addition to the model-level guard in Page.save()) so a mismatch
            # returns a clean 400 instead of relying solely on the generic
            # ValidationError -> 400 mapping in handle_exception.
            parent_page = Page.objects.filter(pk=parent, workspace__slug=slug, is_global=True).first()
            if parent_page is None:
                return Response(
                    {"error": "The parent page must be a global page in the same workspace"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Only update access if the page owner is the requesting user
        if page.access != request.data.get("access", page.access) and page.owned_by_id != request.user.id:
            return Response(
                {"error": "Access cannot be updated since this page is owned by someone else"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = WorkspacePageDetailSerializer(page, data=request.data, partial=True)
        page_description = page.description_html
        if serializer.is_valid():
            try:
                serializer.save()
            except DjangoValidationError as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
            # capture the page transaction
            if request.data.get("description_html"):
                page_transaction.delay(
                    new_description_html=request.data.get("description_html", "<p></p>"),
                    old_description_html=page_description,
                    page_id=page_id,
                )

            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, slug, page_id=None):
        page = self.get_queryset().filter(pk=page_id).first()

        if page is None:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)

        track_visit = request.query_params.get("track_visit", "true").lower() == "true"

        issue_ids = PageLog.objects.filter(page_id=page_id, entity_name="issue").values_list(
            "entity_identifier", flat=True
        )
        data = WorkspacePageDetailSerializer(page).data
        data["issue_ids"] = issue_ids
        if track_visit:
            recent_visited_task.delay(
                slug=slug,
                entity_name="page",
                entity_identifier=page_id,
                user_id=request.user.id,
                project_id=None,
            )
        return Response(data, status=status.HTTP_200_OK)

    def lock(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

        page.is_locked = True
        page.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def unlock(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

        page.is_locked = False
        page.save()

        return Response(status=status.HTTP_204_NO_CONTENT)

    def access(self, request, slug, page_id):
        access = request.data.get("access", 0)
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

        # Only update access if the page owner is the requesting user
        if page.access != request.data.get("access", page.access) and page.owned_by_id != request.user.id:
            return Response(
                {"error": "Access cannot be updated since this page is owned by someone else"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        page.access = access
        page.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def list(self, request, slug):
        queryset = self.get_queryset()
        pages = WorkspacePageSerializer(queryset, many=True).data
        return Response(pages, status=status.HTTP_200_OK)

    def archive(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

        # only the owner or workspace admin can archive the page
        if (
            WorkspaceMember.objects.filter(
                workspace__slug=slug, member=request.user, is_active=True, role__lte=15
            ).exists()
            and request.user.id != page.owned_by_id
        ):
            return Response(
                {"error": "Only the owner or admin can archive the page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        UserFavorite.objects.filter(
            entity_type="page",
            entity_identifier=page_id,
            project=None,
            workspace__slug=slug,
        ).delete()

        unarchive_archive_page_and_descendants(page_id, datetime.now())

        return Response({"archived_at": str(datetime.now())}, status=status.HTTP_200_OK)

    def unarchive(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

        # only the owner or workspace admin can un archive the page
        if (
            WorkspaceMember.objects.filter(
                workspace__slug=slug, member=request.user, is_active=True, role__lte=15
            ).exists()
            and request.user.id != page.owned_by_id
        ):
            return Response(
                {"error": "Only the owner or admin can un archive the page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # if parent archived then page will be un archived breaking hierarchy
        if page.parent_id and page.parent.archived_at:
            page.parent = None
            page.save(update_fields=["parent"])

        unarchive_archive_page_and_descendants(page_id, None)

        return Response(status=status.HTTP_204_NO_CONTENT)

    def destroy(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

        if page.archived_at is None:
            return Response(
                {"error": "The page should be archived before deleting"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page.owned_by_id != request.user.id and (
            not WorkspaceMember.objects.filter(
                workspace__slug=slug,
                member=request.user,
                role=ROLE.ADMIN.value,
                is_active=True,
            ).exists()
        ):
            return Response(
                {"error": "Only admin or owner can delete the page"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # remove parent from all the children
        _ = Page.objects.filter(parent_id=page_id, workspace__slug=slug, is_global=True).update(parent=None)

        page.delete()
        # Delete the user favorite page
        UserFavorite.objects.filter(
            project=None,
            workspace__slug=slug,
            entity_identifier=page_id,
            entity_type="page",
        ).delete()
        # Delete the page from recent visit
        UserRecentVisit.objects.filter(
            project=None,
            workspace__slug=slug,
            entity_identifier=page_id,
            entity_name="page",
        ).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def summary(self, request, slug):
        queryset = (
            Page.objects.filter(workspace__slug=slug)
            .filter(is_global=True)
            .filter(parent__isnull=True)
            .filter(Q(owned_by=request.user) | Q(access=0))
            .distinct()
        )

        stats = queryset.aggregate(
            public_pages=Count(
                Case(
                    When(access=Page.PUBLIC_ACCESS, archived_at__isnull=True, then=1),
                    output_field=IntegerField(),
                )
            ),
            private_pages=Count(
                Case(
                    When(access=Page.PRIVATE_ACCESS, archived_at__isnull=True, then=1),
                    output_field=IntegerField(),
                )
            ),
            archived_pages=Count(Case(When(archived_at__isnull=False, then=1), output_field=IntegerField())),
        )

        return Response(stats, status=status.HTTP_200_OK)


class WorkspacePageFavoriteViewSet(BaseViewSet):
    model = UserFavorite

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug, page_id):
        workspace = Workspace.objects.get(slug=slug)
        _ = UserFavorite.objects.create(
            workspace=workspace,
            project=None,
            entity_identifier=page_id,
            entity_type="page",
            user=request.user,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def destroy(self, request, slug, page_id):
        page_favorite = UserFavorite.objects.get(
            project=None,
            user=request.user,
            workspace__slug=slug,
            entity_identifier=page_id,
            entity_type="page",
        )
        page_favorite.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspacePagesDescriptionViewSet(BaseViewSet):
    permission_classes = [GlobalPagePermission]

    def retrieve(self, request, slug, page_id):
        page = Page.objects.get(
            Q(owned_by=self.request.user) | Q(access=0),
            pk=page_id,
            workspace__slug=slug,
            is_global=True,
        )
        binary_data = page.description_binary

        def stream_data():
            if binary_data:
                yield binary_data
            else:
                yield b""

        response = StreamingHttpResponse(stream_data(), content_type="application/octet-stream")
        response["Content-Disposition"] = 'attachment; filename="page_description.bin"'
        return response

    def partial_update(self, request, slug, page_id):
        page = Page.objects.get(
            Q(owned_by=self.request.user) | Q(access=0),
            pk=page_id,
            workspace__slug=slug,
            is_global=True,
        )

        if page.is_locked:
            return Response(
                {
                    "error_code": ERROR_CODES["PAGE_LOCKED"],
                    "error_message": "PAGE_LOCKED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page.archived_at:
            return Response(
                {
                    "error_code": ERROR_CODES["PAGE_ARCHIVED"],
                    "error_message": "PAGE_ARCHIVED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Store the old description_html before saving (needed for both tasks)
        old_description_html = page.description_html

        # Serialize the existing instance
        existing_instance = json.dumps({"description_html": old_description_html}, cls=DjangoJSONEncoder)

        # Use serializer for validation and update
        serializer = PageBinaryUpdateSerializer(page, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()

            # Capture the page transaction
            if request.data.get("description_html"):
                page_transaction.delay(
                    new_description_html=request.data.get("description_html", "<p></p>"),
                    old_description_html=old_description_html,
                    page_id=page_id,
                )

            # Run background tasks
            track_page_version.delay(
                page_id=page_id,
                existing_instance=existing_instance,
                user_id=request.user.id,
            )
            return Response({"message": "Updated successfully"})
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class WorkspacePageVersionEndpoint(BaseAPIView):
    permission_classes = [GlobalPagePermission]

    def get(self, request, slug, page_id, pk=None):
        # Check if pk is provided
        if pk:
            # Return a single page version, scoped to a global page in this
            # workspace (mirrors the ProjectPage-link scoping in the
            # project-page version endpoint's GHSA fix).
            page_version = (
                PageVersion.objects.filter(
                    workspace__slug=slug,
                    page__is_global=True,
                    page_id=page_id,
                    pk=pk,
                )
                .distinct()
                .get()
            )
            # Serialize the page version
            serializer = PageVersionDetailSerializer(page_version)
            return Response(serializer.data, status=status.HTTP_200_OK)
        # Return all page versions scoped to a global page in this workspace.
        page_versions = PageVersion.objects.filter(
            workspace__slug=slug,
            page__is_global=True,
            page_id=page_id,
        )
        # Serialize the page versions
        serializer = PageVersionSerializer(page_versions, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspacePageDuplicateEndpoint(BaseAPIView):
    permission_classes = [GlobalPagePermission]

    def post(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

        # check for permission
        if page.access == Page.PRIVATE_ACCESS and page.owned_by_id != request.user.id:
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        page.pk = None
        page.name = f"{page.name} (Copy)"
        page.description_binary = None
        page.owned_by = request.user
        page.created_by = request.user
        page.updated_by = request.user
        page.is_global = True
        page.save()

        page_transaction.delay(
            new_description_html=page.description_html,
            old_description_html=None,
            page_id=page.id,
        )

        # Copy the s3 objects uploaded in the page. No project context - this
        # is a workspace-scoped global page, never linked to a project.
        copy_s3_objects_of_description_and_assets.delay(
            entity_name="PAGE",
            entity_identifier=page.id,
            project_id=None,
            slug=slug,
            user_id=request.user.id,
        )

        page = Page.objects.filter(pk=page.id).first()
        serializer = WorkspacePageDetailSerializer(page)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
