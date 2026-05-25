// Source: yt_dlp/extractor/youtube/pot/utils.py

import { PoTokenContext, type PoTokenRequest } from "./provider.ts";

export const WEBPO_CLIENTS = [
  "WEB",
  "MWEB",
  "TVHTML5",
  "WEB_EMBEDDED_PLAYER",
  "WEB_CREATOR",
  "WEB_REMIX",
  "TVHTML5_SIMPLY",
  "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
] as const;

export enum ContentBindingType {
  VISITOR_DATA = "visitor_data",
  DATASYNC_ID = "datasync_id",
  VIDEO_ID = "video_id",
  VISITOR_ID = "visitor_id",
}

export function getWebpoContentBinding(
  request: PoTokenRequest,
  webpoClients: readonly string[] = WEBPO_CLIENTS,
  bindToVisitorId = false,
): [string | undefined, ContentBindingType | undefined] {
  const clientName = request.innertubeContext.client?.clientName;
  if (!clientName || !webpoClients.includes(clientName)) {
    return [undefined, undefined];
  }

  if (request.context === PoTokenContext.GVS && request.gvsBindToVideoId) {
    return [request.videoId, ContentBindingType.VIDEO_ID];
  }

  if (request.context === PoTokenContext.GVS || clientName === "WEB_REMIX") {
    if (request.isAuthenticated) {
      return [request.dataSyncId, ContentBindingType.DATASYNC_ID];
    }
    if (bindToVisitorId) {
      const visitorId = extractVisitorId(request.visitorData);
      if (visitorId) {
        return [visitorId, ContentBindingType.VISITOR_ID];
      }
    }
    return [request.visitorData, ContentBindingType.VISITOR_DATA];
  }

  if (
    request.context === PoTokenContext.PLAYER ||
    request.context === PoTokenContext.SUBS
  ) {
    return [request.videoId, ContentBindingType.VIDEO_ID];
  }

  return [undefined, undefined];
}

function extractVisitorId(visitorData: string | undefined): string | undefined {
  if (!visitorData) {
    return undefined;
  }
  try {
    const decoded = Buffer.from(
      decodeURIComponent(visitorData.replaceAll("+", " ")),
      "base64url",
    );
    const visitorId = decoded.subarray(2, 13).toString();
    return /^[A-Za-z0-9_-]{11}$/.test(visitorId) ? visitorId : undefined;
  } catch {
    return undefined;
  }
}
