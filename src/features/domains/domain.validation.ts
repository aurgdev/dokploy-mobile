export interface DomainFormValues {
  host: string;
  port: string;
  path: string;
  https: boolean;
  certificateType: string;
  serviceName?: string | null;
}

export interface DomainValidationErrors {
  host?: string;
  port?: string;
  path?: string;
  serviceName?: string;
}

/**
 * Validates domain form values based on strict routing rules.
 */
export function validateDomainForm(
  values: DomainFormValues,
  isCompose: boolean,
  availableServices: string[] = []
): { isValid: boolean; errors: DomainValidationErrors } {
  const errors: DomainValidationErrors = {};

  // 1. Host validation
  let host = (values.host || '').trim();
  if (!host) {
    errors.host = 'Host is required';
  } else {
    // Reject http:// or https:// prefix
    if (/^https?:\/\//i.test(host)) {
      errors.host = 'Host must not contain http:// or https:// prefix';
    }
    // Reject embedded credentials (e.g. user:pass@host)
    else if (host.includes('@')) {
      errors.host = 'Host must not contain credentials';
    }
    // Reject paths inside host
    else if (host.includes('/')) {
      errors.host = 'Host must not contain path characters';
    }
    // Reject spaces
    else if (/\s/.test(host)) {
      errors.host = 'Host must not contain spaces';
    }
    // General check for valid domain/wildcard syntax
    // Allow *.domain.com or normal domains
    else {
      const cleanHost = host.replace(/^\*\./, ''); // Strip leading wildcard for validation
      const hostRegex = /^[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}$/;
      const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(cleanHost);
      const isLocalhost = cleanHost === 'localhost';

      if (!hostRegex.test(cleanHost) && !isIp && !isLocalhost) {
        errors.host = 'Invalid hostname format';
      }
    }
  }

  // 2. Port validation
  const portStr = (values.port || '').trim();
  if (!portStr) {
    errors.port = 'Port is required';
  } else {
    const portNum = Number(portStr);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      errors.port = 'Port must be an integer between 1 and 65535';
    }
  }

  // 3. Path validation
  let path = (values.path || '').trim();
  if (path && !path.startsWith('/')) {
    errors.path = 'Path prefix must begin with /';
  }

  // 4. Compose validations
  if (isCompose) {
    const serviceName = values.serviceName;
    if (!serviceName) {
      errors.serviceName = 'Compose service is required';
    } else if (availableServices.length > 0 && !availableServices.includes(serviceName)) {
      errors.serviceName = 'Selected service is invalid for this Compose stack';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export type DomainValidationState =
  | 'valid'
  | 'invalid'
  | 'unable_to_validate'
  | 'forbidden'
  | 'offline'
  | 'server_error';

export function mapValidationState(res: any, error?: any): DomainValidationState {
  if (error) {
    if (error.status === 403 || error.status === 401 || error.code === 'FORBIDDEN' || error.code === 'UNAUTHORIZED') {
      return 'forbidden';
    }
    if (error.code === 'OFFLINE' || error.code === 'TIMEOUT') {
      return 'offline';
    }
    if (error.code === 'SERVER_ERROR' || (error.status && error.status >= 500)) {
      return 'server_error';
    }
    return 'unable_to_validate';
  }
  
  if (res === undefined || res === null) {
    return 'unable_to_validate';
  }

  // Support confirmed response shapes
  if (typeof res === 'boolean') {
    return res ? 'valid' : 'invalid';
  }
  
  if (typeof res === 'object') {
    if (typeof res.isValid === 'boolean') {
      return res.isValid ? 'valid' : 'invalid';
    }
    if (typeof res.valid === 'boolean') {
      return res.valid ? 'valid' : 'invalid';
    }
    if (typeof res.success === 'boolean') {
      return res.success ? 'valid' : 'invalid';
    }
  }

  return 'unable_to_validate';
}
