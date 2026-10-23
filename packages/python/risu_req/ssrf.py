import ipaddress
import socket
from typing import List
from risu_req.errors import SsrfError


def is_private_ip(ip_str: str) -> bool:
    """Determine whether an IP address is private, loopback, link-local, or reserved."""
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        try:
            if ip_str.isdigit():
                num = int(ip_str)
                if 0 <= num <= 0xFFFFFFFF:
                    ip = ipaddress.IPv4Address(num)
                else:
                    return True
            elif ip_str.lower().startswith("0x"):
                num = int(ip_str, 16)
                if 0 <= num <= 0xFFFFFFFF:
                    ip = ipaddress.IPv4Address(num)
                else:
                    return True
            else:
                return True
        except Exception:
            return True

    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        return True

    if ip.version == 4:
        cgnat = ipaddress.ip_network("100.64.0.0/10")
        benchmarking = ipaddress.ip_network("198.18.0.0/15")
        testnet1 = ipaddress.ip_network("192.0.2.0/24")
        testnet2 = ipaddress.ip_network("198.51.100.0/24")
        testnet3 = ipaddress.ip_network("203.0.113.0/24")
        if (
            ip in cgnat
            or ip in benchmarking
            or ip in testnet1
            or ip in testnet2
            or ip in testnet3
        ):
            return True

    return False


def verify_ssrf_safety(hostname: str) -> str:
    """Verify that a destination hostname does not resolve to restricted internal networks."""
    normalized = hostname.strip().lower()

    if (
        normalized == "localhost"
        or normalized.endswith(".localhost")
        or normalized.endswith(".local")
        or normalized.endswith(".internal")
    ):
        raise SsrfError(f"SSRF blocked host: {hostname}", host=hostname)

    if normalized.isdigit() or normalized.startswith("0x"):
        if is_private_ip(normalized):
            raise SsrfError(
                f"SSRF blocked alternate IP: {normalized}",
                host=hostname,
                resolved_address=normalized,
            )

    try:
        ip = ipaddress.ip_address(normalized)
        if is_private_ip(str(ip)):
            raise SsrfError(
                f"SSRF blocked IP: {normalized}",
                host=hostname,
                resolved_address=str(ip),
            )
        return str(ip)
    except ValueError:
        pass

    try:
        addr_info = socket.getaddrinfo(normalized, None)
    except Exception as exc:
        raise SsrfError(
            f"Unable to resolve host for SSRF check: {hostname}",
            host=hostname,
            cause=exc,
        )

    resolved_ips: List[str] = []
    for item in addr_info:
        sockaddr = item[4]
        ip_addr = sockaddr[0]
        resolved_ips.append(ip_addr)

    if not resolved_ips:
        raise SsrfError(
            f"No addresses resolved for host: {hostname}",
            host=hostname,
        )

    for resolved in resolved_ips:
        if is_private_ip(resolved):
            raise SsrfError(
                f"SSRF protection blocked destination {hostname} resolving to private address {resolved}",
                host=hostname,
                resolved_address=resolved,
            )

    return resolved_ips[0]
