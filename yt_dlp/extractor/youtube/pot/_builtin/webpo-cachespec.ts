// Source: yt_dlp/extractor/youtube/pot/_builtin/webpo_cachespec.py

import { BuiltinIEContentProvider } from "../internal-provider.ts";
import {
  CacheProviderWritePolicy,
  PoTokenCacheSpecProvider,
  registerSpec,
  type PoTokenCacheSpec,
} from "../cache.ts";
import { ContentBindingType, getWebpoContentBinding } from "../utils.ts";
import type { PoTokenRequest } from "../provider.ts";

export class WebPoPCSP extends PoTokenCacheSpecProvider {
  static override readonly providerName = "webpo";

  override generateCacheSpec(request: PoTokenRequest): PoTokenCacheSpec | null {
    const bindToVisitorId =
      this.configurationArg("bind_to_visitor_id", ["true"])[0] === "true";
    const [contentBinding, contentBindingType] = getWebpoContentBinding(
      request,
      undefined,
      bindToVisitorId,
    );

    if (!contentBinding || !contentBindingType) {
      return null;
    }

    return {
      keyBindings: {
        t: "webpo",
        cb: contentBinding,
        cbt: contentBindingType,
        ip:
          typeof request.innertubeContext.client?.remoteHost === "string"
            ? request.innertubeContext.client.remoteHost
            : undefined,
        sa: request.requestSourceAddress,
        px: request.requestProxy,
      },
      // Integrity token responses usually state a 12 hour TTL. Use 6 hours as the conservative default from Python.
      defaultTtl: 21600,
      writePolicy:
        contentBindingType === ContentBindingType.VIDEO_ID
          ? CacheProviderWritePolicy.WRITE_FIRST
          : CacheProviderWritePolicy.WRITE_ALL,
    };
  }
}

// Keep the BuiltinIEContentProvider import live as documentation of the Python inheritance source.
void BuiltinIEContentProvider;

registerSpec(WebPoPCSP);
