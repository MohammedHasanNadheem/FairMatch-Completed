import { describe, expect, it } from 'vitest';
import { readAuthCallbackNotice } from '../src/auth-callback';

describe('authentication callback messages', () => {
  it('turns an expired email link into an actionable recovery message', () => {
    const notice = readAuthCallbackNotice('https://fairmatch.example/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    expect(notice?.tone).toBe('error');
    expect(notice?.message).toContain('request a fresh verification email');
  });

  it('recognises a PKCE verification callback', () => {
    expect(readAuthCallbackNotice('https://fairmatch.example/?code=verification-code')?.tone).toBe('success');
  });

  it('ignores normal navigation', () => {
    expect(readAuthCallbackNotice('https://fairmatch.example/')).toBeNull();
  });
});
