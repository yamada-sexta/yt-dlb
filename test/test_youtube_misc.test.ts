// Source: test/test_youtube_misc.py and YouTube redirect/mistake extractor tests

import { describe, expect, test } from "bun:test";

import { ExtractorError } from "../yt_dlp/utils/index.ts";
import {
  BadgeType,
  getInnertubeClient,
  INNERTUBE_CLIENTS,
  shortClientName,
  YoutubeBaseInfoExtractor,
} from "../yt_dlp/extractor/youtube/base.ts";
import { YoutubeClipIE } from "../yt_dlp/extractor/youtube/clip.ts";
import {
  YoutubeTruncatedIDIE,
  YoutubeTruncatedURLIE,
} from "../yt_dlp/extractor/youtube/mistakes.ts";
import { YoutubeNotificationsIE } from "../yt_dlp/extractor/youtube/notifications.ts";
import { PoTokenContext } from "../yt_dlp/extractor/youtube/pot/index.ts";
import {
  YoutubeConsentRedirectIE,
  YoutubeFavouritesIE,
  YoutubeLivestreamEmbedIE,
  YoutubeRecommendedIE,
  YoutubeShortsAudioPivotIE,
  YoutubeSubscriptionsIE,
  YoutubeWatchLaterIE,
  YoutubeYtBeIE,
  YoutubeYtUserIE,
} from "../yt_dlp/extractor/youtube/redirect.ts";
import {
  YoutubeMusicSearchURLIE,
  YoutubeSearchIE,
  YoutubeSearchURLIE,
} from "../yt_dlp/extractor/youtube/search.ts";
import {
  YoutubePlaylistIE,
  YoutubeTabBaseInfoExtractor,
  YoutubeTabIE,
} from "../yt_dlp/extractor/youtube/tab.ts";
import {
  isYoutubeWatchUrl,
  YoutubeIE,
} from "../yt_dlp/extractor/youtube/video.ts";

class TestYoutubeBaseIE extends YoutubeBaseInfoExtractor {
  getTextForTest(
    data: unknown,
    ...paths: Parameters<YoutubeBaseInfoExtractor["_get_text"]> extends [
      unknown,
      ...infer Rest,
    ]
      ? Rest
      : never
  ): string | null {
    return this._get_text(data, ...paths);
  }

  getCountForTest(
    data: unknown,
    ...paths: Parameters<YoutubeBaseInfoExtractor["_get_count"]> extends [
      unknown,
      ...infer Rest,
    ]
      ? Rest
      : never
  ): number | null {
    return this._get_count(data, ...paths);
  }

  extractThumbnailsForTest(
    data: unknown,
    ...paths: Parameters<
      YoutubeBaseInfoExtractor["_extract_thumbnails"]
    > extends [unknown, ...infer Rest]
      ? Rest
      : never
  ) {
    return this._extract_thumbnails(data, ...paths);
  }

  extractBadgesForTest(data: unknown) {
    return this._extract_badges(data);
  }

  extractContextForTest(ytcfg?: unknown, defaultClient?: string) {
    return this._extract_context(ytcfg, defaultClient);
  }

  generateApiHeadersForTest(
    options: Parameters<YoutubeBaseInfoExtractor["generate_api_headers"]>[0],
  ) {
    return this.generate_api_headers(options);
  }

  extractYtcfgForTest(videoId: string, webpage: string) {
    return this.extract_ytcfg(videoId, webpage);
  }

  extractDataSyncIdForTest(...args: unknown[]) {
    return this._extract_data_sync_id(...args);
  }
}

class TestYoutubeNotificationsIE extends YoutubeNotificationsIE {
  extractNotificationRendererForTest(notification: unknown) {
    return this._extract_notification_renderer(notification);
  }

  extractNotificationMenuForTest(response: unknown) {
    const continuation: Array<Record<string, unknown> | null> = [null];
    return {
      entries: [...this._extract_notification_menu(response, continuation)],
      continuation: continuation[0],
    };
  }
}

class TestYoutubeTabIE extends YoutubeTabBaseInfoExtractor {
  extractVideoForTest(renderer: Record<string, unknown>) {
    return this._extract_video(renderer);
  }

  extractChannelForTest(renderer: Record<string, unknown>) {
    return this._extract_channel_renderer(renderer);
  }

  gridEntriesForTest(renderer: unknown) {
    return [...this._grid_entries(renderer)];
  }

  musicEntryForTest(renderer: Record<string, unknown>) {
    return this._music_reponsive_list_entry(renderer);
  }

  playlistEntriesForTest(renderer: Record<string, unknown>) {
    return [...this._playlist_entries(renderer)];
  }

