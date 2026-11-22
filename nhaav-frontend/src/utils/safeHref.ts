/**
 * Safe href computation for user-supplied attachment values (security fix pass).
 *
 * Attachment strings arrive from the API (user-submitted) and are rendered as
 * links with target="_blank". A value with a dangerous URL scheme —
 * "javascript:alert(1)" — would execute script when clicked, even though the
 * app renders no other HTML. The backend rejects such schemes at the schema
 * layer; this guard is the frontend half of the same defense and also covers
 * legacy rows stored before that validation existed.
 *
 * Normalization before judging (review round 2):
 * - whitespace/control characters are stripped ("jav\tascript:" parses as
 *   "javascript:");
 * - the check is case-insensitive ("JAVASCRIPT:" == "javascript:");
 * - protocol-relative URLs ("//host/path") are rejected — they navigate to an
 *   attacker-chosen origin;
 * - values containing percent-escapes are additionally judged in their
 *   percent-DECODED form, in case another layer decodes them later.
 *
 * Allowed unchanged: http(s) URLs, absolute upload paths ("/uploads/..."),
 * and values with no scheme at all (plain file names, relative paths).
 * Anything else returns null so callers render inert text instead of a link.
 */
const SCHEME_RE = /^[a-z0-9][a-z0-9+.-]*:/;

function isSafeCandidate(value: string): boolean {
  if (value.startsWith('//')) return false; // protocol-relative → foreign origin
  if (value.startsWith('https://') || value.startsWith('http://')) return true;
  if (value.startsWith('/')) return true; // absolute upload path
  // No scheme at all → plain file name / relative path: safe as a link.
  return !SCHEME_RE.test(value);
}

export function safeAttachmentHref(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\s\x00-\x1f\x7f]/g, '').toLowerCase();
  let decoded = cleaned;
  if (cleaned.includes('%')) {
    try {
      decoded = decodeURIComponent(cleaned).replace(/[\s\x00-\x1f\x7f]/g, '');
    } catch {
      decoded = cleaned; // malformed escapes: judge the raw form only
    }
  }
  if (!isSafeCandidate(cleaned) || !isSafeCandidate(decoded)) {
    return null;
  }
  return raw;
}
