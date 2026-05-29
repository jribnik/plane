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
import { cn } from "@plane/utils";
import { useIssueCoverImage } from "@/hooks/use-issue-cover-image";

interface IssueDetailCoverImageProps {
  issueId: string;
  projectId: string | null;
  attachmentCount: number;
  coverImageAttachmentId?: string | null;
  isEpic?: boolean;
  // Negative margins must cancel the parent container's horizontal padding so the
  // cover bleeds edge-to-edge. Defaults assume a px-8 container (peek overview);
  // pass a matching value for other paddings (e.g. px-9 on the browse view).
  layoutClassName?: string;
}

export const IssueDetailCoverImage = observer(function IssueDetailCoverImage(props: IssueDetailCoverImageProps) {
  const {
    issueId,
    projectId,
    attachmentCount,
    coverImageAttachmentId,
    isEpic = false,
    layoutClassName = "-mx-8 w-[calc(100%+4rem)]",
  } = props;
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
    return <div className={cn("-mt-5 mb-4 h-60 animate-pulse bg-layer-1", layoutClassName)} />;
  }

  if (!coverImageUrl || imageLoadError) {
    return null;
  }

  return (
    <div className={cn("-mt-5 mb-4 h-60 overflow-hidden", layoutClassName)}>
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
