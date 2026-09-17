/**
 * DI tokens live here, not on the module, for the same reason as
 * `auth/auth.tokens.ts`: a provider that injects one must not have to import
 * the module that declares it.
 *
 * `TenantDatabaseService` is declared by `DatabaseModule` and injects
 * `DATABASE`. With the tokens defined on the module, that is a cycle — the
 * module imports the service, the service imports the module — and Node
 * resolves it by handing one side a half-initialised namespace. Nest then sees
 * `undefined` in its providers array and reports a circular dependency, which
 * is accurate but points at the symptom rather than the import.
 */
export const DATABASE = Symbol("DATABASE")
export const DATABASE_POOL = Symbol("DATABASE_POOL")
