/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Combobox } from "@headlessui/react";
import { Loader } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { SearchIcon } from "@plane/propel/icons";
// components
import type { TLabelDropdownOption } from "./label-dropdown-option-item";
import { LabelDropdownOptionItem } from "./label-dropdown-option-item";

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  onSearchInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef: React.Ref<HTMLInputElement>;
  popperRef: (element: HTMLDivElement | null) => void;
  popperStyle: React.CSSProperties;
  popperAttributes: Record<string, string> | undefined;
  optionsClassName?: string;
  isLoading: boolean;
  filteredOptions: TLabelDropdownOption[];
  workspaceLabelOptions: TLabelDropdownOption[];
  projectLabelOptions: TLabelDropdownOption[];
  submitting: boolean;
  canCreateLabel: boolean | null | undefined;
  onAddLabel: (query: string) => void;
};

export function LabelDropdownPanel(props: Props) {
  const {
    query,
    onQueryChange,
    onSearchInputKeyDown,
    inputRef,
    popperRef,
    popperStyle,
    popperAttributes,
    optionsClassName = "",
    isLoading,
    filteredOptions,
    workspaceLabelOptions,
    projectLabelOptions,
    submitting,
    canCreateLabel,
    onAddLabel,
  } = props;
  const { t } = useTranslation();

  return (
    <Combobox.Options className="fixed z-10" static>
      <div
        className={`z-10 my-1 h-auto w-48 rounded-sm border border-strong bg-surface-1 px-2 py-2.5 text-caption-sm-regular whitespace-nowrap shadow-raised-200 focus:outline-none ${optionsClassName}`}
        ref={popperRef}
        style={popperStyle}
        {...popperAttributes}
      >
        <div className="flex w-full items-center justify-start rounded-sm border border-subtle bg-surface-2 px-2">
          <SearchIcon className="h-3.5 w-3.5 text-tertiary" />
          <Combobox.Input
            ref={inputRef}
            className="w-full bg-transparent px-2 py-1 text-caption-sm-regular text-secondary placeholder:text-placeholder focus:outline-none"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("common.search.label")}
            displayValue={(assigned: any) => assigned?.name || ""}
            onKeyDown={onSearchInputKeyDown}
          />
        </div>
        <div className={`mt-2 max-h-48 space-y-1 overflow-y-scroll`}>
          {isLoading ? (
            <p className="text-center text-secondary">{t("common.loading")}</p>
          ) : filteredOptions.length > 0 ? (
            <>
              {workspaceLabelOptions.length > 0 && (
                <p className="px-1 py-1 text-caption-sm-medium text-tertiary uppercase">{t("common.workspace")}</p>
              )}
              {workspaceLabelOptions.map((option) => (
                <LabelDropdownOptionItem key={option.value} option={option} />
              ))}
              {workspaceLabelOptions.length > 0 && projectLabelOptions.length > 0 && (
                <p className="px-1 py-1 text-caption-sm-medium text-tertiary uppercase">{t("common.project")}</p>
              )}
              {projectLabelOptions.map((option) => (
                <LabelDropdownOptionItem key={option.value} option={option} />
              ))}
            </>
          ) : submitting ? (
            <Loader className="h-3.5 w-3.5 animate-spin" />
          ) : canCreateLabel ? (
            // oxlint-disable-next-line jsx_a11y/click-events-have-key-events
            <p
              onClick={() => {
                if (!query.length) return;
                onAddLabel(query);
              }}
              className={`text-left text-secondary ${query.length ? "cursor-pointer" : "cursor-default"}`}
            >
              {/* TODO: translate here */}
              {query.length ? (
                <>
                  + Add <span className="text-primary">&quot;{query}&quot;</span> to labels
                </>
              ) : (
                t("label.create.type")
              )}
            </p>
          ) : (
            <p className="text-left text-secondary">{t("common.search.no_matching_results")}</p>
          )}
        </div>
      </div>
    </Combobox.Options>
  );
}
