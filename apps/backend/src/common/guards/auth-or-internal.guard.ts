import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AdminRole } from '@poker-bot/shared-types';

/**
 * Guard that allows authentication via EITHER:
 * 1. Valid JWT token (AuthGuard('jwt'))
 * 2. Valid Internal API Key (X-Internal-Api-Key header)
 */
@Injectable()
export class AuthOrInternalGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Check Internal API Key first
    const apiKey = request.headers['x-internal-api-key'];
    if (apiKey && apiKey === process.env.INTERNAL_API_KEY) {
      // Set a mock user with super admin role to pass RolesGuard
      (request as any).user = { role: AdminRole.SUPER_ADMIN, botId: 'internal' };
      return true;
    }

    // Fall back to JWT AuthGuard
    const jwtGuard = new (AuthGuard('jwt'))();
    try {
      const result = await jwtGuard.canActivate(context);
      if (result) {
        return true;
      }
    } catch {
      // JWT validation failed, will throw below
    }

    throw new UnauthorizedException(
      'Authentication required: provide JWT token or X-Internal-Api-Key header',
    );
  }
}
