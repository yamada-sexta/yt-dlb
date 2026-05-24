// Source: yt_dlp/downloader/ism.py
// Port note: ISM PIFF box generation and fragment muxing remain unsupported until the media muxing layer is ported.

import { UnsupportedFD } from "./common.ts";

export class IsmFD extends UnsupportedFD {}
