import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsEnum, IsOptional, Min, IsUUID } from 'class-validator';

export enum TransactionType {
  EARN = 'EARN',
  SPEND = 'SPEND',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  REWARD = 'REWARD',
  PURCHASE = 'PURCHASE',
  SALE = 'SALE',
  REFUND = 'REFUND',
  DAILY_BONUS = 'DAILY_BONUS',
  QUEST_REWARD = 'QUEST_REWARD',
}

export enum CurrencyType {
  GOLD = 'GOLD',
  PREMIUM = 'PREMIUM',
  EVENT = 'EVENT',
}

export class TransferCurrencyDto {
  @ApiProperty()
  @IsUUID()
  toUserId: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ enum: CurrencyType })
  @IsEnum(CurrencyType)
  currency: CurrencyType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}

export class PurchaseDto {
  @ApiProperty()
  @IsString()
  itemId: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ enum: CurrencyType })
  @IsEnum(CurrencyType)
  currency: CurrencyType;
}

export class TransactionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({ enum: TransactionType })
  type: TransactionType;

  @ApiProperty({ enum: CurrencyType })
  currency: CurrencyType;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  balanceBefore: number;

  @ApiProperty()
  balanceAfter: number;

  @ApiProperty()
  referenceId: string | null;

  @ApiProperty()
  referenceType: string | null;

  @ApiProperty()
  description: string | null;

  @ApiProperty()
  metadata: Record<string, any>;

  @ApiProperty()
  createdAt: Date;
}

export class LedgerEntryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  transactionId: string;

  @ApiProperty()
  account: string;

  @ApiProperty()
  debit: number;

  @ApiProperty()
  credit: number;

  @ApiProperty()
  balance: number;
}