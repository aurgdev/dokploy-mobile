# Dokploy Companion Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement hardening updates separating OpenAPI support from API permission, refining 401/403 mapping, improving UUID migration safety, adding an in-memory profile store, and updating CapabilityGate for read/write access.

**Architecture:** Use a stateful `profileStore` cache, separate capability definitions from OpenAPI discovery status in `queries.ts`, add event listener handlers in `api.ts`, and update `CapabilityGate.tsx` to handle read/write access levels.

**Tech Stack:** React Query, expo-secure-store, @react-native-async-storage/async-storage, expo-crypto.

---

### Task 1: In-Memory Profile Store Implementation

**Files:**
- Create: `src/services/profileStore.ts`
- Modify: `src/services/api.ts`

**Interfaces:**
- Produces: `getProfile`, `saveProfile`, and `clearProfileMemoryAndStorage`.

- [ ] **Step 1: Write `src/services/profileStore.ts`**
  ```typescript
  import * as SecureStore from 'expo-secure-store';
  import { SecureConnectionProfile } from './api.types';

  let cachedProfile: SecureConnectionProfile | null = null;
  let loadPromise: Promise<SecureConnectionProfile | null> | null = null;

  export async function getProfile(): Promise<SecureConnectionProfile | null> {
    if (cachedProfile) {
      return cachedProfile;
    }
    if (loadPromise) {
      return loadPromise;
    }
    loadPromise = (async () => {
      try {
        const profileStr = await SecureStore.getItemAsync('dokploy_profile');
        if (!profileStr) return null;
        const parsed = JSON.parse(profileStr) as SecureConnectionProfile;
        if (parsed && parsed.profileId && parsed.serverUrl && parsed.apiKey) {
          cachedProfile = parsed;
          return parsed;
        }
        return null;
      } catch {
        return null;
      } finally {
        loadPromise = null;
      }
    })();
    return loadPromise;
  }

  export async function saveProfile(profile: SecureConnectionProfile): Promise<void> {
    await SecureStore.setItemAsync('dokploy_profile', JSON.stringify(profile));
    cachedProfile = profile;
  }

  export async function clearProfileMemoryAndStorage(): Promise<void> {
    cachedProfile = null;
    await SecureStore.deleteItemAsync('dokploy_profile');
    await SecureStore.deleteItemAsync('dokploy_vps_url');
    await SecureStore.deleteItemAsync('dokploy_api_key');
  }
  ```

- [ ] **Step 2: Modify `src/services/api.ts` to use profileStore**
  Replace `getClientConfig` implementation and SecureStore reads with imports from `profileStore.ts`.
  Add success/error API listener logic.
  ```typescript
  import { getProfile, clearProfileMemoryAndStorage } from './profileStore';

  type ApiListener = (endpoint: string, success: boolean, status?: number) => void;
  const listeners: ApiListener[] = [];
  
  export function addApiListener(listener: ApiListener) {
    listeners.push(listener);
  }

  export async function getClientConfig() {
    const profile = await getProfile();
    if (!profile) {
      return { url: null, apiKey: null, profileId: null };
    }
    return { url: profile.serverUrl, apiKey: profile.apiKey, profileId: profile.profileId };
  }
  ```

---

### Task 2: Profile Migration with Post-Save Validation

**Files:**
- Create: `src/services/profileMigration.ts`
- Modify: `app/_layout.tsx`
- Create: `src/services/__tests__/profileMigration.test.ts`

- [ ] **Step 1: Write `src/services/profileMigration.ts`**
  Implement UUID generation, readback validation, and cleanup.
  ```typescript
  import * as SecureStore from 'expo-secure-store';
  import * as Crypto from 'expo-crypto';
  import { SecureConnectionProfile } from './api.types';
  import { saveProfile } from './profileStore';

  export async function migrateLegacyCredentials(): Promise<boolean> {
    try {
      const profileStr = await SecureStore.getItemAsync('dokploy_profile');
      if (profileStr) {
        try {
          const parsed = JSON.parse(profileStr);
          if (parsed.profileId && parsed.serverUrl && parsed.apiKey) {
            return false;
          }
        } catch {}
      }

      const legacyUrl = await SecureStore.getItemAsync('dokploy_vps_url');
      const legacyApiKey = await SecureStore.getItemAsync('dokploy_api_key');

      if (legacyUrl && legacyApiKey) {
        const profileId = Crypto.randomUUID();
        const newProfile: SecureConnectionProfile = {
          profileId,
          serverUrl: legacyUrl,
          apiKey: legacyApiKey,
          createdAt: new Date().toISOString(),
        };

        await saveProfile(newProfile);

        const readBackStr = await SecureStore.getItemAsync('dokploy_profile');
        if (readBackStr) {
          const readBack = JSON.parse(readBackStr) as SecureConnectionProfile;
          if (readBack.profileId === profileId && readBack.serverUrl === legacyUrl && readBack.apiKey === legacyApiKey) {
            await SecureStore.deleteItemAsync('dokploy_vps_url');
            await SecureStore.deleteItemAsync('dokploy_api_key');
            return true;
          }
        }
        throw new Error('Read back validation failed');
      }
    } catch (error) {
      // Preserve legacy credentials
    }
    return false;
  }
  ```

- [ ] **Step 2: Modify `app/_layout.tsx` to use migration function**
  Replace local checkCredentials migration logic with a call to `migrateLegacyCredentials()`.

---

### Task 3: Differentiating OpenAPI Support from User Permissions

**Files:**
- Modify: `src/services/queries.ts`
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Move queryClient to `queries.ts`**
  Instantiate and export `queryClient` from `src/services/queries.ts`. Remove it from `app/_layout.tsx`.
  
- [ ] **Step 2: Update capability checks**
  In `useDokployCapabilities()`, map paths found in OpenAPI to `unknown` rather than `available` (e.g. they support it but permission is not yet confirmed). Map missing paths to `unsupported`.

- [ ] **Step 3: Listen to API calls to promote capabilities**
  Register API listener in `queries.ts` to dynamically set capabilities to `available` or `forbidden`.

---

### Task 4: Upgrading CapabilityGate for Read-Only and Explanatory Views

**Files:**
- Modify: `src/components/CapabilityGate.tsx`

- [ ] **Step 1: Update CapabilityGate to support access parameters**
  Allow passing `access="read" | "write"`.
  Export helper function `getGranularCapabilityKey`, `getCapabilityStatus`, and `hasCapability`.

- [ ] **Step 2: Render loaders and disabled explainers**
  If status is `unknown`, show loading `ActivityIndicator`. If `forbidden`/`read_only` (on write)/`unsupported`, show warning.