  richEntriesForTest(renderer: Record<string, unknown>) {
    return [...this._rich_entries(renderer)];
  }

  shelfEntriesForTest(renderer: Record<string, unknown>, skipChannels = false) {
    return [...this._shelf_entries(renderer, skipChannels)];
  }

  postThreadEntriesForTest(renderer: Record<string, unknown>) {
    return [...this._post_thread_entries(renderer)];
  }

  extractEntriesForTest(renderer: Record<string, unknown>) {
    const continuation: Array<Record<string, unknown> | null> = [null];
    return {
      entries: [...this._extract_entries(renderer, continuation)],
      continuation: continuation[0],
    };
  }
}

class TestYoutubeIE extends YoutubeIE {
  extractSignatureTimestampForTest(
    videoId: string,
    playerUrl: string | null,
    ytcfg: unknown = null,
    fatal = false,
  ) {
    return this._extract_signature_timestamp(videoId, playerUrl, ytcfg, fatal);
  }

  getConfigPoTokenForTest(client: string, context: PoTokenContext) {
    return this._get_config_po_token(client, context);
  }
}

describe("YouTube URL helpers", () => {
  test.each([
    "http://www.youtube.com/watch?&v=BaW_jenozKc",
    "https://www.youtube.com/watch?&v=BaW_jenozKc",
    "https://www.youtube.com/watch?feature=player_embedded&v=BaW_jenozKc",
    "https://m.youtube.com/watch?v=BaW_jenozKc",
    "https://music.youtube.com/watch?v=BaW_jenozKc",
  ])("recognizes watch URL %s", (url) => {
    expect(isYoutubeWatchUrl(url)).toBe(true);
  });

  test("rejects non-watch URLs", () => {
    expect(isYoutubeWatchUrl("https://www.youtube.com/playlist?list=LL")).toBe(
      false,
    );
    expect(isYoutubeWatchUrl("BaW_jenozKc")).toBe(false);
  });
});

describe("YouTube video dependency helpers", () => {
  test("generates player context like yt-dlp", () => {
    expect(YoutubeIE._get_checkok_params()).toEqual({
      contentCheckOk: true,
      racyCheckOk: true,
    });
    expect(
      YoutubeIE._generate_player_context(12345, true, "encrypted"),
    ).toEqual({
      playbackContext: {
        contentPlaybackContext: {
          html5Preference: "HTML5_PREF_WANTS",
          signatureTimestamp: 12345,
          encryptedHostFlags: "encrypted",
        },
        adPlaybackContext: { pyv: true },
      },
      contentCheckOk: true,
      racyCheckOk: true,
    });
  });

  test("extracts signature timestamp from ytcfg", async () => {
    await expect(
      new TestYoutubeIE().extractSignatureTimestampForTest(
        "BaW_jenozKc",
        null,
        { STS: "12345" },
      ),
    ).resolves.toBe(12345);
  });

  test("reads configured PO tokens", () => {
    const ie = new TestYoutubeIE({
      params: { extractor_args: { youtube: ["po_token=web.gvs+YWJj"] } },
      async urlopen() {
        throw new Error("not used");
      },
      toScreen() {},
      reportWarning() {},
      reportError() {},
    });
    expect(ie.getConfigPoTokenForTest("web", PoTokenContext.GVS)).toBe("YWJj");
    expect(ie.getConfigPoTokenForTest("web", PoTokenContext.PLAYER)).toBeNull();
  });
});

