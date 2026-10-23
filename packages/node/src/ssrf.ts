import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { SsrfError } from "./errors.js";

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((segment) => Number.parseInt(segment, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return -1;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inIpv4Range(targetInt: number, baseIp: string, prefixLength: number): boolean {
  const baseInt = ipv4ToInt(baseIp);
  if (baseInt === -1 || targetInt === -1) {
    return false;
  }
  const mask = prefixLength === 0 ? 0 : (~0 << (32 - prefixLength)) >>> 0;
  return (targetInt & mask) === (baseInt & mask);
}

export function isPrivateIpv4Int(targetInt: number): boolean {
  if (targetInt < 0 || targetInt > 0xffffffff) {
    return true;
  }

  return (
    inIpv4Range(targetInt, "0.0.0.0", 8) ||
    inIpv4Range(targetInt, "10.0.0.0", 8) ||
    inIpv4Range(targetInt, "100.64.0.0", 10) ||
    inIpv4Range(targetInt, "127.0.0.0", 8) ||
    inIpv4Range(targetInt, "169.254.0.0", 16) ||
    inIpv4Range(targetInt, "172.16.0.0", 12) ||
    inIpv4Range(targetInt, "192.0.0.0", 24) ||
    inIpv4Range(targetInt, "192.0.2.0", 24) ||
    inIpv4Range(targetInt, "192.168.0.0", 16) ||
    inIpv4Range(targetInt, "198.18.0.0", 15) ||
    inIpv4Range(targetInt, "198.51.100.0", 24) ||
    inIpv4Range(targetInt, "203.0.113.0", 24) ||
    inIpv4Range(targetInt, "224.0.0.0", 4) ||
    inIpv4Range(targetInt, "240.0.0.0", 4) ||
    targetInt === 0xffffffff
  );
}

export function isPrivateIpv4(ip: string): boolean {
  const targetInt = ipv4ToInt(ip);
  if (targetInt === -1) {
    return true;
  }
  return isPrivateIpv4Int(targetInt);
}

export function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === "::1" || normalized === "::") {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice(7);
    if (isIP(mapped) === 4) {
      return isPrivateIpv4(mapped);
    }
  }

  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  if (normalized.startsWith("ff")) {
    return true;
  }

  if (normalized.startsWith("2001:db8:")) {
    return true;
  }

  return false;
}

export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    return isPrivateIpv4(ip);
  }
  if (version === 6) {
    return isPrivateIpv6(ip);
  }

  if (/^\d+$/.test(ip)) {
    const num = Number.parseInt(ip, 10);
    if (!Number.isNaN(num) && num >= 0 && num <= 0xffffffff) {
      return isPrivateIpv4Int(num >>> 0);
    }
  }

  if (/^0x[0-9a-fA-F]+$/.test(ip)) {
    const num = Number.parseInt(ip, 16);
    if (!Number.isNaN(num) && num >= 0 && num <= 0xffffffff) {
      return isPrivateIpv4Int(num >>> 0);
    }
  }

  return true;
}

export async function verifySsrfSafety(hostname: string): Promise<string> {
  const normalized = hostname.trim().toLowerCase();

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    throw new SsrfError(`SSRF blocked host: ${hostname}`, hostname);
  }

  if (/^\d+$/.test(normalized) || /^0x[0-9a-fA-F]+$/.test(normalized)) {
    if (isPrivateIp(normalized)) {
      throw new SsrfError(`SSRF blocked alternate format IP: ${normalized}`, hostname, normalized);
    }
  }

  const directIpType = isIP(normalized);
  if (directIpType !== 0) {
    if (isPrivateIp(normalized)) {
      throw new SsrfError(`SSRF blocked IP: ${normalized}`, hostname, normalized);
    }
    return normalized;
  }

  const addresses = await lookup(normalized, { all: true });
  if (!addresses || addresses.length === 0) {
    throw new SsrfError(`Unable to resolve host for SSRF check: ${hostname}`, hostname);
  }

  for (const entry of addresses) {
    if (isPrivateIp(entry.address)) {
      throw new SsrfError(
        `SSRF protection blocked destination ${hostname} resolving to private address ${entry.address}`,
        hostname,
        entry.address
      );
    }
  }

  return addresses[0].address;
}
