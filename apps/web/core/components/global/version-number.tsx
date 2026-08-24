/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// assets
import { useTranslation } from "@plane/i18n";
import packageJson from "package.json";

// Short git SHA baked in at build time (VITE_APP_VERSION); empty in plain dev.
const buildSha = process.env.VITE_APP_VERSION ?? "";

export function PlaneVersionNumber() {
  const { t } = useTranslation();
  return (
    <span>
      {t("version")}: v{packageJson.version}
      {buildSha ? ` (${buildSha})` : ""}
    </span>
  );
}
