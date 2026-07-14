import AsyncStorage from '@react-native-async-storage/async-storage';
import { CachedInstanceInfo, CachedCapabilities } from './api.types';

export async function saveCachedInstanceInfo(profileId: string, data: Omit<CachedInstanceInfo, 'schemaVersion' | 'profileId' | 'cachedAt'>): Promise<void> {
  const payload: CachedInstanceInfo = {
    schemaVersion: 1,
    profileId,
    instance: data.instance,
    cachedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(`dokploy:instance:${profileId}`, JSON.stringify(payload));
}

export async function getCachedInstanceInfo(profileId: string): Promise<CachedInstanceInfo | null> {
  try {
    const str = await AsyncStorage.getItem(`dokploy:instance:${profileId}`);
    if (!str) return null;
    const parsed = JSON.parse(str);
    if (parsed?.schemaVersion !== 1 || parsed?.profileId !== profileId) {
      return null; // Invalid cache schema or wrong profile
    }
    return parsed as CachedInstanceInfo;
  } catch {
    return null;
  }
}

export async function saveCachedCapabilities(profileId: string, data: Omit<CachedCapabilities, 'schemaVersion' | 'profileId' | 'refreshedAt'>): Promise<void> {
  const payload: CachedCapabilities = {
    schemaVersion: 1,
    profileId,
    dokployVersion: data.dokployVersion,
    releaseTag: data.releaseTag,
    discovery: data.discovery,
    capabilities: data.capabilities,
    refreshedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(`dokploy:capabilities:${profileId}`, JSON.stringify(payload));
}

export async function getCachedCapabilities(profileId: string): Promise<CachedCapabilities | null> {
  try {
    const str = await AsyncStorage.getItem(`dokploy:capabilities:${profileId}`);
    if (!str) return null;
    const parsed = JSON.parse(str);
    if (parsed?.schemaVersion !== 1 || parsed?.profileId !== profileId) {
      return null;
    }
    return parsed as CachedCapabilities;
  } catch {
    return null;
  }
}

export async function clearCacheForProfile(profileId: string): Promise<void> {
  await AsyncStorage.removeItem(`dokploy:instance:${profileId}`);
  await AsyncStorage.removeItem(`dokploy:capabilities:${profileId}`);
}
