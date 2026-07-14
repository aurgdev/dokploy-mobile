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
  "readVolumeBackups",
  "manageVolumeBackups",
  "runVolumeBackups",
  "readIncidents",
  "readCentralDeployments",
  "readDeploymentQueue",
  "readDeploymentLogs",
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
