/**
 * Helpers shared by more than one check. Keeping the detection here means the
 * same root cause is detected — and worded — identically everywhere; see
 * src/dedupe.js for how duplicate reports collapse into one finding.
 */

/**
 * Detects software (CPU) rendering via glxinfo. Returns the renderer string
 * (e.g. "llvmpipe (LLVM 19.1.4, 256 bits)") when rendering is software, or
 * null when the GPU is being used (or glxinfo is not available).
 */
export async function detectSoftwareRenderer(ctx) {
  const glx = await ctx.run("glxinfo -B 2>/dev/null | grep -i 'renderer string'");
  const renderer = glx.stdout.toLowerCase();
  if (renderer && /llvmpipe|softpipe|swrast|software/i.test(renderer)) {
    return glx.stdout.trim();
  }
  return null;
}

/**
 * Firewall detection shared by the security and ports checks (one probe, one
 * wording). `nft list ruleset` needs CAP_NET_ADMIN, so on a non-root run the
 * probe fails even when nftables is filtering traffic — historically that was
 * read as "no firewall". Here `determined` is false in exactly that case, so
 * callers can say "unknown" instead of asserting a false negative (which also
 * used to drive the ufw-enable safe-fix).
 */
export async function detectFirewall(ctx) {
  const [firewalld, ufw, nftables, nft] = await Promise.all([
    ctx.run("systemctl is-active firewalld 2>/dev/null"),
    ctx.run("systemctl is-active ufw 2>/dev/null"),
    ctx.run("systemctl is-active nftables 2>/dev/null"),
    ctx.run("nft list ruleset 2>/dev/null | head -5"),
  ]);
  const activeUnit = [["firewalld", firewalld], ["ufw", ufw], ["nftables", nftables]]
    .find(([, r]) => r.stdout.trim() === "active");
  const active = Boolean(activeUnit) || (nft.ok && nft.stdout.trim().length > 0);
  // Conclusive when a service is active, when we could read the ruleset
  // (ok, even if empty), or when nftables is not installed at all.
  const determined = active || nft.ok || nft.missing === true;
  const evidence = activeUnit
    ? `${activeUnit[0]} is active`
    : nft.ok
      ? (nft.stdout.trim() ? "nftables rules present" : "nftables ruleset empty, no firewall service active")
      : nft.missing
        ? "nftables not installed, no firewall service active"
        : "nftables ruleset not readable (needs root)";
  return { active, determined, evidence };
}
