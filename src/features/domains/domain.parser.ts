/**
 * A lightweight, safe YAML-based parser to extract service names
 * from a Docker Compose file.
 */
export function parseComposeServices(yaml: string): string[] {
  if (!yaml) return [];
  const services: string[] = [];
  const lines = yaml.split(/\r?\n/);
  
  let inServices = false;
  let servicesIndent = -1;
  let firstServiceIndent = -1;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const indent = line.length - line.trimStart().length;
    
    if (trimmed === 'services:') {
      inServices = true;
      servicesIndent = indent;
      firstServiceIndent = -1;
      continue;
    }
    
    if (inServices) {
      if (indent <= servicesIndent) {
        inServices = false;
        continue;
      }
      
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:/);
      if (match) {
        if (firstServiceIndent === -1) {
          firstServiceIndent = indent;
        }
        if (indent === firstServiceIndent) {
          services.push(match[1]);
        }
      }
    }
  }
  
  return services;
}

/**
 * Parses and normalizes the response of the compose.loadServices endpoint.
 * Throws INVALID_RESPONSE on unexpected shapes.
 */
export function parseComposeLoadServicesResponse(raw: any): string[] {
  if (Array.isArray(raw)) {
    if (raw.every(item => typeof item === 'string')) {
      return raw;
    }
  } else if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.services) && raw.services.every((item: any) => typeof item === 'string')) {
      return raw.services;
    }
    if (Array.isArray(raw.data) && raw.data.every((item: any) => typeof item === 'string')) {
      return raw.data;
    }
  }
  throw new Error('INVALID_RESPONSE');
}

export function parseCanGenerateResponse(raw: any): boolean {
  if (typeof raw === 'string') {
    return raw.trim().length > 0;
  }
  if (typeof raw === 'boolean') {
    return raw;
  }
  if (raw && typeof raw === 'object') {
    if (typeof raw.canGenerate === 'boolean') {
      return raw.canGenerate;
    }
    if (typeof raw.isValid === 'boolean') {
      return raw.isValid;
    }
    if (typeof raw.success === 'boolean') {
      return raw.success;
    }
    if (typeof raw.data === 'boolean') {
      return raw.data;
    }
    if (typeof raw.data === 'string') {
      return raw.data.trim().length > 0;
    }
    if (raw.data && typeof raw.data === 'object') {
      if (typeof raw.data.canGenerate === 'boolean') {
        return raw.data.canGenerate;
      }
    }
  }
  throw new Error('INVALID_RESPONSE');
}

/**
 * Parses generateDomain response to extract the generated hostname.
 * Throws INVALID_RESPONSE on unexpected shapes.
 */
export function parseGenerateDomainResponse(raw: any): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    if (typeof raw.domain === 'string') return raw.domain;
    if (typeof raw.data === 'string') return raw.data;
    if (raw.data && typeof raw.data.domain === 'string') return raw.data.domain;
  }
  throw new Error('INVALID_RESPONSE');
}