describe("YouTube base renderer helpers", () => {
  const ie = new TestYoutubeBaseIE();

  test("Innertube client table matches core Python clients", () => {
    expect(Object.keys(INNERTUBE_CLIENTS).sort()).toEqual([
      "android",
      "android_vr",
      "ios",
      "mweb",
      "tv",
      "tv_downgraded",
      "tv_simply",
      "web",
      "web_creator",
      "web_embedded",
      "web_music",
      "web_safari",
    ]);
    expect(getInnertubeClient("web").INNERTUBE_HOST).toBe("www.youtube.com");
    expect(getInnertubeClient("web_music").INNERTUBE_HOST).toBe(
      "music.youtube.com",
    );
    expect(
      getInnertubeClient("android").GVS_PO_TOKEN_POLICY?.https
        ?.not_required_with_player_token,
    ).toBe(true);
    expect(shortClientName("web_safari")).toBe("WEBS");
    expect(shortClientName("tv_downgraded")).toBe("TVD");
  });

  test("builds API context and headers from ytcfg/default client", () => {
    expect(
      ie.extractContextForTest({
        INNERTUBE_CONTEXT: {
          client: { clientName: "WEB", clientVersion: "1" },
        },
      }),
    ).toMatchObject({
      client: {
        clientName: "WEB",
        clientVersion: "1",
        hl: "en",
        timeZone: "UTC",
        utcOffsetMinutes: 0,
      },
    });
    expect(
      ie.generateApiHeadersForTest({
        ytcfg: {
          INNERTUBE_CONTEXT_CLIENT_NAME: 67,
          INNERTUBE_CONTEXT: {
            client: { clientVersion: "1.2.3", userAgent: "UA" },
          },
          VISITOR_DATA: "visitor",
        },
        default_client: "web_music",
      }),
    ).toMatchObject({
      "X-YouTube-Client-Name": "67",
      "X-YouTube-Client-Version": "1.2.3",
      "X-Goog-Visitor-Id": "visitor",
      "User-Agent": "UA",
      Origin: "https://music.youtube.com",
    });
  });

  test("extracts ytcfg and session identifiers", () => {
    expect(
      ie.extractYtcfgForTest(
        "id",
        '<script>ytcfg.set({"SESSION_INDEX":"2","DATASYNC_ID":"delegated||user"});</script>',
      ),
    ).toEqual({
      SESSION_INDEX: "2",
      DATASYNC_ID: "delegated||user",
    });
    expect(TestYoutubeBaseIE._parse_data_sync_id("delegated||user")).toEqual([
      "delegated",
      "user",
    ]);
    expect(TestYoutubeBaseIE._parse_data_sync_id("primary||")).toEqual([
      null,
      "primary",
    ]);
    expect(
      ie.extractDataSyncIdForTest({
        responseContext: { mainAppWebResponseContext: { datasyncId: "a||b" } },
      }),
    ).toBe("a||b");
  });

  test("extracts continuation queries and alerts", () => {
    expect(
      TestYoutubeBaseIE._extract_next_continuation_data({
        continuations: [
          {
            nextContinuationData: {
              continuation: "token",
              clickTrackingParams: "ctp",
            },
          },
        ],
      }),
    ).toEqual({
      continuation: "token",
      clickTracking: { clickTrackingParams: "ctp" },
    });
    expect(
      TestYoutubeBaseIE._extract_continuation({
        contents: [
          {
            continuationItemRenderer: {
              continuationEndpoint: { continuationCommand: { token: "next" } },
            },
          },
        ],
      }),
    ).toEqual({ continuation: "next" });
    expect(
      TestYoutubeBaseIE._extract_alerts({
        alerts: [
          { alertRenderer: { type: "ERROR", text: { simpleText: "Nope" } } },
        ],
      }),
    ).toEqual([["ERROR", "Nope"]]);
  });

  test("extracts text from simpleText and runs", () => {
    expect(ie.getTextForTest({ simpleText: "Plain" })).toBe("Plain");
    expect(ie.getTextForTest({ runs: [{ text: "A" }, { text: "B" }] })).toBe(
      "AB",
    );
    expect(
      ie.getTextForTest({ title: { runs: [{ text: "Nested" }] } }, "title"),
    ).toBe("Nested");
  });

  test("extracts counts from YouTube text", () => {
    expect(ie.getCountForTest({ simpleText: "50K views" })).toBe(50_000);
    expect(ie.getCountForTest({ simpleText: "1,234 subscribers" })).toBe(1234);
  });

  test("extracts thumbnails and strips maxres query", () => {
    expect(
      ie.extractThumbnailsForTest(
        {
          thumbnail: {
            thumbnails: [
              {
                url: "https://i.ytimg.com/vi/x/maxresdefault.jpg?foo=1",
                width: 1280,
                height: 720,
              },
            ],
          },
        },
        "thumbnail",
      ),
    ).toEqual([
      {
        url: "https://i.ytimg.com/vi/x/maxresdefault.jpg",
        height: 720,
        width: 1280,
      },
    ]);
  });

  test("extracts known badges", () => {
    expect(
      ie.extractBadgesForTest([
        { metadataBadgeRenderer: { icon: { iconType: "CHECK" } } },
        { metadataBadgeRenderer: { style: "BADGE_STYLE_TYPE_LIVE_NOW" } },
        { metadataBadgeRenderer: { label: "Members only" } },
      ]),
    ).toEqual([
      { type: BadgeType.VERIFIED },
      { type: BadgeType.LIVE_NOW },
      { type: BadgeType.AVAILABILITY_SUBSCRIPTION },
    ]);
  });
});

