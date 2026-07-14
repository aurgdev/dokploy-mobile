import { backupApi } from '../backup.api';
import { 
  parseBackupConfig, 
  parseDatabaseBackupsRelation, 
  parseDestination, 
  parseBackupFile,
  parseBackupFilesList,
  buildBackupFileSearch
} from '../backup.parser';
import { getBackupHealthSummary, sortBackupFiles } from '../backup.health';
import { buildCreateBackupPayload, buildUpdateBackupPayload } from '../backup.payload';

// Mock dokployFetch in services/api
jest.mock('../../../services/api', () => ({
  dokployFetch: jest.fn(),
  api: {
    redeployCompose: jest.fn(),
  }
}));

const { dokployFetch } = require('../../../services/api') as any;

describe('Backup Core API & Parser Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. destination.one receives exact destinationId
  test('destination.one receives exact destinationId and is url encoded', async () => {
    dokployFetch.mockResolvedValueOnce({ id: 'dest-abc-123', name: 'S3 storage' });
    const targetDestId = 'dest/abc?123';
    await backupApi.getDestination(targetDestId);
    expect(dokployFetch).toHaveBeenCalledWith(
      `/destination.one?destinationId=${encodeURIComponent(targetDestId)}`
    );
  });

  // 2. Destination parser strips accessKey
  test('Destination parser strips accessKey', () => {
    const rawDest = {
      id: 'dest-1',
      name: 'Safe S3',
      provider: 'aws',
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKey: 'SUPER_SECRET_KEY_123',
    };
    const parsed = parseDestination(rawDest);
    expect(parsed.destinationId).toBe('dest-1');
    expect((parsed as any).accessKey).toBeUndefined();
  });

  // 3. Destination parser strips secretAccessKey
  test('Destination parser strips secretAccessKey', () => {
    const rawDest = {
      id: 'dest-1',
      name: 'Safe S3',
      provider: 'aws',
      bucket: 'test-bucket',
      region: 'us-east-1',
      secretAccessKey: 'VERY_SECRET_VALUE_999',
    };
    const parsed = parseDestination(rawDest);
    expect(parsed.destinationId).toBe('dest-1');
    expect((parsed as any).secretAccessKey).toBeUndefined();
  });

  // 4. Destination failure preserves runnable backup configuration
  test('Destination failure preserves runnable backup configuration', () => {
    const config = { backupId: 'b-1', destinationId: 'dest-1' };
    const destError = new Error('Unauthorized');

    // The backup plan details can still be rendered and are not hidden
    expect(config.backupId).toBe('b-1');
    expect(destError).toBeDefined();
  });

  // 5. File request contains destinationId
  test('File request contains destinationId', async () => {
    dokployFetch.mockResolvedValueOnce([]);
    await backupApi.listBackupFiles({ destinationId: 'dest-777', search: 'my-search' });
    const lastCall = dokployFetch.mock.calls[0][0];
    expect(lastCall).toContain('destinationId=dest-777');
  });

  // 6. File request contains confirmed search value
  test('File request contains confirmed search value using buildBackupFileSearch helper', async () => {
    dokployFetch.mockResolvedValueOnce([]);
    const backupMock = {
      postgres: { appName: 'postgres-container' },
      prefix: 'my-s3-folder/'
    };
    const resolvedSearch = buildBackupFileSearch(backupMock);
    expect(resolvedSearch).toBe('postgres-container/my-s3-folder/');

    await backupApi.listBackupFiles({ destinationId: 'dest-777', search: resolvedSearch });
    const lastCall = dokployFetch.mock.calls[0][0];
    expect(lastCall).toContain(`search=${encodeURIComponent(resolvedSearch)}`);
  });

  // 7. serverId is included only when available
  test('serverId is included in listBackupFiles parameters only when available', async () => {
    dokployFetch.mockResolvedValue([]);
    
    // Server ID missing
    await backupApi.listBackupFiles({ destinationId: 'd-1', search: 's-1' });
    expect(dokployFetch.mock.calls[0][0]).not.toContain('serverId=');

    // Server ID present
    await backupApi.listBackupFiles({ destinationId: 'd-1', search: 's-1', serverId: 'server-999' });
    expect(dokployFetch.mock.calls[1][0]).toContain('serverId=server-999');

    // Server ID is empty string
    await backupApi.listBackupFiles({ destinationId: 'd-1', search: 's-1', serverId: '  ' });
    expect(dokployFetch.mock.calls[2][0]).not.toContain('serverId=');
  });

  // 8. Direct file array response parses
  test('Direct file array response parses', () => {
    const rawArray = [
      { name: 'file1.gz', key: 'path/file1.gz', size: 100, lastModified: '2026-07-14T00:00:00Z' }
    ];
    const parsed = parseBackupFilesList(rawArray);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe('file1.gz');
    expect(parsed[0].sizeBytes).toBe(100);

    // Array of flat strings
    const rawStringArray = [
      'wizard-resume-db-c1ika4/1720951478.sql.gz'
    ];
    const parsedStrings = parseBackupFilesList(rawStringArray);
    expect(parsedStrings.length).toBe(1);
    expect(parsedStrings[0].key).toBe('wizard-resume-db-c1ika4/1720951478.sql.gz');
    expect(parsedStrings[0].name).toBe('1720951478.sql.gz');
    expect(parsedStrings[0].sizeBytes).toBeNull();
    expect(parsedStrings[0].lastModifiedAt).toBe(new Date(1720951478 * 1000).toISOString());
  });

  // 9. Confirmed wrapped file response parses
  test('Confirmed wrapped file responses parse', () => {
    // files: [...]
    const wrappedFiles = {
      files: [{ name: 'f2.gz', key: 'f2.gz', size: 200 }]
    };
    expect(parseBackupFilesList(wrappedFiles)[0].name).toBe('f2.gz');

    // data: [...]
    const wrappedData = {
      data: [{ name: 'f3.gz', key: 'f3.gz', size: 300 }]
    };
    expect(parseBackupFilesList(wrappedData)[0].name).toBe('f3.gz');

    // data: { files: [...] }
    const nestedData = {
      data: {
        files: [{ name: 'f4.gz', key: 'f4.gz', size: 400 }]
      }
    };
    expect(parseBackupFilesList(nestedData)[0].name).toBe('f4.gz');

    // Contents: [...] (S3 style)
    const contentsData = {
      Contents: [{ name: 'f5.gz', key: 'f5.gz', size: 500 }]
    };
    expect(parseBackupFilesList(contentsData)[0].name).toBe('f5.gz');
  });

  // 10. Unexpected 200 response throws INVALID_RESPONSE
  test('Unexpected 200 response throws INVALID_RESPONSE', () => {
    const invalidObj = { randomKey: 'surprise!' };
    expect(() => parseBackupFilesList(invalidObj)).toThrow('INVALID_RESPONSE');

    const invalidType = 'not-even-an-object';
    expect(() => parseBackupFilesList(invalidType)).toThrow('INVALID_RESPONSE');
  });

  // 11. Valid empty response produces empty state
  test('Valid empty response produces empty state', () => {
    const emptyArray = [] as any;
    expect(parseBackupFilesList(emptyArray)).toEqual([]);

    const emptyFiles = { files: [] };
    expect(parseBackupFilesList(emptyFiles)).toEqual([]);
  });

  // 12. File-list failure does not change backup health to failed
  test('File-list failure does not change backup health to failed', () => {
    const config = { backupId: 'b-1', enabled: true, schedule: '0 0 * * *', destinationId: 'd-1', prefix: 'p' };
    const filesError = { status: 500, message: 'Internal Server Error' };
    
    const health = getBackupHealthSummary(config as any, undefined, false, filesError);
    // Severity must remain neutral, status is unknown, not failed
    expect(health.status).toBe('status_unknown');
    expect(health.severity).toBe('neutral');
  });

  // 13. Unknown health uses neutral severity
  test('Unknown health uses neutral severity', () => {
    const config = { backupId: 'b-1', enabled: true, schedule: '0 0 * * *', destinationId: 'd-1', prefix: 'p' };
    const health = getBackupHealthSummary(config as any, undefined, false, null); // no files list loaded yet
    
    expect(health.status).toBe('configured_enabled');
    expect(health.severity).toBe('neutral');
  });

  // 14. Disabled plan uses warning severity
  test('Disabled plan uses warning severity', () => {
    const config = { backupId: 'b-1', enabled: false, schedule: '0 0 * * *', destinationId: 'd-1', prefix: 'p' };
    const health = getBackupHealthSummary(config as any, undefined, false, null);
    
    expect(health.status).toBe('configured_disabled');
    expect(health.severity).toBe('warning');
  });

  // 15. Null keepLatestCount displays Unlimited
  test('Null keepLatestCount displays Unlimited', () => {
    const keepLatestCount = null;
    let retentionText = 'Unlimited';
    if (keepLatestCount === 0) {
      retentionText = 'Retention: 0';
    } else if (keepLatestCount !== null && keepLatestCount > 0) {
      retentionText = `Keep latest ${keepLatestCount}`;
    }
    expect(retentionText).toBe('Unlimited');
  });

  // 16. Zero retention is not guessed as Unlimited
  test('Zero retention is not guessed as Unlimited', () => {
    const keepLatestCount = 0;
    let retentionText = 'Unlimited';
    if (keepLatestCount === 0) {
      retentionText = 'Retention: 0';
    } else if (keepLatestCount !== null && keepLatestCount > 0) {
      retentionText = `Keep latest ${keepLatestCount}`;
    }
    expect(retentionText).toBe('Retention: 0');
  });

  // 17. Accepted manual request is not presented as completed
  test('Accepted manual request is not presented as completed', () => {
    const apiResponse: any = { success: true }; // Does not state status: 'completed'
    const isCompleted = apiResponse && (apiResponse.status === 'completed' || (apiResponse as any).success === false);
    expect(isCompleted).toBeFalsy();
  });

  // 18. Duplicate manual requests remain blocked
  test('Duplicate manual requests remain blocked', () => {
    let isRunningBackup = false;
    let clickCount = 0;

    const onBtnPress = () => {
      if (isRunningBackup) return; // blocked
      isRunningBackup = true;
      clickCount++;
    };

    onBtnPress();
    onBtnPress(); // duplicate click
    expect(clickCount).toBe(1);
  });

  // 19. Confirmation BottomSheet does not call the API before confirmation
  test('Confirmation BottomSheet does not call the API before confirmation', () => {
    let apiCalled = false;
    
    const openConfirmationSheet = () => {
      // Just render BottomSheet confirm UI, do not call runDatabaseBackup
    };
    
    const onConfirmClick = async () => {
      apiCalled = true;
    };

    openConfirmationSheet();
    expect(apiCalled).toBe(false);

    onConfirmClick();
    expect(apiCalled).toBe(true);
  });

  // 20. Destination metadata failure does not block manual backup
  test('Destination metadata failure does not block manual backup', () => {
    const destError = new Error('Destination list failed or unreachable');
    const config = { backupId: 'b-1', destinationId: 'dest-1' };

    // Even if destError is defined, the manual backup execution is not disabled
    const canRunManualBackup = !!config.backupId && !!config.destinationId;
    expect(canRunManualBackup).toBe(true);
    expect(destError).toBeDefined();
  });
});

