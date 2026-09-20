import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;

const BLOCKED_IPV4_CIDRS = ([
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
] as const).map(([network, prefix]) => ({ network: ipv4ToInt(network), prefix }));

const BLOCKED_IPV6_CIDRS = ([
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:2::", 48],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8]
] as const).map(([network, prefix]) => ({ network: ipv6ToBigInt(network)!, prefix }));

export type UrlMetadata = {
  title: string | null;
  description: string | null;
  faviconUrl: string | null;
};

type ResolvedAddress = { address: string; family: 4 | 6 };

export async function fetchUrlMetadata(rawUrl: string): Promise<UrlMetadata> {
  const response = await requestHtml(new URL(rawUrl), 0);
  return parseMetadata(response.html, response.finalUrl);
}

async function requestHtml(url: URL, redirectCount: number): Promise<{ html: string; finalUrl: URL }> {
  assertHttpUrl(url);
  const target = await resolvePublicAddress(url.hostname);
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: "GET",
      headers: {
        "User-Agent": "OhMyFavorites/0.1 (+self-hosted metadata fetcher)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1"
      },
      timeout: REQUEST_TIMEOUT_MS,
      lookup: ((_hostname: string, options: { all?: boolean } | number, callback: (...args: any[]) => void) => {
        if (typeof options === "object" && options.all) {
          callback(null, [{ address: target.address, family: target.family }]);
          return;
        }
        callback(null, target.address, target.family);
      }) as any
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;

      if (status >= 300 && status < 400 && location) {
        response.resume();
        if (redirectCount >= MAX_REDIRECTS) {
          reject(new Error("Too many redirects"));
          return;
        }
        const redirected = new URL(location, url);
        void requestHtml(redirected, redirectCount + 1).then(resolve, reject);
        return;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`Metadata request failed with status ${status}`));
        return;
      }

      const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        response.resume();
        reject(new Error("URL is not an HTML document"));
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_HTML_BYTES) {
          request.destroy(new Error("HTML document exceeds metadata size limit"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        resolve({ html: Buffer.concat(chunks).toString("utf8"), finalUrl: url });
      });
      response.on("error", reject);
    });

    request.on("timeout", () => request.destroy(new Error("Metadata request timed out")));
    request.on("error", reject);
    request.end();
  });
}

export async function resolvePublicAddress(hostname: string): Promise<ResolvedAddress> {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    throw new Error("Local addresses are not allowed");
  }

  if (isIP(normalized)) {
    if (isBlockedIp(normalized)) throw new Error("Private or reserved addresses are not allowed");
    return { address: normalized, family: isIP(normalized) as 4 | 6 };
  }

  const addresses = await lookup(normalized, { all: true, verbatim: true });
  if (addresses.length === 0) throw new Error("Hostname did not resolve");
  if (addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new Error("Hostname resolves to a private or reserved address");
  }

  const chosen = addresses[0]!;
  return { address: chosen.address, family: chosen.family as 4 | 6 };
}

export function isBlockedIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const value = ipv4ToInt(address);
    return BLOCKED_IPV4_CIDRS.some(({ network, prefix }) => ipv4InCidr(value, network, prefix));
  }
  if (version === 6) {
    const value = ipv6ToBigInt(address);
    if (value === null) return true;
    return BLOCKED_IPV6_CIDRS.some(({ network, prefix }) => ipv6InCidr(value, network, prefix));
  }
  return true;
}

function ipv4ToInt(address: string) {
  return address.split(".").reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);
}

function ipv4InCidr(value: number, network: number, prefix: number) {
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return ((value & mask) >>> 0) === ((network & mask) >>> 0);
}

function ipv6ToBigInt(address: string): bigint | null {
  if (address.includes("%")) return null;
  const halves = address.toLowerCase().split("::");
  if (halves.length > 2) return null;

  const expandPart = (part: string) => {
    if (!part) return [] as string[];
    const pieces = part.split(":");
    const last = pieces.at(-1);
    if (last?.includes(".")) {
      const ipv4 = ipv4ToInt(last);
      pieces.splice(pieces.length - 1, 1, ((ipv4 >>> 16) & 0xffff).toString(16), (ipv4 & 0xffff).toString(16));
    }
    return pieces;
  };

  const head = expandPart(halves[0] ?? "");
  const tail = expandPart(halves[1] ?? "");
  const hasCompression = halves.length === 2;
  const zeroCount = hasCompression ? 8 - head.length - tail.length : 0;
  if (zeroCount < 0 || (!hasCompression && head.length !== 8)) return null;

  const groups = hasCompression
    ? [...head, ...Array(zeroCount).fill("0"), ...tail]
    : head;
  if (groups.length !== 8) return null;

  let value = 0n;
  for (const group of groups) {
    const parsed = Number.parseInt(group, 16);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff) return null;
    value = (value << 16n) | BigInt(parsed);
  }
  return value;
}

function ipv6InCidr(value: bigint, network: bigint, prefix: number) {
  if (prefix === 0) return true;
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (network >> shift);
}

function assertHttpUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported");
  }
  if (url.username || url.password) throw new Error("URLs containing credentials are not allowed");
}

export function parseMetadata(html: string, pageUrl: URL): UrlMetadata {
  const title = firstNonEmpty(
    getMetaContent(html, "property", "og:title"),
    getMetaContent(html, "name", "twitter:title"),
    getTitle(html)
  );
  const description = firstNonEmpty(
    getMetaContent(html, "property", "og:description"),
    getMetaContent(html, "name", "description"),
    getMetaContent(html, "name", "twitter:description")
  );
  const favicon = getFavicon(html);

  return {
    title: title ? cleanText(title).slice(0, 500) : null,
    description: description ? cleanText(description).slice(0, 2_000) : null,
    faviconUrl: favicon ? safeAbsoluteUrl(favicon, pageUrl) : null
  };
}

function getTitle(html: string) {
  return html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
}

function getMetaContent(html: string, key: "name" | "property", value: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attributes = parseAttributes(tag);
    if (attributes[key]?.toLowerCase() === value.toLowerCase() && attributes.content) return attributes.content;
  }
  return null;
}

function getFavicon(html: string) {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attributes = parseAttributes(tag);
    const rel = attributes.rel?.toLowerCase().split(/\s+/) ?? [];
    if (rel.includes("icon") && attributes.href) return attributes.href;
  }
  return "/favicon.ico";
}

function parseAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  const regex = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(regex)) {
    attributes[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

function cleanText(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_entity, body: string) => {
    if (body[0] === "#") {
      const hex = body[1]?.toLowerCase() === "x";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _entity;
    }
    return named[body.toLowerCase()] ?? _entity;
  });
}

function safeAbsoluteUrl(value: string, base: URL) {
  try {
    const url = new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function firstNonEmpty(...values: Array<string | null>) {
  return values.find((value): value is string => Boolean(value?.trim())) ?? null;
}
