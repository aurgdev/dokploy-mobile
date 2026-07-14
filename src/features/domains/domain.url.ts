import { Domain } from './domain.types';

/**
 * Builds the externally accessible public URL for a domain.
 */
export function buildPublicUrl(domain: Pick<Domain, 'host' | 'https' | 'path'>): string {
  const scheme = domain.https ? 'https://' : 'http://';
  const host = domain.host.trim().toLowerCase();
  
  // Normalize path suffix (omit trailing slash if it is just "/")
  let suffix = (domain.path || '').trim();
  if (suffix === '/' || !suffix) {
    suffix = '';
  } else {
    if (!suffix.startsWith('/')) {
      suffix = '/' + suffix;
    }
  }

  return `${scheme}${host}${suffix}`;
}
