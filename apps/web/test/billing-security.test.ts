import { describe, expect, it } from 'vitest';
import checkout from '../../../api/billing/checkout';
import webhook from '../../../api/billing/webhook';

describe('server-only billing boundaries', () => {
  it('rejects anonymous checkout before revealing payment configuration', async () => {
    const response = await checkout.fetch(new Request('https://fairmatch.example/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('Sign in') });
  });

  it('rejects unsupported methods on both payment endpoints', async () => {
    const checkoutResponse = await checkout.fetch(new Request('https://fairmatch.example/api/billing/checkout'));
    const webhookResponse = await webhook.fetch(new Request('https://fairmatch.example/api/billing/webhook'));
    expect(checkoutResponse.status).toBe(405);
    expect(webhookResponse.status).toBe(405);
  });

  it('never allows browser caching of checkout responses', async () => {
    const response = await checkout.fetch(new Request('https://fairmatch.example/api/billing/checkout', { method: 'POST' }));
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
