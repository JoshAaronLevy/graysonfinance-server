import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create or find test user
  const testUser = await prisma.user.upsert({
    where: {
      authId: 'test_user_auth_id_123',
    },
    update: {
      email: 'test@graysonfinance.com',
    },
    create: {
      authId: 'test_user_auth_id_123',
      email: 'test@graysonfinance.com',
    },
  });

  console.log('✅ Created test user:', testUser.id);

  // Create sample income sources
  const incomeSource1 = await prisma.incomeSource.create({
    data: {
      userId: testUser.id,
      sourceName: 'Salary - Software Developer',
      amount: 7500.00,
      frequency: 'MONTHLY',
      notes: 'Full-time salary from tech company',
    },
  });

  const incomeSource2 = await prisma.incomeSource.create({
    data: {
      userId: testUser.id,
      sourceName: 'Freelance Projects',
      amount: 1200.00,
      frequency: 'MONTHLY',
      notes: 'Side projects and consulting',
    },
  });

  console.log('✅ Created income sources:', incomeSource1.id, incomeSource2.id);

  // Create sample debt sources
  const debtSource1 = await prisma.debtSource.create({
    data: {
      userId: testUser.id,
      sourceName: 'Credit Card - Chase',
      amount: 3500.00,
      frequency: 'MONTHLY',
      interestRate: 18.99,
      minPayment: 150.00,
      notes: 'High interest credit card debt',
    },
  });

  const debtSource2 = await prisma.debtSource.create({
    data: {
      userId: testUser.id,
      sourceName: 'Student Loan',
      amount: 25000.00,
      frequency: 'MONTHLY',
      interestRate: 4.5,
      minPayment: 280.00,
      notes: 'Federal student loan',
    },
  });

  console.log('✅ Created debt sources:', debtSource1.id, debtSource2.id);

  // Create sample expense sources
  const expenseSource1 = await prisma.expenseSource.create({
    data: {
      userId: testUser.id,
      sourceName: 'Rent',
      amount: 2200.00,
      frequency: 'MONTHLY',
      notes: '2-bedroom apartment in downtown',
    },
  });

  const expenseSource2 = await prisma.expenseSource.create({
    data: {
      userId: testUser.id,
      sourceName: 'Groceries',
      amount: 600.00,
      frequency: 'MONTHLY',
      notes: 'Food and household items',
    },
  });

  const expenseSource3 = await prisma.expenseSource.create({
    data: {
      userId: testUser.id,
      sourceName: 'Car Insurance',
      amount: 150.00,
      frequency: 'MONTHLY',
      notes: 'Full coverage auto insurance',
    },
  });

  console.log('✅ Created expense sources:', expenseSource1.id, expenseSource2.id, expenseSource3.id);

  // Create sample savings sources
  const savingsSource1 = await prisma.savingsSource.create({
    data: {
      userId: testUser.id,
      sourceName: 'Emergency Fund',
      amount: 10000.00,
      frequency: 'MONTHLY',
      notes: '6 months of expenses saved',
    },
  });

  const savingsSource2 = await prisma.savingsSource.create({
    data: {
      userId: testUser.id,
      sourceName: '401k Contribution',
      amount: 800.00,
      frequency: 'MONTHLY',
      notes: 'Employer match retirement savings',
    },
  });

  console.log('✅ Created savings sources:', savingsSource1.id, savingsSource2.id);

  // Create sample conversations and messages
  const conversation1 = await prisma.conversation.create({
    data: {
      userId: testUser.id,
      chatType: 'INCOME',
      conversationId: 'conv_income_123',
    },
  });

  const message1_user = await prisma.message.create({
    data: {
      conversationId: conversation1.id,
      sender: 'USER',
      content: 'How can I increase my monthly income?',
    },
  });

  const message1_bot = await prisma.message.create({
    data: {
      conversationId: conversation1.id,
      sender: 'BOT',
      content: 'Here are some strategies to increase your monthly income: 1) Ask for a raise at your current job, 2) Take on freelance work in your spare time, 3) Develop new skills that are in high demand, 4) Consider a side business or passive income streams.',
    },
  });

  const conversation2 = await prisma.conversation.create({
    data: {
      userId: testUser.id,
      chatType: 'DEBT',
      conversationId: 'conv_debt_456',
    },
  });

  const message2_user = await prisma.message.create({
    data: {
      conversationId: conversation2.id,
      sender: 'USER',
      content: 'What is the best strategy to pay off my credit card debt?',
    },
  });

  const message2_bot = await prisma.message.create({
    data: {
      conversationId: conversation2.id,
      sender: 'BOT',
      content: 'For credit card debt, I recommend the avalanche method: pay minimum payments on all cards, then put any extra money toward the card with the highest interest rate. This will save you the most money in interest over time.',
    },
  });

  const conversation3 = await prisma.conversation.create({
    data: {
      userId: testUser.id,
      chatType: 'OPEN_CHAT',
      conversationId: 'conv_general_789',
    },
  });

  const message3_user = await prisma.message.create({
    data: {
      conversationId: conversation3.id,
      sender: 'USER',
      content: 'Can you help me create a budget?',
    },
  });

  const message3_bot = await prisma.message.create({
    data: {
      conversationId: conversation3.id,
      sender: 'BOT',
      content: 'Absolutely! Based on your financial data, I can help you create a comprehensive budget. Let\'s start with the 50/30/20 rule: 50% for needs, 30% for wants, and 20% for savings and debt repayment.',
    },
  });

  console.log('✅ Created conversations:', conversation1.id, conversation2.id, conversation3.id);
  console.log('✅ Created messages:', message1_user.id, message1_bot.id, message2_user.id, message2_bot.id, message3_user.id, message3_bot.id);

  console.log('🎉 Database seed completed successfully!');
  
  // Print summary
  console.log('\n📊 Seed Summary:');
  console.log(`User: ${testUser.email} (ID: ${testUser.id})`);
  console.log(`Income Sources: 2`);
  console.log(`Debt Sources: 2`);
  console.log(`Expense Sources: 3`);
  console.log(`Savings Sources: 2`);
  console.log(`Conversations: 3`);
  console.log(`Messages: 6`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });