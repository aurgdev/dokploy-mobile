export type SupportedDatabaseBackupType =
  | "postgres"
  | "mysql"
  | "mariadb"
  | "mongo";

export type DatabaseBackupConfig = {
  backupId: string;
  databaseType: SupportedDatabaseBackupType;
  database: string; // The database ID (e.g., postgresId, mysqlId, etc.)
  enabled: boolean | null;
  schedule: string;
  prefix: string;
  destinationId: string;
  keepLatestCount: number | null;
  serviceName: string | null;
  createdAt: string | null;
  appName?: string;
  serverId?: string | null;
};

export type BackupFile = {
  key: string;
  name: string;
  sizeBytes: number | null;
  lastModifiedAt: string | null;
  timestampSource?: 'storage' | 'filename' | 'unknown';
};

export type SafeDestination = {
  destinationId: string;
  name: string | null;
  provider: string | null;
  bucket: string | null;
  region: string | null;
  serverId: string | null;
};
