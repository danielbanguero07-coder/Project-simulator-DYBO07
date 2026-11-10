import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, Max, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum ActionType {
  BUILD = 'BUILD',
  UPGRADE = 'UPGRADE',
  DEMOLISH = 'DEMOLISH',
  COLLECT = 'COLLECT',
  MOVE = 'MOVE',
  ATTACK = 'ATTACK',
  TRADE = 'TRADE',
  RESEARCH = 'RESEARCH',
  TRAIN = 'TRAIN',
}

export class PositionDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  x: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  y: number;
}

export class GameActionDto {
  @ApiProperty({ enum: ActionType })
  @IsEnum(ActionType)
  type: ActionType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  buildingId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  itemId?: string;

  @ApiProperty()
  @IsNumber()
  clientTick: number;
}

export class GameActionBatchDto {
  @ApiProperty({ type: [GameActionDto] })
  @ValidateNested({ each: true })
  @Type(() => GameActionDto)
  actions: GameActionDto[];

  @ApiProperty()
  @IsNumber()
  clientTick: number;
}

export class BuildingStateDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  templateId: string;

  @ApiProperty()
  level: number;

  @ApiProperty()
  position: PositionDto;

  @ApiProperty()
  status: string;

  @ApiProperty()
  progress: number;

  @ApiProperty()
  productionEndAt: Date | null;

  @ApiProperty()
  storedResources: Record<string, number>;
}

export class ResourceStateDto {
  @ApiProperty()
  type: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  rate: number;

  @ApiProperty()
  capacity: number;
}

export class GameStateDeltaDto {
  @ApiProperty()
  tick: number;

  @ApiProperty({ type: [BuildingStateDto] })
  buildings: BuildingStateDto[];

  @ApiProperty({ type: [ResourceStateDto] })
  resources: ResourceStateDto[];

  @ApiProperty()
  playerStats: {
    gold: number;
    experience: number;
    level: number;
  };

  @ApiProperty()
  timestamp: number;
}

export class WorldStateDto {
  @ApiProperty()
  worldId: string;

  @ApiProperty()
  tick: number;

  @ApiProperty({ type: [BuildingStateDto] })
  buildings: BuildingStateDto[];

  @ApiProperty({ type: [ResourceStateDto] })
  resources: ResourceStateDto[];

  @ApiProperty()
  players: Array<{
    userId: string;
    username: string;
    position: PositionDto;
  }>;
}