import { readFileSync } from "fs";

// The major version of `effect` the generated code targets. v3 and v4 differ in
// their service/runtime APIs (see `variantsFor`) and Schema APIs (see
// `schemas.ts`), so the generator emits code matching whichever `effect` the
// consuming project has installed.
export type EffectMajor = 3 | 4;

// Extract the supported EffectMajor from a version-ish string ("4.0.0-beta.83",
// "^3.19", "10"). Reads the first run of digits as the major, so multi-digit
// majors parse correctly; only a leading major of 4+ selects v4. Anything that
// doesn't parse to >= 4 — including malformed values — falls back to v3, the
// long-standing stable line.
function majorOf(version: string): EffectMajor {
  return Number(version.match(/\d+/)?.[0]) >= 4 ? 4 : 3;
}

// Resolve the consuming project's installed `effect` major version. Returns
// `undefined` when `effect` can't be resolved, so callers can fall back.
function resolveEffectMajor(searchPaths: string[]): EffectMajor | undefined {
  try {
    // require.resolve is the reliable way to find the consumer's installed
    // effect from this CommonJS generator; the JSON is then read with fs.
    const pkgPath = require.resolve("effect/package.json", {
      paths: searchPaths,
    });
    const version: string = JSON.parse(readFileSync(pkgPath, "utf8")).version;
    return majorOf(version);
  } catch {
    return undefined;
  }
}

// Decide which effect major to target: an explicit `effectVersion` config wins,
// otherwise auto-detect from the consumer's installed `effect`, otherwise fall
// back to v3.
export function determineEffectMajor(
  configVersion: string | string[] | undefined,
  searchPaths: string[],
): EffectMajor {
  const explicit = Array.isArray(configVersion)
    ? configVersion[0]
    : configVersion;
  if (typeof explicit === "string" && explicit.trim() !== "") {
    return majorOf(explicit);
  }
  return resolveEffectMajor(searchPaths) ?? 3;
}
