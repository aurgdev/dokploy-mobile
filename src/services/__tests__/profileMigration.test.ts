import * as SecureStore from 'expo-secure-store';
import { migrateLegacyCredentials } from '../profileMigration';
import { getProfile } from '../profileStore';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'mocked-uuid-12345-67890'),
}));

jest.mock('expo-secure-store', () => {
  const store: Record<string, string> = {};
  return {
    getItemAsync: jest.fn(async (key: string) => store[key] || null),
    setItemAsync: jest.fn(async (key: string, val: string) => {
      store[key] = val;
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      delete store[key];
    }),
    clearMockStore: () => {
      for (const k in store) delete store[k];
    },
    getRawStore: () => store,
  };
});

describe('profileMigration', () => {
  beforeEach(() => {
    const mock = require('expo-secure-store') as any;
    mock.clearMockStore();
    jest.clearAllMocks();
  });

  test('should migrate legacy credentials successfully with stable UUID and delete old keys', async () => {
    await SecureStore.setItemAsync('dokploy_vps_url', 'https://vps.ip');
    await SecureStore.setItemAsync('dokploy_api_key', 'api-key-12345');

    const result = await migrateLegacyCredentials();
    expect(result).toBe(true);

    const profile = await getProfile();
    expect(profile).not.toBeNull();
    expect(profile?.serverUrl).toBe('https://vps.ip');
    expect(profile?.apiKey).toBe('api-key-12345');
    expect(profile?.profileId).toBe('mocked-uuid-12345-67890');

    // Verify old keys are deleted
    const oldUrl = await SecureStore.getItemAsync('dokploy_vps_url');
    const oldKey = await SecureStore.getItemAsync('dokploy_api_key');
    expect(oldUrl).toBeNull();
    expect(oldKey).toBeNull();

    // Repeating the migration must not run again or change profileId
    const originalProfileId = profile?.profileId;
    const secondResult = await migrateLegacyCredentials();
    expect(secondResult).toBe(false);
    
    const reloadedProfile = await getProfile();
    expect(reloadedProfile?.profileId).toBe(originalProfileId);
  });

  test('should preserve legacy credentials if write-back validation fails', async () => {
    await SecureStore.setItemAsync('dokploy_vps_url', 'https://vps.ip');
    await SecureStore.setItemAsync('dokploy_api_key', 'api-key-12356');

    // Mock getItemAsync to return null on readBack of dokploy_profile
    jest.spyOn(SecureStore, 'getItemAsync').mockImplementation(async (key: string) => {
      if (key === 'dokploy_profile') {
        return null; // Force validation failure
      }
      const rawStore = (SecureStore as any).getRawStore();
      return rawStore[key] || null;
    });

    const result = await migrateLegacyCredentials();
    expect(result).toBe(false);

    // Verify old credentials are preserved
    jest.restoreAllMocks();
    const oldUrl = await SecureStore.getItemAsync('dokploy_vps_url');
    const oldKey = await SecureStore.getItemAsync('dokploy_api_key');
    expect(oldUrl).toBe('https://vps.ip');
    expect(oldKey).toBe('api-key-12356');
  });
});
