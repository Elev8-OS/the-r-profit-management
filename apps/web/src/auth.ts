import AzureADProvider from "next-auth/providers/azure-ad";
import type { NextAuthOptions } from "next-auth";

/**
 * Microsoft Entra ID (Azure AD) SSO — Phase 0.
 *
 * Phase 1: single-tenant app registration restricted to the elev8-suite.com
 * Entra tenant (set AZURE_AD_TENANT_ID to that tenant's ID, not "common").
 * Phase 4 (multi-tenant onboarding): switch AZURE_AD_TENANT_ID to "organizations"
 * or "common" and map the `tid` claim to our internal tenantId at sign-in —
 * see the JIT-provisioning callback below, which currently assumes single-tenant.
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
      // TODO (Phase 0 follow-up): JIT-provision a User row here, scoped to the
      // single "The R" Tenant row, mapping profile.oid -> User.entraObjectId.
      // Deferred until packages/db is wired up with a real DATABASE_URL.
      return true;
    },
  },
  session: { strategy: "jwt" },
};
