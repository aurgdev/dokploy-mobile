import { DatabaseBackupConfig, SupportedDatabaseBackupType, BackupFile, SafeDestination } from './backup.types';

export function parseBackupConfig(raw: any): DatabaseBackupConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('INVALID_RESPONSE');
  }

  const backupId = raw.backupId || raw.id;
  if (typeof backupId !== 'string') {
    throw new Error('INVALID_RESPONSE');
  }

  let databaseType: SupportedDatabaseBackupType | null = null;
  let database = '';

  if (typeof raw.postgresId === 'string' && raw.postgresId) {
    databaseType = 'postgres';
    database = raw.postgresId;
  } else if (typeof raw.mysqlId === 'string' && raw.mysqlId) {
    databaseType = 'mysql';
    database = raw.mysqlId;
  } else if (typeof raw.mariadbId === 'string' && raw.mariadbId) {
    databaseType = 'mariadb';
    database = raw.mariadbId;
  } else if (typeof raw.mongoId === 'string' && raw.mongoId) {
    databaseType = 'mongo';
    database = raw.mongoId;
  } else if (typeof raw.databaseType === 'string' && raw.databaseType) {
    databaseType = raw.databaseType as SupportedDatabaseBackupType;
    database = raw.database || '';
  }

  if (!databaseType) {
    throw new Error('INVALID_RESPONSE');
  }

  const schedule = raw.schedule;
  const prefix = raw.prefix;
  const destinationId = raw.destinationId;

  if (typeof schedule !== 'string' || typeof prefix !== 'string' || typeof destinationId !== 'string') {
    throw new Error('INVALID_RESPONSE');
  }

  return {
    backupId,
    databaseType,
    database,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : null,
    schedule,
    prefix,
    destinationId,
    keepLatestCount: typeof raw.keepLatestCount === 'number' ? raw.keepLatestCount : null,
    serviceName: typeof raw.serviceName === 'string' ? raw.serviceName : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
  };
}

export function parseDatabaseBackupsRelation(dbResponse: any): { type: 'full' | 'ids'; data: any } {
  if (!dbResponse) {
    return { type: 'full', data: [] };
  }

  // If both are missing, assume empty full backups list
  if (dbResponse.backups === undefined && dbResponse.backup === undefined) {
    return { type: 'full', data: [] };
  }

  // Check singular backup
  if (dbResponse.backup !== undefined) {
    const val = dbResponse.backup;
    if (val === null) {
      return { type: 'full', data: [] };
    }
    if (typeof val !== 'object' || Array.isArray(val)) {
      throw new Error('INVALID_RESPONSE');
    }
    if (typeof val.schedule === 'string') {
      return { type: 'full', data: [parseBackupConfig(val)] };
    } else if (typeof val.backupId === 'string' || typeof val.id === 'string') {
      return { type: 'ids', data: [val.backupId || val.id] };
    } else {
      throw new Error('INVALID_RESPONSE');
    }
  }

  // Check plural backups
  if (dbResponse.backups !== undefined) {
    const val = dbResponse.backups;
    if (val === null) {
      return { type: 'full', data: [] };
    }
    if (!Array.isArray(val)) {
      throw new Error('INVALID_RESPONSE');
    }
    if (val.length === 0) {
      return { type: 'full', data: [] };
    }

    const first = val[0];
    if (typeof first === 'string') {
      return { type: 'ids', data: val };
    }

    if (first && typeof first === 'object') {
      if (typeof first.schedule === 'string') {
        return { type: 'full', data: val.map(b => parseBackupConfig(b)) };
      } else if (typeof first.backupId === 'string' || typeof first.id === 'string') {
        return { type: 'ids', data: val.map(b => b.backupId || b.id) };
      } else {
        throw new Error('INVALID_RESPONSE');
      }
    }
    throw new Error('INVALID_RESPONSE');
  }

  return { type: 'full', data: [] };
}

export function parseDestination(raw: any): SafeDestination {
  if (!raw || typeof raw !== 'object') {
    throw new Error('INVALID_RESPONSE');
  }

  const destinationId = raw.destinationId || raw.id;

  if (typeof destinationId !== 'string') {
    throw new Error('INVALID_RESPONSE');
  }

  // Return ONLY non-secret safe fields. accessKey and secretAccessKey are discarded.
  return {
    destinationId,
    name: typeof raw.name === 'string' ? raw.name : null,
    provider: typeof raw.provider === 'string' ? raw.provider : null,
    bucket: typeof raw.bucket === 'string' ? raw.bucket : null,
    region: typeof raw.region === 'string' ? raw.region : null,
    serverId: typeof raw.serverId === 'string' ? raw.serverId : null,
  };
}

