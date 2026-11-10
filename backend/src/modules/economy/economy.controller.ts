import { Controller, Get, Post, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';

import { EconomyService } from './economy.service';
import { TransferCurrencyDto, PurchaseDto, TransactionResponseDto, LedgerEntryDto, CurrencyType } from './dto/economy.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { UserPayload } from '../auth/interfaces/user-payload.interface';

@ApiTags('Economy')
@Controller('economy')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiCookieAuth('access-token')
export class EconomyController {
  constructor(private economyService: EconomyService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Get current currency balances' })
  @ApiResponse({ status: 200, description: 'Gold and premium currency balances' })
  async getBalance(@CurrentUser('userId') userId: string) {
    return this.economyService.getBalance(userId);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transfer currency to another player' })
  @ApiResponse({ status: 200, type: TransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Insufficient funds or invalid recipient' })
  async transferCurrency(
    @CurrentUser('userId') userId: string,
    @Body() dto: TransferCurrencyDto,
  ): Promise<TransactionResponseDto> {
    return this.economyService.transferCurrency(userId, dto);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get transaction history' })
  @ApiResponse({ status: 200, type: [TransactionResponseDto] })
  async getTransactions(
    @CurrentUser('userId') userId: string,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ): Promise<TransactionResponseDto[]> {
    return this.economyService.getTransactionHistory(userId, limit, offset);
  }

  @Get('transactions/:id/ledger')
  @ApiOperation({ summary: 'Get ledger entries for a transaction (audit trail)' })
  @ApiResponse({ status: 200, type: [LedgerEntryDto] })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getLedgerEntries(@Param('id') transactionId: string): Promise<LedgerEntryDto[]> {
    return this.economyService.getLedgerEntries(transactionId);
  }

  @Post('daily-bonus')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim daily login bonus' })
  @ApiResponse({ status: 200, type: TransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Already claimed today' })
  async claimDailyBonus(@CurrentUser('userId') userId: string): Promise<TransactionResponseDto> {
    return this.economyService.claimDailyBonus(userId);
  }

  // Admin endpoints for economy management
  @Post('admin/grant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grant currency to player (admin)' })
  @ApiResponse({ status: 200, type: TransactionResponseDto })
  async adminGrant(
    @Body('userId') targetUserId: string,
    @Body('amount') amount: number,
    @Body('currency') currency: CurrencyType,
    @Body('reason') reason: string,
  ): Promise<TransactionResponseDto> {
    // In production, add @Roles('ADMIN') guard
    return this.economyService.earnCurrency(targetUserId, amount, currency, 'ADMIN_GRANT', 'admin', reason);
  }
}