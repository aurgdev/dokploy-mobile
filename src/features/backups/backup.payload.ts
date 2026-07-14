import { SupportedDatabaseBackupType } from './backup.types';

export function buildCreateBackupPayload(input: {
  databaseId: string;
  databaseType: SupportedDatabaseBackupType;
  databaseName: string;
  form: {
    schedule: string;
    enabled: boolean;
    prefix: string;
    destinationId: string;
    keepLatestCount: number | null;
  };
}) {
  const { databaseId, databaseType, databaseName, form } = input;
  
  const payload: any = {
    schedule: form.schedule,
    enabled: form.enabled,
    prefix: form.prefix.trim(),
    destinationId: form.destinationId,
    keepLatestCount: form.keepLatestCount,
    database: databaseName,
    databaseType: databaseType,
    backupType: "database"
  };

  if (databaseType === 'postgres') {
    payload.postgresId = databaseId;
  } else if (databaseType === 'mysql') {
    payload.mysqlId = databaseId;
  } else if (databaseType === 'mariadb') {
    payload.mariadbId = databaseId;
  } else if (databaseType === 'mongo') {
    payload.mongoId = databaseId;
  }

  // Omit undefined optional values
  Object.keys(payload).forEach(key => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  return payload;
}

export function buildUpdateBackupPayload(input: {
  backup: any;
  form: {
    schedule: string;
    enabled: boolean;
    prefix: string;
    destinationId: string;
    keepLatestCount: number | null;
  };
}) {
  const { backup, form } = input;

  const payload: any = {
    backupId: backup.backupId || backup.id,
    schedule: form.schedule,
    enabled: form.enabled,
    prefix: form.prefix.trim(),
    destinationId: form.destinationId,
    keepLatestCount: form.keepLatestCount,
    
    // Preserve required hidden fields from backup configuration
    database: backup.database,
    databaseType: backup.databaseType,
    serviceName: backup.serviceName !== undefined ? backup.serviceName : null,
    metadata: backup.metadata !== undefined ? backup.metadata : null,
  };

  // Omit undefined optional values
  Object.keys(payload).forEach(key => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  return payload;
}