export function parseDestinationsList(raw: any): SafeDestination[] {
  if (!Array.isArray(raw)) {
    throw new Error('INVALID_RESPONSE');
  }
  return raw.map(item => parseDestination(item));
}

export function parseBackupFile(raw: any): BackupFile {
  if (!raw) {
    throw new Error('INVALID_RESPONSE');
  }

  let name = '';
  let key = '';
  let sizeBytes: number | null = null;
  let lastModifiedAt: string | null = null;
  let timestampSource: 'storage' | 'filename' | 'unknown' = 'unknown';

  if (typeof raw === 'string') {
    const parts = raw.split('/');
    name = parts[parts.length - 1] || raw;
    key = raw;
  } else if (raw && typeof raw === 'object') {
    name = raw.name || raw.Name || raw.key || raw.Key || '';
    key = raw.key || raw.Key || raw.name || raw.Name || '';
    if (typeof name !== 'string' || typeof key !== 'string' || !name) {
      throw new Error('INVALID_RESPONSE');
    }
    const rawSize = raw.size !== undefined ? raw.size : (raw.Size !== undefined ? raw.Size : (raw.sizeBytes !== undefined ? raw.sizeBytes : null));
    if (typeof rawSize === 'number') {
      sizeBytes = rawSize;
    } else if (typeof rawSize === 'string') {
      const parsed = parseInt(rawSize, 10);
      if (!isNaN(parsed)) {
        sizeBytes = parsed;
      }
    }
  } else {
    throw new Error('INVALID_RESPONSE');
  }

  // 1. Try storage timestamp
  const rawTime = (raw && typeof raw === 'object') ? (raw.lastModifiedAt || raw.LastModifiedAt || raw.lastModified || raw.LastModified || raw.modified || raw.time || null) : null;
  if (typeof rawTime === 'string' && rawTime.trim() !== '') {
    lastModifiedAt = rawTime;
    timestampSource = 'storage';
  } else {
    // 2. Try strict filename ISO timestamp fallback: YYYY-MM-DDTHH:mm:ss.SSSZ
    const isoMatch = name.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/i);
    if (isoMatch && isoMatch[1]) {
      const parsed = Date.parse(isoMatch[1]);
      if (!isNaN(parsed)) {
        lastModifiedAt = new Date(parsed).toISOString();
        timestampSource = 'filename';
      }
    } else {
      // 3. Fallback to Unix timestamp (10 or 13 digits) if present
      const tsMatch = name.match(/\b(\d{10}|\d{13})\b/);
      if (tsMatch && tsMatch[1]) {
        const ts = parseInt(tsMatch[1], 10);
        if (ts > 1000000000 && ts < 2000000000) {
          lastModifiedAt = new Date(ts * 1000).toISOString();
          timestampSource = 'filename';
        } else if (ts > 1000000000000 && ts < 2000000000000) {
          lastModifiedAt = new Date(ts).toISOString();
          timestampSource = 'filename';
        }
      }
    }
  }

  return {
    key,
    name,
    sizeBytes,
    lastModifiedAt,
    timestampSource,
  };
}

export function parseBackupFilesList(raw: any): BackupFile[] {
  if (!raw) {
    throw new Error('INVALID_RESPONSE');
  }

  let filesArray: any[] | null = null;

  if (Array.isArray(raw)) {
    filesArray = raw;
  } else if (typeof raw === 'object') {
    if (Array.isArray(raw.files)) {
      filesArray = raw.files;
    } else if (raw.data !== undefined) {
      if (Array.isArray(raw.data)) {
        filesArray = raw.data;
      } else if (raw.data && Array.isArray(raw.data.files)) {
        filesArray = raw.data.files;
      }
    } else if (Array.isArray(raw.Contents)) {
      filesArray = raw.Contents;
    }
  }

  if (filesArray === null) {
    throw new Error('INVALID_RESPONSE');
  }

  return filesArray.map(item => parseBackupFile(item));
}

export function buildBackupFileSearch(backup: any): string {
  if (!backup) return '';
  const db = backup.postgres || backup.mysql || backup.mariadb || backup.mongo;
  const appName = db?.appName || backup.serviceName || backup.appName || '';
  const prefix = backup.prefix || '';

  let cleanPrefix = prefix.trim();
  if (cleanPrefix.startsWith('/')) {
    cleanPrefix = cleanPrefix.substring(1);
  }
  if (cleanPrefix && !cleanPrefix.endsWith('/')) {
    cleanPrefix = `${cleanPrefix}/`;
  }

  if (appName) {
    return `${appName}/${cleanPrefix}`;
  }
  return cleanPrefix;
}
