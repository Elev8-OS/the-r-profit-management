# Microsoft Entra ID (Azure AD) SSO setup — manual steps

This app has no Azure admin API access from the build environment, so this
registration has to be done by hand in the Azure Portal by someone with admin
rights on the elev8-suite.com Entra tenant (Reto — Founder & CTO).

1. Go to https://portal.azure.com → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Name: `The R - Profit Management` (or similar).
3. Supported account types: **Accounts in this organizational directory only (elev8-suite.com only — Single tenant)** for Phase 1. This gets switched to multi-tenant only in Phase 4, when other companies are onboarded.
4. Redirect URI: type **Web**, value `https://web-app-production-d5b8.up.railway.app/api/auth/callback/azure-ad` (this is the real Railway domain provisioned for the `web-app` service, which is the one actually connected to this GitHub repo — see note below on service naming) — and add `http://localhost:3000/api/auth/callback/azure-ad` too for local dev.
5. After creation, note down:
   - **Application (client) ID** → `AZURE_AD_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_AD_TENANT_ID`
6. Go to **Certificates & secrets** → **New client secret** → copy the value immediately (shown once) → `AZURE_AD_CLIENT_SECRET`.
7. Go to **API permissions** → confirm `User.Read` (Microsoft Graph, delegated) is present — it's added by default and is sufficient for Phase 1 sign-in.
8. Set `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, and `AZURE_AD_TENANT_ID` as Railway environment variables on the **`web-app`** service (Railway project `the-r-profit-management`) — `NEXTAUTH_URL` and `NEXTAUTH_SECRET` are already set there.
9. When a `staging` environment is added later, repeat this whole registration for a second app (staging has its own domain, so its own redirect URI).

**Note on service naming:** the Railway project has two services per app role: `web` / `worker` (created first, empty placeholders with no deploy source — safe to delete) and `web-app` / `worker-app` (created afterwards, actually connected to this GitHub repo and building/deploying). Use `web-app` for anything real; `web`/`worker` are orphaned and can be removed from the Railway dashboard.

No further app-side code changes are needed once these are set; `apps/web/src/auth.ts` already reads all of them.

## Dev login bypass (until the above is done)

The app has a temporary "Dev Login" sign-in option that skips Microsoft entirely — enabled by
setting `ENABLE_DEV_LOGIN=true` on the `web-app` Railway service (already turned on there now).
Go to `https://web-app-production-d5b8.up.railway.app/api/auth/signin`, pick "Dev Login (bypasses
Microsoft SSO — DEV ONLY)", type any email (e.g. `reto.wyss@elev8-suite.com`) and a name, and
you're in — it goes through the same tenant/user provisioning as real SSO would.

**This has zero verification** — anyone who can reach the sign-in page can log in as anyone. A
yellow banner appears across the whole app whenever it's on, as a reminder. Turn it off by
unsetting `ENABLE_DEV_LOGIN` on `web-app` the moment the real Entra ID registration above is
working, and definitely before Phase 4 (other companies' data in the same app).
