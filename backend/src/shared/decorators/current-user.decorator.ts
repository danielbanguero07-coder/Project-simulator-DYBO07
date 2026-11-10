import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserPayload } from '../../modules/auth/interfaces/user-payload.interface';

export const CurrentUser = createParamDecorator(
  (data: keyof UserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (data) {
      return user?.[data];
    }
    return user;
  },
);