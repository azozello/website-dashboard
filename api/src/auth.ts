import { betterAuth } from 'better-auth';
import { organization, twoFactor } from 'better-auth/plugins';
import type { Pool } from 'pg';
import type { Settings } from './config.ts';
import type { Mailer } from './mail.ts';

/**
 * Authentication: Better Auth, in this process, on our Postgres.
 *
 * - Email + password: scrypt hashes, email must be verified before the first sign-in.
 * - MFA (credential sign-in only): authenticator app (TOTP), emailed code as fallback, backup codes.
 * - Google: OAuth code flow, scopes openid/email/profile. Same verified email → same user.
 * - Sessions: opaque token in the `session` table, signed host-only cookie, 7-day sliding expiry.
 * - Organisations (tenants): the organization plugin (organization, member, invitation tables).
 *
 * Mounted at /api/auth/* (see app.ts).
 */
export function createAuth(settings: Settings, db: Pool, mailer: Mailer) {
  // Fire and forget: awaiting the SMTP call would leak (by timing) whether an address exists.
  const send = (to: string, subject: string, text: string) => {
    mailer.send({ to, subject, text }).catch((err) => console.error('[mail] send failed:', err));
  };

  return betterAuth({
    appName: 'Rate 1', // issuer shown in authenticator apps
    baseURL: settings.appBaseUrl,
    basePath: '/api/auth',
    secret: settings.secret,
    database: db,

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        send(user.email, 'Reset your Rate 1 password', `Reset your password:\n${url}\n\nThe link is valid for 1 hour. If you didn't ask for this, ignore this email.`),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) =>
        send(user.email, 'Confirm your email for Rate 1', `Confirm your email address:\n${url}\n\nThe link is valid for 1 hour.`),
    },

    socialProviders: settings.google ? { google: { ...settings.google, prompt: 'select_account' } } : {},
    account: { accountLinking: { enabled: true, trustedProviders: ['google'] } },

    plugins: [
      twoFactor({
        otpOptions: {
          period: 5, // minutes
          storeOTP: 'hashed',
          sendOTP: async ({ user, otp }) =>
            send(user.email, 'Your Rate 1 sign-in code', `Your sign-in code: ${otp}\n\nIt is valid for 5 minutes. If you didn't try to sign in, change your password.`),
        },
        backupCodeOptions: { storeBackupCodes: 'encrypted' },
      }),
      organization({
        invitationExpiresIn: 60 * 60 * 48,
        sendInvitationEmail: async (d) =>
          send(
            d.email,
            `Join ${d.organization.name} on Rate 1`,
            `${d.inviter.user.name || d.inviter.user.email} invited you to the ${d.organization.name} website dashboard as ${d.role}.\n\n` +
              `Accept: ${settings.appBaseUrl}/invite/${d.id}\n\nThe invitation is valid for 48 hours.`,
          ),
      }),
    ],

    rateLimit: { enabled: settings.rateLimit, storage: 'database' },
    advanced: {
      useSecureCookies: settings.appBaseUrl.startsWith('https://'),
      ipAddress: { ipAddressHeaders: [settings.clientIpHeader] },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
