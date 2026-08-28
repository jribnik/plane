/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Placement } from "@popperjs/core";
import { useParams } from "next/navigation";
import { usePopper } from "react-popper";
// plane imports
import { EUserPermissionsLevel, getRandomLabelColor } from "@plane/constants";
import { useOutsideClickDetector } from "@plane/hooks";
// types
import type { IIssueLabel } from "@plane/types";
import { EUserProjectRoles } from "@plane/types";
// components
import { ComboDropDown } from "@plane/ui";
import { sortBySelectedFirst } from "@plane/utils";
// hooks
import { useLabel } from "@/hooks/store/use-label";
import { useUserPermissions } from "@/hooks/store/user";
import { useDropdownKeyDown } from "@/hooks/use-dropdown-key-down";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { LabelDropdownButton } from "./label-dropdown-button";
import { LabelDropdownPanel } from "./label-dropdown-panel";

export interface ILabelDropdownProps {
  projectId: string | null;
  value: string[];
  onChange: (data: string[]) => void;
  onClose?: () => void;
  disabled?: boolean;
  defaultOptions?: any;
  hideDropdownArrow?: boolean;
  className?: string;
  buttonClassName?: string;
  optionsClassName?: string;
  placement?: Placement;
  maxRender?: number;
  renderByDefault?: boolean;
  fullWidth?: boolean;
  fullHeight?: boolean;
  label: React.ReactNode;
}

const preventPropagation = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
  e.stopPropagation();
  e.preventDefault();
};

