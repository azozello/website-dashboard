import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Browser, PASSWORD, firstUrl, freshApp, lastMail, signUpVerified, totp, type TestApp } from './helpers.ts';

let t: TestApp;
beforeAll(async () => {
  t = await freshApp('auth');
});
afterAll(async () => {
  await t.app.close();
});

describe('email and password', () => {
  it('needs a verified email before the first sign-in', async () => {
    const b = new Browser(t);
    const email = 'ann@example.com';
    expect((await b.post('/api/auth/sign-up/email', { name: 'Ann', email, password: PASSWORD })).status).toBe(200);
    expect((await b.get('/api/me')).status).toBe(401);
    expect((await b.post('/api/auth/sign-in/email', { email, password: PASSWORD })).status).toBe(403);

    const link = firstUrl(lastMail(t, email, /Confirm your email/).text);
    await b.get(link.pathname + link.search);
    const me = await b.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.json.user).toMatchObject({ email, twoFactorEnabled: false, signInMethods: ['credential'] });
    expect(me.json.orgs).toEqual([]);
    expect(me.json.sites).toEqual([]);
  });

  it('rejects a wrong password and a short one', async () => {
    await signUpVerified(t, 'bea@example.com');
    const b = new Browser(t);
    expect((await b.post('/api/auth/sign-in/email', { email: 'bea@example.com', password: 'wrong-password-123' })).status).toBe(401);
    expect((await b.post('/api/auth/sign-up/email', { name: 'x', email: 'short@example.com', password: 'short' })).status).toBe(400);
  });

  it('signs out and resets a password by email link', async () => {
    const b = await signUpVerified(t, 'cy@example.com');
    await b.post('/api/auth/sign-out');
    expect((await b.get('/api/me')).status).toBe(401);

    expect((await b.post('/api/auth/request-password-reset', { email: 'cy@example.com', redirectTo: '/reset-password' })).status).toBe(200);
    const link = firstUrl(lastMail(t, 'cy@example.com', /Reset your/).text);
    const redirected = await b.get(link.pathname + link.search);
    const location = new URL(String(redirected.headers.location), 'http://x');
    const token = location.searchParams.get('token');
    expect(token).toBeTruthy();
    expect((await b.post('/api/auth/reset-password', { token, newPassword: 'a-brand-new-password' })).status).toBe(200);
    expect((await b.post('/api/auth/sign-in/email', { email: 'cy@example.com', password: PASSWORD })).status).toBe(401);
    expect((await b.post('/api/auth/sign-in/email', { email: 'cy@example.com', password: 'a-brand-new-password' })).status).toBe(200);
  });
});

describe('MFA', () => {
  const email = 'mfa@example.com';
  let totpURI = '';
  let backupCodes: string[] = [];

  const passwordStep = async () => {
    const b = new Browser(t);
    const r = await b.post('/api/auth/sign-in/email', { email, password: PASSWORD });
    expect(r.status).toBe(200);
    expect(r.json.twoFactorRedirect).toBe(true);
    expect((await b.get('/api/me')).status).toBe(401); // no session until the second factor
    return b;
  };

  it('enrols an authenticator app; it is active only after a valid code', async () => {
    const b = await signUpVerified(t, email);
    expect((await b.post('/api/auth/two-factor/enable', { password: 'wrong-password-123' })).status).not.toBe(200);
    const en = await b.post('/api/auth/two-factor/enable', { password: PASSWORD });
    expect(en.status).toBe(200);
    ({ totpURI, backupCodes } = en.json);
    expect(totpURI).toMatch(/^otpauth:\/\/totp\/.*issuer=Rate(%20|\+)1/);
    expect(backupCodes.length).toBeGreaterThan(5);
    expect((await b.get('/api/me')).json.user.twoFactorEnabled).toBe(false);

    expect((await b.post('/api/auth/two-factor/verify-totp', { code: totp(totpURI) })).status).toBe(200);
    expect((await b.get('/api/me')).json.user.twoFactorEnabled).toBe(true);
  });

  it('second step: authenticator code', async () => {
    const b = await passwordStep();
    expect((await b.post('/api/auth/two-factor/verify-totp', { code: '000000' })).status).not.toBe(200);
    expect((await b.get('/api/me')).status).toBe(401);
    expect((await b.post('/api/auth/two-factor/verify-totp', { code: totp(totpURI) })).status).toBe(200);
    expect((await b.get('/api/me')).status).toBe(200);
  });

  it('second step: emailed code', async () => {
    const b = await passwordStep();
    expect((await b.post('/api/auth/two-factor/send-otp')).status).toBe(200);
    const code = lastMail(t, email, /sign-in code/).text.match(/\b(\d{6})\b/)![1];
    expect((await b.post('/api/auth/two-factor/verify-otp', { code })).status).toBe(200);
    expect((await b.get('/api/me')).status).toBe(200);
  });

  it('second step: backup code, single use', async () => {
    const b = await passwordStep();
    expect((await b.post('/api/auth/two-factor/verify-backup-code', { code: backupCodes[0] })).status).toBe(200);
    expect((await b.get('/api/me')).status).toBe(200);

    const again = await passwordStep();
    expect((await again.post('/api/auth/two-factor/verify-backup-code', { code: backupCodes[0] })).status).not.toBe(200);
    expect((await again.get('/api/me')).status).toBe(401);
  });

  it('trusted device skips the second step', async () => {
    const b = await passwordStep();
    expect((await b.post('/api/auth/two-factor/verify-totp', { code: totp(totpURI), trustDevice: true })).status).toBe(200);
    await b.post('/api/auth/sign-out');
    const r = await b.post('/api/auth/sign-in/email', { email, password: PASSWORD });
    expect(r.status).toBe(200);
    expect(r.json.twoFactorRedirect).toBeUndefined();
    expect((await b.get('/api/me')).status).toBe(200);
  });
});

describe('public config', () => {
  it('reports Google as off without credentials', async () => {
    expect((await new Browser(t).get('/api/config')).json).toEqual({ google: false });
  });
});
