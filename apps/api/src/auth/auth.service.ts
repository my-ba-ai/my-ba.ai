import { Injectable, NotFoundException } from "@nestjs/common"
import { eq } from "drizzle-orm"
import {
  currentUserResponseSchema,
  type AuthContext,
  type CurrentUserResponse,
} from "@my-ba/shared"
import { users } from "@my-ba/db"
import { TenantDatabaseService } from "../database/tenant-database.service"

@Injectable()
export class AuthService {
  constructor(private readonly tenantDb: TenantDatabaseService) {}

  /**
   * Reads the row back rather than echoing the auth context.
   *
   * That is the whole value of this endpoint as an acceptance check: the guard
   * could resolve an identity correctly and the tenant-scoped query path could
   * still be broken. Returning the token's own contents would pass either way.
   * This returns a row that was selected under `app.tenant_id`, so a response
   * body is proof the RLS path works — and an empty result is proof it does
   * not, rather than a silent success.
   */
  async currentUser(auth: AuthContext): Promise<CurrentUserResponse> {
    const row = await this.tenantDb.run(auth, async (tx) => {
      const rows = await tx
        .select({
          userId: users.id,
          tenantId: users.tenantId,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, auth.userId))
        .limit(1)

      return rows[0] ?? null
    })

    if (!row) {
      // Resolved an identity, then could not see its own row inside its own
      // tenant. Not a missing user — a broken policy or a broken scope.
      throw new NotFoundException("Authenticated user is not visible within its own tenant scope")
    }

    return currentUserResponseSchema.parse({ ...row, provisioned: auth.provisioned })
  }
}
