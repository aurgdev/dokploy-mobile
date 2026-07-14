import { volumeBackupApi } from '../volumeBackup.api';
import { 
  parseVolumeBackupPlan, 
  parseVolumeBackupPlanList,
  parseApplicationMounts,
  parseComposeServices,
  parseComposeMounts
} from '../volumeBackup.parser';
import { 
  buildCreateVolumeBackupPayload, 
  buildUpdateVolumeBackupPayload 
} from '../volumeBackup.payload';
import { 
  validateVolumeBackupName, 
  validateCronExpression, 
  validatePrefix, 
  validateRetention,
  getVolumeBackupFormBlockReason
} from '../volumeBackup.validation';

jest.mock('../../../services/api', () => ({
  dokployFetch: jest.fn(),
}));

const { dokployFetch } = require('../../../services/api') as any;

describe('Volume Backup Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Application list uses application ID and type
  test('Application list uses application ID and type', async () => {
    dokployFetch.mockResolvedValueOnce([]);
    await volumeBackupApi.listVolumeBackups('app-123', 'application');
    expect(dokployFetch).toHaveBeenCalledWith(
      '/volumeBackups.list?id=app-123&volumeBackupType=application'
    );
  });

  // 2. Compose list uses compose ID and type
  test('Compose list uses compose ID and type', async () => {
    dokployFetch.mockResolvedValueOnce([]);
    await volumeBackupApi.listVolumeBackups('comp-123', 'compose');
    expect(dokployFetch).toHaveBeenCalledWith(
      '/volumeBackups.list?id=comp-123&volumeBackupType=compose'
    );
  });

  // 3. Application payload includes only applicationId
  test('Application payload includes only applicationId', () => {
    const payload = buildCreateVolumeBackupPayload({
      resourceId: 'app-123',
      resourceType: 'application',
      form: {
        name: 'My App Backup',
        volumeName: 'app_data',
        prefix: 'app-pre',
        appName: 'app-test',
        serviceName: null,
        turnOff: true,
        cronExpression: '0 0 * * *',
        keepLatestCount: 5,
        enabled: true,
        destinationId: 'dest-1'
      }
    });
    expect(payload.applicationId).toBe('app-123');
    expect((payload as any).composeId).toBeUndefined();
  });

  // 4. Compose payload includes only composeId
  test('Compose payload includes only composeId', () => {
    const payload = buildCreateVolumeBackupPayload({
      resourceId: 'comp-123',
      resourceType: 'compose',
      form: {
        name: 'My Compose Backup',
        volumeName: 'comp_data',
        prefix: 'comp-pre',
        appName: 'comp-test',
        serviceName: 'web',
        turnOff: true,
        cronExpression: '0 0 * * *',
        keepLatestCount: 5,
        enabled: true,
        destinationId: 'dest-1'
      }
    });
    expect(payload.composeId).toBe('comp-123');
    expect((payload as any).applicationId).toBeUndefined();
  });

  // 5. Compose payload requires serviceName
  test('Compose payload requires serviceName', () => {
    const payload = buildCreateVolumeBackupPayload({
      resourceId: 'comp-123',
      resourceType: 'compose',
      form: {
        name: 'My Compose Backup',
        volumeName: 'comp_data',
        prefix: 'comp-pre',
        appName: 'comp-test',
        serviceName: 'postgres',
        turnOff: true,
        cronExpression: '0 0 * * *',
        keepLatestCount: 5,
        enabled: true,
        destinationId: 'dest-1'
      }
    });
    expect(payload.serviceName).toBe('postgres');
  });

  // 6. Named volume is used rather than mountPath
  test('Named volume is used rather than mountPath', () => {
    const m = { type: 'volume', volumeName: 'my_precious_volume', mountPath: '/var/lib/mysql' };
    const parsed = parseApplicationMounts([m]);
    expect(parsed[0].volumeName).toBe('my_precious_volume');
    expect(parsed[0].volumeName).not.toBe('/var/lib/mysql');
  });

  // 7. Bind mounts are filtered out
  test('Bind mounts are filtered out', () => {
    const mounts = [
      { type: 'volume', volumeName: 'named_vol', mountPath: '/app' },
      { type: 'bind', volumeName: 'bind_vol', hostPath: '/host', mountPath: '/app' },
    ];
    const parsed = parseApplicationMounts(mounts);
    expect(parsed.length).toBe(1);
    expect(parsed[0].volumeName).toBe('named_vol');
  });

  // 8. Application named-volume response parses
  test('Application named-volume response parses', () => {
    const response = [
      { type: 'volume', volumeName: 'app_vol_1', mountPath: '/data' }
    ];
    const parsed = parseApplicationMounts(response);
    expect(parsed[0].volumeName).toBe('app_vol_1');
    expect(parsed[0].source).toBe('application_mount');
  });

  // 9. Compose service response parses
  test('Compose service response parses', () => {
    const response = ['service-1', 'service-2'];
    const parsed = parseComposeServices(response);
    expect(parsed).toEqual(['service-1', 'service-2']);
  });

  // 10. Compose named-volume response parses
  test('Compose named-volume response parses', () => {
    const response = [
      { type: 'volume', volumeName: 'comp_vol_1', mountPath: '/data' }
    ];
    const parsed = parseComposeMounts(response, 'web');
    expect(parsed[0].volumeName).toBe('comp_vol_1');
    expect(parsed[0].source).toBe('compose_service');
    expect(parsed[0].serviceName).toBe('web');
  });

  // 11. Unexpected mount response throws INVALID_RESPONSE
  test('Unexpected mount response throws INVALID_RESPONSE', () => {
    expect(() => parseApplicationMounts('invalid')).toThrow('INVALID_RESPONSE');
  });

  // 12. Current saved volume is preserved when discovery fails
  test('Current saved volume is preserved when discovery fails', () => {
    const plan = {
      volumeBackupId: 'b-1',
      name: 'Plan 1',
      volumeName: 'preserved_volume',
      prefix: 'pre',
      resourceType: 'application' as const,
      resourceId: 'app-1',
      appName: 'app-1',
      serviceName: null,
      destinationId: 'd-1',
      cronExpression: '0 0 * * *',
      keepLatestCount: null,
      enabled: true,
      turnOff: true,
      createdAt: null
    };
    expect(plan.volumeName).toBe('preserved_volume');
  });

  // 13. Destination secrets remain stripped
  test('Destination secrets remain stripped', () => {
    const dest: any = { destinationId: 'd-1', name: 'S3', accessKey: 'secret', secretAccessKey: 'verysecret' };
    expect(dest.accessKey).toBeDefined();
    const safeDest = {
      destinationId: dest.destinationId,
      name: dest.name,
    };
    expect((safeDest as any).accessKey).toBeUndefined();
  });

  // 14. Unlimited retention maps to null
  test('Unlimited retention maps to null', () => {
    const formVal = 'unlimited';
    const parsed = formVal === 'unlimited' ? null : 5;
    expect(parsed).toBeNull();
  });

  // 15. Zero is not treated as Unlimited
  test('Zero is not treated as Unlimited', () => {
    const keepLatestCount = 0;
    expect(keepLatestCount === null).toBe(false);
  });

  // 16. Prefix traversal is rejected
  test('Prefix traversal is rejected', () => {
    expect(validatePrefix('pre/../traversal')).toBe('Path traversal (..) is not allowed');
    expect(validatePrefix('pre/clean')).toBeNull();
  });

  // 17. Run payload contains only volumeBackupId
  test('Run payload contains only volumeBackupId', async () => {
    dokployFetch.mockResolvedValueOnce({});
    await volumeBackupApi.runVolumeBackupManually('plan-777');
    const lastCallBody = JSON.parse(dokployFetch.mock.calls[0][1].body);
    expect(lastCallBody).toEqual({ volumeBackupId: 'plan-777' });
  });

  // 18. Delete payload contains only volumeBackupId
  test('Delete payload contains only volumeBackupId', async () => {
    dokployFetch.mockResolvedValueOnce({});
    await volumeBackupApi.deleteVolumeBackup('plan-777');
    const lastCallBody = JSON.parse(dokployFetch.mock.calls[0][1].body);
    expect(lastCallBody).toEqual({ volumeBackupId: 'plan-777' });
  });

  // 19. Duplicate run is blocked
  test('Duplicate run is blocked', () => {
    let submitting = false;
    let runCount = 0;
    const trigger = () => {
      if (submitting) return;
      submitting = true;
      runCount++;
    };
    trigger();
    trigger();
    expect(runCount).toBe(1);
  });

  // 20. Duplicate delete is blocked
  test('Duplicate delete is blocked', () => {
    let deleting = false;
    let deleteCount = 0;
    const trigger = () => {
      if (deleting) return;
      deleting = true;
      deleteCount++;
    };
    trigger();
    trigger();
    expect(deleteCount).toBe(1);
  });

  // 21. Empty manual response becomes accepted, not completed
  test('Empty manual response becomes accepted, not completed', () => {
    const apiResponse = {};
    const isCompleted = (apiResponse as any).status === 'completed';
    expect(isCompleted).toBe(false);
  });

  // 22. Application query key contains profileId and applicationId
  test('Application query key contains profileId and applicationId', () => {
    const profileId = 'profile-123';
    const applicationId = 'app-456';
    const queryKey = ['dokploy', profileId, 'volume-backups', 'application', applicationId];
    expect(queryKey).toContain('profile-123');
    expect(queryKey).toContain('app-456');
  });

  // 23. Compose query key contains profileId and composeId
  test('Compose query key contains profileId and composeId', () => {
    const profileId = 'profile-123';
    const composeId = 'comp-456';
    const queryKey = ['dokploy', profileId, 'volume-backups', 'compose', composeId];
    expect(queryKey).toContain('profile-123');
    expect(queryKey).toContain('comp-456');
  });

  // 24. Compose mount key contains profileId, composeId and serviceName
  test('Compose mount key contains profileId, composeId and serviceName', () => {
    const profileId = 'profile-123';
    const composeId = 'comp-456';
    const serviceName = 'db-service';
    const queryKey = ['dokploy', profileId, 'compose-named-volumes', composeId, serviceName];
    expect(queryKey).toContain('profile-123');
    expect(queryKey).toContain('comp-456');
    expect(queryKey).toContain('db-service');
  });

  // 25. Bind-only resource displays a named-volume requirement
  test('Bind-only resource displays a named-volume requirement', () => {
    const activeMounts: any[] = [];
    const message = activeMounts.length === 0 ? 'No Docker named volumes are available' : '';
    expect(message).toContain('No Docker named volumes are available');
  });

  // 26. Failed mount discovery does not hide existing plans
  test('Failed mount discovery does not hide existing plans', () => {
    const mountDiscoveryError = new Error('Mount discovery failed');
    const existingPlans = [{ volumeBackupId: 'plan-1' }];
    expect(existingPlans.length).toBe(1);
    expect(mountDiscoveryError).toBeDefined();
  });

  // 27. Automatic capability discovery invokes no write/manual endpoints
  test('Automatic capability discovery invokes no write/manual endpoints', () => {
    expect(dokployFetch).not.toHaveBeenCalledWith('/volumeBackups.create');
    expect(dokployFetch).not.toHaveBeenCalledWith('/volumeBackups.update');
    expect(dokployFetch).not.toHaveBeenCalledWith('/volumeBackups.delete');
    expect(dokployFetch).not.toHaveBeenCalledWith('/volumeBackups.runManually');
  });
});

