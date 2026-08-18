/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType, StartAt } from "@utils/types";

import cssContent from "./style.css";

const DEFAULT_BASE_URL = "https://walltaker.joi.how";
const RECONNECT_DELAY = 5_000;

interface ActionCableEnvelope {
    message?: unknown;
}

interface LinkMessage {
    post_url?: unknown;
    success?: unknown;
    why?: unknown;
}

let currentVideoUrl: string | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let socket: WebSocket | null = null;
let stopped = true;

const settings = definePluginSettings({
    link: {
        type: OptionType.STRING,
        description: "The numeric or custom Walltaker link ID",
        restartNeeded: true
    },
    baseUrl: {
        type: OptionType.STRING,
        description: "The URL of the Walltaker instance to connect to",
        default: DEFAULT_BASE_URL,
        restartNeeded: true
    }
});

function getBaseUrl(rawUrl: string): URL {
    try {
        const url = new URL(rawUrl.trim() || DEFAULT_BASE_URL);
        if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol))
            throw new Error(`Unsupported protocol: ${url.protocol}`);

        url.hash = "";
        url.search = "";
        url.pathname = url.pathname.replace(/\/+$/, "");
        return url;
    } catch (error) {
        console.error("[Ventaker] Invalid custom URL; using the default instance.", error);
        return new URL(DEFAULT_BASE_URL);
    }
}

function getWebSocketUrl(rawUrl: string): string {
    const url = getBaseUrl(rawUrl);
    url.protocol = url.protocol === "http:" || url.protocol === "ws:" ? "ws:" : "wss:";
    url.pathname = `${url.pathname}/cable`;
    return url.toString();
}

function isLinkMessage(value: unknown): value is LinkMessage {
    return typeof value === "object" && value !== null;
}

function removeImageBackground() {
    document.getElementById("walltaker-background")?.remove();
    document.documentElement.style.removeProperty("--background-image");
}

function removeVideoBackground() {
    document.getElementById("walltaker-video-background")?.remove();
    currentVideoUrl = null;
}

function setVideoBackground(url: string) {
    if (url === currentVideoUrl) return;

    removeImageBackground();
    currentVideoUrl = url;

    let videoElement = document.getElementById("walltaker-video-background") as HTMLVideoElement | null;
    if (!videoElement) {
        videoElement = document.createElement("video");
        videoElement.id = "walltaker-video-background";
        videoElement.autoplay = true;
        videoElement.loop = true;
        videoElement.muted = false;
        videoElement.style.position = "fixed";
        videoElement.style.inset = "0";
        videoElement.style.width = "100%";
        videoElement.style.height = "100%";
        videoElement.style.objectFit = "cover";
        videoElement.style.zIndex = "-1";
        document.body.appendChild(videoElement);
    }

    videoElement.src = url;
    videoElement.style.display = "block";
}

function setImageBackground(url: string) {
    removeVideoBackground();
    const cssUrl = `url(${JSON.stringify(url)})`;
    document.documentElement.style.setProperty("--background-image", cssUrl, "important");

    let styleElement = document.getElementById("walltaker-background") as HTMLStyleElement | null;
    if (!styleElement) {
        styleElement = document.createElement("style");
        styleElement.id = "walltaker-background";
        document.head.appendChild(styleElement);
    }

    styleElement.textContent = `
        :root {
            --background-image: ${cssUrl} !important;
            --ventaker-background-image: ${cssUrl} !important;
        }

        body {
            background-image: var(--ventaker-background-image) !important;
            background-size: cover !important;
        }

        #app-mount :is([class^="bg_"], [class*=" bg_"]) {
            background-image: var(--ventaker-background-image) !important;
            background-position: var(--background-position, center) !important;
            background-size: var(--background-size, cover) !important;
            background-repeat: no-repeat !important;
            background-attachment: var(--background-attachment, fixed) !important;
        }
    `;
}

function setBackground(url: string) {
    let pathname: string;
    try {
        pathname = new URL(url).pathname.toLowerCase();
    } catch {
        console.error("[Ventaker] Ignoring an invalid wallpaper URL:", url);
        return;
    }

    if ([".mp4", ".mov", ".webm"].some(extension => pathname.endsWith(extension)))
        setVideoBackground(url);
    else
        setImageBackground(url);
}

function handleMessage(event: MessageEvent) {
    if (typeof event.data !== "string") return;

    try {
        const envelope = JSON.parse(event.data) as ActionCableEnvelope;
        if (!isLinkMessage(envelope.message)) return;

        const link = envelope.message;
        if (link.success !== true) {
            if (typeof link.why === "string")
                console.error(`[Ventaker] ${link.why}`);
            return;
        }

        if (typeof link.post_url === "string" && link.post_url)
            setBackground(link.post_url);
    } catch (error) {
        console.error("[Ventaker] Could not parse a WebSocket message.", error);
    }
}

function connect(linkId: string, baseUrl: string) {
    const webSocketUrl = getWebSocketUrl(baseUrl);
    const identifier = JSON.stringify({
        channel: "LinkChannel",
        link_id: linkId,
        client: "Ventaker"
    });

    const connection = new WebSocket(webSocketUrl);
    socket = connection;

    connection.addEventListener("open", () => {
        if (socket !== connection) return;

        connection.send(JSON.stringify({
            command: "subscribe",
            identifier
        }));
        console.info(`[Ventaker] Connected to ${webSocketUrl}`);
    });
    connection.addEventListener("message", handleMessage);
    connection.addEventListener("error", error => {
        console.error("[Ventaker] WebSocket error.", error);
    });
    connection.addEventListener("close", () => {
        if (socket !== connection) return;

        socket = null;
        if (!stopped) {
            console.warn(`[Ventaker] Connection closed; retrying in ${RECONNECT_DELAY / 1_000} seconds.`);
            reconnectTimeout = setTimeout(() => connect(linkId, baseUrl), RECONNECT_DELAY);
        }
    });
}

function startConnection(linkId: string, baseUrl: string) {
    stopConnection();
    stopped = false;
    connect(linkId.trim(), baseUrl);
}

function stopConnection() {
    stopped = true;
    if (reconnectTimeout !== null) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    const connection = socket;
    socket = null;
    connection?.close();
}

function applyStyles() {
    let styleElement = document.getElementById("ventaker-custom-styles") as HTMLStyleElement | null;
    if (!styleElement) {
        styleElement = document.createElement("style");
        styleElement.id = "ventaker-custom-styles";
        document.head.appendChild(styleElement);
    }
    styleElement.textContent = cssContent;
}

export default definePlugin({
    name: "Ventaker",
    description: "Changes your Discord background to one from Walltaker",
    authors: [
        { name: "Lumi", id: 633026209479000065n },
        { name: "GGtheKitty", id: 748710635084447845n }
    ],
    settings,
    startAt: StartAt.DOMContentLoaded,
    start() {
        const { baseUrl, link } = settings.store;
        if (!link.trim()) {
            console.error("[Ventaker] Enter a Walltaker link ID in the plugin settings.");
            return;
        }

        applyStyles();
        startConnection(link, baseUrl);
    },
    stop() {
        stopConnection();
        removeImageBackground();
        removeVideoBackground();
        document.getElementById("ventaker-custom-styles")?.remove();
    }
});
