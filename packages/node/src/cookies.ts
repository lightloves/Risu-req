import type { CookieEntry, CookieJarLike } from "./types.js";

function parseSetCookieString(headerValue: string): CookieEntry | null {
  const parts = headerValue.split(";").map((part) => part.trim());
  if (parts.length === 0 || parts[0] === "") {
    return null;
  }

  const firstEqual = parts[0].indexOf("=");
  if (firstEqual === -1) {
    return null;
  }

  const name = parts[0].slice(0, firstEqual).trim();
  const value = parts[0].slice(firstEqual + 1).trim();
  if (name === "") {
    return null;
  }

  const entry: CookieEntry = { name, value };

  for (let i = 1; i < parts.length; i++) {
    const attribute = parts[i];
    const attributeEqual = attribute.indexOf("=");
    const attrName = (attributeEqual === -1 ? attribute : attribute.slice(0, attributeEqual)).trim().toLowerCase();
    const attrValue = attributeEqual === -1 ? "" : attribute.slice(attributeEqual + 1).trim();

    if (attrName === "domain") {
      entry.domain = attrValue.startsWith(".") ? attrValue.slice(1).toLowerCase() : attrValue.toLowerCase();
    } else if (attrName === "path") {
      entry.path = attrValue.startsWith("/") ? attrValue : "/" + attrValue;
    } else if (attrName === "expires") {
      const parsedDate = new Date(attrValue);
      if (!Number.isNaN(parsedDate.getTime())) {
        entry.expires = parsedDate;
      }
    } else if (attrName === "max-age") {
      const seconds = Number.parseInt(attrValue, 10);
      if (!Number.isNaN(seconds)) {
        entry.maxAge = seconds;
        entry.expires = new Date(Date.now() + seconds * 1000);
      }
    } else if (attrName === "secure") {
      entry.secure = true;
    } else if (attrName === "httponly") {
      entry.httpOnly = true;
    } else if (attrName === "samesite") {
      const lower = attrValue.toLowerCase();
      if (lower === "strict") {
        entry.sameSite = "Strict";
      } else if (lower === "lax") {
        entry.sameSite = "Lax";
      } else if (lower === "none") {
        entry.sameSite = "None";
      }
    }
  }

  return entry;
}

export function splitSetCookieHeaders(header: string | string[] | undefined): string[] {
  if (!header) {
    return [];
  }
  if (Array.isArray(header)) {
    return header.flatMap((item) => splitSetCookieHeaders(item));
  }

  const results: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < header.length; i++) {
    const char = header[i];
    if (char === '"') {
      insideQuotes = !insideQuotes;
      current += char;
    } else if (char === "," && !insideQuotes) {
      const nextSegment = header.slice(i + 1).trimStart();
      const isExpiresDate = /^(mon|tue|wed|thu|fri|sat|sun),/i.test(header.slice(Math.max(0, i - 3), i + 1));
      if (isExpiresDate || /^[0-9]{1,2}-[a-zA-Z]{3}-[0-9]{4}/.test(nextSegment)) {
        current += char;
      } else {
        if (current.trim().length > 0) {
          results.push(current.trim());
        }
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current.trim().length > 0) {
    results.push(current.trim());
  }

  return results;
}

function isDomainMatch(cookieDomain: string | undefined, requestHost: string, isHostOnly: boolean): boolean {
  const normalizedHost = requestHost.toLowerCase();
  if (!cookieDomain || isHostOnly) {
    return normalizedHost === (cookieDomain ?? normalizedHost);
  }

  const normalizedCookieDomain = cookieDomain.toLowerCase();
  if (normalizedHost === normalizedCookieDomain) {
    return true;
  }

  return normalizedHost.endsWith("." + normalizedCookieDomain);
}

function isPathMatch(cookiePath: string | undefined, requestPath: string): boolean {
  const normalizedCookiePath = cookiePath || "/";
  const normalizedRequestPath = requestPath || "/";

  if (normalizedRequestPath === normalizedCookiePath) {
    return true;
  }

  if (normalizedRequestPath.startsWith(normalizedCookiePath)) {
    if (normalizedCookiePath.endsWith("/")) {
      return true;
    }
    if (normalizedRequestPath[normalizedCookiePath.length] === "/") {
      return true;
    }
  }

  return false;
}

interface StoredCookie extends CookieEntry {
  hostOnly: boolean;
  creationTime: number;
}

export class CookieJar implements CookieJarLike {
  private readonly store: Map<string, StoredCookie> = new Map();

  setCookie(rawHeaderOrEntry: string | CookieEntry, url: string | URL): void {
    const parsedUrl = typeof url === "string" ? new URL(url) : url;
    const requestHost = parsedUrl.hostname.toLowerCase();

    let entry: CookieEntry | null;
    if (typeof rawHeaderOrEntry === "string") {
      entry = parseSetCookieString(rawHeaderOrEntry);
    } else {
      entry = { ...rawHeaderOrEntry };
    }

    if (!entry) {
      return;
    }

    const hostOnly = !entry.domain;
    if (entry.domain) {
      const normalizedDomain = entry.domain.toLowerCase();
      if (!isDomainMatch(normalizedDomain, requestHost, false)) {
        return;
      }
      if (!normalizedDomain.includes(".") && normalizedDomain !== "localhost") {
        return;
      }
      entry.domain = normalizedDomain;
    } else {
      entry.domain = requestHost;
    }

    if (!entry.path) {
      const pathname = parsedUrl.pathname;
      const lastSlash = pathname.lastIndexOf("/");
      entry.path = lastSlash <= 0 ? "/" : pathname.slice(0, lastSlash);
    }

    const key = `${entry.domain}:${entry.path}:${entry.name}`;
    const stored: StoredCookie = {
      ...entry,
      hostOnly,
      creationTime: Date.now(),
    };

    if (entry.expires && entry.expires.getTime() <= Date.now()) {
      this.store.delete(key);
    } else {
      this.store.set(key, stored);
    }
  }

  setCookies(rawHeaders: string[] | string, url: string | URL): void {
    const splitHeaders = splitSetCookieHeaders(rawHeaders);
    for (const raw of splitHeaders) {
      this.setCookie(raw, url);
    }
  }

  getCookies(url: string | URL): CookieEntry[] {
    const parsedUrl = typeof url === "string" ? new URL(url) : url;
    const requestHost = parsedUrl.hostname.toLowerCase();
    const requestPath = parsedUrl.pathname || "/";
    const isHttps = parsedUrl.protocol === "https:";
    const now = Date.now();

    const matched: CookieEntry[] = [];
    const expiredKeys: string[] = [];

    for (const [key, stored] of this.store.entries()) {
      if (stored.expires && stored.expires.getTime() <= now) {
        expiredKeys.push(key);
        continue;
      }

      if (!isDomainMatch(stored.domain, requestHost, stored.hostOnly)) {
        continue;
      }

      if (!isPathMatch(stored.path, requestPath)) {
        continue;
      }

      if (stored.secure && !isHttps) {
        continue;
      }

      matched.push({
        name: stored.name,
        value: stored.value,
        domain: stored.domain,
        path: stored.path,
        expires: stored.expires,
        maxAge: stored.maxAge,
        secure: stored.secure,
        httpOnly: stored.httpOnly,
        sameSite: stored.sameSite,
      });
    }

    for (const expiredKey of expiredKeys) {
      this.store.delete(expiredKey);
    }

    return matched;
  }

  getCookieString(url: string | URL): string {
    const cookies = this.getCookies(url);
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  }

  clear(): void {
    this.store.clear();
  }
}
