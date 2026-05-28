/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import type { TIssueAttachment, TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
import { getFileURL } from "@plane/utils";
import { IssueAttachmentService } from "@/services/issue";

const COVER_IMAGE_NAMES = [
  "cover-image.jpg",
  "cover-image.jpeg",
  "cover-image.png",
  "cover-image.webp",
  "cover.jpg",
  "cover.jpeg",
  "cover.png",
  "cover.webp",
];

// Mirrors FileAsset.asset_url for ISSUE_ATTACHMENT on the backend, letting us
// resolve an explicit cover without fetching the attachment list per card.
const buildAttachmentUrl = (workspaceSlug: string, projectId: string, issueId: string, attachmentId: string) =>
  getFileURL(
    `/api/assets/v2/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/attachments/${attachmentId}/`
  ) ?? null;

export const useIssueCoverImage = (
  workspaceSlug: string | undefined,
  projectId: string | null | undefined,
  issueId: string,
  attachmentCount: number,
  serviceType: TIssueServiceType = EIssueServiceType.ISSUES,
  coverImageAttachmentId?: string | null
) => {
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(() =>
    workspaceSlug && projectId && issueId && coverImageAttachmentId
      ? buildAttachmentUrl(workspaceSlug, projectId, issueId, coverImageAttachmentId)
      : null
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!workspaceSlug || !projectId || !issueId) {
      setCoverImageUrl(null);
      return;
    }

    // Explicit cover: build the URL directly, no network request.
    if (coverImageAttachmentId) {
      setCoverImageUrl(buildAttachmentUrl(workspaceSlug, projectId, issueId, coverImageAttachmentId));
      return;
    }

    // Filename fallback: only fetch when there are attachments to scan.
    if (attachmentCount === 0) {
      setCoverImageUrl(null);
      return;
    }

    let isMounted = true;
    const attachmentService = new IssueAttachmentService(serviceType);

    const fetchCoverImage = async () => {
      setIsLoading(true);
      try {
        const attachments = await attachmentService.getIssueAttachments(workspaceSlug, projectId, issueId);
        if (!isMounted) return;

        const coverAttachment = attachments.find((attachment: TIssueAttachment) => {
          const fileName = attachment.attributes.name.toLowerCase();
          return COVER_IMAGE_NAMES.some((coverName) => fileName === coverName);
        });

        setCoverImageUrl(coverAttachment ? (getFileURL(coverAttachment.asset_url) ?? null) : null);
      } catch (error) {
        if (isMounted) {
          console.error("Failed to fetch cover image:", error);
          setCoverImageUrl(null);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchCoverImage();

    return () => {
      isMounted = false;
    };
  }, [workspaceSlug, projectId, issueId, attachmentCount, serviceType, coverImageAttachmentId]);

  return { coverImageUrl, isLoading };
};
