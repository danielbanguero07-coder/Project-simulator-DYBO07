import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, MaxLength, IsInt, Min, Max, IsEnum } from 'class-validator';

export class UpdatePlayerDto {
  @ApiProperty({ example: 'PlayerOne', required: false, minLength: 2, maxLength: 30 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  displayName?: string;

  @ApiProperty({ example: 'https://example.com/avatar.png', required: false })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiProperty({ example: 'Welcome to my profile!', required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;
}

export class PlayerResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  avatarUrl: string | null;

  @ApiProperty()
  bio: string | null;

  @ApiProperty()
  level: number;

  @ApiProperty()
  experience: number;

  @ApiProperty()
  experienceToNextLevel: number;

  @ApiProperty()
  gold: number;

  @ApiProperty()
  premiumCurrency: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PlayerStatsDto {
  @ApiProperty()
  totalPlayTime: number;

  @ApiProperty()
  buildingsBuilt: number;

  @ApiProperty()
  resourcesCollected: number;

  @ApiProperty()
  tradesCompleted: number;

  @ApiProperty()
  clanId: string | null;

  @ApiProperty()
  rank: number | null;
}