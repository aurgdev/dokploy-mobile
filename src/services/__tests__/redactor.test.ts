import { redactSecrets } from '../redactor';

describe('redactSecrets', () => {
  test('should redact api keys, tokens, and authorization headers in objects', () => {
    const payload = {
      headers: {
        'x-api-key': 'secret-dokploy-12345',
        'Authorization': 'Bearer my-jwt-token',
        'Accept': 'application/json'
      },
      data: {
        password: 'super-password',
        username: 'admin',
        nested: {
          secretToken: 'abcde12345'
        }
      }
    };
    const result = redactSecrets(payload);
    expect(result.headers['x-api-key']).toBe('[REDACTED]');
    expect(result.headers['Authorization']).toBe('[REDACTED]');
    expect(result.headers['Accept']).toBe('application/json');
    expect(result.data.password).toBe('[REDACTED]');
    expect(result.data.username).toBe('admin');
    expect(result.data.nested.secretToken).toBe('[REDACTED]');
  });

  test('should redact sensitive patterns in string logs', () => {
    const log1 = 'Error: x-api-key: some_secret_123 in request';
    expect(redactSecrets(log1)).toBe('Error: x-api-key: [REDACTED] in request');

    const log2 = 'Authorization=Bearer 12345-token';
    expect(redactSecrets(log2)).toBe('Authorization=Bearer [REDACTED]');

    const log3 = 'dbPassword="someSecretPassword"';
    expect(redactSecrets(log3)).toBe('dbPassword="[REDACTED]"');
  });
});