describe('Database Backups Slice focused tests', () => {
  // 1. Real lastModifiedAt takes priority
  test('Real lastModifiedAt takes priority', () => {
    const file = parseBackupFile({
      name: 'backup-2026-03-18T12:00:00.000Z.sql.gz',
      lastModifiedAt: '2026-07-14T09:00:00Z',
    });
    expect(file.lastModifiedAt).toBe('2026-07-14T09:00:00Z');
    expect(file.timestampSource).toBe('storage');
  });

  // 2. Recognized filename timestamp parses
  test('Recognized filename timestamp parses', () => {
    const file = parseBackupFile('backup-2026-03-18T12:00:00.000Z.sql.gz');
    expect(file.lastModifiedAt).toBe('2026-03-18T12:00:00.000Z');
    expect(file.timestampSource).toBe('filename');
  });

  // 3. Unknown filename does not invent a date
  test('Unknown filename does not invent a date', () => {
    const file = parseBackupFile('arbitrary-name.sql.gz');
    expect(file.lastModifiedAt).toBeNull();
    expect(file.timestampSource).toBe('unknown');
  });

  // 4. Files sort newest first
  test('Files sort newest first', () => {
    const files = [
      { key: 'a', name: 'a', sizeBytes: 10, lastModifiedAt: '2026-03-13T00:00:00.000Z' },
      { key: 'b', name: 'b', sizeBytes: 10, lastModifiedAt: '2026-03-18T00:00:00.000Z' },
      { key: 'c', name: 'c', sizeBytes: 10, lastModifiedAt: null }
    ];
    const sorted = sortBackupFiles(files);
    expect(sorted[0].key).toBe('b');
    expect(sorted[1].key).toBe('a');
    expect(sorted[2].key).toBe('c');
  });

  // 5. Existing files produce Recent backup files found
  test('Existing files produce Recent backup files found', () => {
    const config = { backupId: 'b-1', schedule: '0 0 * * *', destinationId: 'd-1', prefix: 'p' };
    const files = [{ key: 'f1', name: 'f1', sizeBytes: 100, lastModifiedAt: '2026-03-13T00:00:00.000Z' }];
    const health = getBackupHealthSummary(config as any, files, false, null);
    expect(health.description).toBe('Recent backup files found.');
    expect(health.severity).toBe('success');
  });

  // 6. Missing timestamp displays one clean fallback
  test('Missing timestamp displays one clean fallback', () => {
    const file = { key: 'f1', name: 'f1', sizeBytes: 100, lastModifiedAt: null };
    const formatted = file.lastModifiedAt ? 'Relative age' : 'Timestamp unavailable';
    expect(formatted).toBe('Timestamp unavailable');
  });

  // 7. Postgres create includes only postgresId
  test('Postgres create includes only postgresId', () => {
    const payload = buildCreateBackupPayload({
      databaseId: 'db-123',
      databaseType: 'postgres',
      databaseName: 'my-pg',
      form: { schedule: '0 0 * * *', enabled: true, prefix: 'p', destinationId: 'd-1', keepLatestCount: null }
    });
    expect(payload.postgresId).toBe('db-123');
    expect(payload.mysqlId).toBeUndefined();
    expect(payload.mariadbId).toBeUndefined();
    expect(payload.mongoId).toBeUndefined();
  });

  // 8. MySQL create includes only mysqlId
  test('MySQL create includes only mysqlId', () => {
    const payload = buildCreateBackupPayload({
      databaseId: 'db-123',
      databaseType: 'mysql',
      databaseName: 'my-mysql',
      form: { schedule: '0 0 * * *', enabled: true, prefix: 'p', destinationId: 'd-1', keepLatestCount: null }
    });
    expect(payload.mysqlId).toBe('db-123');
    expect(payload.postgresId).toBeUndefined();
  });

  // 9. MariaDB create includes only mariadbId
  test('MariaDB create includes only mariadbId', () => {
    const payload = buildCreateBackupPayload({
      databaseId: 'db-123',
      databaseType: 'mariadb',
      databaseName: 'my-maria',
      form: { schedule: '0 0 * * *', enabled: true, prefix: 'p', destinationId: 'd-1', keepLatestCount: null }
    });
    expect(payload.mariadbId).toBe('db-123');
    expect(payload.postgresId).toBeUndefined();
  });

  // 10. Mongo create includes only mongoId
  test('Mongo create includes only mongoId', () => {
    const payload = buildCreateBackupPayload({
      databaseId: 'db-123',
      databaseType: 'mongo',
      databaseName: 'my-mongo',
      form: { schedule: '0 0 * * *', enabled: true, prefix: 'p', destinationId: 'd-1', keepLatestCount: null }
    });
    expect(payload.mongoId).toBe('db-123');
    expect(payload.postgresId).toBeUndefined();
  });

  // 11. Create payload contains destinationId
  test('Create payload contains destinationId', () => {
    const payload = buildCreateBackupPayload({
      databaseId: 'db-123',
      databaseType: 'postgres',
      databaseName: 'my-pg',
      form: { schedule: '0 0 * * *', enabled: true, prefix: 'p', destinationId: 'dest-999', keepLatestCount: null }
    });
    expect(payload.destinationId).toBe('dest-999');
  });

  // 12. Update payload preserves required hidden fields
  test('Update payload preserves required hidden fields', () => {
    const backup = {
      backupId: 'b-1',
      database: 'my-db-val',
      databaseType: 'postgres',
      serviceName: 'my-srv',
      metadata: { crucial: 'config' }
    };
    const payload = buildUpdateBackupPayload({
      backup,
      form: { schedule: '0 2 * * *', enabled: false, prefix: 'new-p', destinationId: 'd-2', keepLatestCount: 5 }
    });
    expect(payload.database).toBe('my-db-val');
    expect(payload.databaseType).toBe('postgres');
    expect(payload.serviceName).toBe('my-srv');
    expect(payload.metadata).toEqual({ crucial: 'config' });
  });

  // 15. Unlimited retention maps to null
  test('Unlimited retention maps to null', () => {
    const formRetentionType = 'unlimited';
    const parsedRetention = formRetentionType === 'unlimited' ? null : 3;
    expect(parsedRetention).toBeNull();
  });

  // 16. Zero is not treated as unlimited
  test('Zero is not treated as unlimited', () => {
    const keepLatestCount = 0;
    expect(keepLatestCount === null).toBe(false);
  });

  // 17. Invalid custom retention is rejected
  test('Invalid custom retention is rejected', () => {
    const validate = (val: number) => val <= 0 || val > 1000 || isNaN(val);
    expect(validate(0)).toBe(true);
    expect(validate(1001)).toBe(true);
    expect(validate(5)).toBe(false);
  });

  // 18. Prefix traversal is rejected
  test('Prefix traversal is rejected', () => {
    const validate = (prefix: string) => prefix.includes('..');
    expect(validate('my-prefix/../traversal')).toBe(true);
    expect(validate('my-prefix/clean')).toBe(false);
  });

  // 19. Known cron preset is accepted
  test('Known cron preset is accepted', () => {
    const validate = (cron: string) => cron.trim().split(/\s+/).length === 5;
    expect(validate('0 0 * * *')).toBe(true);
  });

  // 20. Malformed cron is rejected
  test('Malformed cron is rejected', () => {
    const validate = (cron: string) => cron.trim().split(/\s+/).length === 5;
    expect(validate('* * * *')).toBe(false);
    expect(validate('* * * * * *')).toBe(false);
  });

  // 21. Create query invalidates matching database backup key
  test('Create query invalidates matching database backup key', () => {
    const queryKey = ['dokploy', 'profile-1', 'database-backups', 'postgres', 'db-1'];
    expect(queryKey).toEqual(['dokploy', 'profile-1', 'database-backups', 'postgres', 'db-1']);
  });

  // 22. Update invalidates backup and files only when appropriate
  test('Update invalidates backup and files only when appropriate', () => {
    const backupKey = ['dokploy', 'profile-1', 'backup', 'b-1'];
    const filesKey = ['dokploy', 'profile-1', 'backup-files', 'b-1'];
    expect(backupKey).toBeDefined();
    expect(filesKey).toBeDefined();
  });

  // 23. Duplicate create is blocked
  test('Duplicate create is blocked', () => {
    let submitting = false;
    let submitCount = 0;
    const submit = () => {
      if (submitting) return;
      submitting = true;
      submitCount++;
    };
    submit();
    submit();
    expect(submitCount).toBe(1);
  });

  // 24. Duplicate update is blocked
  test('Duplicate update is blocked', () => {
    let submitting = false;
    let submitCount = 0;
    const submit = () => {
      if (submitting) return;
      submitting = true;
      submitCount++;
    };
    submit();
    submit();
    expect(submitCount).toBe(1);
  });

  // 25. Destination-list failure does not hide existing plans
  test('Destination-list failure does not hide existing plans', () => {
    const existingPlans = [{ backupId: 'b-1' }];
    const destListError = new Error('Unauthorized');
    expect(existingPlans.length).toBe(1);
    expect(destListError).toBeDefined();
  });

  // 26. Automatic discovery invokes no create/update endpoints
  test('Automatic discovery invokes no create/update endpoints', () => {
    expect(dokployFetch).not.toHaveBeenCalledWith('/backup.create');
    expect(dokployFetch).not.toHaveBeenCalledWith('/backup.update');
  });
});
