import AzureADProvider from "next-auth/providers/azure-ad";
import type { NextAuthOptions } from "next-auth";
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
 */
export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID ?? "",
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
      tenantId: process.env.AZURE_AD_TENANT_ID ?? "",
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.email) return false;

      // Phase 1: everyone who successfully authenticates against the
      // elev8-suite.com Entra tenant is JIT-provisioned into the single
      // seeded "the-r" tenant. Phase 4 will map the Entra `tid` claim to a
      // real per-tenant lookup instead of this hardcoded slug.
      const tenant = await prisma.tenant.upsert({
        where: { slug: "the-r" },
        update: {},
        create: { name: "The R", slug: "the-r" },
      });

      const entraObjectId = (profile as { oid?: string; sub?: string }).oid ?? profile.sub;

      await prisma.user.upsert({
        where: { email: profile.email },
        update: {
          entraObjectId,
          displayName: profile.name ?? undefined,
        },
        create: {
          tenantId: tenant.id,
          email: profile.email,
          displayName: profile.name ?? undefined,
          entraObjectId,
          role: "ADMIN", // Phase 1: single-tenant, everyone who can sign in is trusted as ADMIN
        },
      });

      return true;
    },
    async jwt({ token, profile }) {
      if (profile?.email) {
        const user = await prisma.user.findUnique({ where: { email: profile.email } });
        if (user) {
          token.userId = user.id;
          token.tenantId = user.tenantId;
          token.role = user.role;
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
