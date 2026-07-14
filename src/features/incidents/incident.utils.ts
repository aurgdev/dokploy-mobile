/**
 * Sanitizes error messages by redacting credentials in URLs, authorization values,
 * token-like strings, and limiting the summary length.
 */
export function sanitizeErrorMessage(message: string | null | undefined): string {
  if (!message) return '';
  
  let clean = message.trim();
  
  // 1. Redact credentials in URLs: e.g. http://user:password@host -> http://[REDACTED]@host
  clean = clean.replace(/(https?:\/\/)([^:\s]+):([^@\s]+)@/gi, '$1[REDACTED]@');
  
  // 2. Redact Authorization headers or Bearer tokens
  clean = clean.replace(/(bearer\s+|auth\s+|x-api-key\s*:?\s*)([a-zA-Z0-9_\-\.\=\+]{10,})/gi, '$1[REDACTED]');
  
  // 3. Redact generic high-entropy token-like strings (long hex or alpha-numeric sequences)
  // e.g. 32-character or longer API keys/tokens
  clean = clean.replace(/\b([a-fA-F0-9]{32,}|[a-zA-Z0-9_\-\.]{40,})\b/g, '[REDACTED]');
  
  // 4. Limit length to a safe UI summary length (e.g. 200 characters)
  if (clean.length > 200) {
    clean = clean.substring(0, 197) + '...';
  }
  
  return clean;
}

/**
 * Generates a deterministic, stable ID for an incident to prevent duplicates and keep state stable across refreshes.
 */
export function generateIncidentId(
  category: string,
  resourceType: string,
  resourceId: string | null,
  deploymentId: string | null,
  extraKey: string | null = null
): string {
  const parts = [
    category,
    resourceType,
    resourceId || 'none',
    deploymentId || 'none',
    extraKey || 'none'
  ];
  return parts.join(':');
}
