import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/services/prisma.service';
import { AccessRequestStatus } from 'generated/prisma';

@Injectable()
export class PaymentAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // TESTING MODE: Always allow payment access
    return true;

    /* ORIGINAL CODE - Uncomment after testing
    const request = context.switchToHttp().getRequest();
    const userId = request.user;

    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { accessRequestStatus: true },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    if (user.accessRequestStatus !== AccessRequestStatus.APPROVED) {
      throw new ForbiddenException(
        'You do not have access to payment features. Request access to get started.',
      );
    }

    return true;
    */
  }
}
