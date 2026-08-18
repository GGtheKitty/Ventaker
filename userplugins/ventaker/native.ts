/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 sadan and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CspPolicies, ImageAndMediaSrc } from "@main/csp";
import { RendererSettings } from "@main/settings";

const DEFAULT_BASE_URL = "https://walltaker.joi.how";

function getConfiguredBaseUrl(): URL {
    try {
        const setting = RendererSettings.store.plugins?.Ventaker?.baseUrl;
        const url = new URL(typeof setting === "string" && setting.trim() ? setting.trim() : DEFAULT_BASE_URL);
        if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol))
            throw new Error("Unsupported protocol");

        return url;
    } catch {
        return new URL(DEFAULT_BASE_URL);
    }
}

const configuredBaseUrl = getConfiguredBaseUrl();
const webSocketProtocol = configuredBaseUrl.protocol === "http:" || configuredBaseUrl.protocol === "ws:"
    ? "ws:"
    : "wss:";

CspPolicies[configuredBaseUrl.origin] = ImageAndMediaSrc;
CspPolicies[`${webSocketProtocol}//${configuredBaseUrl.host}`] = ImageAndMediaSrc;
CspPolicies["*.e621.net"] = ImageAndMediaSrc;
