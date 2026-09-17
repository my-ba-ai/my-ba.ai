import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { authContextSchema } from "@my-ba/shared"
import { TOKEN_VERIFIER } from "./auth.tokens"
import type { AuthenticatedRequest } from "./authenticated-request"
import { IdentityResolverService } from "./identity-resolver.service"
import { IS_PUBLIC } from "./public.decorator"
import type { TokenVerifier } from "./token-verifier"

function bearerToken(header: string | undefined): string | null {
  if (!header) return null
  const [scheme, value] = header.split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !value) return null
  return value.trim() || null
}

/**
 * Registered as an APP_GUARD, so it runs on every route that has not opted out.
 *
 * It does two things and they are separate on purpose: prove the token is real
 * (signature, expiry, authorised party — all Clerk's job), then decide which
 * tenant that proves. Nothing between the two steps reads anything the client
 * sent. A header, query parameter or body field naming a tenant is not
 * consulted here and must never be, or the isolation in D26 becomes advisory.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name)

  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
    private readonly identities: IdentityResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const token = bearerToken(request.headers.authorization)
    if (!token) {
      throw new UnauthorizedException("Missing bearer token")
    }

    const claims = await this.verify(token)
    const identity = await this.identities.resolve(claims.sub)

    request.auth = authContextSchema.parse({
      externalAuthId: claims.sub,
      sessionId: claims.sid ?? null,
      userId: identity.userId,
      tenantId: identity.tenantId,
      email: identity.email,
      displayName: identity.displayName,
      role: identity.role,
      provisioned: identity.provisioned,
    })

    return true
  }

  /**
   * The reason the verifier rejected a token is useful in a log and not in a
   * response. Telling a caller whether a token was malformed, expired or minted
   * for another party is free reconnaissance.
   */
  private async verify(token: string) {
    try {
      return await this.verifier.verify(token)
    } catch (error: unknown) {
      this.logger.warn(
        `Token verification failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw new UnauthorizedException("Invalid or expired session token")
    }
  }
}
