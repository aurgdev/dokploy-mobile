const SENSITIVE_KEYS = [
  "api-key", "x-api-key", "authorization", "password", "token", 
  "private-key", "secret", "connection-string", "key", "cert"
];

export function redactSecrets(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    let cleaned = obj;
    // Redact headers and inline keys matching standard formats
    cleaned = cleaned.replace(/(x-api-key\s*[:=]\s*["']?)([^\s&"',;]+)(["']?)/ig, '$1[REDACTED]$3');
    cleaned = cleaned.replace(/(authorization\s*[:=]\s*["']?bearer\s+)([^\s&"',;]+)(["']?)/ig, '$1[REDACTED]$3');
    cleaned = cleaned.replace(/(password\s*[:=]\s*["']?)([^\s&"',;]+)(["']?)/ig, '$1[REDACTED]$3');
    cleaned = cleaned.replace(/(token\s*[:=]\s*["']?)([^\s&"',;]+)(["']?)/ig, '$1[REDACTED]$3');
    cleaned = cleaned.replace(/(secret\s*[:=]\s*["']?)([^\s&"',;]+)(["']?)/ig, '$1[REDACTED]$3');
    return cleaned;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSecrets(item));
  }

  if (typeof obj === 'object') {
    const redacted: any = {};
    for (const [key, val] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive))) {
        redacted[key] = "[REDACTED]";
      } else {
        redacted[key] = redactSecrets(val);
      }
    }
    return redacted;
  }

  return obj;
}
