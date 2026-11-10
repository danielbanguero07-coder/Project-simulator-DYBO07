import { PrismaClient, UserRole, AuthProvider, ClanRole, FriendStatus, BuildingStatus, CurrencyType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create default world
  const world = await prisma.world.upsert({
    where: { id: 'world-main' },
    update: {},
    create: {
      id: 'world-main',
      name: 'Main World',
      description: 'The primary game world',
      status: 'ACTIVE',
      maxPlayers: 5000,
    },
  });
  console.log(`✅ World created: ${world.name}`);

  // Create default resources for world
  const resources = [
    { type: 'gold', amount: 1000000, rate: 100, capacity: 10000000 },
    { type: 'wood', amount: 500000, rate: 50, capacity: 5000000 },
    { type: 'stone', amount: 300000, rate: 30, capacity: 3000000 },
    { type: 'food', amount: 200000, rate: 40, capacity: 2000000 },
  ];

  for (const res of resources) {
    await prisma.resource.upsert({
      where: { worldId_type: { worldId: world.id, type: res.type } },
      update: {},
      create: {
        worldId: world.id,
        type: res.type,
        amount: res.amount,
        rate: res.rate,
        capacity: res.capacity,
      },
    });
  }
  console.log('✅ World resources initialized');

  // Create admin user
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@simulator.com' },
    update: {},
    create: {
      email: 'admin@simulator.com',
      username: 'admin',
      passwordHash: adminPasswordHash,
      roles: [UserRole.ADMIN, UserRole.DEVELOPER],
      isActive: true,
      isEmailVerified: true,
      displayName: 'Admin Pilot',
    },
  });

  // Create player for admin
  await prisma.player.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: {
      userId: adminUser.id,
      displayName: 'Admin Pilot',
      level: 10,
      gold: BigInt(100000),
      premiumCurrency: BigInt(1000),
    },
  });
  console.log(`✅ Admin user created: ${adminUser.username}`);

  // Create test players
  const testUsers = [
    { email: 'player1@test.com', username: 'player1', displayName: 'Player One', level: 1, gold: 1000, premiumCurrency: 500 },
    { email: 'player2@test.com', username: 'player2', displayName: 'Player Two', level: 2, gold: 2000, premiumCurrency: 750 },
    { email: 'player3@test.com', username: 'player3', displayName: 'Player Three', level: 3, gold: 3000, premiumCurrency: 1000 },
  ];

  for (const userData of testUsers) {
    const password = await bcrypt.hash('password123', 10);
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        email: userData.email,
        username: userData.username,
        passwordHash: password,
        roles: [UserRole.PLAYER],
        isActive: true,
        isEmailVerified: true,
        displayName: userData.displayName,
        authProvider: AuthProvider.LOCAL,
      },
    });

    await prisma.player.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        displayName: userData.displayName,
        level: userData.level,
        gold: BigInt(userData.gold),
        premiumCurrency: BigInt(userData.premiumCurrency),
      },
    });
    console.log(`✅ Test user created: ${userData.username}`);
  }

  // Create item templates
  const itemTemplates = [
    { id: 'wood', name: 'Wood', type: 'resource', rarity: 'common', maxStack: 999, sellPrice: 1, buyPrice: 2 },
    { id: 'stone', name: 'Stone', type: 'resource', rarity: 'common', maxStack: 999, sellPrice: 2, buyPrice: 4 },
    { id: 'gold_bars', name: 'Gold Bars', type: 'resource', rarity: 'rare', maxStack: 100, sellPrice: 100, buyPrice: 200 },
    { id: 'health_potion', name: 'Health Potion', type: 'consumable', rarity: 'common', maxStack: 20, sellPrice: 10, buyPrice: 50 },
  ];

  for (const item of itemTemplates) {
    await prisma.itemTemplate.upsert({
      where: { id: item.id },
      update: {},
      create: item,
    });
  }
  console.log('✅ Item templates initialized');

  // Create a test clan
  const player1 = await prisma.user.findUnique({ where: { username: 'player1' } });
  if (player1) {
    const clan = await prisma.clan.upsert({
      where: { name: 'Test Clan' },
      update: {},
      create: {
        name: 'Test Clan',
        tag: 'TEST',
        description: 'A test clan for development',
        isPublic: true,
        leaderId: player1.id,
        maxMembers: 50,
      },
    });

    await prisma.clanMember.upsert({
      where: { userId: player1.id },
      update: {},
      create: {
        clanId: clan.id,
        userId: player1.id,
        role: ClanRole.LEADER,
      },
    });

    await prisma.player.update({
      where: { userId: player1.id },
      data: { clanId: clan.id },
    });
    console.log(`✅ Test clan created: ${clan.name} [${clan.tag}]`);
  }

  // Create sample buildings for player1
  const player1Id = player1?.id;
  if (player1Id) {
    await prisma.building.create({
      data: {
        worldId: world.id,
        playerId: player1Id,
        templateId: 'farm_1',
        level: 1,
        positionX: 10,
        positionY: 15,
        status: BuildingStatus.IDLE,
        progress: 1.0,
        storedResources: { wood: 100, food: 50 },
      },
    });
    console.log(`✅ Sample building created for player1`);
  }

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });