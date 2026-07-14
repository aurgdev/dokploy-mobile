import { dokployFetch } from '../../services/api';
import { DatabaseBackupConfig, BackupFile, SafeDestination } from './backup.types';
import { 
  parseBackupConfig, 
  parseBackupFilesList, 
  parseDestination, 
  parseDestinationsList,
  parseDatabaseBackupsRelation 
} from './backup.parser';

// Development-only diagnostic logging helper (captures metadata, never raw secrets/credentials/bodies)
function logDiagnostics(info: {
  endpoint: string;
  status: number | null;
  errorCode: string | null;
  responseType: string;
  responseKeys: string[];
  destinationId?: string;
  search?: string;
  hasServerId?: boolean;
}) {
  if (__DEV__) {
    console.log(`[BACKUP DIAGNOSTICS]`, JSON.stringify(info, null, 2));
  }
}

export const backupApi = {
  /**
   * Fetch single backup configuration.
   * GET /api/backup.one?backupId=<id>
   */
  getBackupById: async (backupId: string): Promise<DatabaseBackupConfig> => {
    const raw = await dokployFetch(`/backup.one?backupId=${encodeURIComponent(backupId)}`);
    return parseBackupConfig(raw);
  },

  /**
   * Fetch database details.
   * GET /api/<dbType>.one?<dbType>Id=<id>
   */
  getDatabaseDetails: async (databaseId: string, databaseType: string): Promise<any> => {
    const cleanType = databaseType.toLowerCase();
    if (cleanType !== 'postgres' && cleanType !== 'mysql' && cleanType !== 'mariadb' && cleanType !== 'mongo') {
      throw new Error(`Unsupported database type for backups: ${databaseType}`);
    }
    return dokployFetch(`/${cleanType}.one?${cleanType}Id=${encodeURIComponent(databaseId)}`);
  },

  /**
   * List backup files.
   * GET /api/backup.listBackupFiles?destinationId=<id>&search=<prefix>
   */
  listBackupFiles: async (input: { destinationId: string; search: string; serverId?: string }): Promise<BackupFile[]> => {
    let status: number | null = null;
    let errorCode: string | null = null;
    let responseType = 'undefined';
    let responseKeys: string[] = [];
    const hasServerId = !!input.serverId && input.serverId.trim() !== '';

    const params = new URLSearchParams();
    params.append('destinationId', input.destinationId);
    params.append('search', input.search);
    if (hasServerId && input.serverId) {
      params.append('serverId', input.serverId);
    }

    try {
      const raw = await dokployFetch(`/backup.listBackupFiles?${params.toString()}`);
      status = 200;
      responseType = typeof raw;
      if (raw && typeof raw === 'object') {
        responseKeys = Object.keys(raw);
      }
      logDiagnostics({
        endpoint: '/backup.listBackupFiles',
        status,
        errorCode,
        responseType,
        responseKeys,
        destinationId: input.destinationId,
        search: input.search,
        hasServerId,
      });
      return parseBackupFilesList(raw);
    } catch (err: any) {
      status = err.status || null;
      errorCode = err.code || 'UNKNOWN';
      logDiagnostics({
        endpoint: '/backup.listBackupFiles',
        status,
        errorCode,
        responseType,
        responseKeys,
        destinationId: input.destinationId,
        search: input.search,
        hasServerId,
      });
      throw err;
    }
  },

  /**
   * Fetch S3/backup destination details (strips sensitive credentials).
   * GET /api/destination.one?destinationId=<id>
   */
  getDestination: async (destinationId: string): Promise<SafeDestination> => {
    let status: number | null = null;
    let errorCode: string | null = null;
    let responseType = 'undefined';
    let responseKeys: string[] = [];

    try {
      const raw = await dokployFetch(`/destination.one?destinationId=${encodeURIComponent(destinationId)}`);
      status = 200;
      responseType = typeof raw;
      if (raw && typeof raw === 'object') {
        responseKeys = Object.keys(raw);
      }
      logDiagnostics({
        endpoint: '/destination.one',
        status,
        errorCode,
        responseType,
        responseKeys,
        destinationId,
      });
      return parseDestination(raw);
    } catch (err: any) {
      status = err.status || null;
      errorCode = err.code || 'UNKNOWN';
      logDiagnostics({
        endpoint: '/destination.one',
        status,
        errorCode,
        responseType,
        responseKeys,
        destinationId,
      });
      throw err;
    }
  },

  /**
   * Trigger database manual backup.
   * Reject unsupported database types (e.g. Redis) before making a network call.
   */
  runDatabaseBackup: async (input: { backupId: string; databaseType: string }): Promise<any> => {
    const cleanType = input.databaseType.toLowerCase();

    // Map each supported type to its exact manual backup endpoint
    const endpointMap: Record<string, string> = {
      postgres: '/backup.manualBackupPostgres',
      mysql: '/backup.manualBackupMySql',
      mariadb: '/backup.manualBackupMariadb',
      mongo: '/backup.manualBackupMongo',
    };

    const endpoint = endpointMap[cleanType];
    if (!endpoint) {
      throw new Error(`Unsupported database type for manual backup: ${input.databaseType}`);
    }

    return dokployFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({ backupId: input.backupId }),
    });
  },

  /**
   * Get all backups configured for a specific database.
   * If details contain full backup configs, reuses them.
   * If details contain backup IDs only, calls getBackupById for each ID.
   */
  getBackupsForDatabase: async (databaseId: string, databaseType: string): Promise<DatabaseBackupConfig[]> => {
    const details = await backupApi.getDatabaseDetails(databaseId, databaseType);
    const parsedRelation = parseDatabaseBackupsRelation(details);
    const appName = details?.appName || '';
    const serverId = details?.serverId || null;

    if (parsedRelation.type === 'full') {
      const configs = parsedRelation.data as DatabaseBackupConfig[];
      return configs.map(c => ({
        ...c,
        appName: c.appName || appName,
        serverId: c.serverId || serverId,
      }));
    } else {
      const ids = parsedRelation.data as string[];
      const configs = await Promise.all(
        ids.map(id => backupApi.getBackupById(id))
      );
      return configs.map(c => ({
        ...c,
        appName: c.appName || appName,
        serverId: c.serverId || serverId,
      }));
    }
  },

  /**
   * Fetch all safe destinations.
   * GET /api/destination.all
   */
  getAllDestinations: async (): Promise<SafeDestination[]> => {
    const raw = await dokployFetch('/destination.all');
    return parseDestinationsList(raw);
  },

  /**
   * Create database backup config.
   * POST /api/backup.create
   */
  createBackup: async (payload: any): Promise<any> => {
    return dokployFetch('/backup.create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Update database backup config.
   * POST /api/backup.update
   */
  updateBackup: async (payload: any): Promise<any> => {
    return dokployFetch('/backup.update', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
};
