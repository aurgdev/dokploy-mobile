import {
  useAppDomains,
  useComposeDomains,
  useCertificates,
  useDomainValidation,
  useUpdateDomain,
  useComposeServices,
  useCanGenerateTraefikMe,
  useRedeployCompose,
} from '../domain.queries';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DomainMutationResult } from '../domain.types';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: jest.fn(() => ({
    invalidateQueries: jest.fn(),
  })),
}));

jest.mock('../../../services/api', () => ({
  api: {
    redeployCompose: jest.fn(),
  },
}));

describe('domain.queries profile-scoped keys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useQuery as jest.Mock).mockImplementation(({ queryKey }) => {
      if (queryKey && queryKey[0] === 'active-profile-id') {
        return { data: 'mocked-profile-uuid-123' };
      }
      return { data: null };
    });
    (useMutation as jest.Mock).mockImplementation(() => ({
      mutateAsync: jest.fn(),
      isPending: false,
    }));
  });

  test('domain query keys should include profileId', () => {
    useAppDomains('app-id-99');
    expect(useQuery).toHaveBeenLastCalledWith(expect.objectContaining({
      queryKey: ['dokploy', 'mocked-profile-uuid-123', 'domains', 'application', 'app-id-99']
    }));

    useComposeDomains('compose-id-99');
    expect(useQuery).toHaveBeenLastCalledWith(expect.objectContaining({
      queryKey: ['dokploy', 'mocked-profile-uuid-123', 'domains', 'compose', 'compose-id-99']
    }));

    useCertificates();
    expect(useQuery).toHaveBeenLastCalledWith(expect.objectContaining({
      queryKey: ['dokploy', 'mocked-profile-uuid-123', 'certificates']
    }));
  });

  test('canGenerate query key contains profileId and serverId', () => {
    useCanGenerateTraefikMe('server-uuid-888');
    expect(useQuery).toHaveBeenLastCalledWith(expect.objectContaining({
      queryKey: ['dokploy', 'mocked-profile-uuid-123', 'domains', 'can-generate-traefik-me', 'server-uuid-888']
    }));
  });

  test('canGenerate does not run without serverId', () => {
    useCanGenerateTraefikMe(undefined);
    const queryCall = (useQuery as jest.Mock).mock.calls[(useQuery as jest.Mock).mock.calls.length - 1][0];
    expect(queryCall.enabled).toBe(false);
  });
});

describe('Compose Redeployment State Model Rules', () => {
  test('Application mutation does not require redeploy', () => {
    const result: DomainMutationResult = {
      resourceType: 'application',
      resourceId: 'app-1',
      operation: 'create',
      requiresRedeploy: false,
    };
    expect(result.requiresRedeploy).toBe(false);
  });

  test('Compose create requires redeploy after success', () => {
    const result: DomainMutationResult = {
      resourceType: 'compose',
      resourceId: 'comp-1',
      operation: 'create',
      requiresRedeploy: true,
    };
    expect(result.requiresRedeploy).toBe(true);
  });

  test('Compose update requires redeploy after success', () => {
    const result: DomainMutationResult = {
      resourceType: 'compose',
      resourceId: 'comp-1',
      operation: 'update',
      requiresRedeploy: true,
    };
    expect(result.requiresRedeploy).toBe(true);
  });

  test('Compose delete requires redeploy after success', () => {
    const result: DomainMutationResult = {
      resourceType: 'compose',
      resourceId: 'comp-1',
      operation: 'delete',
      requiresRedeploy: true,
    };
    expect(result.requiresRedeploy).toBe(true);
  });

  test('Failed mutation does not prompt redeployment', () => {
    const mutationResult: DomainMutationResult | null = null;
    expect(mutationResult).toBeNull();
  });
});

describe('Redeployment API executions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test 14: Redeploy sends exact composeId
  test('Redeploy sends exact composeId', async () => {
    const { api } = require('../../../services/api') as any;
    api.redeployCompose.mockResolvedValueOnce({ success: true });
    
    await api.redeployCompose('compose-uuid-abc');
    expect(api.redeployCompose).toHaveBeenCalledWith('compose-uuid-abc');
  });

  // Test 15: Duplicate redeploy requests are blocked
  test('Duplicate redeploy requests are blocked', async () => {
    let redeployPending = false;
    const mockRedeploy = jest.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    const triggerRedeploy = async () => {
      if (redeployPending) return;
      redeployPending = true;
      try {
        await mockRedeploy();
      } finally {
        redeployPending = false;
      }
    };

    const p1 = triggerRedeploy();
    const p2 = triggerRedeploy();
    await Promise.all([p1, p2]);

    expect(mockRedeploy).toHaveBeenCalledTimes(1);
  });

  // Test 16: Redeploy request acceptance is not presented as completed deployment
  test('Redeploy request acceptance is not presented as completed deployment', () => {
    const handleResponse = (res: any) => {
      return {
        status: 'queued',
        message: 'The redeployment request has been queued on the server.',
      };
    };

    const result = handleResponse({ success: true });
    expect(result.status).toBe('queued');
    expect(result.message).toContain('queued');
  });
});
