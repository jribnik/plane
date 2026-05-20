/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import type { TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
import { useIssueCoverImage } from "@/hooks/use-issue-cover-image";

interface KanbanIssueCoverImageProps {
  issueId: string;
  projectId: string | null;
  attachmentCount: number;
  coverImageAttachmentId?: string | null;
  isEpic?: boolean;
}

export const KanbanIssueCoverImage = observer(function KanbanIssueCoverImage(props: KanbanIssueCoverImageProps) {
  const { issueId, projectId, attachmentCount, coverImageAttachmentId, isEpic = false } = props;
  const { workspaceSlug } = useParams();
  const [imageLoadError, setImageLoadError] = useState(false);

  const serviceType: TIssueServiceType = isEpic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES;
  const { coverImageUrl, isLoading } = useIssueCoverImage(
    workspaceSlug?.toString(),
    projectId,
    issueId,
    attachmentCount,
    serviceType,
    coverImageAttachmentId
  );

  if (isLoading) {
    return <div className="relative h-32 w-full animate-pulse bg-layer-1" />;
  }

  if (!coverImageUrl || imageLoadError) {
    return null;
  }

  return (
    <div className="relative h-32 w-full overflow-hidden">
      <img
        src={coverImageUrl}
        alt="Cover"
        className="h-full w-full object-cover"
        onError={() => setImageLoadError(true)}
        loading="lazy"
      />
    </div>
  );
});
