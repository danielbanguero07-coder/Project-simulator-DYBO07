"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../node_modules/.prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
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
            roles: ['ADMIN', 'DEVELOPER'],
            isActive: true,
            isEmailVerified: true,
        },
    });
    console.log(`✅ Admin user created: ${adminUser.username}`);
    // Create player for admin
    const adminPlayer = await prisma.player.upsert({
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
    console.log(`✅ Admin player profile created: ${adminPlayer.displayName}`);
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
    console.log('✨ Seed completed successfully!');
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
//# sourceMappingURL=seed.js.map