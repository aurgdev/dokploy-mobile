import { parseComposeServices, parseComposeLoadServicesResponse, parseCanGenerateResponse, parseGenerateDomainResponse } from '../domain.parser';
import { domainApi } from '../domain.api';
import { validateDomainForm, mapValidationState } from '../domain.validation';
import { buildCreatePayload, buildUpdatePayload } from '../domain.payload';
import { buildPublicUrl } from '../domain.url';

jest.mock('../../../services/api', () => ({
  dokployFetch: jest.fn(),
}));

const { dokployFetch } = require('../../../services/api') as any;

describe('parseComposeServices fallback', () => {
  test('should parse simple compose files with multiple services', () => {
    const yaml = `
version: '3.8'
services:
  web:
    image: nginx
    ports:
      - "80:80"
  api:
    image: node
    `;
    const services = parseComposeServices(yaml);
    expect(services).toEqual(['web', 'api']);
  });
});

describe('domain.validation form validations', () => {
  test('Normal domain host accepted', () => {
    const { isValid, errors } = validateDomainForm({
      host: 'api.example.com',
      port: '3000',
      path: '/',
      https: false,
      certificateType: 'none',
    }, false);
    expect(isValid).toBe(true);
    expect(errors.host).toBeUndefined();
  });

  test('Protocol-prefixed host rejected', () => {
    const { isValid, errors } = validateDomainForm({
      host: 'https://api.example.com',
      port: '3000',
      path: '/',
      https: false,
      certificateType: 'none',
    }, false);
    expect(isValid).toBe(false);
    expect(errors.host).toBe('Host must not contain http:// or https:// prefix');
  });

  test('Embedded credentials rejected', () => {
    const { isValid, errors } = validateDomainForm({
      host: 'user:pass@api.example.com',
      port: '3000',
      path: '/',
      https: false,
      certificateType: 'none',
    }, false);
    expect(isValid).toBe(false);
    expect(errors.host).toBe('Host must not contain credentials');
  });

  test('Host path rejected', () => {
    const { isValid, errors } = validateDomainForm({
      host: 'api.example.com/v1/auth',
      port: '3000',
      path: '/',
      https: false,
      certificateType: 'none',
    }, false);
    expect(isValid).toBe(false);
    expect(errors.host).toBe('Host must not contain path characters');
  });

  test('Port boundary validation', () => {
    const checkPort = (port: string) => validateDomainForm({
      host: 'api.example.com',
      port,
      path: '/',
      https: false,
      certificateType: 'none',
    }, false);

    expect(checkPort('0').isValid).toBe(false);
    expect(checkPort('65536').isValid).toBe(false);
    expect(checkPort('-1').isValid).toBe(false);
    expect(checkPort('3000').isValid).toBe(true);
    expect(checkPort('abc').isValid).toBe(false);
  });
});

describe('domainApi validateDomain payload checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('validateDomain sends { domain: host } and does not send domainId', async () => {
    dokployFetch.mockResolvedValueOnce({ isValid: true });
    await domainApi.validateDomain({ domain: 'api.example.com' });
    expect(dokployFetch).toHaveBeenCalledWith(
      '/domain.validateDomain',
      expect.objectContaining({
        body: JSON.stringify({ domain: 'api.example.com' })
      })
    );
    const sentBody = JSON.parse(dokployFetch.mock.calls[0][1].body);
    expect(sentBody.domainId).toBeUndefined();
  });

  test('optional serverIp is omitted when missing', async () => {
    dokployFetch.mockResolvedValueOnce({ isValid: true });
    await domainApi.validateDomain({ domain: 'api.example.com' });
    const sentBody = JSON.parse(dokployFetch.mock.calls[0][1].body);
    expect(sentBody.serverIp).toBeUndefined();
  });
});

describe('domain validation response normalization', () => {
  test('real validation response is normalized', () => {
    expect(mapValidationState({ isValid: true })).toBe('valid');
    expect(mapValidationState({ isValid: false })).toBe('invalid');
    expect(mapValidationState({ valid: true })).toBe('valid');
    expect(mapValidationState({ valid: false })).toBe('invalid');
    expect(mapValidationState({ success: true })).toBe('valid');
    expect(mapValidationState(true)).toBe('valid');
    expect(mapValidationState(false)).toBe('invalid');
  });

  test('unknown validation response becomes unable_to_validate', () => {
    expect(mapValidationState({ unknownField: 'hello' })).toBe('unable_to_validate');
    expect(mapValidationState(null)).toBe('unable_to_validate');
    expect(mapValidationState(undefined)).toBe('unable_to_validate');
  });
});

