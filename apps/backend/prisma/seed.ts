import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const adminEmail = process.env.ADMIN_SEED_EMAIL || 'admin@poker-bots.local';
  const adminPassword = process.env.ADMIN_SEED_PASSWORD || 'Admin123!';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });
  console.log(`Admin created: ${admin.email}`);

  const easyStrategy = await prisma.strategyProfile.upsert({
    where: { name: 'EASY' },
    update: {},
    create: {
      name: 'EASY',
      description: 'Tight strategy for beginners - no bluffing, conservative play',
      difficulty: 'EASY',
      configurationJson: {
        preflopRanges: {
          UTG: 'PREMIUM',
          MP: 'PREMIUM,STRONG',
          CO: 'PREMIUM,STRONG,MEDIUM',
          BTN: 'PREMIUM,STRONG,MEDIUM,SPECULATIVE',
          SB: 'PREMIUM,STRONG',
          BB: 'PREMIUM,STRONG,MEDIUM',
        },
        aggression: 0.2,
        bluffFrequency: 0,
        cbetFrequency: 0.3,
        betSizes: {
          flop: [25, 33, 50],
          turn: [33, 50],
          river: [33, 50],
        },
        maxAllInThreshold: 0.8,
        randomization: 0.1,
        enabledGames: ['NLH'],
      },
      isActive: true,
    },
  });
  console.log(`Strategy created: ${easyStrategy.name}`);

  const mediumStrategy = await prisma.strategyProfile.upsert({
    where: { name: 'MEDIUM' },
    update: {},
    create: {
      name: 'MEDIUM',
      description: 'Intermediate strategy - position-aware, pot odds, limited bluffing',
      difficulty: 'MEDIUM',
      configurationJson: {
        preflopRanges: {
          UTG: 'PREMIUM,STRONG',
          MP: 'PREMIUM,STRONG,MEDIUM',
          CO: 'PREMIUM,STRONG,MEDIUM,SPECULATIVE',
          BTN: 'ALL',
          SB: 'PREMIUM,STRONG,MEDIUM',
          BB: 'PREMIUM,STRONG,MEDIUM,SPECULATIVE',
        },
        aggression: 0.5,
        bluffFrequency: 0.15,
        cbetFrequency: 0.6,
        betSizes: {
          flop: [25, 33, 50, 66, 75],
          turn: [33, 50, 66, 75],
          river: [33, 50, 66, 75, 100],
        },
        maxAllInThreshold: 0.9,
        randomization: 0.2,
        enabledGames: ['NLH'],
      },
      isActive: true,
    },
  });
  console.log(`Strategy created: ${mediumStrategy.name}`);

  const botCredentials = [
    { name: 'Bot Alpha', login: 'bot_alpha' },
    { name: 'Bot Beta', login: 'bot_beta' },
    { name: 'Bot Gamma', login: 'bot_gamma' },
  ];

  for (const cred of botCredentials) {
    const bot = await prisma.bot.upsert({
      where: { login: cred.login },
      update: {},
      create: {
        name: cred.name,
        login: cred.login,
        encryptedPassword: 'ENC_PLACEHOLDER_bot_password_123',
        status: 'OFFLINE',
        isEnabled: true,
        operationMode: 'OBSERVER',
        strategyProfileId: easyStrategy.id,
        defaultBuyIn: 1000,
        minBuyIn: 200,
        maxBuyIn: 5000,
        dailyLossLimit: -5000,
        sessionLossLimit: -2000,
        maxTables: 1,
      },
    });

    await prisma.botLimit.upsert({
      where: { botId: bot.id },
      update: {},
      create: {
        botId: bot.id,
        maxDailyLoss: -5000,
        maxSessionLoss: -2000,
        maxHandsPerSession: 500,
        maxSessionDurationMinutes: 480,
        maxBuyIn: 5000,
        minBalance: 100,
        autoStopEnabled: true,
      },
    });

    console.log(`Bot created: ${cred.name} (${cred.login})`);
  }

  console.log('Seeding completed successfully');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
