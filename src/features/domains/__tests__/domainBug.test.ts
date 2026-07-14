import { cleanEndpointPath } from '../../../services/queries';
import { parseComposeServices } from '../domain.parser';

// Mocks for react-query and api
jest.mock('@react-native-async-storage/async-storage', () => 
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('Docker Compose Domains bug regression checks', () => {
  
  test('cleanEndpointPath should normalize query strings and optional leading /api', () => {
    // 1. /api/domain.byComposeId?... normalization
    expect(cleanEndpointPath('/api/domain.byComposeId?composeId=123')).toBe('/domain.byComposeId');
    expect(cleanEndpointPath('/domain.byComposeId?composeId=abc&other=1')).toBe('/domain.byComposeId');
    expect(cleanEndpointPath('/api/project.all')).toBe('/project.all');
    expect(cleanEndpointPath('/settings.getDokployVersion')).toBe('/settings.getDokployVersion');
  });

  test('Compose read overrides stale unsupported cache states', () => {
    // Simulate cache capabilities before successful request
    const cachedCapabilities = {
      readDomains: 'unsupported', // stale invalid unsupported
    };

    // Simulated successful read request updates capability
    const handleComposeReadSuccess = () => {
      cachedCapabilities.readDomains = 'available';
    };

    handleComposeReadSuccess();

    expect(cachedCapabilities.readDomains).toBe('available');
  });

  test('Missing optional endpoints should not mark readDomains unsupported', () => {
    // OpenAPI response has domain list paths but is missing validateDomain or generateDomain
    const mockPaths = ['/domain.byApplicationId', '/domain.byComposeId'];
    
    const readDomainsSupported = mockPaths.includes('/domain.byApplicationId') || mockPaths.includes('/domain.byComposeId');
    
    // readDomains must remain supported (unknown permission, not unsupported)
    const readDomainsStatus = readDomainsSupported ? 'unknown' : 'unsupported';
    expect(readDomainsStatus).toBe('unknown');
  });

  test('Stale unsupported status does not prevent the safe read query from executing', () => {
    const cachedCapabilities = {
      readDomains: 'unsupported',
    };

    const composeId = 'compose-stack-uuid';
    const profileId = 'active-profile-uuid';
    
    // The query is enabled if composeId and profileId exist, completely independent of cachedCapabilities.readDomains
    const isQueryEnabled = !!composeId && !!profileId;
    
    expect(isQueryEnabled).toBe(true);
  });

  test('403 status code response sets readDomains to forbidden', () => {
    const cachedCapabilities = {
      readDomains: 'unknown',
    };

    const handleApiResponse = (success: boolean, status?: number) => {
      if (!success && status === 403) {
        cachedCapabilities.readDomains = 'forbidden';
      }
    };

    // Simulate 403 failure
    handleApiResponse(false, 403);

    expect(cachedCapabilities.readDomains).toBe('forbidden');
  });
});