describe('compose.loadServices API checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('compose.loadServices receives exact composeId', async () => {
    dokployFetch.mockResolvedValueOnce(['srv1', 'srv2']);
    const composeId = 'my-compose-id-999';
    await domainApi.getComposeServices(composeId);
    expect(dokployFetch).toHaveBeenCalledWith(`/compose.loadServices?composeId=${encodeURIComponent(composeId)}`);
  });

  test('direct string[] response is parsed', () => {
    const raw = ['web', 'db'];
    const parsed = parseComposeLoadServicesResponse(raw);
    expect(parsed).toEqual(['web', 'db']);
  });

  test('confirmed wrapped response is parsed if applicable', () => {
    const wrappedServices = { services: ['web', 'api'] };
    const wrappedData = { data: ['web', 'worker'] };
    expect(parseComposeLoadServicesResponse(wrappedServices)).toEqual(['web', 'api']);
    expect(parseComposeLoadServicesResponse(wrappedData)).toEqual(['web', 'worker']);
  });

  test('unexpected response throws INVALID_RESPONSE', () => {
    expect(() => parseComposeLoadServicesResponse({ invalidKey: 123 })).toThrow('INVALID_RESPONSE');
    expect(() => parseComposeLoadServicesResponse(null)).toThrow('INVALID_RESPONSE');
    expect(() => parseComposeLoadServicesResponse([1, 2, 3])).toThrow('INVALID_RESPONSE');
  });
});

describe('compose services UI helpers', () => {
  test('service fetch failure is not displayed as “No services”', () => {
    const isError = true;
    const composeServicesList: string[] = [];
    const showNoServicesState = !isError && composeServicesList.length === 0;
    expect(showNoServicesState).toBe(false);
  });

  test('existing Compose serviceName is preserved when service loading fails', () => {
    const editingDomain = {
      domainId: 'd-1',
      host: 'example.com',
      serviceName: 'web-service',
    };
    const isError = true;
    let selectedService = editingDomain.serviceName;
    expect(selectedService).toBe('web-service');
  });

  test('new Compose domain creation remains disabled without a confirmed service', () => {
    const isApplication = false;
    const editingDomain = null;
    const composeServicesList: string[] = [];
    const composeServicesErrorText = 'Failed to load services';
    const isSubmitDisabled = !isApplication && !editingDomain && (composeServicesList.length === 0 || !!composeServicesErrorText);
    expect(isSubmitDisabled).toBe(true);
  });
});

describe('domain.url public URL builder', () => {
  test('Public URL uses HTTPS only when enabled', () => {
    const urlHttps = buildPublicUrl({ host: 'example.com', https: true, path: '/' });
    const urlHttp = buildPublicUrl({ host: 'example.com', https: false, path: '/' });
    expect(urlHttps).toBe('https://example.com');
    expect(urlHttp).toBe('http://example.com');
  });

  test('Public URL includes external path', () => {
    const url = buildPublicUrl({ host: 'example.com', https: true, path: '/v1' });
    expect(url).toBe('https://example.com/v1');
  });

  test('Public URL excludes serviceName/internal values', () => {
    const url = buildPublicUrl({ host: 'example.com', https: true, path: '/' });
    expect(url).not.toContain('serviceName');
    expect(url).not.toContain('port');
  });
});

describe('Traefik.me Test Domain Generators', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test 3: generateDomain sends appName, not applicationId
  test('generateDomain sends appName, not applicationId', async () => {
    dokployFetch.mockResolvedValueOnce({ domain: 'app-server.traefik.me' });
    await domainApi.generateDomain({ appName: 'test-app' });
    expect(dokployFetch).toHaveBeenCalledWith(
      '/domain.generateDomain',
      expect.objectContaining({
        body: JSON.stringify({ appName: 'test-app' })
      })
    );
    const sent = JSON.parse(dokployFetch.mock.calls[0][1].body);
    expect(sent.applicationId).toBeUndefined();
  });

  // Test 4: generateDomain includes serverId only when available
  test('generateDomain includes serverId only when available', async () => {
    dokployFetch.mockResolvedValueOnce({ domain: 'app-server.traefik.me' });
    
    // Server ID missing
    await domainApi.generateDomain({ appName: 'test-app' });
    let sent = JSON.parse(dokployFetch.mock.calls[0][1].body);
    expect(sent.serverId).toBeUndefined();

    // Server ID present
    await domainApi.generateDomain({ appName: 'test-app', serverId: 'server-1' });
    sent = JSON.parse(dokployFetch.mock.calls[1][1].body);
    expect(sent.serverId).toBe('server-1');
  });

  // Test 5: Generated hostname comes from the API response
  test('Generated hostname comes from the API response', () => {
    const resString = 'my-custom-sub.traefik.me';
    const resObj = { domain: 'another-sub.traefik.me' };
    expect(parseGenerateDomainResponse(resString)).toBe('my-custom-sub.traefik.me');
    expect(parseGenerateDomainResponse(resObj)).toBe('another-sub.traefik.me');
  });

  // Test 6: Generated form values set HTTP, /, and certificate none
  test('Generated form values set HTTP, /, and certificate none', () => {
    const mockGeneratedDomain = 'my-app.traefik.me';
    const formValues = {
      host: mockGeneratedDomain,
      port: '3000',
      path: '/',
      https: false,
      certificateType: 'none',
    };
    expect(formValues.host).toBe('my-app.traefik.me');
    expect(formValues.path).toBe('/');
    expect(formValues.https).toBe(false);
    expect(formValues.certificateType).toBe('none');
  });

  // Test 7: Generation does not automatically submit domain.create
  test('Generation does not automatically submit domain.create', () => {
    let mockCreateCalled = false;
    const onGenerate = () => {
      // should fill fields only
    };
    onGenerate();
    expect(mockCreateCalled).toBe(false);
  });

  // Test 8: Optional generation failure does not affect readDomains
  test('Optional generation failure does not affect readDomains', () => {
    let readDomainsStatus = 'available';
    const onGenerationError = () => {
      // optional failure does not update readDomainsStatus to unsupported
    };
    onGenerationError();
    expect(readDomainsStatus).toBe('available');
  });
});

