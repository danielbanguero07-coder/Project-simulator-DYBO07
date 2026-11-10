import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum WSClientEvent {
  JOIN_WORLD = 'join_world',
  LEAVE_WORLD = 'leave_world',
  ACTION = 'action',
  ACTION_BATCH = 'action_batch',
  PING = 'ping',
  SYNC_REQUEST = 'sync_request',
  CHAT_MESSAGE = 'chat_message',
}

export enum WSServerEvent {
  WELCOME = 'welcome',
  STATE_DELTA = 'state_delta',
  WORLD_STATE = 'world_state',
  ACTION_ACK = 'action_ack',
  ACTION_REJECTED = 'action_rejected',
  PLAYER_JOINED = 'player_joined',
  PLAYER_LEFT = 'player_left',
  CHAT_MESSAGE = 'chat_message',
  NOTIFICATION = 'notification',
  ERROR = 'error',
  PONG = 'pong',
  SYNC_RESPONSE = 'sync_response',
  RECONNECT = 'reconnect',
}

export class JoinWorldPayloadDto {
  @ApiProperty()
  @IsString()
  worldId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sessionToken?: string;
}

export class ActionPayloadDto {
  @ApiProperty()
  @IsString()
  actionId: string;

  @ApiProperty({ enum: WSClientEvent })
  @IsEnum(WSClientEvent)
  type: WSClientEvent;

  @ApiProperty()
  @IsNumber()
  clientTick: number;

  @ApiProperty({ required: false })
  @IsOptional()
  data: any;
}

export class ActionAckPayloadDto {
  @ApiProperty()
  actionId: string;

  @ApiProperty()
  serverTick: number;

  @ApiProperty()
  success: boolean;

  @ApiProperty({ required: false })
  error?: string;
}

export class StateDeltaPayloadDto {
  @ApiProperty()
  tick: number;

  @ApiProperty()
  buildings: any[];

  @ApiProperty()
  resources: any[];

  @ApiProperty()
  players: any[];

  @ApiProperty()
  timestamp: number;
}

export class ChatMessagePayloadDto {
  @ApiProperty()
  @IsString()
  channel: string;

  @ApiProperty()
  @IsString()
  message: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  targetUserId?: string;
}

export class NotificationPayloadDto {
  @ApiProperty()
  @IsString()
  type: 'info' | 'warning' | 'error' | 'success' | 'achievement';

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  message: string;

  @ApiProperty({ required: false })
  @IsOptional()
  data?: any;
}