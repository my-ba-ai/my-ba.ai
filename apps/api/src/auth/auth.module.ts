import { Module, type Provider } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { APP_GUARD } from "@nestjs/core"
import type { Redis } from "ioredis"
import { REDIS_CLIENT } from "../redis/redis.tokens"
import { AuthController } from "./auth.controller"
import { AuthGuard } from "./auth.guard"
import { AuthService } from "./auth.service"
import { IDENTITY_CACHE, TOKEN_VERIFIER, USER_DIRECTORY } from "./auth.tokens"
import { type IdentityCache, RedisIdentityCache } from "./identity-cache"
import { IdentityResolverService } from "./identity-resolver.service"
import { ClerkTokenVerifier, type TokenVerifier } from "./token-verifier"
import { ClerkUserDirectory, type UserDirectory } from "./user-directory"

/**
 * Both factories throw at startup rather than at the first request.
 *
 * An API that boots without a usable auth configuration is an API that answers
 * the first authenticated request with a 500 at a time nobody is watching. This
 * is also why there is no AUTH_DISABLED escape hatch for local development: a
 * switch that turns the guard off is a switch that can be set in the wrong
 * environment, and the cost of not having one is putting real keys in
 * `.env.local`.
 */
const verifierProvider: Provider = {
  provide: TOKEN_VERIFIER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): TokenVerifier => {
    const jwtKey = config.get<string>("CLERK_JWT_KEY")
    const secretKey = config.get<string>("CLERK_SECRET_KEY")

    if (!jwtKey && !secretKey) {
      throw new Error(
        "Set CLERK_JWT_KEY (networkless, preferred) or CLERK_SECRET_KEY (JWKS fetch). See apps/api/.env.example.",
      )
    }

    const authorizedParties = (config.get<string>("CLERK_AUTHORIZED_PARTIES") ?? "")
      .split(",")
      .map((party) => party.trim())
      .filter((party) => party.length > 0)

    return new ClerkTokenVerifier({ jwtKey, secretKey, authorizedParties })
  },
}

const directoryProvider: Provider = {
  provide: USER_DIRECTORY,
  inject: [ConfigService],
  useFactory: (config: ConfigService): UserDirectory => {
    const secretKey = config.get<string>("CLERK_SECRET_KEY")
    if (!secretKey) {
      throw new Error(
        "CLERK_SECRET_KEY is required to read a profile when provisioning a new identity (D47). See apps/api/.env.example.",
      )
    }
    return new ClerkUserDirectory(secretKey)
  },
}

const identityCacheProvider: Provider = {
  provide: IDENTITY_CACHE,
  inject: [REDIS_CLIENT],
  useFactory: (redis: Redis): IdentityCache => new RedisIdentityCache(redis),
}

@Module({
  controllers: [AuthController],
  providers: [
    verifierProvider,
    directoryProvider,
    identityCacheProvider,
    IdentityResolverService,
    AuthService,
    // Global. Every route is protected unless it carries @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [IdentityResolverService],
})
export class AuthModule {}
