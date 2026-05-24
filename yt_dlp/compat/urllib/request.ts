// Source: yt_dlp/compat/urllib/request.py
// Port note: proxy discovery is limited to environment variables; Bun does not read the Windows Python registry path.

export interface ProxyMap {
  http?: string;
  https?: string;
  ftp?: string;
  no_proxy?: string;
}

export function getproxies(): ProxyMap {
  const env = process.env;
  return {
    http: env.http_proxy ?? env.HTTP_PROXY,
    https: env.https_proxy ?? env.HTTPS_PROXY,
    ftp: env.ftp_proxy ?? env.FTP_PROXY,
    no_proxy: env.no_proxy ?? env.NO_PROXY,
  };
}

export const getproxies_environment = getproxies;