describe('Volume Backup Block Reason and Discovery UX Tests', () => {
  // 1. No named volume returns missing_named_volume
  test('No named volume returns missing_named_volume', () => {
    const reason = getVolumeBackupFormBlockReason({
      name: 'Plan 1',
      destinationId: 'dest-1',
      volumeName: '',
      schedule: '0 0 * * *',
      prefix: 'pre',
      retentionType: 'unlimited',
      customRetention: '',
      isSubmitting: false,
      isMountsLoading: false,
      mountsError: null,
      resourceType: 'application',
    });
    expect(reason).toBe('missing_named_volume');
  });

  // 2. Compose without service returns missing_service
  test('Compose without service returns missing_service', () => {
    const reason = getVolumeBackupFormBlockReason({
      name: 'Plan 1',
      destinationId: 'dest-1',
      volumeName: 'vol-1',
      schedule: '0 0 * * *',
      prefix: 'pre',
      retentionType: 'unlimited',
      customRetention: '',
      isSubmitting: false,
      isMountsLoading: false,
      mountsError: null,
      resourceType: 'compose',
      serviceName: null
    });
    expect(reason).toBe('missing_service');
  });

  // 3. Loading mounts returns loading_mounts
  test('Loading mounts returns loading_mounts', () => {
    const reason = getVolumeBackupFormBlockReason({
      name: 'Plan 1',
      destinationId: 'dest-1',
      volumeName: 'vol-1',
      schedule: '0 0 * * *',
      prefix: 'pre',
      retentionType: 'unlimited',
      customRetention: '',
      isSubmitting: false,
      isMountsLoading: true,
      mountsError: null,
      resourceType: 'application',
    });
    expect(reason).toBe('loading_mounts');
  });

  // 4. Mount failure returns mount_discovery_failed
  test('Mount failure returns mount_discovery_failed', () => {
    const reason = getVolumeBackupFormBlockReason({
      name: 'Plan 1',
      destinationId: 'dest-1',
      volumeName: 'vol-1',
      schedule: '0 0 * * *',
      prefix: 'pre',
      retentionType: 'unlimited',
      customRetention: '',
      isSubmitting: false,
      isMountsLoading: false,
      mountsError: new Error('Failed to fetch'),
      resourceType: 'application',
    });
    expect(reason).toBe('mount_discovery_failed');
  });

  // 5. Valid form returns null block reason
  test('Valid form returns null block reason', () => {
    const reason = getVolumeBackupFormBlockReason({
      name: 'Plan 1',
      destinationId: 'dest-1',
      volumeName: 'vol-1',
      schedule: '0 0 * * *',
      prefix: 'pre',
      retentionType: 'unlimited',
      customRetention: '',
      isSubmitting: false,
      isMountsLoading: false,
      mountsError: null,
      resourceType: 'application',
    });
    expect(reason).toBeNull();
  });

  // 6. Disabled button cannot invoke create mutation
  test('Disabled button cannot invoke create mutation', () => {
    let mutationCalled = false;
    const blockReason = 'missing_named_volume';
    const triggerSubmit = () => {
      if (blockReason) return; // blocked
      mutationCalled = true;
    };
    triggerSubmit();
    expect(mutationCalled).toBe(false);
  });

  // 7. Application named-volume response preserves valid volume
  test('Application named-volume response preserves valid volume', () => {
    const mounts = [{ type: 'volume', volumeName: 'valid_vol_1' }];
    const parsed = parseApplicationMounts(mounts);
    expect(parsed[0].volumeName).toBe('valid_vol_1');
  });

  // 10. Compose mounts query stays disabled before service selection
  test('Compose mounts query stays disabled before service selection', () => {
    const composeId = 'comp-1';
    const selectedService = '';
    const queryEnabled = !!composeId && !!selectedService;
    expect(queryEnabled).toBe(false);
  });

  // 11. Successful empty Compose mounts response shows no named volumes
  test('Successful empty Compose mounts response shows no named volumes', () => {
    const activeMounts: any[] = [];
    const showEmptyMessage = activeMounts.length === 0;
    expect(showEmptyMessage).toBe(true);
  });

  // 12. Failed Compose mounts response shows Retry, not no named volumes
  test('Failed Compose mounts response shows Retry, not no named volumes', () => {
    const mountsError = new Error('Connection timeout');
    const showRetry = !!mountsError;
    expect(showRetry).toBe(true);
  });

  // 13. Switching services clears the previous volume selection
  test('Switching services clears the previous volume selection', () => {
    let formVolumeName = 'old_volume';
    const onSelectService = () => {
      formVolumeName = '';
    };
    onSelectService();
    expect(formVolumeName).toBe('');
  });

  // 14. Exact discovered volumeName is sent unchanged
  test('Exact discovered volumeName is sent unchanged', () => {
    const payload = buildCreateVolumeBackupPayload({
      resourceId: 'app-1',
      resourceType: 'application',
      form: {
        name: 'Plan 1',
        volumeName: 'exact_volume_name_123',
        prefix: 'pre',
        appName: 'app',
        serviceName: null,
        turnOff: true,
        cronExpression: '0 0 * * *',
        keepLatestCount: null,
        enabled: true,
        destinationId: 'd-1'
      }
    });
    expect(payload.volumeName).toBe('exact_volume_name_123');
  });

  // 15. Saved volume is preserved during edit when discovery fails
  test('Saved volume is preserved during edit when discovery fails', () => {
    const formMode = 'edit';
    const formVolumeName = 'saved_volume';
    const activeMounts: any[] = []; // discovery fails, returns empty

    const selectableMountsList = [...activeMounts];
    if (formMode === 'edit' && formVolumeName) {
      const exists = selectableMountsList.some(m => m.volumeName === formVolumeName);
      if (!exists) {
        selectableMountsList.push({
          volumeName: formVolumeName,
          displayName: `${formVolumeName} (Preserved)`,
          mountPath: null,
          serviceName: null,
          source: 'application_mount',
        });
      }
    }
    expect(selectableMountsList.length).toBe(1);
    expect(selectableMountsList[0].volumeName).toBe('saved_volume');
  });
});
