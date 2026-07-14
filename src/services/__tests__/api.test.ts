import { normalizeUrl, mapError } from '../api';
import { getProfile, saveProfile, clearProfileMemoryAndStorage } from '../profileStore';
import * as SecureStore from 'expo-secure-store';
import { hasCapability } from '../../components/CapabilityGate';

jest.mock('@react-native-async-storage/async-storage', () => 
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

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
  };
});

describe('API normalization and mappings', () => {
  test('normalizeUrl should clean url trailing slash and double /api', () => {
    expect(normalizeUrl('https://my-vps.com/')).toBe('https://my-vps.com');
    expect(normalizeUrl('https://my-vps.com/api/')).toBe('https://my-vps.com');
    expect(normalizeUrl('https://my-vps.com/api')).toBe('https://my-vps.com');
  });

  test('normalizeUrl should reject invalid protocol', () => {
    expect(() => normalizeUrl('ftp://my-vps.com')).toThrow('Invalid protocol');
    expect(() => normalizeUrl('my-vps.com')).toThrow('Invalid protocol');
  });

  test('normalizeUrl should allow plain HTTP only for localhost/private IP', () => {
    expect(normalizeUrl('http://localhost')).toBe('http://localhost');
    expect(normalizeUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeUrl('http://127.0.0.1')).toBe('http://127.0.0.1');
    expect(normalizeUrl('http://192.168.1.5')).toBe('http://192.168.1.5');
    expect(normalizeUrl('http://10.0.0.1')).toBe('http://10.0.0.1');
    expect(() => normalizeUrl('http://my-remote-vps.com')).toThrow('Plain HTTP is rejected');
  });

  test('mapError should map status codes correctly', () => {
    expect(mapError({ status: 401, message: 'Unauthorized' }).code).toBe('UNAUTHORIZED');
    expect(mapError({ status: 403, message: 'Forbidden' }).code).toBe('FORBIDDEN');
    expect(mapError({ status: 404, message: 'Not found' }).code).toBe('NOT_FOUND');
    expect(mapError({ status: 500, message: 'Server error' }).code).toBe('SERVER_ERROR');
    expect(mapError(new Error('Network request failed')).code).toBe('OFFLINE');
    expect(mapError({ name: 'AbortError', message: 'aborted' }).code).toBe('TIMEOUT');
  });
});

describe('profileStore caching', () => {
  beforeEach(() => {
    const mock = require('expo-secure-store') as any;
    mock.clearMockStore();
    jest.clearAllMocks();
  });

  test('profile store should read SecureStore once and return cached memory profile', async () => {
    const profile = {
      profileId: 'abc-123-uuid',
      serverUrl: 'https://vps.ip',
      apiKey: 'key-12345',
      createdAt: '2026-07-13T12:00:00Z',
    };
    await saveProfile(profile);

    // Call getProfile multiple times in parallel
    const p1 = await getProfile();
    const p2 = await getProfile();

    expect(p1).toEqual(profile);
    expect(p2).toEqual(profile);

    // SecureStore.getItemAsync should not have been called again since cache is present
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  });
});

describe('CapabilityGate access checks', () => {
  test('should allow read on read_only status and reject write', () => {
    const mockCapabilities = {
      readDomains: 'read_only',
      manageDomains: 'read_only',
    };

    // read domains is permitted under read_only status
    expect(hasCapability(mockCapabilities, 'domains', 'read')).toBe(true);
    // write domains is rejected under read_only status
    expect(hasCapability(mockCapabilities, 'domains', 'write')).toBe(false);
  });

  test('should allow both read and write on available status', () => {
    const mockCapabilities = {
      readDomains: 'available',
      manageDomains: 'available',
    };

    expect(hasCapability(mockCapabilities, 'domains', 'read')).toBe(true);
    expect(hasCapability(mockCapabilities, 'domains', 'write')).toBe(true);
  });

  test('should reject both read and write on forbidden status', () => {
    const mockCapabilities = {
      readDomains: 'forbidden',
      manageDomains: 'forbidden',
    };

    expect(hasCapability(mockCapabilities, 'domains', 'read')).toBe(false);
    expect(hasCapability(mockCapabilities, 'domains', 'write')).toBe(false);
  });
});
