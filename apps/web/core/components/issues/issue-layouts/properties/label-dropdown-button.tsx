/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { ChevronDownIcon } from "@plane/propel/icons";

type Props = {
  buttonRef: (el: HTMLButtonElement | null) => void;
  label: React.ReactNode;
  disabled?: boolean;
  fullWidth?: boolean;
  hideDropdownArrow?: boolean;
  buttonClassName?: string;
  maxRender: number;
  valueLength: number;
  onClick: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
};

export function LabelDropdownButton(props: Props) {
  const {
    buttonRef,
    label,
    disabled,
    fullWidth,
    hideDropdownArrow,
    buttonClassName = "",
    maxRender,
    valueLength,
    onClick,
  } = props;

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`clickable flex h-full w-full items-center justify-center gap-1 text-caption-sm-regular ${fullWidth && "hover:bg-layer-1"} ${
        disabled
          ? "cursor-not-allowed text-secondary"
          : valueLength <= maxRender
            ? "cursor-pointer"
            : "cursor-pointer hover:bg-layer-1"
      } ${buttonClassName}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
      {!hideDropdownArrow && !disabled && <ChevronDownIcon className="h-3 w-3" aria-hidden="true" />}
    </button>
  );
}
