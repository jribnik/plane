/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Combobox } from "@headlessui/react";
// plane imports
import { CheckIcon } from "@plane/propel/icons";

export type TLabelDropdownOption = {
  value: string | undefined;
  query: string | undefined;
  isWorkspaceLabel: boolean;
  content: React.ReactNode;
};

type Props = {
  option: TLabelDropdownOption;
};

export function LabelDropdownOptionItem(props: Props) {
  const { option } = props;

  return (
    <Combobox.Option
      key={option.value}
      value={option.value}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className={({ active, selected }) =>
        `flex cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 select-none hover:bg-layer-1 ${
          active ? "bg-layer-1" : ""
        } ${selected ? "text-primary" : "text-secondary"}`
      }
    >
      {({ selected }) => (
        <>
          {option.content}
          {selected && (
            <div className="flex-shrink-0">
              <CheckIcon className={`h-3.5 w-3.5`} />
            </div>
          )}
        </>
      )}
    </Combobox.Option>
  );
}
