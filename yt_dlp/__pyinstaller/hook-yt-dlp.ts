// Source: yt_dlp/__pyinstaller/hook-yt_dlp.py
// Port note: PyInstaller collection is represented as static metadata because Bun does not bundle through PyInstaller.

export function pycryptodomeModule(): "bun:crypto" {
  // Logic change: Python Crypto/Cryptodome probing is replaced by Bun's native crypto surface.
  return "bun:crypto";
}

export function getHiddenImports(): string[] {
  return [
    "yt_dlp/compat/legacy",
    "yt_dlp/compat/deprecated",
    "yt_dlp/utils",
    "yt_dlp/dependencies/Cryptodome",
  ];
}

export const hiddenimports = getHiddenImports();
export const excludedimports = ["youtube_dl", "youtube_dlc", "test", "ytdlp_plugins", "devscripts", "bundle"];
export const datas: string[] = [];

export const pycryptodome_module = pycryptodomeModule;
export const get_hidden_imports = getHiddenImports;
