import { lines, plural } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";
import { pkgInstall } from "../distro.js";

/**
 * Network connectivity: default route and DNS resolution. This is the #1
 * reason people reach for a diagnostic tool, and it was missing entirely.
 * Every command is bounded by ctx.run's timeout so a hung resolver or a
 * half-configured interface cannot stall the whole report.
 */

export const network = defineCheck({
  id: "network",
  title: "Network connectivity and DNS",
  category: "network",
  async run(ctx) {
    const findings = [];

    const [addr, route] = await Promise.all([
      ctx.run("ip -brief addr show 2>/dev/null"),
      ctx.run("ip route show default 2>/dev/null"),
    ]);
    if (addr.missing && route.missing) {
      findings.push(finding({
        severity: "info",
        code: "network/skipped",
        title: "Network check skipped",
        detail: "`ip` (iproute2) is not available on this system, so network connectivity could not be checked.",
        evidence: "ip: not found",
        fix: `Install iproute2 (${pkgInstall(ctx.dist, { fedora: "iproute", "*": "iproute2" })}) and re-run.`,
        confidence: "high",
      }));
      return findings;
    }

    const interfaces = lines(addr.stdout).filter((l) => / UP /.test(l));
    const ifaceNames = interfaces.length ? interfaces.map((l) => l.split(/\s+/)[0]).join(", ") : "none";

    if (!route.ok || route.stdout.trim() === "") {
      findings.push(finding({
        severity: "medium",
        code: "network/no-route",
        title: "No default network route",
        detail:
          "The system has no default gateway, so it cannot reach the internet. " +
          (interfaces.length
            ? `Active ${plural(interfaces.length, "interface")}: ${ifaceNames}.`
            : "No network interface is up."),
        evidence: `interfaces: ${ifaceNames}\nroute: none`,
        fix: interfaces.length
          ? `Reconnect to your network, e.g. \`nmcli device connect ${interfaces[0].split(/\s+/)[0]}\` (NetworkManager), or check your router/wifi.`
          : "Bring an interface up: `nmcli device status` to see what is available, then `nmcli device connect <iface>`.",
        confidence: "medium",
      }));
      return findings;
    }

    // DNS is only meaningful when there is a route. Time the resolution to
    // catch slow resolvers — the most common "net is slow" complaint.
    const t0 = Date.now();
    const dns = await ctx.run("getent ahostsv4 kernel.org 2>/dev/null | head -1");
    const dnsMs = Date.now() - t0;
    if (!dns.ok || dns.stdout.trim() === "") {
      findings.push(finding({
        severity: "medium",
        code: "network/dns",
        title: "DNS resolution is failing",
        detail:
          "There is a default route, but the system resolver could not look up kernel.org. " +
          "Web browsing and many services will not work.",
        evidence: "getent ahostsv4 kernel.org → no result",
        fix: "Check /etc/resolv.conf, re-apply your connection (`nmcli device reapply <iface>`), and if you use a VPN check its DNS settings.",
        confidence: "medium",
      }));
      return findings;
    }

    if (dnsMs > 500) {
      findings.push(finding({
        severity: "medium",
        code: "network/dns-slow",
        title: `DNS resolution is slow (${dnsMs}ms)` ,
        detail:
          `kernel.org resolved in ${dnsMs}ms — normal is under 100ms. ` +
          "Slow DNS makes every web request feel sluggish.",
        evidence: `getent ahostsv4 kernel.org → ${dns.stdout.trim().split("\n")[0]} (${dnsMs}ms)`,
        fix: "Check /etc/resolv.conf for slow or misconfigured nameservers. Consider switching to a faster resolver (e.g. 1.1.1.1 or 8.8.8.8).",
        confidence: "high",
      }));
    }

    findings.push(finding({
      severity: "info",
      code: "network/ok",
      title: "Network and DNS look healthy",
      detail: `There is a default route and the system resolver works (kernel.org resolved in ${dnsMs}ms).`,
      evidence: route.stdout.trim().split("\n")[0],
      fix: null,
      confidence: "high",
    }));
    return findings;
  },
});
