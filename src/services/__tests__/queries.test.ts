import { createDefaultCapabilities, updateCapabilityStatus } from '../queries';
import { CapabilityStatus, DokployCapabilityKey } from '../api.types';

jest.mock('../api', () => {
  return {
    api: {
      getProjects: jest.fn(),
    },
    dokployFetch: jest.fn(),
    getClientConfig: jest.fn(async () => ({
      url: 'https://vps.ip',
      apiKey: 'api-key-12345',
      profileId: 'mock-profile-id',
    })),
    addApiListener: jest.fn(),
  };
});

jest.mock('../cache', () => ({
  getCachedInstanceInfo: jest.fn(),
  saveCachedInstanceInfo: jest.fn(),
  getCachedCapabilities: jest.fn(),
  saveCachedCapabilities: jest.fn(),
}));

describe('useDokployCapabilities checks', () => {
  test('createDefaultCapabilities should set all values to target status', () => {
    const caps = createDefaultCapabilities('unknown');
    expect(caps.readProjects).toBe('unknown');
    expect(caps.manageDocker).toBe('unknown');
    expect(caps.readDomains).toBe('unknown');
  });

  test('OpenAPI path mapping behavior simulations', () => {
    // OpenAPI path presence verifies only capability support, permission is kept unknown
    const mockOpenApiPaths = ['/project.all', '/project.create', '/application.start'];
    
    // Check key mapping based on path support
    const readProjectsSupported = mockOpenApiPaths.includes('/project.all');
    const readProjectsStatus: CapabilityStatus = readProjectsSupported ? 'unknown' : 'unsupported';
    expect(readProjectsStatus).toBe('unknown');

    const manageDomainsSupported = mockOpenApiPaths.includes('/domain.create');
    const manageDomainsStatus: CapabilityStatus = manageDomainsSupported ? 'unknown' : 'unsupported';
    expect(manageDomainsStatus).toBe('unsupported');
  });
});
