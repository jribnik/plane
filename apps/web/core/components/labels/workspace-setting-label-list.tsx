/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EditIcon } from "@plane/propel/icons";
import { Button } from "@plane/propel/button";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import type { IIssueLabel } from "@plane/types";
import { Loader } from "@plane/ui";
// components
import type { TLabelOperationsCallbacks } from "@/components/labels";
import { CreateUpdateLabelInline, DeleteLabelModal } from "@/components/labels";
import type { ICustomMenuItem } from "@/components/labels/label-block/label-item-block";
import { LabelItemBlock } from "@/components/labels/label-block/label-item-block";
// hooks
import { useLabel } from "@/hooks/store/use-label";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { SettingsHeading } from "../settings/heading";

type TWorkspaceSettingLabelItemProps = {
  label: IIssueLabel;
  isEditable: boolean;
  isEditing: boolean;
  onEdit: (labelId: string | null) => void;
  onDelete: (label: IIssueLabel) => void;
  labelOperationsCallbacks: TLabelOperationsCallbacks;
};

const WorkspaceSettingLabelItem = observer(function WorkspaceSettingLabelItem(props: TWorkspaceSettingLabelItemProps) {
  const { label, isEditable, isEditing, onEdit, onDelete, labelOperationsCallbacks } = props;
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);

  const customMenuItems: ICustomMenuItem[] = [
    {
      CustomIcon: EditIcon,
      onClick: () => onEdit(label.id),
      isVisible: true,
      text: "Edit label",
      key: "edit_label",
    },
  ];

  return (
    <div className="group relative flex items-center justify-between gap-2 space-y-3 rounded-sm border-[0.5px] border-subtle bg-surface-1 px-1 py-3">
      {isEditing ? (
        <CreateUpdateLabelInline
          labelForm={isEditing}
          setLabelForm={() => onEdit(null)}
          isUpdating
          labelToUpdate={label}
          labelOperationsCallbacks={labelOperationsCallbacks}
          onClose={() => onEdit(null)}
        />
      ) : (
        <LabelItemBlock
          label={label}
          isDragging={false}
          draggable={false}
          customMenuItems={customMenuItems}
          handleLabelDelete={onDelete}
          dragHandleRef={dragHandleRef}
          disabled={!isEditable}
        />
      )}
    </div>
  );
});

export const WorkspaceSettingsLabelList = observer(function WorkspaceSettingsLabelList() {
  // router
  const { workspaceSlug } = useParams();
  // states
  const [showLabelForm, setLabelForm] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [selectDeleteLabel, setSelectDeleteLabel] = useState<IIssueLabel | null>(null);
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getWorkspaceScopedLabels, createWorkspaceLabel, updateWorkspaceLabel, deleteWorkspaceLabel } = useLabel();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const isEditable = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const workspaceScopedLabels = workspaceSlug ? getWorkspaceScopedLabels(workspaceSlug.toString()) : undefined;

  const labelOperationsCallbacks: TLabelOperationsCallbacks = {
    createLabel: (data: Partial<IIssueLabel>) => createWorkspaceLabel(workspaceSlug?.toString() ?? "", data),
    updateLabel: (labelId: string, data: Partial<IIssueLabel>) =>
      updateWorkspaceLabel(workspaceSlug?.toString() ?? "", labelId, data),
  };

  const newLabel = () => {
    setEditingLabelId(null);
    setLabelForm(true);
  };

  const handleConfirmDelete = async () => {
    if (!workspaceSlug || !selectDeleteLabel) return;
    await deleteWorkspaceLabel(workspaceSlug.toString(), selectDeleteLabel.id);
  };

  return (
    <>
      <DeleteLabelModal
        isOpen={!!selectDeleteLabel}
        data={selectDeleteLabel ?? null}
        onClose={() => setSelectDeleteLabel(null)}
        onConfirmDelete={handleConfirmDelete}
        isWorkspaceScoped
      />
      <SettingsHeading
        title={t("workspace_settings.settings.labels.heading")}
        description={t("workspace_settings.settings.labels.description")}
        control={
          isEditable && (
            <Button variant="primary" size="lg" onClick={newLabel}>
              {t("common.add_label")}
            </Button>
          )
        }
      />
      <div className="mt-6 w-full">
        {showLabelForm && (
          <div className="my-2 w-full rounded-sm border border-subtle px-3.5 py-2">
            <CreateUpdateLabelInline
              labelForm={showLabelForm}
              setLabelForm={setLabelForm}
              isUpdating={false}
              labelOperationsCallbacks={labelOperationsCallbacks}
              onClose={() => setLabelForm(false)}
            />
          </div>
        )}
        {workspaceScopedLabels ? (
          workspaceScopedLabels.length === 0 && !showLabelForm ? (
            <EmptyStateCompact
              assetKey="label"
              assetClassName="size-20"
              title={t("settings_empty_state.labels.title")}
              description={t("settings_empty_state.labels.description")}
              actions={[
                {
                  label: t("settings_empty_state.labels.cta_primary"),
                  onClick: () => {
                    newLabel();
                  },
                },
              ]}
              align="start"
              rootClassName="py-20"
            />
          ) : (
            <div className="space-y-2">
              {workspaceScopedLabels.map((label) => (
                <WorkspaceSettingLabelItem
                  key={label.id}
                  label={label}
                  isEditable={isEditable}
                  isEditing={editingLabelId === label.id}
                  onEdit={setEditingLabelId}
                  onDelete={(labelToDelete) => setSelectDeleteLabel(labelToDelete)}
                  labelOperationsCallbacks={labelOperationsCallbacks}
                />
              ))}
            </div>
          )
        ) : (
          !showLabelForm && (
            <Loader className="space-y-5">
              <Loader.Item height="42px" />
              <Loader.Item height="42px" />
              <Loader.Item height="42px" />
              <Loader.Item height="42px" />
            </Loader>
          )
        )}
      </div>
    </>
  );
});
