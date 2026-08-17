/**
 * Standard metadata wrapper for checks. `category` groups checks in --list
 * output; `appliesTo` lists which kinds of systems the check is relevant for
 * (desktop | laptop | server — see src/profile.js). Checks without an
 * appliesTo run everywhere.
 */
export const ALL_KINDS = ["desktop", "laptop", "server"];

export function defineCheck({ id, title, category = "system", appliesTo = ALL_KINDS, run }) {
  return { id, title, category, appliesTo, run };
}