export function LabelDropdown(props: ILabelDropdownProps) {
  const {
    projectId,
    value,
    onChange,
    onClose,
    disabled,
    defaultOptions = [],
    hideDropdownArrow = false,
    className,
    buttonClassName = "",
    optionsClassName = "",
    placement,
    maxRender = 2,
    renderByDefault = true,
    fullWidth = false,
    fullHeight = false,
    label,
  } = props;

  //router
  const { workspaceSlug: routerWorkspaceSlug } = useParams();
  const workspaceSlug = routerWorkspaceSlug?.toString();

  //states
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  //refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // popper-js refs
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);

  //hooks
  const { fetchProjectLabels, getProjectAvailableLabels, createLabel } = useLabel();
  const { isMobile } = usePlatformOS();
  const storeLabels = getProjectAvailableLabels(projectId);
  const { allowPermissions } = useUserPermissions();

  const canCreateLabel = Boolean(
    projectId && allowPermissions([EUserProjectRoles.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId)
  );

  let projectLabels: IIssueLabel[] = defaultOptions;
  if (storeLabels && storeLabels.length > 0) projectLabels = storeLabels;

  const options = useMemo(
    () =>
      projectLabels.map((projectLabel) => ({
        value: projectLabel?.id,
        query: projectLabel?.name,
        isWorkspaceLabel: !projectLabel?.project_id,
        content: (
          <div className="flex items-center justify-start gap-2 overflow-hidden">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{
                backgroundColor: projectLabel?.color,
              }}
            />
            <div className="line-clamp-1 inline-block truncate">{projectLabel?.name}</div>
          </div>
        ),
      })),
    [projectLabels]
  );

  const searchedOptions = useMemo(
    () =>
      (query === ""
        ? options
        : options?.filter((option) => option.query.toLowerCase().includes(query.toLowerCase()))) ?? [],
    [options, query]
  );

  // workspace-scoped labels rendered as a distinct group above the project's own labels
  const workspaceLabelOptions = useMemo(
    () =>
      sortBySelectedFirst(
        searchedOptions.filter((option) => option.isWorkspaceLabel),
        value
      ) ?? [],
    [searchedOptions, value]
  );
  const projectLabelOptions = useMemo(
    () =>
      sortBySelectedFirst(
        searchedOptions.filter((option) => !option.isWorkspaceLabel),
        value
      ) ?? [],
    [searchedOptions, value]
  );
  const filteredOptions = useMemo(
    () => [...workspaceLabelOptions, ...projectLabelOptions],
    [workspaceLabelOptions, projectLabelOptions]
  );

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
    modifiers: [
      {
        name: "preventOverflow",
        options: {
          padding: 12,
        },
      },
    ],
  });

  const onOpen = useCallback(() => {
    if (!storeLabels && workspaceSlug && projectId)
      fetchProjectLabels(workspaceSlug, projectId)
        .then(() => setIsLoading(false))
        .catch(() => {
          setIsLoading(false);
        });
  }, [storeLabels, workspaceSlug, projectId, fetchProjectLabels, setIsLoading]);

  const toggleDropdown = useCallback(() => {
    if (!isOpen) onOpen();
    setIsOpen((prevIsOpen) => !prevIsOpen);
    if (isOpen && onClose) onClose();
  }, [onOpen, onClose, isOpen, setIsOpen]);

  const handleClose = () => {
    if (!isOpen) return;
    setIsOpen(false);
    setQuery("");
    if (onClose) onClose();
  };

  const handleAddLabel = async (labelName: string) => {
    if (!projectId) return;
    setSubmitting(true);
    const newLabel = await createLabel(workspaceSlug, projectId, { name: labelName, color: getRandomLabelColor() });
    onChange([...value, newLabel.id]);
    setQuery("");
    setSubmitting(false);
  };

  const searchInputKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (query !== "" && e.key === "Escape") {
      setQuery("");
      e.preventDefault();
    }

    if (query !== "" && e.key === "Enter" && !e.nativeEvent.isComposing && canCreateLabel) {
      e.preventDefault();
      await handleAddLabel(query);
    }
  };
  const handleKeyDown = useDropdownKeyDown(toggleDropdown, handleClose);

  const handleOnClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      e.stopPropagation();
      e.preventDefault();
      toggleDropdown();
    },
    [toggleDropdown]
  );

  useEffect(() => {
    if (isOpen && inputRef.current && !isMobile) {
      inputRef.current.focus();
    }
  }, [isOpen, isMobile]);

  useOutsideClickDetector(dropdownRef, handleClose);

  const comboButton = useMemo(
    () => (
      <LabelDropdownButton
        buttonRef={setReferenceElement}
        label={label}
        disabled={disabled}
        fullWidth={fullWidth}
        hideDropdownArrow={hideDropdownArrow}
        buttonClassName={buttonClassName}
        maxRender={maxRender}
        valueLength={value.length}
        onClick={handleOnClick}
      />
    ),
    [
      buttonClassName,
      disabled,
      fullWidth,
      handleOnClick,
      hideDropdownArrow,
      label,
      maxRender,
      value.length,
      setReferenceElement,
    ]
  );

  return (
    // oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions
    <div className={`${fullHeight ? "h-full" : "h-5"}`} onClick={preventPropagation}>
      {/* oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
      <ComboDropDown
        as="div"
        ref={dropdownRef}
        className={`h-full w-auto max-w-full flex-shrink-0 text-left ${className}`}
        value={value}
        onChange={onChange}
        disabled={disabled}
        onKeyDown={handleKeyDown}
        button={comboButton}
        renderByDefault={renderByDefault}
        multiple
      >
        {isOpen && (
          <LabelDropdownPanel
            query={query}
            onQueryChange={setQuery}
            onSearchInputKeyDown={searchInputKeyDown}
            inputRef={inputRef}
            popperRef={setPopperElement}
            popperStyle={styles.popper}
            popperAttributes={attributes.popper}
            optionsClassName={optionsClassName}
            isLoading={isLoading}
            filteredOptions={filteredOptions}
            workspaceLabelOptions={workspaceLabelOptions}
            projectLabelOptions={projectLabelOptions}
            submitting={submitting}
            canCreateLabel={canCreateLabel}
            onAddLabel={handleAddLabel}
          />
        )}
      </ComboDropDown>
    </div>
  );
}