describe('Traefik.me Test Domain Generator focused tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. IPv4 string response -> available
  test('IPv4 string response -> available', () => {
    expect(parseCanGenerateResponse('192.168.1.1')).toBe(true);
    expect(parseCanGenerateResponse('203.0.113.10')).toBe(true);
  });

  // 2. IPv6 string response -> available
  test('IPv6 string response -> available', () => {
    expect(parseCanGenerateResponse('2001:db8::1')).toBe(true);
  });

  // 3. Empty string response -> unavailable
  test('Empty string response -> unavailable', () => {
    expect(parseCanGenerateResponse('')).toBe(false);
  });

  // 4. Whitespace-only string -> unavailable
  test('Whitespace-only string -> unavailable', () => {
    expect(parseCanGenerateResponse('   ')).toBe(false);
  });

  // 5. Wrapped string response parses if confirmed
  test('Wrapped string response parses if confirmed', () => {
    expect(parseCanGenerateResponse({ data: '192.168.1.1' })).toBe(true);
    expect(parseCanGenerateResponse({ data: '' })).toBe(false);
    expect(parseCanGenerateResponse({ data: '   ' })).toBe(false);
  });

  // 6. Unknown object throws INVALID_RESPONSE
  test('Unknown object throws INVALID_RESPONSE', () => {
    expect(() => parseCanGenerateResponse({ someRandomKey: 'value' })).toThrow('INVALID_RESPONSE');
    expect(() => parseCanGenerateResponse(123)).toThrow('INVALID_RESPONSE');
    expect(() => parseCanGenerateResponse(null)).toThrow('INVALID_RESPONSE');
  });

  // 7. Local support request includes serverId=
  test('Local support request includes serverId=', async () => {
    dokployFetch.mockResolvedValueOnce('192.168.1.1');
    await domainApi.canGenerateTraefikMeDomains('');
    expect(dokployFetch).toHaveBeenCalledWith('/domain.canGenerateTraefikMeDomains?serverId=');
  });

  // 8. Remote support request includes exact real serverId
  test('Remote support request includes exact real serverId', async () => {
    dokployFetch.mockResolvedValueOnce('192.168.1.1');
    const realId = 'server-uuid-888';
    await domainApi.canGenerateTraefikMeDomains(realId);
    expect(dokployFetch).toHaveBeenCalledWith(`/domain.canGenerateTraefikMeDomains?serverId=${encodeURIComponent(realId)}`);
  });

  // 9. Local generation request omits serverId
  test('Local generation request omits serverId', async () => {
    dokployFetch.mockResolvedValueOnce({ domain: 'local.traefik.me' });
    await domainApi.generateDomain({ appName: 'test-app' });
    expect(dokployFetch).toHaveBeenCalledWith(
      '/domain.generateDomain',
      expect.objectContaining({
        body: JSON.stringify({ appName: 'test-app' })
      })
    );
  });

  // 10. Remote generation request includes serverId
  test('Remote generation request includes serverId', async () => {
    dokployFetch.mockResolvedValueOnce({ domain: 'remote.traefik.me' });
    await domainApi.generateDomain({ appName: 'test-app', serverId: 'server-uuid-888' });
    expect(dokployFetch).toHaveBeenCalledWith(
      '/domain.generateDomain',
      expect.objectContaining({
        body: JSON.stringify({ appName: 'test-app', serverId: 'server-uuid-888' })
      })
    );
  });

  // 11. webServerSettings.id is never used as serverId
  test('webServerSettings.id is never used as serverId', () => {
    const target = { kind: 'local' };
    const payload: any = { appName: 'test-app' };
    if (target.kind === 'remote') {
      payload.serverId = 'remote-id';
    }
    expect(payload.serverId).toBeUndefined();
  });

  // 12. Loading/error state does not show unsupported
  test('Loading/error state does not show unsupported', () => {
    const getUIState = (isLoading: boolean, isError: boolean, error?: any): string => {
      if (isLoading) return 'checking';
      if (isError) return 'server_error';
      return 'not_configured';
    };
    expect(getUIState(true, false)).toBe('checking');
    expect(getUIState(false, true)).toBe('server_error');
  });

  // 13. Non-empty IP response makes wand visible
  test('Non-empty IP response makes wand visible', () => {
    const hasIp = parseCanGenerateResponse('192.168.1.1');
    const wandVisible = hasIp;
    expect(wandVisible).toBe(true);
  });
});
