import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, MinLength, MaxLength, IsUUID } from 'class-validator';

export enum ClanRole {
  LEADER = 'LEADER',
  OFFICER = 'OFFICER',
  MEMBER = 'MEMBER',
}

export enum ClanInviteStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export class CreateClanDto {
  @ApiProperty({ example: 'Dragon Slayers', minLength: 3, maxLength: 30 })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  name: string;

  @ApiProperty({ example: 'DS', minLength: 2, maxLength: 5 })
  @IsString()
  @MinLength(2)
  @MaxLength(5)
  tag: string;

  @ApiProperty({ example: 'We slay dragons!', required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  isPublic?: boolean;
}

export class UpdateClanDto {
  @ApiProperty({ required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  isPublic?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bannerUrl?: string;
}

export class ClanInviteDto {
  @ApiProperty()
  @IsUUID()
  targetUserId: string;
}

export class ClanResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  tag: string;

  @ApiProperty()
  description: string | null;

  @ApiProperty()
  isPublic: boolean;

  @ApiProperty()
  bannerUrl: string | null;

  @ApiProperty()
  level: number;

  @ApiProperty()
  experience: number;

  @ApiProperty()
  memberCount: number;

  @ApiProperty()
  maxMembers: number;

  @ApiProperty()
  createdAt: Date;
}

export class ClanMemberDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty({ enum: ClanRole })
  role: ClanRole;

  @ApiProperty()
  joinedAt: Date;

  @ApiProperty()
  contribution: number;
}

export class FriendRequestDto {
  @ApiProperty()
  @IsUUID()
  targetUserId: string;
}

export class FriendResponseDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty()
  avatarUrl: string | null;

  @ApiProperty()
  isOnline: boolean;

  @ApiProperty()
  lastSeen: Date | null;
}