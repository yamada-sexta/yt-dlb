// Source: yt_dlp/extractor/box.py

import { ExtractorError, parseIso8601, updateUrlQuery, urlOrNone } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface BoxSharedItem {
  itemType?: string;
  itemID?: string | number;
}

interface BoxConfig {
  requestToken?: string;
}

interface BoxTokenResponse {
  [fileId: string]: { read?: string } | undefined;
}

interface BoxFileInfo {
  name?: string;
  description?: string;
  created_at?: string;
  created_by?: { name?: string; id?: string };
  representations?: {
    entries?: Array<{
      representation?: string;
      content?: { url_template?: string };
    }>;
  };
}

export class BoxIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:[^.]+\.)?(?<service>app|ent)\.box\.com/s/(?<shared_name>[^/?#]+)(?:/file/(?<id>\d+))?`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const service = match?.groups?.service;
    const sharedName = match?.groups?.shared_name;
    let fileId: string | undefined = match?.groups?.id;
    if (!service || !sharedName) {
      throw new Error("Unable to extract Box shared file id");
    }
    const webpage = await this.downloadWebpage(url, fileId ?? sharedName);
    if (webpage === false) {
      throw new Error("Unable to download Box page");
    }

    if (!fileId) {
      const postStreamData = this.searchJson<Record<string, unknown>>(
        String.raw`Box\.postStreamData\s*=`,
        webpage,
        "Box post-stream data",
        sharedName,
      );
      const sharedItem = postStreamData?.["/app-api/enduserapp/shared-item"] as BoxSharedItem | undefined;
      if (sharedItem?.itemType !== "file" || sharedItem.itemID === undefined) {
        throw new ExtractorError("The requested resource is not a file", { expected: true });
      }
      fileId = String(sharedItem.itemID);
    }

    const boxConfig = this.searchJson<BoxConfig>(String.raw`Box\.config\s*=`, webpage, "Box config", fileId);
    const requestToken = boxConfig?.requestToken;
    if (!requestToken) {
      throw new Error("Unable to extract Box request token");
    }
    const tokenResponse = await this.downloadJson<BoxTokenResponse>(
      `https://${service}.box.com/app-api/enduserapp/elements/tokens`,
      fileId,
      {
        note: "Downloading token JSON metadata",
        data: JSON.stringify({ fileIDs: [fileId] }),
        headers: {
          "Content-Type": "application/json",
          "X-Request-Token": requestToken,
          "X-Box-EndUser-API": `sharedName=${sharedName}`,
        },
      },
    );
    const accessToken = tokenResponse !== false ? tokenResponse[fileId]?.read : null;
    if (!accessToken) {
      throw new Error("Unable to extract Box access token");
    }

    const sharedLink = `https://${service}.box.com/s/${sharedName}`;
    const fileInfo = await this.downloadJson<BoxFileInfo>(
      `https://api.box.com/2.0/files/${fileId}`,
      fileId,
      {
        note: "Downloading file JSON metadata",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          BoxApi: `shared_link=${sharedLink}`,
          "X-Rep-Hints": "[dash]",
        },
        query: {
          fields: "authenticated_download_url,created_at,created_by,description,extension,is_download_available,name,representations,size",
        },
      },
    );
    if (fileInfo === false) {
      throw new Error("Unable to download Box file metadata");
    }

    const query = {
      access_token: accessToken,
      shared_link: sharedLink,
    };
    const formats: Array<Record<string, unknown>> = [];
    for (const representation of fileInfo.representations?.entries ?? []) {
      if (representation.representation !== "dash") {
        continue;
      }
      const template = urlOrNone(representation.content?.url_template);
      if (!template) {
        continue;
      }
      const manifestUrl = updateUrlQuery(template.replace("{+asset_path}", "manifest.mpd"), query);
      const manifestQuery = new URL(manifestUrl).searchParams.toString();
      for (const format of this.extractMpdFormats(manifestUrl, fileId)) {
        formats.push({
          ...format,
          extra_param_to_segment_url: manifestQuery,
        });
      }
    }

    return {
      id: fileId,
      title: fileInfo.name ?? fileId,
      formats,
      description: fileInfo.description || undefined,
      uploader: fileInfo.created_by?.name,
      timestamp: parseIso8601(fileInfo.created_at) ?? undefined,
      uploader_id: fileInfo.created_by?.id,
    };
  }
}
