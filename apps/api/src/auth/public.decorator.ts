import { SetMetadata } from "@nestjs/common"

export const IS_PUBLIC = "auth:public"

/**
 * Opts a route out of the global guard.
 *
 * The default is the other way round on purpose: a new controller is protected
 * because nobody remembered to protect it, not exposed because nobody
 * remembered to. Health is public because an orchestrator probing liveness has
 * no token to present.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true)
