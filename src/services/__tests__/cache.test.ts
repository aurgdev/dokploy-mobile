import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedInstanceInfo, saveCachedInstanceInfo, clearCacheForProfile } from '../cache';

jest.mock('@react-native-async-storage/async-storage', () => 
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

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
    expect(cached?.schemaVersion).toBe(1);
    expect(cached?.profileId).toBe('test-profile');
  });

  test('should discard invalid cache schemaVersion or incorrect profileId', async () => {
    await AsyncStorage.setItem('dokploy:instance:test-profile', JSON.stringify({ 
      schemaVersion: 2, 
      profileId: 'test-profile' 
    }));
    
    const cached = await getCachedInstanceInfo('test-profile');
    expect(cached).toBeNull();
  });

  test('should clean caches successfully when profile is removed', async () => {
    const mockInstance = {
      baseUrl: 'https://vps.ip',
      version: '0.4.0',
      releaseTag: null,
      connectionStatus: 'connected' as const,
      healthEndpointAvailable: true,
      healthy: true,
      connectedAt: null,
      lastSuccessfulConnectionAt: null,
      lastCheckedAt: null,
    };

    await saveCachedInstanceInfo('test-profile', { instance: mockInstance });
    await clearCacheForProfile('test-profile');
    const cached = await getCachedInstanceInfo('test-profile');
    expect(cached).toBeNull();
  });
});
