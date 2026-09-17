import { Inject, Injectable } from "@nestjs/common"
import type { AuthContext } from "@my-ba/shared"
import { withTenant, type Database, type TenantTransaction } from "@my-ba/db"
import { DATABASE } from "./database.tokens"

/**
 * How a request touches the database. There is no other sanctioned way.
 *
 * The tenant comes from the `AuthContext` the guard built, which came from a
 * signature-verified token — so a caller cannot choose the tenant it reads, and
 * a handler cannot forget to set one. Outside this wrapper the app role sees an
 * empty database, which is the design in `packages/db/src/tenant.ts`: a query
 * that loses its scope returns nothing rather than everything.
 *
 * The `AuthContext` is passed explicitly rather than pulled from an
 * AsyncLocalStorage. Threading it is slightly more typing at each call site,
 * and in exchange every query in the codebase names the tenant it runs as,
 * greppably, in a project whose entire isolation story is RLS. If the threading
 * becomes genuinely painful several services deep, ALS is the upgrade — but
 * that is a decision to take when the pain is real, not in anticipation.
 */
@Injectable()
export class TenantDatabaseService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async run<T>(auth: AuthContext, fn: (tx: TenantTransaction) => Promise<T>): Promise<T> {
    return withTenant(this.db, auth.tenantId, fn)
  }
}
