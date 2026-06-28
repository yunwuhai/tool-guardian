// utils/path-utils.ts
// ===========================================================================
// Path normalization and detection utilities.
// ===========================================================================

/**
 * Normalize a path by resolving `.` and `..` segments.
 * Does not follow symlinks or check existence.
 */
export function normalizePath(p: string): string {
  const segments = p.split("/").filter(s => s !== "" && s !== ".");
  const result: string[] = [];
  for (const seg of segments) {
    if (seg === "..") {
      result.pop();
    } else {
      result.push(seg);
    }
  }
  return "/" + result.join("/");
}

/**
 * Detect whether a command-line token is likely a file path.
 * Recognizes absolute paths, relative paths, and home-dir paths.
 */
export function isPathLike(token: string): boolean {
  if (token.startsWith("/")) return true;
  if (token.startsWith("./")) return true;
  if (token.startsWith("../")) return true;
  if (token.startsWith("~/")) return true;
  if (token === "." || token === ".." || token === "~") return true;
  // Paths with slashes that aren't flags
  if (token.includes("/") && !token.startsWith("-")) return true;
  return false;
}
