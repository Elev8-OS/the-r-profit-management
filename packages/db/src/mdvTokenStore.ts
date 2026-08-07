import type { MdvOAuthRecord, MdvTokenStore } from "@the-r/integrations";
import { prisma } from "./index";

/**
 * Prisma-backed implementation of @the-r/integrations' MdvTokenStore.
 * Lives here (not in @the-r/integrations) so that package stays a pure REST
 * client library with no Prisma/@the-r/db dependency, matching this repo's
 * existing layering. apps/web and apps/worker both import this directly to
 * build their own MdvTokenManager instance against the same
 * MdvOAuthCredential row (see schema.prisma for the rotation/optimistic-
 * concurrency rationale).
 */
export class PrismaMdvTokenStore implements MdvTokenStore {
  async getOrCreate(tenantId: string, initialRefreshToken: string): Promise<MdvOAuthRecord> {
    const existing = await prisma.mdvOAuthCredential.findUnique({ where: { tenantId } });
    if (existing) return toRecord(existing);

    // Bootstrap: first-ever use for this tenant, seeded with the one-time
    // initial refresh_token issued by MDV support. If two processes race to
    // bootstrap at the exact same moment, the @@unique(tenantId) constraint
    // makes the loser's create() throw — it just re-reads the winner's row.
    try {
      const created = await prisma.mdvOAuthCredential.create({
        data: { tenantId, refreshToken: initialRefreshToken, version: 0 },
      });
      return toRecord(created);
    } catch {
      const raceWinner = await prisma.mdvOAuthCredential.findUnique({ where: { tenantId } });
      if (!raceWinner) {
        throw new Error("Failed to bootstrap MdvOAuthCredential and no row exists after retry.");
      }
      return toRecord(raceWinner);
    }
  }

  async reload(id: string): Promise<MdvOAuthRecord | null> {
    const row = await prisma.mdvOAuthCredential.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async claim(id: string, expectedVersion: number): Promise<boolean> {
    const result = await prisma.mdvOAuthCredential.updateMany({
      where: { id, version: expectedVersion },
      data: { version: { increment: 1 } },
    });
    return result.count === 1;
  }

  async save(
    id: string,
    data: { refreshToken: string; accessToken: string; accessTokenExpiresAt: Date }
  ): Promise<void> {
    await prisma.mdvOAuthCredential.update({
      where: { id },
      data: {
        refreshToken: data.refreshToken,
        accessToken: data.accessToken,
        accessTokenExpiresAt: data.accessTokenExpiresAt,
      },
    });
  }
}

function toRecord(row: {
  id: string;
  refreshToken: string;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
  version: number;
}): MdvOAuthRecord {
  return {
    id: row.id,
    refreshToken: row.refreshToken,
    accessToken: row.accessToken,
    accessTokenExpiresAt: row.accessTokenExpiresAt,
    version: row.version,
  };
}
