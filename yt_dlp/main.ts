// Source: yt_dlp/__main__.py

import { main } from "./index.ts";

if (import.meta.main) {
  process.exitCode = await main();
}
