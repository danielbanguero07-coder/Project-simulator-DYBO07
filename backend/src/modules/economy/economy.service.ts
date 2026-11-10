import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { RedisService } from '../../shared/services/redis.service';
import {
  TransferCurrencyDto,
  PurchaseDto,
  TransactionResponseDto,
  LedgerEntryDto,
  TransactionType,
  CurrencyType,
} from './dto/economy.dto';

@Injectable()
export class EconomyService {
  private readonly logger = new Logger(EconomyService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // Double-entry bookkeeping: every transaction creates balanced ledger entries
  async transferCurrency(userId: string, dto: TransferCurrencyDto): Promise<TransactionResponseDto> {
    if (userId === dto.toUserId) {
      throw new BadRequestException('Cannot transfer to yourself');
    }

    return this.prisma.withTransaction(async (tx) => {
      // Check sender balance
      const sender = await tx.player.findUnique({
        where: { userId },
        select: { gold: true, premiumCurrency: true },
      });

      if (!sender) throw new NotFoundException('Sender not found');

      const senderBalance = dto.currency === CurrencyType.GOLD ? sender.gold : sender.premiumCurrency;
      if (senderBalance < dto.amount) {
        throw new BadRequestException('Insufficient funds');
      }

      // Check recipient exists
      const recipient = await tx.player.findUnique({
        where: { userId: dto.toUserId },
        select: { id: true },
      });

      if (!recipient) throw new NotFoundException('Recipient not found');

      // Create transaction record
      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.TRANSFER_OUT,
          currency: dto.currency,
          amount: -dto.amount,
          balanceBefore: senderBalance,
          balanceAfter: senderBalance - dto.amount,
          referenceId: dto.toUserId,
          referenceType: 'PLAYER_TRANSFER',
          description: dto.note || `Transfer to ${dto.toUserId}`,
          metadata: { toUserId: dto.toUserId },
        },
      });

      // Create recipient transaction
      const recipientPlayer = await tx.player.findUnique({
        where: { userId: dto.toUserId },
        select: { gold: true, premiumCurrency: true },
      });

      const recipientBalance = dto.currency === CurrencyType.GOLD ? recipientPlayer.gold : recipientPlayer.premiumCurrency;

      await tx.transaction.create({
        data: {
          userId: dto.toUserId,
          type: TransactionType.TRANSFER_IN,
          currency: dto.currency,
          amount: dto.amount,
          balanceBefore: recipientBalance,
          balanceAfter: recipientBalance + dto.amount,
          referenceId: userId,
          referenceType: 'PLAYER_TRANSFER',
          description: `Transfer from ${userId}`,
          metadata: { fromUserId: userId },
        },
      });

      // Update balances (double-entry: debit sender, credit recipient)
      if (dto.currency === CurrencyType.GOLD) {
        await tx.player.update({
          where: { userId },
          data: { gold: { decrement: dto.amount } },
        });
        await tx.player.update({
          where: { userId: dto.toUserId },
          data: { gold: { increment: dto.amount } },
        });
      } else {
        await tx.player.update({
          where: { userId },
          data: { premiumCurrency: { decrement: dto.amount } },
        });
        await tx.player.update({
          where: { userId: dto.toUserId },
          data: { premiumCurrency: { increment: dto.amount } },
        });
      }

      // Create ledger entries for audit trail
      await this.createLedgerEntries(tx, transaction.id, [
        { account: `player:${userId}:${dto.currency.toLowerCase()}`, debit: dto.amount, credit: 0 },
        { account: `player:${dto.toUserId}:${dto.currency.toLowerCase()}`, debit: 0, credit: dto.amount },
      ]);

      // Invalidate caches
      await this.redis.deleteCache(`player:resources:${userId}`);
      await this.redis.deleteCache(`player:resources:${dto.toUserId}`);

      this.logger.log(`Transfer: ${userId} -> ${dto.toUserId} (${dto.amount} ${dto.currency})`);

      return this.mapToResponse(transaction);
    });
  }

  async earnCurrency(
    userId: string,
    amount: number,
    currency: CurrencyType,
    referenceType: string,
    referenceId: string,
    description?: string,
  ): Promise<TransactionResponseDto> {
    return this.prisma.withTransaction(async (tx) => {
      const player = await tx.player.findUnique({
        where: { userId },
        select: { gold: true, premiumCurrency: true },
      });

      if (!player) throw new NotFoundException('Player not found');

      const balanceBefore = currency === CurrencyType.GOLD ? player.gold : player.premiumCurrency;
      const balanceAfter = balanceBefore + amount;

      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.EARN,
          currency,
          amount,
          balanceBefore,
          balanceAfter,
          referenceId,
          referenceType,
          description: description || `Earned ${amount} ${currency}`,
        },
      });

      if (currency === CurrencyType.GOLD) {
        await tx.player.update({
          where: { userId },
          data: { gold: { increment: amount } },
        });
      } else {
        await tx.player.update({
          where: { userId },
          data: { premiumCurrency: { increment: amount } },
        });
      }

      // Ledger entry
      await this.createLedgerEntries(tx, transaction.id, [
        { account: `player:${userId}:${currency.toLowerCase()}`, debit: 0, credit: amount },
        { account: `system:revenue:${currency.toLowerCase()}`, debit: amount, credit: 0 },
      ]);

      await this.redis.deleteCache(`player:resources:${userId}`);

      return this.mapToResponse(transaction);
    });
  }

  async spendCurrency(
    userId: string,
    amount: number,
    currency: CurrencyType,
    referenceType: string,
    referenceId: string,
    description?: string,
  ): Promise<TransactionResponseDto> {
    return this.prisma.withTransaction(async (tx) => {
      const player = await tx.player.findUnique({
        where: { userId },
        select: { gold: true, premiumCurrency: true },
      });

      if (!player) throw new NotFoundException('Player not found');

      const balanceBefore = currency === CurrencyType.GOLD ? player.gold : player.premiumCurrency;
      if (balanceBefore < amount) {
        throw new BadRequestException('Insufficient funds');
      }

      const balanceAfter = balanceBefore - amount;

      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.SPEND,
          currency,
          amount: -amount,
          balanceBefore,
          balanceAfter,
          referenceId,
          referenceType,
          description: description || `Spent ${amount} ${currency}`,
        },
      });

      if (currency === CurrencyType.GOLD) {
        await tx.player.update({
          where: { userId },
          data: { gold: { decrement: amount } },
        });
      } else {
        await tx.player.update({
          where: { userId },
          data: { premiumCurrency: { decrement: amount } },
        });
      }

      // Ledger entry
      await this.createLedgerEntries(tx, transaction.id, [
        { account: `player:${userId}:${currency.toLowerCase()}`, debit: amount, credit: 0 },
        { account: `system:expense:${currency.toLowerCase()}`, debit: 0, credit: amount },
      ]);

      await this.redis.deleteCache(`player:resources:${userId}`);

      return this.mapToResponse(transaction);
    });
  }

  async getTransactionHistory(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<TransactionResponseDto[]> {
    const transactions = await (this.prisma as any).transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return transactions.map(this.mapToResponse);
  }

  async getLedgerEntries(transactionId: string): Promise<LedgerEntryDto[]> {
    const entries = await (this.prisma as any).ledgerEntry.findMany({
      where: { transactionId },
      orderBy: { id: 'asc' },
    });

    return entries.map((e: any) => ({
      id: e.id,
      transactionId: e.transactionId,
      account: e.account,
      debit: e.debit,
      credit: e.credit,
      balance: e.balance,
    }));
  }

  async getBalance(userId: string): Promise<{ gold: number; premiumCurrency: number }> {
    const cached = await this.redis.getCache<{ gold: number; premiumCurrency: number }>(`player:resources:${userId}`);
    if (cached) return cached;

    const player = await this.prisma.player.findUnique({
      where: { userId },
      select: { gold: true, premiumCurrency: true },
    });

    if (!player) throw new NotFoundException('Player not found');

    const balance = {
      gold: Number(player.gold),
      premiumCurrency: Number(player.premiumCurrency),
    };
    await this.redis.setCache(`player:resources:${userId}`, balance, 60);
    return balance;
  }

  // Daily bonus
  async claimDailyBonus(userId: string): Promise<TransactionResponseDto> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await this.prisma.transaction.findFirst({
      where: {
        userId,
        type: TransactionType.DAILY_BONUS,
        createdAt: { gte: today },
      },
    });

    if (existing) {
      throw new BadRequestException('Daily bonus already claimed today');
    }

    // Streak bonus logic would go here
    const baseAmount = 100;
    const streak = await this.getLoginStreak(userId);
    const bonusAmount = baseAmount + streak * 10;

    return this.earnCurrency(
      userId,
      bonusAmount,
      CurrencyType.GOLD,
      'DAILY_BONUS',
      today.toISOString(),
      `Daily bonus (day ${streak + 1})`,
    );
  }

  private async getLoginStreak(userId: string): Promise<number> {
    // Simplified - in production, track login days
    return 0;
  }

  private async createLedgerEntries(
    tx: any,
    transactionId: string,
    entries: Array<{ account: string; debit: number; credit: number }>,
  ): Promise<void> {
    for (const entry of entries) {
      // Get current account balance
      const lastEntry = await tx.ledgerEntry.findFirst({
        where: { account: entry.account },
        orderBy: { id: 'desc' },
        select: { balance: true },
      });

      const currentBalance = lastEntry?.balance || 0;
      const newBalance = currentBalance + entry.credit - entry.debit;

      await tx.ledgerEntry.create({
        data: {
          transactionId,
          account: entry.account,
          debit: entry.debit,
          credit: entry.credit,
          balance: newBalance,
        },
      });
    }
  }

  private mapToResponse(transaction: any): TransactionResponseDto {
    return {
      id: transaction.id,
      userId: transaction.userId,
      type: transaction.type,
      currency: transaction.currency,
      amount: transaction.amount,
      balanceBefore: transaction.balanceBefore,
      balanceAfter: transaction.balanceAfter,
      referenceId: transaction.referenceId,
      referenceType: transaction.referenceType,
      description: transaction.description,
      metadata: transaction.metadata || {},
      createdAt: transaction.createdAt,
    };
  }
}