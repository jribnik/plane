/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// types
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IIssueLabel } from "@plane/types";
// ui
import { AlertModalCore } from "@plane/ui";
// hooks
import { useLabel } from "@/hooks/store/use-label";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  data: IIssueLabel | null;
  /** When provided, used instead of the default project-scoped delete call (e.g. for workspace-scoped labels). */
  onConfirmDelete?: () => Promise<void>;
  /** Whether the label being deleted is workspace-scoped, used to tailor the confirmation copy. */
  isWorkspaceScoped?: boolean;
};

export const DeleteLabelModal = observer(function DeleteLabelModal(props: Props) {
  const { isOpen, onClose, data, onConfirmDelete, isWorkspaceScoped = false } = props;
  // router
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { deleteLabel } = useLabel();
  // states
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);

  const handleClose = () => {
    onClose();
    setIsDeleteLoading(false);
  };

  const handleDeletion = async () => {
    if (!data) return;

    setIsDeleteLoading(true);

    const deletePromise = onConfirmDelete
      ? onConfirmDelete()
      : workspaceSlug && projectId
        ? deleteLabel(workspaceSlug.toString(), projectId.toString(), data.id)
        : undefined;

    if (!deletePromise) {
      setIsDeleteLoading(false);
      return;
    }

    await deletePromise
      .then(() => {
        handleClose();
        return;
      })
      .catch((err) => {
        setIsDeleteLoading(false);
        const error = err?.error || "Label could not be deleted. Please try again.";
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: error,
        });
      });
  };

  return (
    <AlertModalCore
      handleClose={handleClose}
      handleSubmit={handleDeletion}
      isSubmitting={isDeleteLoading}
      isOpen={isOpen}
      title="Delete Label"
      content={
        isWorkspaceScoped ? (
          <>
            Are you sure you want to delete <span className="font-medium text-primary">{data?.name}</span>? This is a
            workspace-level label and will be removed from all work items across every project in the workspace, and
            from any views where the label is being filtered upon.
          </>
        ) : (
          <>
            Are you sure you want to delete <span className="font-medium text-primary">{data?.name}</span>? This will
            remove the label from all the work item and from any views where the label is being filtered upon.
          </>
        )
      }
    />
  );
});
