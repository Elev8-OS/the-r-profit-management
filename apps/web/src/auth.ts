import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions, Profile } from "next-auth";
import { prisma } from "@the-r/db";

/**
 * Microsoft Entra ID (Azure AD) SSO.
 *
 * Phase 1: single-tenant app registration restricted to the elev8-suite.com
 * Entra tenant (set AZURE_AD_TENANT_ID to that tenant's ID, not "common").
 * Phase 4 (multi-tenant onboarding): switch AZURE_AD_TENANT_ID to "organizations"
 * or "common" and map the `tid` claim to our internal tenantId at sign-in —
 * the JIT-provisioning callback below currently always resolves to the single
 * seeded "the-r" tenant (see packages/db/prisma/seed.ts); that single-tenant
 * assumption is the thing to change first when Phase 4 starts.
 *
 * Required env vars (see .env.example):
 *   AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, AZURE_AD_TENANT_ID,
 *   NEXTAUTH_SECRET, NEXTAUTH_URL
 *
 * DEV-ONLY SSO BYPASS
 * --------------------
 * Set ENABLE_DEV_LOGIN=true to add a second sign-in option, "Dev Login", that
 * accepts any email/name typed into a form — no Microsoft account needed.
 * This exists purely so development/testing can proceed before the real
 * Entra ID app registration is done (see docs/entra-sso-setup.md). It:
 *   - is only added to `providers` when ENABLE_DEV_LOGIN === "true" — leave
 *     that var unset (the default) and this code path does not exist;
 *   - still goes through the same JIT-provisioning + tenant/role logic below,
 *     so it behaves like a real login, not a special case;
 *   - trusts whatever email is typed with NO verification whatsoever — this
 *     is only acceptable while there is exactly one real tenant (The R) and
 *     no external users. Turn ENABLE_DEV_LOGIN off (unset it on the Railway
 *     `web-app` service) before Phase 4 (onboarding other companies), and
 *     never enable it anywhere guests or other tenants could reach.
 */
const providers: NextAuthOptions["providers"] = [
  AzureADProvider({
    clientId: process.env.AZURE_AD_CLIENT_ID ?? "",
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
    tenantId: process.env.AZURE_AD_TENANT_ID ?? "",
  }),
];

if (process.env.ENABLE_DEV_LOGIN === "true") {
  providers.push(
    CredentialsProvider({
      id: "dev-login",
      name: "Dev Login (bypasses Microsoft SSO — DEV ONLY)",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@elev8-suite.com" },
        name: { label: "Name (optional)", type: "text" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim();
        if (!email) return null;
        // No password / verification by design — see the big warning above.
        return { id: email, email, name: credentials?.name?.trim() || email };
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async signIn({ user, profile }) {
      const email = profile?.email ?? user?.email ?? undefined;
      if (!email) return false;

      // Phase 1: everyone who successfully authenticates (via Entra ID, or
      // via Dev Login when enabled) is JIT-provisioned into the single
      // seeded "the-r" tenant. Phase 4 will map the Entra `tid` claim to a
      // real per-tenant lookup instead of this hardcoded slug.
      const tenant = await prisma.tenant.upsert({
        where: { slug: "the-r" },
        update: {},
        create: { name: "The R", slug: "the-r" },
      });

      const entraObjectId = (profile as (Profile & { oid?: string }) | undefined)?.oid ?? profile?.sub;
      const displayName = profile?.name ?? user?.name ?? undefined;

      await prisma.user.upsert({
        where: { email },
        update: {
          ...(entraObjectId ? { entraObjectId } : {}),
          displayName,
        },
        create: {
          tenantId: tenant.id,
          email,
          displayName,
          entraObjectId,
          role: "ADMIN", // Phase 1: single-tenant, everyone who can sign in is trusted as ADMIN
        },
      });

      return true;
    },
    async jwt({ token }) {
      // Provider-agnostic: NextAuth always sets token.email from the
      // sign-in result (Entra profile.email or Dev Login's user.email), so
      // this works the same for both providers without branching.
      if (token.email && !token.tenantId) {
        const dbUser = await prisma.user.findUnique({ where: { email: token.email } });
        if (dbUser) {
          token.userId = dbUser.id;
          token.tenantId = dbUser.tenantId;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as typeof session.user & { id?: string; tenantId?: string; role?: string }).id =
          token.userId as string | undefined;
        (session.user as typeof session.user & { id?: string; tenantId?: string; role?: string }).tenantId =
          token.tenantId as string | undefined;
        (session.user as typeof session.user & { id?: string; tenantId?: string; role?: string }).role =
          token.role as string | undefined;
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
};
