import { dokployFetch } from '../../services/api';
import { Domain, CreateDomainInput, UpdateDomainInput, Certificate } from './domain.types';
import { parseComposeLoadServicesResponse } from './domain.parser';

export const domainApi = {
  /**
   * List all domains attached to an Application.
   * Endpoint: GET /domain.byApplicationId?applicationId=<id>
   */
  getByApplicationId: (applicationId: string): Promise<Domain[]> =>
    dokployFetch(`/domain.byApplicationId?applicationId=${encodeURIComponent(applicationId)}`),

  /**
   * List all domains attached to a Compose stack.
   * Endpoint: GET /domain.byComposeId?composeId=<id>
   */
  getByComposeId: (composeId: string): Promise<Domain[]> =>
    dokployFetch(`/domain.byComposeId?composeId=${encodeURIComponent(composeId)}`),

  /**
   * Create a new domain.
   * POST /domain.create
   */
  create: (input: CreateDomainInput): Promise<Domain> =>
    dokployFetch('/domain.create', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /**
   * Update an existing domain.
   * POST /domain.update
   */
  update: (input: UpdateDomainInput): Promise<Domain> =>
    dokployFetch('/domain.update', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /**
   * Delete a domain by ID.
   * POST /domain.delete
   */
  remove: (domainId: string): Promise<void> =>
    dokployFetch('/domain.delete', {
      method: 'POST',
      body: JSON.stringify({ domainId }),
    }),

  /**
   * Auto-generate a traefik.me domain name for an application.
   * POST /domain.generateDomain
   * Request body: `{ appName: string, serverId?: string }`
   */
  generateDomain: (input: { appName: string; serverId?: string }): Promise<any> =>
    dokployFetch('/domain.generateDomain', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  canGenerateTraefikMeDomains: (serverId?: string): Promise<any> => {
    const val = serverId || '';
    return dokployFetch(`/domain.canGenerateTraefikMeDomains?serverId=${encodeURIComponent(val)}`);
  },

  /**
   * Fetch single application details.
   * GET /application.one?applicationId=<id>
   */
  getApplication: (applicationId: string): Promise<any> =>
    dokployFetch(`/application.one?applicationId=${encodeURIComponent(applicationId)}`),

  /**
   * Fetch single compose stack details.
   * GET /compose.one?composeId=<id>
   */
  getCompose: (composeId: string): Promise<any> =>
    dokployFetch(`/compose.one?composeId=${encodeURIComponent(composeId)}`),

  /**
   * Validate a domain DNS/routing using Dokploy.
   * POST /domain.validateDomain
   * payload expects `{ domain: string, serverIp?: string }`
   */
  validateDomain: (input: { domain: string; serverIp?: string }): Promise<any> =>
    dokployFetch('/domain.validateDomain', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /**
   * Fetch services list of a Docker Compose stack by ID.
   * GET /compose.loadServices?composeId=<id>
   */
  getComposeServices: async (composeId: string): Promise<string[]> => {
    const raw = await dokployFetch(`/compose.loadServices?composeId=${encodeURIComponent(composeId)}`);
    return parseComposeLoadServicesResponse(raw);
  },

  /**
   * List all custom certificates (name + id only).
   * SECURITY: Strips secret key and certificate material from memory/logs at runtime.
   * GET /certificate.all
   */
  getCertificates: async (): Promise<Certificate[]> => {
    const raw = await dokployFetch('/certificate.all');
    if (!Array.isArray(raw)) {
      return [];
    }
    // Explicitly validate and map into safe metadata objects containing only required fields
    return raw.map((item: any) => ({
      certificateId: item.certificateId || '',
      name: item.name || '',
      autoRenew: typeof item.autoRenew === 'boolean' ? item.autoRenew : null,
      createdAt: item.createdAt || '',
    }));
  },
};
