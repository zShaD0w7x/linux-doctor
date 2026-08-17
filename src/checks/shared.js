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