describe("YouTube tab renderer helpers", () => {
  const ie = new TestYoutubeTabIE();

  test("extracts video renderer entries", () => {
    const result = ie.extractVideoForTest({
      videoId: "BaW_jenozKc",
      title: { runs: [{ text: "Test video" }] },
      lengthSeconds: "10",
      ownerText: { runs: [{ text: "yt-dlp" }] },
      shortBylineText: {
        runs: [
          {
            text: "yt-dlp",
            navigationEndpoint: {
              browseEndpoint: {
                browseId: "UC2_KI6RB__jGdlnK6dvFEZA",
                canonicalBaseUrl: "/@ytdlp",
              },
            },
          },
        ],
      },
      viewCountText: { simpleText: "1,234 views" },
      thumbnail: {
        thumbnails: [{ url: "https://i.ytimg.com/vi/BaW_jenozKc/default.jpg" }],
      },
      ownerBadges: [{ metadataBadgeRenderer: { icon: { iconType: "CHECK" } } }],
    });
    expect(result).toMatchObject({
      _type: "url",
      url: "https://www.youtube.com/watch?v=BaW_jenozKc",
      ie_key: YoutubeIE.ieKey(),
      id: "BaW_jenozKc",
      title: "Test video",
      duration: 10,
      channel_id: "UC2_KI6RB__jGdlnK6dvFEZA",
      channel: "yt-dlp",
      uploader_id: "@ytdlp",
      view_count: 1234,
      channel_is_verified: true,
    });
  });

  test("extracts channel renderer entries", () => {
    const result = ie.extractChannelForTest({
      channelId: "UC2_KI6RB__jGdlnK6dvFEZA",
      title: { simpleText: "yt-dlp" },
      subscriberCountText: { simpleText: "50K subscribers" },
      navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: "/@ytdlp" } },
    });
    expect(result).toMatchObject({
      _type: "url",
      url: "https://www.youtube.com/channel/UC2_KI6RB__jGdlnK6dvFEZA",
      ie_key: YoutubeTabIE.ieKey(),
      id: "UC2_KI6RB__jGdlnK6dvFEZA",
      title: "yt-dlp",
      channel_follower_count: 50_000,
      uploader_id: "@ytdlp",
    });
  });

  test("grid entries dispatch playlists, videos, and channels", () => {
    const entries = ie.gridEntriesForTest({
      items: [
        {
          gridPlaylistRenderer: {
            playlistId: "PL63F0C78739B09958",
            title: { simpleText: "Playlist" },
          },
        },
        {
          gridVideoRenderer: {
            videoId: "BaW_jenozKc",
            title: { simpleText: "Video" },
          },
        },
        {
          gridChannelRenderer: {
            channelId: "UC2_KI6RB__jGdlnK6dvFEZA",
            title: { simpleText: "Channel" },
          },
        },
      ],
    });
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://www.youtube.com/playlist?list=PL63F0C78739B09958",
      "https://www.youtube.com/watch?v=BaW_jenozKc",
      "https://www.youtube.com/channel/UC2_KI6RB__jGdlnK6dvFEZA",
    ]);
  });

  test("playlist entries handle playlist video renderers", () => {
    const entries = ie.playlistEntriesForTest({
      contents: [
        {
          playlistVideoRenderer: {
            videoId: "BaW_jenozKc",
            title: { simpleText: "Video" },
            lengthSeconds: "10",
          },
        },
        {
          playlistPanelVideoRenderer: {
            videoId: "yeWKywCrFtk",
            title: { simpleText: "Panel" },
          },
        },
      ],
    });
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://www.youtube.com/watch?v=BaW_jenozKc",
      "https://www.youtube.com/watch?v=yeWKywCrFtk",
    ]);
  });

  test("music responsive entries dispatch video playlist and browse URLs", () => {
    expect(
      ie.musicEntryForTest({
        playlistItemData: { videoId: "BaW_jenozKc" },
        flexColumns: [
          {
            musicResponsiveListItemFlexColumnRenderer: {
              text: { runs: [{ text: "Song" }] },
            },
          },
        ],
      }),
    ).toMatchObject({
      url: "https://music.youtube.com/watch?v=BaW_jenozKc",
      title: "Song",
      ie_key: YoutubeIE.ieKey(),
    });
    expect(
      ie.musicEntryForTest({
        navigationEndpoint: {
          watchEndpoint: {
            videoId: "BaW_jenozKc",
            playlistId: "PL63F0C78739B09958",
          },
        },
      }),
    ).toMatchObject({
      url: "https://music.youtube.com/watch?v=BaW_jenozKc&list=PL63F0C78739B09958",
      ie_key: YoutubeTabIE.ieKey(),
    });
    expect(
      ie.musicEntryForTest({
        navigationEndpoint: { browseEndpoint: { browseId: "MPLYt" } },
      }),
    ).toMatchObject({
      url: "https://music.youtube.com/browse/MPLYt",
      ie_key: YoutubeTabIE.ieKey(),
    });
  });

  test("rich entries handle lockup, playlist, and shorts renderers", () => {
    expect(
      ie.richEntriesForTest({
        content: {
          lockupViewModel: {
            contentId: "BaW_jenozKc",
            contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
            metadata: {
              lockupMetadataViewModel: { title: { content: "Lockup" } },
            },
          },
        },
      })[0],
    ).toMatchObject({
      url: "https://www.youtube.com/watch?v=BaW_jenozKc",
      title: "Lockup",
      ie_key: YoutubeIE.ieKey(),
    });
    expect(
      ie.richEntriesForTest({
        content: {
          playlistRenderer: {
            playlistId: "PL63F0C78739B09958",
            title: { simpleText: "Playlist" },
          },
        },
      })[0],
    ).toMatchObject({
      url: "https://www.youtube.com/playlist?list=PL63F0C78739B09958",
      ie_key: YoutubeTabIE.ieKey(),
    });
    expect(
      ie.richEntriesForTest({
        content: {
          shortsLockupViewModel: {
            entityId: "shorts-shelf-item",
            onTap: {
              innertubeCommand: {
                reelWatchEndpoint: { videoId: "BaW_jenozKc" },
              },
            },
            overlayMetadata: {
              primaryText: { content: "Short" },
              secondaryText: { content: "12K views" },
            },
          },
        },
      })[0],
    ).toMatchObject({
      url: "https://www.youtube.com/shorts/BaW_jenozKc",
      title: "Short",
      view_count: 12_000,
    });
  });

  test("shelf and post thread entries extract nested URLs", () => {
    expect(
      ie
        .shelfEntriesForTest({
          content: {
            gridRenderer: {
              items: [
                {
                  gridVideoRenderer: {
                    videoId: "BaW_jenozKc",
                    title: { simpleText: "Video" },
                  },
                },
              ],
            },
          },
        })
        .map((entry) => entry.url),
    ).toEqual(["https://www.youtube.com/watch?v=BaW_jenozKc"]);
    expect(
      ie
        .postThreadEntriesForTest({
          post: {
            backstagePostRenderer: {
              backstageAttachment: {
                playlistRenderer: { playlistId: "PL63F0C78739B09958" },
              },
              contentText: {
                runs: [
                  {
                    navigationEndpoint: {
                      urlEndpoint: {
                        url: "https://www.youtube.com/watch?v=BaW_jenozKc",
                      },
                    },
                  },
                ],
              },
            },
          },
        })
        .map((entry) => entry.url),
    ).toEqual([
      "https://www.youtube.com/playlist?list=PL63F0C78739B09958",
      "https://www.youtube.com/watch?v=BaW_jenozKc",
    ]);
  });

  test("extractEntries dispatches item section renderers and continuations", () => {
    const { entries, continuation } = ie.extractEntriesForTest({
      contents: [
        {
          itemSectionRenderer: {
            contents: [
              {
                videoRenderer: {
                  videoId: "BaW_jenozKc",
                  title: { simpleText: "Video" },
                },
              },
            ],
            continuations: [
              {
                nextContinuationData: {
                  continuation: "next",
                  clickTrackingParams: "ctp",
                },
              },
            ],
          },
        },
      ],
    });
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://www.youtube.com/watch?v=BaW_jenozKc",
    ]);
    expect(continuation).toEqual({
      continuation: "next",
      clickTracking: { clickTrackingParams: "ctp" },
    });
  });

  test("YoutubeTabIE extracts initial webpage tab entries", async () => {
    const data = {
      metadata: {
        channelMetadataRenderer: {
          title: "yt-dlp",
          externalId: "UC2_KI6RB__jGdlnK6dvFEZA",
          vanityChannelUrl: "https://www.youtube.com/@ytdlp",
          description: "Downloads",
        },
      },
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                selected: true,
                title: "Videos",
                content: {
                  sectionListRenderer: {
                    contents: [
                      {
                        itemSectionRenderer: {
                          contents: [
                            {
                              videoRenderer: {
                                videoId: "BaW_jenozKc",
                                title: { simpleText: "Video" },
                              },
                            },
                          ],
                          continuations: [
                            {
                              nextContinuationData: {
                                continuation: "next",
                                clickTrackingParams: "ctp",
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };
    const extractor = new YoutubeTabIE({
      params: {},
      async urlopen(request: string | URL | Request) {
        const requestUrl =
          request instanceof Request ? request.url : request.toString();
        if (requestUrl.includes("/youtubei/v1/browse")) {
          return new Response(
            JSON.stringify({
              onResponseReceivedActions: [
                {
                  appendContinuationItemsAction: {
                    continuationItems: [
                      {
                        videoRenderer: {
                          videoId: "yeWKywCrFtk",
                          title: { simpleText: "Continuation video" },
                        },
                      },
                    ],
                  },
                },
              ],
            }),
          );
        }
        return new Response(
          `<script>ytcfg.set({"VISITOR_DATA":"visitor"});</script><script>var ytInitialData = ${JSON.stringify(data)};</script>`,
        );
      },
      toScreen() {},
      reportWarning() {},
      reportError() {},
      writeDebug() {},
    });
    const result = await extractor.extract(
      "https://www.youtube.com/channel/UC2_KI6RB__jGdlnK6dvFEZA/videos",
    );
    expect(result).toMatchObject({
      _type: "playlist",
      id: "UC2_KI6RB__jGdlnK6dvFEZA",
      title: "yt-dlp - Videos",
      channel: "yt-dlp",
      uploader_id: "@ytdlp",
      webpage_url:
        "https://www.youtube.com/channel/UC2_KI6RB__jGdlnK6dvFEZA/videos",
    });
    expect([...(result?.entries as Iterable<unknown>)]).toMatchObject([
      { url: "https://www.youtube.com/watch?v=BaW_jenozKc", title: "Video" },
      {
        url: "https://www.youtube.com/watch?v=yeWKywCrFtk",
        title: "Continuation video",
      },
    ]);
  });

  test("YoutubePlaylistIE redirects playlist IDs to tab extractor", async () => {
    const result = await new YoutubePlaylistIE().extract("PL63F0C78739B09958");
    expect(result).toMatchObject({
      _type: "url",
      url: "https://www.youtube.com/playlist?list=PL63F0C78739B09958",
      id: "PL63F0C78739B09958",
      ie_key: YoutubeTabIE.ieKey(),
    });
  });
});

describe("YouTube search extractors", () => {
  test("ytsearch collects Innertube search result pages", async () => {
    const extractor = new YoutubeSearchIE(
      makeSearchDownloader([
        {
          contents: {
            twoColumnSearchResultsRenderer: {
              primaryContents: {
                sectionListRenderer: {
                  contents: [
                    {
                      itemSectionRenderer: {
                        contents: [
                          {
                            videoRenderer: {
                              videoId: "BaW_jenozKc",
                              title: { simpleText: "First" },
                            },
                          },
                        ],
                        continuations: [
                          {
                            nextContinuationData: {
                              continuation: "next",
                              clickTrackingParams: "ctp",
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        {
          onResponseReceivedCommands: [
            {
              appendContinuationItemsAction: {
                continuationItems: [
                  {
                    videoRenderer: {
                      videoId: "yeWKywCrFtk",
                      title: { simpleText: "Second" },
                    },
                  },
                ],
              },
            },
          ],
        },
      ]),
    );
    const result = await extractor.extract("ytsearch2:youtube-dl test video");
    expect(result).toMatchObject({
      _type: "playlist",
      id: "youtube-dl test video",
      title: "youtube-dl test video",
    });
    expect([...(result?.entries as Iterable<unknown>)]).toMatchObject([
      { url: "https://www.youtube.com/watch?v=BaW_jenozKc", title: "First" },
      { url: "https://www.youtube.com/watch?v=yeWKywCrFtk", title: "Second" },
    ]);
  });

  test("search URL extractors preserve query titles and music sections", async () => {
    const searchResult = await new YoutubeSearchURLIE(
      makeSearchDownloader([
        {
          contents: {
            twoColumnSearchResultsRenderer: {
              primaryContents: {
                sectionListRenderer: {
                  contents: [
                    {
                      itemSectionRenderer: {
                        contents: [
                          {
                            channelRenderer: {
                              channelId: "UC2_KI6RB__jGdlnK6dvFEZA",
                              title: { simpleText: "yt-dlp" },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      ]),
    ).extract(
      "https://www.youtube.com/results?search_query=yt-dlp&sp=EgIQAg%253D%253D",
    );
    expect(searchResult).toMatchObject({ id: "yt-dlp", title: "yt-dlp" });
    expect([...(searchResult?.entries as Iterable<unknown>)]).toMatchObject([
      {
        url: "https://www.youtube.com/channel/UC2_KI6RB__jGdlnK6dvFEZA",
        ie_key: YoutubeTabIE.ieKey(),
      },
    ]);

    const musicResult = await new YoutubeMusicSearchURLIE(
      makeSearchDownloader([
        {
          contents: {
            tabbedSearchResultsRenderer: {
              tabs: [
                {
                  tabRenderer: {
                    content: {
                      sectionListRenderer: {
                        contents: [
                          {
                            itemSectionRenderer: {
                              contents: [
                                {
                                  musicResponsiveListItemRenderer: {
                                    playlistItemData: {
                                      videoId: "BaW_jenozKc",
                                    },
                                  },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      ]),
    ).extract("https://music.youtube.com/search?q=royalty+free+music#songs");
    expect(musicResult).toMatchObject({
      id: "royalty free music - songs",
      title: "royalty free music - songs",
    });
    expect([...(musicResult?.entries as Iterable<unknown>)]).toMatchObject([
      {
        url: "https://music.youtube.com/watch?v=BaW_jenozKc",
        ie_key: YoutubeIE.ieKey(),
      },
    ]);
  });
});

describe("YouTube redirect extractors", () => {
  test("YoutubeYtBeIE returns a YoutubeTab watch URL with playlist", async () => {
    const result = await new YoutubeYtBeIE().extract(
      "https://youtu.be/yeWKywCrFtk?list=PL2qgrgXsNUG5ig9cat4ohreBjYLAPC0J5",
    );
    expect(result).toMatchObject({
      _type: "url",
      id: "PL2qgrgXsNUG5ig9cat4ohreBjYLAPC0J5",
      ie_key: YoutubeTabIE.ieKey(),
    });
    expect(result?.url).toBe(
      "https://www.youtube.com/watch?v=yeWKywCrFtk&list=PL2qgrgXsNUG5ig9cat4ohreBjYLAPC0J5&feature=youtu.be",
    );
  });

  test("livestream embed redirects to channel live tab", async () => {
    const result = await new YoutubeLivestreamEmbedIE().extract(
      "https://www.youtube.com/embed/live_stream?channel=UC2_KI6RB__jGdlnK6dvFEZA",
    );
    expect(result).toMatchObject({
      _type: "url",
      id: "UC2_KI6RB__jGdlnK6dvFEZA",
      ie_key: YoutubeTabIE.ieKey(),
      url: "https://www.youtube.com/channel/UC2_KI6RB__jGdlnK6dvFEZA/live",
    });
  });

  test("ytuser redirects to user tab", async () => {
    const result = await new YoutubeYtUserIE().extract("ytuser:phihag");
    expect(result).toMatchObject({
      _type: "url",
      id: "phihag",
      ie_key: YoutubeTabIE.ieKey(),
      url: "https://www.youtube.com/user/phihag",
    });
  });

  test.each([
    [
      new YoutubeFavouritesIE(),
      ":ytfav",
      "https://www.youtube.com/playlist?list=LL",
    ],
    [
      new YoutubeWatchLaterIE(),
      ":ytwatchlater",
      "https://www.youtube.com/playlist?list=WL",
    ],
    [
      new YoutubeRecommendedIE(),
      ":ytrec",
      "https://www.youtube.com/feed/recommended",
    ],
    [
      new YoutubeSubscriptionsIE(),
      ":ytsubs",
      "https://www.youtube.com/feed/subscriptions",
    ],
  ])("keyword redirect %#", async (extractor, url, expectedUrl) => {
    const result = await extractor.extract(url);
    expect(result).toMatchObject({
      _type: "url",
      ie_key: YoutubeTabIE.ieKey(),
      url: expectedUrl,
    });
  });

  test("shorts audio pivot builds sfv URL", async () => {
    const result = await new YoutubeShortsAudioPivotIE().extract(
      "https://www.youtube.com/source/Lyj-MZSAA9o/shorts",
    );
    expect(result?.url).toStartWith(
      "https://www.youtube.com/feed/sfv_audio_pivot?bp=",
    );
    expect(result?.ie_key).toBe(YoutubeTabIE.ieKey());
  });

  test("consent redirect extracts continue URL", async () => {
    const result = await new YoutubeConsentRedirectIE().extract(
      "https://consent.youtube.com/m?continue=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DBaW_jenozKc&gl=NL",
    );
    expect(result).toMatchObject({
      _type: "url",
      url: "https://www.youtube.com/watch?v=BaW_jenozKc",
    });
  });
});

function makeSearchDownloader(responses: unknown[]) {
  let responseIndex = 0;
  return {
    params: {},
    async urlopen(request: string | URL | Request) {
      const url = request instanceof Request ? request.url : request.toString();
      expect(url).toContain("/youtubei/v1/search");
      return new Response(
        JSON.stringify(
          responses[Math.min(responseIndex++, responses.length - 1)],
        ),
      );
    },
    toScreen() {},
    reportWarning() {},
    reportError() {},
  };
}

describe("YouTube clip and notifications extractors", () => {
  test("clip URL matching", () => {
    expect(
      YoutubeClipIE.suitable(
        "https://www.youtube.com/clip/UgytZKpehg-hEMBSn3F4AaABCQ",
      ),
    ).toBe(true);
  });

  test.each([
    ":ytnotif",
    ":ytnotifications",
  ])("notifications keyword matching %s", (url) => {
    expect(YoutubeNotificationsIE.suitable(url)).toBe(true);
  });

  test("notification renderer extracts video entry", () => {
    const result =
      new TestYoutubeNotificationsIE().extractNotificationRendererForTest({
        navigationEndpoint: { watchEndpoint: { videoId: "BaW_jenozKc" } },
        contextualMenu: {
          menuRenderer: {
            items: [
              null,
              {
                menuServiceItemRenderer: {
                  text: { runs: [{ text: "unused" }, { text: "yt-dlp" }] },
                },
              },
            ],
          },
        },
        shortMessage: { simpleText: "yt-dlp uploaded: Test video" },
        videoThumbnail: {
          thumbnails: [
            {
              url: "https://i.ytimg.com/vi/BaW_jenozKc/default.jpg",
              width: 120,
              height: 90,
            },
          ],
        },
      });
    expect(result).toMatchObject({
      _type: "url",
      url: "https://www.youtube.com/watch?v=BaW_jenozKc",
      ie_key: YoutubeIE.ieKey(),
      video_id: "BaW_jenozKc",
      title: "Test video",
      channel: "yt-dlp",
      thumbnails: [
        {
          url: "https://i.ytimg.com/vi/BaW_jenozKc/default.jpg",
          width: 120,
          height: 90,
        },
      ],
    });
  });

  test("notification renderer extracts community post entry", () => {
    const result =
      new TestYoutubeNotificationsIE().extractNotificationRendererForTest({
        navigationEndpoint: {
          browseEndpoint: {
            browseId: "UC2_KI6RB__jGdlnK6dvFEZA",
            canonicalBaseUrl: "/post/Ugkx123",
          },
        },
        contextualMenu: {
          menuRenderer: {
            items: [
              null,
              {
                menuServiceItemRenderer: {
                  text: { runs: [{ text: "unused" }, { text: "Channel" }] },
                },
              },
            ],
          },
        },
        shortMessage: { simpleText: "Channel posted: Community update" },
      });
    expect(result).toMatchObject({
      _type: "url",
      url: "https://www.youtube.com/channel/UC2_KI6RB__jGdlnK6dvFEZA/community?lb=Ugkx123",
      ie_key: YoutubeTabIE.ieKey(),
      channel_id: "UC2_KI6RB__jGdlnK6dvFEZA",
      channel: "Channel",
    });
  });

  test("notification menu extraction follows continuations", async () => {
    const extractor = new YoutubeNotificationsIE({
      params: {},
      async urlopen() {
        return new Response(
          JSON.stringify(
            notificationResponses.shift() ?? notificationResponses.at(-1),
          ),
        );
      },
      toScreen() {},
      reportWarning() {},
      reportError() {},
    });
    const notificationResponses = [
      {
        actions: [
          {
            openPopupAction: {
              popup: {
                multiPageMenuRenderer: {
                  sections: [
                    {
                      multiPageMenuNotificationSectionRenderer: {
                        items: [
                          {
                            notificationRenderer: {
                              navigationEndpoint: {
                                watchEndpoint: { videoId: "BaW_jenozKc" },
                              },
                              shortMessage: {
                                simpleText: "Channel uploaded: First",
                              },
                            },
                          },
                          {
                            continuationItemRenderer: {
                              continuationEndpoint: {
                                getNotificationMenuEndpoint: { ctoken: "next" },
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
      {
        actions: [
          {
            appendContinuationItemsAction: {
              continuationItems: [
                {
                  notificationRenderer: {
                    navigationEndpoint: {
                      watchEndpoint: { videoId: "yeWKywCrFtk" },
                    },
                    shortMessage: { simpleText: "Channel uploaded: Second" },
                  },
                },
              ],
            },
          },
        ],
      },
    ];
    const result = await extractor.extract(":ytnotif");
    expect(result).toMatchObject({
      _type: "playlist",
      id: "notifications",
      title: "notifications",
    });
    expect([...(result?.entries as Iterable<unknown>)]).toMatchObject([
      { url: "https://www.youtube.com/watch?v=BaW_jenozKc" },
      { url: "https://www.youtube.com/watch?v=yeWKywCrFtk" },
    ]);
  });
});

describe("YouTube mistake extractors", () => {
  test("truncated URL reports quote guidance", async () => {
    await expect(
      new YoutubeTruncatedURLIE().extract(
        "https://www.youtube.com/watch?feature=foo",
      ),
    ).rejects.toThrow(ExtractorError);
  });

  test("truncated ID reports incomplete ID", async () => {
    await expect(
      new YoutubeTruncatedIDIE().extract(
        "https://www.youtube.com/watch?v=N_708QY7Ob",
      ),
    ).rejects.toThrow(/Incomplete YouTube ID/);
  });
});
