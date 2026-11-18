export type AuthCallbackNotice = { tone: 'error' | 'success'; message: string };

export function readAuthCallbackNotice(urlValue: string): AuthCallbackNotice | null {
  const url = new URL(urlValue, 'https://fairmatch.invalid');
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const errorCode = hash.get('error_code') ?? url.searchParams.get('error_code');
  const errorDescription = hash.get('error_description') ?? url.searchParams.get('error_description');

  if (errorCode === 'otp_expired' || /expired|invalid/i.test(errorDescription ?? '')) {
    return { tone: 'error', message: 'This verification link is invalid or has expired. Sign in with the same email and password, then request a fresh verification email.' };
  }
  if (errorCode || errorDescription) {
    return { tone: 'error', message: errorDescription?.replace(/\+/g, ' ') ?? 'We could not verify this authentication link. Request a fresh link and try again.' };
  }
  if (hash.has('access_token') || url.searchParams.has('code')) {
    return { tone: 'success', message: 'Verification received. FairMatch is securely completing your sign-in.' };
  }
  return null;
}
