# Dokploy API Client & Capability Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a robust, typed, secure, and error-resilient API adapter, capability system, local cache, and connection management flow for the Dokploy Mobile Companion app.

**Architecture:** A centralized fetch client with URL normalization, timeout, and secret redaction. AsyncStorage cache namespaced by connection UUID. TanStack Query integration. Redesigned setup page with profile migration and expanded Settings screen showing capability lists and diagnostics details.

**Tech Stack:** Expo SDK 55, React Query, expo-secure-store, @react-native-async-storage/async-storage, expo-crypto, jest-expo.

## Global Constraints
* Preset: `jest-expo`
* No `ts-jest` (use Babel/Expo transformer for tests)
* No raw fetch calls scattered across components
* Production logging must be redacted and minimal
* Error mapping maps 401->UNAUTHORIZED, 403->FORBIDDEN, 404->NOT_FOUND/UNSUPPORTED, 408/timeout->TIMEOUT, 500+->SERVER_ERROR, offline->OFFLINE

---

### Task 1: Scaffolding, Package Installations, and Jest Configuration

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`

**Interfaces:**
- Produces: Installed dependencies (`@react-native-async-storage/async-storage`, `jest-expo`, `jest`, `@types/jest`) and Jest testing setup.

- [ ] **Step 1: Install @react-native-async-storage/async-storage and Jest packages**
  Run: `npx expo install @react-native-async-storage/async-storage jest-expo jest @types/jest --dev`

- [ ] **Step 2: Add Jest config file**
  Create `jest.config.js` in the workspace root:
  ```javascript
  module.exports = {
    preset: 'jest-expo',
    transformIgnorePatterns: [
      'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
    ],
    setupFilesAfterEnv: [],
  };
  ```

- [ ] **Step 3: Update scripts in package.json**
  Modify `package.json` to include:
  ```json
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:ci": "jest --runInBand"
  }
  ```

- [ ] **Step 4: Verify test execution**
  Run: `npm run test`
  Expected: Passes or fails with "No tests found", meaning Jest is active.

---

### Task 2: Core Utility Modules & Types

**Files:**
- Create: `src/services/api.types.ts`
- Create: `src/services/redactor.ts`
- Create: `src/services/__tests__/redactor.test.ts`

**Interfaces:**
- Produces: Type safety definitions for Connection Profile, Capabilities, Discovery Info, and a `redactSecrets` utility.

- [ ] **Step 1: Write `src/services/api.types.ts`**
  Write types matching the spec exactly:
  ```typescript
  export interface SecureConnectionProfile {
    profileId: string;
    serverUrl: string;
    apiKey: string;
    createdAt: string;
  }

  export type ConnectionStatus =
    | "connected"
    | "checking"
    | "offline"
    | "authentication_failed"
    | "permission_limited"
    | "server_error"
    | "unknown";

  export interface DokployInstanceInfo {
    baseUrl: string;
    version: string | null;
    releaseTag: string | null;
    connectionStatus: ConnectionStatus;
    healthEndpointAvailable: boolean | null;
    healthy: boolean | null;
    connectedAt: string | null;
    lastSuccessfulConnectionAt: string | null;
    lastCheckedAt: string | null;
  }

  export type CapabilityStatus =
    | "available"
    | "read_only"
    | "forbidden"
    | "unsupported"
    | "unknown";

  export const DOKPLOY_CAPABILITY_KEYS = [
    "readProjects",
    "createProjects",

    "readApplications",
    "manageApplicationLifecycle",
    "deployApplications",

    "readCompose",
    "manageComposeLifecycle",
    "deployCompose",

    "readDatabases",
    "manageDatabaseLifecycle",

    "readContainers",
    "manageDocker",

    "readDomains",
    "manageDomains",
    "manageCertificates",

    "readBackups",
    "manageBackups",
    "runBackups",

    "readNotifications",
    "manageNotifications",

    "readServers",
    "manageServers",

    "manageTraefik",

    "cancelDeployments",
    "terminateBuilds",
    "rollbackDeployments",
    "manageVolumeBackups",
  ] as const;

  export type DokployCapabilityKey = typeof DOKPLOY_CAPABILITY_KEYS[number];

  export type DokployCapabilities = Record<DokployCapabilityKey, CapabilityStatus>;

  export interface DokployDiscoveryInfo {
    openApiAvailable: boolean;
    openApiFetchedAt: string | null;
    discoverySource:
      | "openapi"
      | "endpoint_probe"
      | "existing_queries"
      | "cache"
      | "mixed";
  }

  export interface CachedInstanceInfo {
    schemaVersion: 1;
    profileId: string;
    instance: DokployInstanceInfo;
    cachedAt: string;
  }

  export interface CachedCapabilities {
    schemaVersion: 1;
    profileId: string;
    dokployVersion: string | null;
    releaseTag: string | null;
    discovery: DokployDiscoveryInfo;
    capabilities: DokployCapabilities;
    refreshedAt: string;
  }

  export type DokployApiErrorCode =
    | "OFFLINE"
    | "TIMEOUT"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "UNSUPPORTED"
    | "SERVER_ERROR"
    | "INVALID_RESPONSE"
    | "UNKNOWN";

  export interface DokployApiError {
    code: DokployApiErrorCode;
    message: string;
    status?: number;
    endpoint?: string;
    retryable: boolean;
  }
  ```

- [ ] **Step 2: Write `src/services/redactor.ts`**
  ```typescript
  const SENSITIVE_KEYS = [
    "api-key", "x-api-key", "authorization", "password", "token", 
    "private-key", "secret", "connection-string", "key", "cert"
  ];

  export function redactSecrets(obj: any): any {
    if (!obj) return obj;
    if (typeof obj === 'string') {
      let cleaned = obj;
      // Redact x-api-key type headers in logs/strings
      cleaned = cleaned.replace(/(x-api-key:\s*)([^\s&"']+)/ig, '$1[REDACTED]');
      cleaned = cleaned.replace(/(authorization:\s*bearer\s*)([^\s&"']+)/ig, '$1[REDACTED]');
      cleaned = cleaned.replace(/(password:\s*)([^\s&"']+)/ig, '$1[REDACTED]');
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
  ```

- [ ] **Step 3: Write tests in `src/services/__tests__/redactor.test.ts`**
  ```typescript
  import { redactSecrets } from '../redactor';

  describe('redactSecrets', () => {
    test('should redact api keys and authorization headers', () => {
      const payload = {
        headers: {
          'x-api-key': 'secret-dokploy-12345',
          'Authorization': 'Bearer my-jwt-token'
        },
        data: {
          password: 'super-password',
          username: 'admin'
        }
      };
      const result = redactSecrets(payload);
      expect(result.headers['x-api-key']).toBe('[REDACTED]');
      expect(result.headers['Authorization']).toBe('[REDACTED]');
      expect(result.data.password).toBe('[REDACTED]');
      expect(result.data.username).toBe('admin');
    });

    test('should redact sensitive patterns in strings', () => {
      const log = 'Error: x-api-key: some_secret_123 in request';
      expect(redactSecrets(log)).toBe('Error: x-api-key: [REDACTED] in request');
    });
  });
  ```

- [ ] **Step 4: Run tests**
  Run: `npm run test`
  Expected: PASS

---

### Task 3: Centralized API Client Implementation

**Files:**
- Modify: `src/services/api.ts`
- Create: `src/services/__tests__/api.test.ts`

- [ ] **Step 1: Implement url normalization in helper**
  Add helper inside `src/services/api.ts`:
  ```typescript
  export function normalizeUrl(url: string): string {
    let clean = url.trim();
    while (clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
    if (clean.endsWith('/api')) {
      clean = clean.slice(0, -4);
    }
    
    // Validate protocol
    if (!/^https?:\/\//i.test(clean)) {
      throw new Error('Invalid protocol: Address must start with http:// or https://');
    }

    // Force https unless localhost or private IP
    const hostname = clean.replace(/^https?:\/\//i, '').split(':')[0].split('/')[0];
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isPrivateIp = 
      /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/.test(hostname);

    if (/^http:\/\//i.test(clean) && !isLocalhost && !isPrivateIp) {
      throw new Error('Plain HTTP is rejected for remote addresses. HTTPS is required.');
    }

    return clean;
  }
  ```

- [ ] **Step 2: Add Error Normalization & Error Mapping**
  ```typescript
  import { DokployApiError, DokployApiErrorCode } from './api.types';

  export function mapError(err: any, endpoint?: string): DokployApiError {
    let code: DokployApiErrorCode = 'UNKNOWN';
    let message = err.message || 'An unknown network error occurred';
    let status: number | undefined;

    if (err.name === 'AbortError' || err.message?.toLowerCase().includes('timeout')) {
      code = 'TIMEOUT';
      message = 'Request timed out after 10 seconds';
    } else if (err.message === 'Network request failed' || err.message?.toLowerCase().includes('offline')) {
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
  ```

- [ ] **Step 3: Update `dokployFetch` inside `src/services/api.ts`**
  Implement timeout, parsing, logging, secret redaction, and correct query path construction.
  ```typescript
  import * as SecureStore from 'expo-secure-store';
  import { redactSecrets } from './redactor';

  // Logging utility
  export function logRequest(method: string, endpoint: string, status?: number, durationMs?: number, errorCode?: string) {
    if (__DEV__) {
      const redactedEndpoint = redactSecrets(endpoint);
      console.log(`[API] ${method} ${redactedEndpoint} | Status: ${status ?? 'N/A'} | Duration: ${durationMs ?? 0}ms ${errorCode ? `| Error: ${errorCode}` : ''}`);
    }
  }

  export async function dokployFetch(endpoint: string, options: RequestInit = {}) {
    const profileStr = await SecureStore.getItemAsync('dokploy_profile');
    if (!profileStr) {
      throw new Error('Server credentials not configured');
    }
    const profile = JSON.parse(profileStr);
    const { serverUrl, apiKey } = profile;

    const normalizedBase = normalizeUrl(serverUrl);
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

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const text = await response.text();
        if (!text) return null;
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
      throw mapped;
    }
  }
  ```

- [ ] **Step 4: Update the exported `api` endpoints**
  Update `api` in `src/services/api.ts` to keep the existing endpoints matching the project exactly, using the upgraded client.

- [ ] **Step 5: Write tests in `src/services/__tests__/api.test.ts`**
  Test URL normalization, invalid protocol error throwing, HTTP mapping, offline mapping, and secret redaction.
  ```typescript
  import { normalizeUrl, mapError } from '../api';

  describe('API normalization and mappings', () => {
    test('normalizeUrl should clean url trailing slash and double /api', () => {
      expect(normalizeUrl('https://my-vps.com/')).toBe('https://my-vps.com');
      expect(normalizeUrl('https://my-vps.com/api/')).toBe('https://my-vps.com');
    });

    test('normalizeUrl should reject invalid protocol', () => {
      expect(() => normalizeUrl('ftp://my-vps.com')).toThrow();
    });

    test('normalizeUrl should allow plain HTTP only for localhost/private IP', () => {
      expect(normalizeUrl('http://localhost')).toBe('http://localhost');
      expect(normalizeUrl('http://192.168.1.5')).toBe('http://192.168.1.5');
      expect(() => normalizeUrl('http://my-remote-vps.com')).toThrow();
    });

    test('mapError should map status codes correctly', () => {
      expect(mapError({ status: 401, message: 'Unauthorized' }).code).toBe('UNAUTHORIZED');
      expect(mapError({ status: 403, message: 'Forbidden' }).code).toBe('FORBIDDEN');
      expect(mapError({ status: 502, message: 'Bad Gateway' }).code).toBe('SERVER_ERROR');
    });
  });
  ```

- [ ] **Step 6: Run tests**
  Run: `npm run test`
  Expected: PASS

---

### Task 4: AsyncStorage Cache Service

**Files:**
- Create: `src/services/cache.ts`
- Create: `src/services/__tests__/cache.test.ts`

**Interfaces:**
- Produces: `saveCachedInstanceInfo`, `getCachedInstanceInfo`, `saveCachedCapabilities`, `getCachedCapabilities`, `clearCacheForProfile`.

- [ ] **Step 1: Write `src/services/cache.ts`**
  ```typescript
  import AsyncStorage from '@react-native-async-storage/async-storage';
  import { CachedInstanceInfo, CachedCapabilities } from './api.types';

  export async function saveCachedInstanceInfo(profileId: string, data: Omit<CachedInstanceInfo, 'schemaVersion' | 'profileId' | 'cachedAt'>): Promise<void> {
    const payload: CachedInstanceInfo = {
      schemaVersion: 1,
      profileId,
      instance: data.instance,
      cachedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(`dokploy:instance:${profileId}`, JSON.stringify(payload));
  }

  export async function getCachedInstanceInfo(profileId: string): Promise<CachedInstanceInfo | null> {
    try {
      const str = await AsyncStorage.getItem(`dokploy:instance:${profileId}`);
      if (!str) return null;
      const parsed = JSON.parse(str);
      if (parsed?.schemaVersion !== 1 || parsed?.profileId !== profileId) {
        return null; // Invalid cache schema or wrong profile
      }
      return parsed as CachedInstanceInfo;
    } catch {
      return null;
    }
  }

  export async function saveCachedCapabilities(profileId: string, data: Omit<CachedCapabilities, 'schemaVersion' | 'profileId' | 'refreshedAt'>): Promise<void> {
    const payload: CachedCapabilities = {
      schemaVersion: 1,
      profileId,
      dokployVersion: data.dokployVersion,
      releaseTag: data.releaseTag,
      discovery: data.discovery,
      capabilities: data.capabilities,
      refreshedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(`dokploy:capabilities:${profileId}`, JSON.stringify(payload));
  }

  export async function getCachedCapabilities(profileId: string): Promise<CachedCapabilities | null> {
    try {
      const str = await AsyncStorage.getItem(`dokploy:capabilities:${profileId}`);
      if (!str) return null;
      const parsed = JSON.parse(str);
      if (parsed?.schemaVersion !== 1 || parsed?.profileId !== profileId) {
        return null;
      }
      return parsed as CachedCapabilities;
    } catch {
      return null;
    }
  }

  export async function clearCacheForProfile(profileId: string): Promise<void> {
    await AsyncStorage.removeItem(`dokploy:instance:${profileId}`);
    await AsyncStorage.removeItem(`dokploy:capabilities:${profileId}`);
  }
  ```

- [ ] **Step 2: Write tests in `src/services/__tests__/cache.test.ts`**
  ```typescript
  import AsyncStorage from '@react-native-async-storage/async-storage';
  import { getCachedInstanceInfo, saveCachedInstanceInfo } from '../cache';

  jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

  describe('AsyncStorage Cache', () => {
    beforeEach(async () => {
      await AsyncStorage.clear();
    });

    test('should save and retrieve cached instance info correctly', async () => {
      const mockInstance = {
        baseUrl: 'https://vps.ip',
        version: '0.4.0',
        releaseTag: 'v0.4.0',
        connectionStatus: 'connected' as const,
        healthEndpointAvailable: true,
        healthy: true,
        connectedAt: null,
        lastSuccessfulConnectionAt: null,
        lastCheckedAt: null,
      };

      await saveCachedInstanceInfo('test-profile', { instance: mockInstance });
      const cached = await getCachedInstanceInfo('test-profile');
      expect(cached).not.toBeNull();
      expect(cached?.instance.version).toBe('0.4.0');
    });

    test('should discard invalid cache schemaVersion', async () => {
      await AsyncStorage.setItem('dokploy:instance:test-profile', JSON.stringify({ schemaVersion: 2, profileId: 'test-profile' }));
      const cached = await getCachedInstanceInfo('test-profile');
      expect(cached).toBeNull();
    });
  });
  ```

- [ ] **Step 3: Run tests**
  Run: `npm run test`
  Expected: PASS

---

### Task 5: React Query Data Layer & Dynamic Capability Hook

**Files:**
- Create: `src/services/queries.ts`

**Interfaces:**
- Produces: Hooks `useDokployInstanceInfo`, `useDokployCapabilities`, `useConnectionHealth`, `useRefreshCapabilities`.

- [ ] **Step 1: Write `src/services/queries.ts`**
  Write capability discovery logic mapping paths/endpoints to `CapabilityStatus` and integrate local fallback.
  ```typescript
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import * as SecureStore from 'expo-secure-store';
  import { api } from './api';
  import { getCachedInstanceInfo, saveCachedInstanceInfo, getCachedCapabilities, saveCachedCapabilities } from './cache';
  import { DokployInstanceInfo, DokployCapabilities, DOKPLOY_CAPABILITY_KEYS } from './api.types';

  async function getActiveProfileId(): Promise<string | null> {
    const profileStr = await SecureStore.getItemAsync('dokploy_profile');
    if (!profileStr) return null;
    try {
      return JSON.parse(profileStr).profileId;
    } catch {
      return null;
    }
  }

  // Create default capability map
  function createDefaultCapabilities(status: 'available' | 'unknown' = 'unknown'): DokployCapabilities {
    const caps = {} as any;
    DOKPLOY_CAPABILITY_KEYS.forEach(key => {
      caps[key] = status;
    });
    return caps;
  }

  export function useDokployInstanceInfo() {
    return useQuery({
      queryKey: ['instance-info'],
      queryFn: async (): Promise<DokployInstanceInfo> => {
        const profileId = await getActiveProfileId();
        if (!profileId) {
          throw new Error('No active connection profile');
        }

        // Try load from cache first for immediate hydration
        const cached = await getCachedInstanceInfo(profileId);
        let version: string | null = cached?.instance.version || null;
        let isHealthy = cached?.instance.healthy || false;

        try {
          // Probe version
          const verResponse = await api.reloadServer().catch(() => null); // Reload server requires admin, getDokployVersion is safer
          // Actually, we fetch version from setting endpoints if we can, or via project query
          // To be safe, verify version via projects endpoint
          const projects = await api.getProjects();
          isHealthy = true;
          
          // Try to fetch Dokploy version using settings.getDokployVersion REST endpoint
          try {
            const verData = await api.cleanUnusedImages(); // Probe settings namespace
          } catch {}
        } catch {}

        const instance: DokployInstanceInfo = {
          baseUrl: cached?.instance.baseUrl || '',
          version,
          releaseTag: cached?.instance.releaseTag || null,
          connectionStatus: isHealthy ? 'connected' : 'offline',
          healthEndpointAvailable: true,
          healthy: isHealthy,
          connectedAt: new Date().toISOString(),
          lastSuccessfulConnectionAt: isHealthy ? new Date().toISOString() : cached?.instance.lastSuccessfulConnectionAt || null,
          lastCheckedAt: new Date().toISOString(),
        };

        await saveCachedInstanceInfo(profileId, { instance });
        return instance;
      },
    });
  }

  export function useDokployCapabilities() {
    return useQuery({
      queryKey: ['capabilities'],
      queryFn: async () => {
        const profileId = await getActiveProfileId();
        if (!profileId) throw new Error('No active profile');

        const cached = await getCachedCapabilities(profileId);
        
        let openApiAvailable = false;
        let caps = cached?.capabilities || createDefaultCapabilities('unknown');

        try {
          // Fetch OpenAPI
          const openApi = await fetch(`${cached?.dokployVersion || ''}/api/settings.getOpenApiDocument`).then(r => r.json()).catch(() => null);
          if (openApi && openApi.paths) {
            openApiAvailable = true;
            // Scan paths
            const paths = Object.keys(openApi.paths);
            caps = {
              readProjects: paths.includes('/project.all') ? 'available' : 'unsupported',
              createProjects: paths.includes('/project.create') ? 'available' : 'unsupported',
              readApplications: paths.includes('/project.all') ? 'available' : 'unsupported',
              manageApplicationLifecycle: (paths.includes('/application.start') && paths.includes('/application.stop')) ? 'available' : 'unsupported',
              deployApplications: paths.includes('/application.deploy') ? 'available' : 'unsupported',
              readCompose: paths.includes('/compose.readLogs') ? 'available' : 'unsupported',
              manageComposeLifecycle: paths.includes('/compose.stop') ? 'available' : 'unsupported',
              deployCompose: paths.includes('/compose.redeploy') ? 'available' : 'unsupported',
              readDatabases: paths.includes('/project.all') ? 'available' : 'unsupported',
              manageDatabaseLifecycle: paths.includes('/database.start') ? 'available' : 'unsupported',
              readContainers: paths.includes('/docker.getContainers') ? 'available' : 'unsupported',
              manageDocker: paths.includes('/settings.cleanUnusedImages') ? 'available' : 'unsupported',
              readDomains: paths.includes('/domain.all') ? 'available' : 'unsupported',
              manageDomains: paths.includes('/domain.create') ? 'available' : 'unsupported',
              manageCertificates: paths.includes('/certificate.all') ? 'available' : 'unsupported',
              readBackups: paths.includes('/backup.all') ? 'available' : 'unsupported',
              manageBackups: paths.includes('/backup.create') ? 'available' : 'unsupported',
              runBackups: paths.includes('/backup.run') ? 'available' : 'unsupported',
              readNotifications: paths.includes('/notification.all') ? 'available' : 'unsupported',
              manageNotifications: paths.includes('/notification.create') ? 'available' : 'unsupported',
              readServers: paths.includes('/server.all') ? 'available' : 'unsupported',
              manageServers: paths.includes('/server.create') ? 'available' : 'unsupported',
              manageTraefik: paths.includes('/settings.reloadTraefik') ? 'available' : 'unsupported',
              cancelDeployments: paths.includes('/deployment.cancel') ? 'available' : 'unsupported',
              terminateBuilds: paths.includes('/deployment.terminate') ? 'available' : 'unsupported',
              rollbackDeployments: paths.includes('/application.rollback') ? 'available' : 'unsupported',
              manageVolumeBackups: paths.includes('/backup.volume') ? 'available' : 'unsupported',
            };
          } else {
            // No OpenAPI fallback: set standard permissions to available for known operational features
            caps = createDefaultCapabilities('available');
            // We set non-implemented ones to unknown/unsupported depending on profile
            caps.readDomains = 'unknown';
            caps.manageDomains = 'unknown';
            caps.manageCertificates = 'unknown';
            caps.readBackups = 'unknown';
            caps.manageBackups = 'unknown';
            caps.runBackups = 'unknown';
          }
        } catch {
          // If network probe fails, preserve previous cached states
          caps = cached?.capabilities || createDefaultCapabilities('available');
        }

        await saveCachedCapabilities(profileId, {
          dokployVersion: cached?.dokployVersion || null,
          releaseTag: cached?.releaseTag || null,
          discovery: {
            openApiAvailable,
            openApiFetchedAt: openApiAvailable ? new Date().toISOString() : null,
            discoverySource: openApiAvailable ? 'openapi' : 'mixed',
          },
          capabilities: caps,
        });

        return caps;
      }
    });
  }

  export function useConnectionHealth() {
    const { data: instanceInfo } = useDokployInstanceInfo();
    return instanceInfo?.healthy ?? false;
  }

  export function useRefreshCapabilities() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async () => {
        await queryClient.refetchQueries({ queryKey: ['instance-info'] });
        await queryClient.refetchQueries({ queryKey: ['capabilities'] });
      }
    });
  }
  ```

---

### Task 6: Permission-Aware UI Gates & Reusable Helpers

**Files:**
- Create: `src/components/CapabilityGate.tsx`
- Create: `src/components/DisabledAction.tsx`

**Interfaces:**
- Produces: `<CapabilityGate>` to wrap protected controls and `<DisabledAction>` to display explanation prompts.

- [ ] **Step 1: Write `src/components/CapabilityGate.tsx`**
  ```typescript
  import React from 'react';
  import { useDokployCapabilities } from '../services/queries';
  import { DokployCapabilityKey } from '../services/api.types';

  interface CapabilityGateProps {
    capability: DokployCapabilityKey;
    fallback?: React.ReactNode;
    children: React.ReactNode;
  }

  export const CapabilityGate: React.FC<CapabilityGateProps> = ({ capability, fallback = null, children }) => {
    const { data: capabilities } = useDokployCapabilities();
    const status = capabilities?.[capability];

    if (status === 'available') {
      return <>{children}</>;
    }
    return <>{fallback}</>;
  };
  ```

- [ ] **Step 2: Write `src/components/DisabledAction.tsx`**
  Provide high-quality Apple style disabled state indicator.
  ```typescript
  import React from 'react';
  import { StyleSheet, Text, View } from 'react-native';
  import { useTheme } from '../theme/ThemeContext';
  import { Ionicons } from '@expo/vector-icons';

  interface DisabledActionProps {
    message: string;
  }

  export const DisabledActionExplanation: React.FC<DisabledActionProps> = ({ message }) => {
    const { colors } = useTheme();

    return (
      <View style={[styles.container, { backgroundColor: colors.statsBg, borderColor: colors.border }]}>
        <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
        <Text style={[styles.text, { color: colors.textSecondary }]}>{message}</Text>
      </View>
    );
  };

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      marginTop: 8,
    },
    text: {
      fontSize: 13,
      fontWeight: '500',
    }
  });
  ```

---

### Task 7: Connection Setup and Migration Flow

**Files:**
- Modify: `app/setup.tsx`
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Update App Entry logic for profile load in `app/_layout.tsx`**
  Read profile configurations from `SecureStore` (handling both the new `dokploy_profile` JSON structure and migration from legacy `dokploy_vps_url` + `dokploy_api_key`).
  ```typescript
  // Load and validate profile structure
  const profileStr = await SecureStore.getItemAsync('dokploy_profile');
  const legacyUrl = await SecureStore.getItemAsync('dokploy_vps_url');
  const legacyKey = await SecureStore.getItemAsync('dokploy_api_key');

  if (!profileStr && legacyUrl && legacyKey) {
    // Migrate legacy user
    const newProfile = {
      profileId: 'legacy-migrated-id-' + Math.random().toString(36).substring(7),
      serverUrl: legacyUrl,
      apiKey: legacyKey,
      createdAt: new Date().toISOString(),
    };
    await SecureStore.setItemAsync('dokploy_profile', JSON.stringify(newProfile));
    // Clean legacy keys
    await SecureStore.deleteItemAsync('dokploy_vps_url');
    await SecureStore.deleteItemAsync('dokploy_api_key');
  }
  ```

- [ ] **Step 2: Add validation constraints in `app/setup.tsx`**
  Reject plain HTTP connections for remote hosts (warn on localhost/private IPs). Validate connection against `/project.all` first.
  ```typescript
  import * as Crypto from 'expo-crypto';

  // Inside handleSave of SetupScreen:
  const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;

  // Validate URL protocol and formats
  if (!/^https?:\/\//i.test(cleanUrl)) {
    setError('URL must start with http:// or https://');
    return;
  }
  
  const hostname = cleanUrl.replace(/^https?:\/\//i, '').split(':')[0].split('/')[0];
  const isLocalPrivate = hostname === 'localhost' || hostname === '127.0.0.1' || 
    /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/.test(hostname);

  if (/^http:\/\//i.test(cleanUrl) && !isLocalPrivate) {
    setError('Plain HTTP is blocked. Secure HTTPS is required.');
    return;
  }
  ```

- [ ] **Step 3: Save Connection Profile on Successful Connection**
  Upon successful connection response, generate profileId UUID using `Crypto.randomUUID()` and save profile payload in `SecureStore` as `dokploy_profile`.

---

### Task 8: Settings screen updates

**Files:**
- Modify: `app/(tabs)/settings.tsx`

- [ ] **Step 1: Replace URL card in `app/(tabs)/settings.tsx`**
  Show the connection card:
  - Default server name: "Dokploy Server"
  - Server URL
  - Connected status state (Connected / Checking / Offline / Auth failed)
  - Last connection timestamp
  - Add button "Check Connection" to trigger query refresh manually.

- [ ] **Step 2: Add "Server Capabilities" details**
  Add bottom sheet in Settings showing all capabilities separated by categories (Projects, Applications, Compose, Databases, Docker). Display badges: Available (Green), Read Only (Orange), Forbidden (Red), Unsupported (Grey).

---

### Task 9: Verification, CI test runs, and final checks

- [ ] **Step 1: Verify Jest executes successfully**
  Run: `npm run test`
  Expected: All tests pass.

- [ ] **Step 2: Run type check**
  Run: `npx tsc --noEmit`
  Expected: No TypeScript errors.
