# Dokploy API Client & Capability Foundation Design Specification

**Date:** 2026-07-13  
**Status:** Proposed  
**Author:** Antigravity AI  

---

## 1. Goal & Overview
The goal is to build a centralized, typed, secure, and resilient API client foundation for the Dokploy Companion mobile app, including:
1. **Centralized API Client (`src/services/api.ts`)**: Safe normalization of base URL, timeout handling, JSON parsing, error-mapping to a normalized model, and secret redaction.
2. **Instance & Capability Models**: Typed models for `DokployInstanceInfo` and `DokployCapabilities` (which use a status-based `CapabilityStatus` rather than plain booleans).
3. **AsyncStorage Cache**: Namespaced local caching of connection metadata and capabilities using `@react-native-async-storage/async-storage` under a secure `profileId` generated only after successful validation.
4. **React Query Integration**: Custom hooks (`useDokployInstanceInfo`, `useDokployCapabilities`, `useConnectionHealth`, etc.) keeping React Query as the in-memory source of truth.
5. **Settings UI Update**: Enhanced connection details card, a "Server Capabilities" row that slides open a bottom sheet, and a "Technical Details" collapse view.
6. **Permission-Aware UI Helpers**: Reusable components (`CapabilityGate`) and helper functions to disable/hide unauthorized features dynamically.
7. **Connection Validation Flow**: Upgraded first-time setup validating URL, SSL/TLS, and authentication before generating a unique profile ID.
8. **Secure Logging & Testing**: Redacting sensitive keys/headers from logs and adding unit tests via `jest-expo`.

---

## 2. Architecture & Types

### A. Core Types

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
```

---

## 3. Detailed Components & Logic

### A. Centralized API Adapter
All network requests go through a unified fetch wrapper.
* **Base URL Normalization**:
  * Strips trailing slashes: `http://vps.ip/api/` -> `http://vps.ip`
  * Prevents double `/api`: if URL has `/api` at the end, it strips it and targets `/api/...` correctly.
  * Rejects invalid protocols (accepts `http` / `https`, but forces `https` unless it is `localhost` or a private IP `10.x.x.x`, `192.168.x.x`, `172.16.x.x-172.31.x.x`).
* **Timeout Handling**: Uses `AbortController` with a default 10-second timeout.
* **Error Model**: Maps raw errors to `DokployApiError`:
  ```typescript
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
* **Secret Redactor**: A utility that recursively filters or replaces strings matching sensitive keys (`x-api-key`, `Authorization`, API keys, passwords, database credentials) with `[REDACTED]` in error payloads and console logs.

### B. Capability Detection Logic
1. **Fetch OpenAPI (`settings.getOpenApiDocument`)**:
   * If succeeds, parse the JSON document. Scan its paths.
   * If a path like `/domain.all` exists, check if `readDomains` is supported. If a mutating path like `/domain.create` exists, mark `manageDomains` as potential.
2. **Handle Non-OpenAPI or Failed Discovery**:
   * Fall back to checking known version features or explicit HTTP status mappings:
     * **403 Forbidden**: Mark capability as `forbidden`.
     * **404 Not Found**: If an endpoint (like `/domain.all`) yields 404, update the capability status to `unsupported`.
     * **500 Server Error / Timeout / Offline**: Do NOT mutate capabilities (leaves them as they were).
3. **Caching**: Store `CachedCapabilities` and `CachedInstanceInfo` in `AsyncStorage` namespaced by `profileId`.

### C. UI & Gates
* **`CapabilityGate` Component**:
  ```tsx
  export const CapabilityGate: React.FC<{
    capability: DokployCapabilityKey;
    fallback?: React.ReactNode;
    children: React.ReactNode;
  }> = ({ capability, fallback, children }) => { ... }
  ```
* **Settings screen update**: Replace server card with structured status card + collapsible technical details + bottom sheet listing all capabilities categorized cleanly.

---

## 4. Verification & Testing Plan
* **Automated Unit Tests**:
  Configure `jest-expo` and write tests in `src/services/__tests__/api.test.ts`.
  * Validate URL normalization and protocol checks.
  * Validate error conversion (401 -> `UNAUTHORIZED`, 403 -> `FORBIDDEN`, timeouts, network failure).
  * Validate secret redactor (removing API keys/headers from logs and errors).
  * Validate OpenAPI path detection and capability mapping.
  * Validate cache loading/discarding on schema mismatch.
