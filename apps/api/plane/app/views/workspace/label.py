# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from django.db import IntegrityError
from django.db.models import Q

# Third party modules
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseViewSet
from plane.app.serializers import LabelSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import Label, Workspace
from plane.app.permissions import WorkspaceViewerPermission, allow_permission, ROLE
from plane.utils.cache import cache_response, invalidate_cache


class WorkspaceLabelsEndpoint(BaseAPIView):
    permission_classes = [WorkspaceViewerPermission]
    use_read_replica = True

    @cache_response(60 * 60 * 2)
    def get(self, request, slug):
        labels = Label.objects.filter(
            Q(project__isnull=True)
            | Q(
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            ),
            workspace__slug=slug,
        ).distinct()
        serializer = LabelSerializer(labels, many=True).data
        return Response(serializer, status=status.HTTP_200_OK)


class WorkspaceLabelViewSet(BaseViewSet):
    """Workspace-scoped ("global") labels.

    These labels have no project and can be assigned to issues in any
    project within the workspace. Only workspace admins may create,
    update, or delete them; any active workspace member may list them.
    """

    serializer_class = LabelSerializer
    model = Label

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project__isnull=True)
            .select_related("workspace")
            .select_related("parent")
            .order_by("sort_order")
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        labels = self.get_queryset()
        serializer = LabelSerializer(labels, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        label = self.get_queryset().filter(pk=pk).first()
        if not label:
            return Response({"error": "Label not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = LabelSerializer(label)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @invalidate_cache(path="/api/workspaces/:slug/labels/", url_params=True, user=False, multiple=True)
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        try:
            workspace = Workspace.objects.get(slug=slug)
            serializer = LabelSerializer(data=request.data, context={"workspace_id": workspace.id})
            if serializer.is_valid():
                serializer.save(workspace_id=workspace.id)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response(
                {"error": "Label with the same name already exists in the workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @invalidate_cache(path="/api/workspaces/:slug/labels/", url_params=True, user=False)
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        label = self.get_queryset().filter(pk=pk).first()
        if not label:
            return Response({"error": "Label not found"}, status=status.HTTP_404_NOT_FOUND)

        workspace = Workspace.objects.get(slug=slug)

        # Check if the label name is unique within the workspace-scoped labels
        if (
            "name" in request.data
            and Label.objects.filter(
                workspace_id=workspace.id,
                project__isnull=True,
                name__iexact=request.data["name"],
            )
            .exclude(pk=pk)
            .exists()
        ):
            return Response(
                {"error": "Label with the same name already exists in the workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            serializer = LabelSerializer(
                instance=label,
                data=request.data,
                context={"workspace_id": workspace.id},
                partial=True,
            )
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response(
                {"error": "Label with the same name already exists in the workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @invalidate_cache(path="/api/workspaces/:slug/labels/", url_params=True, user=False)
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        label = self.get_queryset().filter(pk=pk).first()
        if not label:
            return Response({"error": "Label not found"}, status=status.HTTP_404_NOT_FOUND)
        label.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
