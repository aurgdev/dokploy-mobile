import { redactSecrets } from './redactor';
import { DokployApiError, DokployApiErrorCode } from './api.types';
import { getProfile } from './profileStore';

export interface Application {
  id: string;
  name: string;
  status: 'running' | 'idle' | 'failed' | string;
  appName?: string;
  createdAt: string;
}

export interface Database {
  id: string;
  name: string;
  status: 'running' | 'idle' | string;
  databaseName?: string;
  type: 'postgres' | 'mysql' | 'mariadb' | 'mongo' | 'redis' | string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  applications: Application[];
  databases: Database[];
}

export interface Deployment {
  id: string;
  applicationId: string;
  status: 'running' | 'success' | 'failed' | string;
  createdAt: string;
  title?: string;
  application?: {
    name: string;
  };
}

export type ApiListener = (endpoint: string, success: boolean, status?: number) => void;
const listeners: ApiListener[] = [];

export function addApiListener(listener: ApiListener) {
  listeners.push(listener);
}

export function normalizeUrl(url: string): string {
  let clean = url.trim();
  while (clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  if (clean.endsWith('/api')) {
    clean = clean.slice(0, -4);
  }
  
  if (!/^https?:\/\//i.test(clean)) {
    throw new Error('Invalid protocol: Address must start with http:// or https://');
  }

  const hostname = clean.replace(/^https?:\/\//i, '').split(':')[0].split('/')[0];
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const isPrivateIp = 
    /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/.test(hostname);

  if (/^http:\/\//i.test(clean) && !isLocalhost && !isPrivateIp) {
    throw new Error('Plain HTTP is rejected for remote addresses. HTTPS is required.');
  }

  return clean;
}

export function mapError(err: any, endpoint?: string): DokployApiError {
  let code: DokployApiErrorCode = 'UNKNOWN';
  let message = err.message || 'An unknown error occurred';
  let status: number | undefined;

  if (err.name === 'AbortError' || err.message?.toLowerCase().includes('timeout')) {
    code = 'TIMEOUT';
    message = 'Request timed out after 10 seconds';
  } else if (err.message === 'Network request failed' || err.message?.toLowerCase().includes('offline') || err.message?.toLowerCase().includes('unreachable')) {
    code = 'OFFLINE';
    message = 'Server is unreachable. Please check your internet connection.';
  } else if (err.status) {
    status = err.status;
    message = err.message;
    switch (err.status) {
      case 401:
        code = 'UNAUTHORIZED';
        break;
      case 403:
        code = 'FORBIDDEN';
        break;
      case 404:
        code = 'NOT_FOUND';
        break;
      default:
        if (err.status >= 500) {
          code = 'SERVER_ERROR';
        }
    }
  }

  return { code, message, status, endpoint, retryable: code === 'TIMEOUT' || code === 'OFFLINE' || code === 'SERVER_ERROR' };
}

export function logRequest(method: string, endpoint: string, status?: number, durationMs?: number, errorCode?: string) {
  if (__DEV__) {
    const redactedEndpoint = redactSecrets(endpoint);
    console.log(`[API] ${method} ${redactedEndpoint} | Status: ${status ?? 'N/A'} | Duration: ${durationMs ?? 0}ms ${errorCode ? `| Error: ${errorCode}` : ''}`);
  }
}

export async function getClientConfig() {
  const profile = await getProfile();
  if (!profile) {
    return { url: null, apiKey: null, profileId: null };
  }
  return { url: profile.serverUrl, apiKey: profile.apiKey, profileId: profile.profileId };
}

export async function dokployFetch(endpoint: string, options: RequestInit = {}) {
  const { url, apiKey } = await getClientConfig();
  if (!url || !apiKey) {
    throw mapError(new Error('Server credentials not configured'), endpoint);
  }

  let normalizedBase: string;
  try {
    normalizedBase = normalizeUrl(url);
  } catch (err: any) {
    throw mapError(err, endpoint);
  }

  const targetUrl = `${normalizedBase}/api${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const startTime = Date.now();
  try {
    const response = await fetch(targetUrl, {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...options.headers,
      }
    });
    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    if (!response.ok) {
      let errorMsg = `API Request failed with status ${response.status}`;
      try {
        const text = await response.text();
        errorMsg = text || errorMsg;
      } catch {}
      throw { status: response.status, message: errorMsg };
    }

    logRequest(options.method || 'GET', endpoint, response.status, duration);

    // Notify listeners of success
    listeners.forEach(l => l(endpoint, true, response.status));

    // Handle empty responses
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const text = await response.text();
      if (!text || text.trim() === '') return null;
      try {
        return JSON.parse(text);
      } catch {
        throw { status: 200, message: 'Invalid response body: malformed JSON' };
      }
    }
    return null;
  } catch (err: any) {
    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    const mapped = mapError(err, endpoint);
    logRequest(options.method || 'GET', endpoint, mapped.status, duration, mapped.code);
    
    // Notify listeners of failure
    listeners.forEach(l => l(endpoint, false, err.status || mapped.status));
    
    throw mapped;
  }
}

export const api = {
  // Fetch Projects, Applications, and Databases
  getProjects: (): Promise<Project[]> => dokployFetch('/project.all'),

  // Application Lifecycle Controls
  startApp: (id: string) => dokployFetch('/application.start', {
    method: 'POST',
    body: JSON.stringify({ applicationId: id })
  }),
  
  stopApp: (id: string) => dokployFetch('/application.stop', {
    method: 'POST',
    body: JSON.stringify({ applicationId: id })
  }),
  
  restartApp: (id: string) => dokployFetch('/application.restart', {
    method: 'POST',
    body: JSON.stringify({ applicationId: id })
  }),
  
  deployApp: (id: string) => dokployFetch('/application.deploy', {
    method: 'POST',
    body: JSON.stringify({ applicationId: id })
  }),

  // Database Lifecycle Controls
  startDatabase: (id: string) => dokployFetch('/database.start', {
    method: 'POST',
    body: JSON.stringify({ databaseId: id })
  }),

  stopDatabase: (id: string) => dokployFetch('/database.stop', {
    method: 'POST',
    body: JSON.stringify({ databaseId: id })
  }),

  // Fetch Logs
  getAppLogs: (id: string): Promise<{ logs: string }> => 
    dokployFetch(`/application.readLogs?applicationId=${id}`),

  getDatabaseLogs: (id: string, dbType: string): Promise<{ logs: string }> => {
    const cleanType = dbType.toLowerCase();
    return dokployFetch(`/${cleanType}.readLogs?${cleanType}Id=${id}`);
  },

  // Fetch Deployments Feed for a specific application
  getDeployments: (applicationId: string): Promise<Deployment[]> => 
    dokployFetch(`/deployment.readLogs?applicationId=${applicationId}`),

  // Fetch Specific Deployment Logs
  getDeploymentLogs: (id: string): Promise<{ logs: string }> => 
    dokployFetch(`/deployment.readLogs?deploymentId=${id}`),

  // Fetch Docker Containers list
  getContainers: (): Promise<any[]> => dokployFetch('/docker.getContainers'),

  // Compose Lifecycle Controls
  redeployCompose: (id: string) => dokployFetch('/compose.redeploy', {
    method: 'POST',
    body: JSON.stringify({ composeId: id })
  }),

  stopCompose: (id: string) => dokployFetch('/compose.stop', {
    method: 'POST',
    body: JSON.stringify({ composeId: id })
  }),

  getComposeLogs: (id: string): Promise<{ logs: string }> => 
    dokployFetch(`/compose.readLogs?composeId=${id}`),

  // Project Creation
  createProject: (name: string, description?: string): Promise<any> => 
    dokployFetch('/project.create', {
      method: 'POST',
      body: JSON.stringify({ name, description })
    }),

  // Server Control & Cleanup APIs
  cleanAll: () => dokployFetch('/settings.cleanAll', { method: 'POST' }),
  cleanUnusedImages: () => dokployFetch('/settings.cleanUnusedImages', { method: 'POST' }),
  cleanUnusedVolumes: () => dokployFetch('/settings.cleanUnusedVolumes', { method: 'POST' }),
  cleanStoppedContainers: () => dokployFetch('/settings.cleanStoppedContainers', { method: 'POST' }),
  reloadServer: () => dokployFetch('/settings.reloadServer', { method: 'POST' }),
  cleanRedis: () => dokployFetch('/settings.cleanRedis', { method: 'POST' })
};
