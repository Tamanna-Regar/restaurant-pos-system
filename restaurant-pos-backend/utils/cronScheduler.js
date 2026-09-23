const cron = require('node-cron');
const Customer = require('../models/Customer');
const Ingredient = require('../models/Ingredient');
const Order = require('../models/Order');
const { sendLowStockAlertEmail } = require('./emailHelper');
const { sendWhatsAppBill } = require('./whatsappHelper');
const { queueCommunication } = require('./communicationHelper');

/**
 * 1. Birthday Offer Job:
 * Checks for customers having their birthday today and hasn't received an offer this year yet.
 * Awards bonus loyalty points and queues WhatsApp/SMS birthday greetings.
 */
const runBirthdayOfferJob = async (io = null) => {
  try {
    const today = new Date();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentDay = today.getDate(); // 1-31
    const currentYear = today.getFullYear();

    console.log(`[Cron: Birthday Job] Checking birthday offers for ${currentDay}/${currentMonth}/${currentYear}...`);

    // Find all customers with dateOfBirth set
    const customers = await Customer.find({ 
      dateOfBirth: { $ne: null },
      $or: [
        { lastBirthdayOfferYear: { $exists: false } },
        { lastBirthdayOfferYear: null },
        { lastBirthdayOfferYear: { $ne: currentYear } }
      ]
    });

    let countAwarded = 0;

    for (const customer of customers) {
      const dob = new Date(customer.dateOfBirth);
      if (dob.getMonth() + 1 === currentMonth && dob.getDate() === currentDay) {
        // Match found!
        const bonusPoints = 100;
        customer.loyaltyPoints = (customer.loyaltyPoints || 0) + bonusPoints;
        customer.lastBirthdayOfferYear = currentYear;
        await customer.save();

        const greetingMessage = `🎂 Happy Birthday ${customer.name || 'Valued Guest'}! Tamanna Restaurant wishes you a wonderful year ahead. We've credited ${bonusPoints} loyalty points to your account. Enjoy a complimentary dessert on your next visit! 🌱`;

        // Queue communication
        if (customer.phone) {
          await queueCommunication({
            channel: 'whatsapp',
            purpose: 'birthday_offer',
            phone: customer.phone,
            customerName: customer.name,
            message: greetingMessage
          });
        }

        countAwarded++;
      }
    }

    console.log(`[Cron: Birthday Job Completed] Successfully sent ${countAwarded} birthday greetings & bonuses.`);
    return { success: true, count: countAwarded };
  } catch (error) {
    console.error('[Cron: Birthday Job Error]:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * 2. Low Stock Inventory Alert Job:
 * Checks all kitchen ingredients; sends email to admin & emits live socket alerts.
 */
const runLowStockCheckJob = async (io = null) => {
  try {
    console.log('[Cron: Low Stock Job] Inspecting ingredient inventory levels...');

    const lowStockIngredients = await Ingredient.find({
      $expr: { $lte: ['$currentStock', '$minStockAlert'] }
    }).select('name unit currentStock minStockAlert');

    if (lowStockIngredients.length > 0) {
      console.warn(`[Cron: Low Stock Warning] Found ${lowStockIngredients.length} low-stock ingredients!`);

      // Socket.io real-time alert
      if (io) {
        io.emit('inventory-low-stock-alert', {
          count: lowStockIngredients.length,
          items: lowStockIngredients
        });
      }

      // Send email alert to admin/manager
      const alertEmail = process.env.ALERT_EMAIL || process.env.EMAIL_USER;
      if (alertEmail) {
        await sendLowStockAlertEmail(alertEmail, lowStockIngredients);
      }
    } else {
      console.log('[Cron: Low Stock Job] All inventory levels are healthy.');
    }

    return { success: true, count: lowStockIngredients.length, items: lowStockIngredients };
  } catch (error) {
    console.error('[Cron: Low Stock Job Error]:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * 3. Day-End Shift & Order Reconciliation Reminder Job:
 * Checks for any active un-closed orders before midnight and logs summary.
 */
const runDayEndReconciliationJob = async (io = null) => {
  try {
    console.log('[Cron: Day-End Job] Checking un-closed orders and day-end audit...');

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const openOrders = await Order.countDocuments({
      status: { $in: ['running', 'placed', 'preparing', 'ready', 'served'] }
    });

    const settledToday = await Order.find({
      status: 'settled',
      createdAt: { $gte: startOfDay }
    }).select('grandTotal');

    const totalSalesToday = settledToday.reduce((sum, o) => sum + (o.grandTotal || 0), 0);

    console.log(`[Cron: Day-End Report] Open Orders Remaining: ${openOrders}, Settled Today: ${settledToday.length}, Total Revenue: ₹${totalSalesToday.toFixed(2)}`);

    if (io) {
      io.emit('day-end-summary', {
        openOrders,
        settledCount: settledToday.length,
        totalSales: totalSalesToday
      });
    }

    return { success: true, openOrders, settledCount: settledToday.length, totalSalesToday };
  } catch (error) {
    console.error('[Cron: Day-End Job Error]:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * 4. Automated Database Backup Job:
 * Dumps all collections to timestamped JSON backup file.
 */
const runDatabaseBackupJob = async () => {
  try {
    console.log('[Cron: Database Backup] Initiating automated nightly MongoDB backup...');
    const { createDatabaseBackup } = require('./databaseBackup');
    const result = await createDatabaseBackup('cron_automated');
    return result;
  } catch (error) {
    console.error('[Cron: Database Backup Error]:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Initializes all node-cron scheduled jobs
 */
const initCronScheduler = (io = null) => {
  console.log('[Scheduler] Initializing automated background cron tasks...');

  // 1. Birthday offers: Daily at 09:00 AM (0 9 * * *)
  cron.schedule('0 9 * * *', async () => {
    console.log('[Cron Triggered] Daily 9:00 AM Birthday Offer Scan');
    await runBirthdayOfferJob(io);
  });

  // 2. Low stock alert: Daily at 11:00 AM (0 11 * * *)
  cron.schedule('0 11 * * *', async () => {
    console.log('[Cron Triggered] Daily 11:00 AM Inventory Stock Check');
    await runLowStockCheckJob(io);
  });

  // 3. Day-end reconciliation reminder: Every night at 11:30 PM (30 23 * * *)
  cron.schedule('30 23 * * *', async () => {
    console.log('[Cron Triggered] Daily 11:30 PM Day-End Audit');
    await runDayEndReconciliationJob(io);
  });

  // 4. Nightly database backup: Every night at 02:00 AM (0 2 * * *)
  cron.schedule('0 2 * * *', async () => {
    console.log('[Cron Triggered] Daily 2:00 AM Database Backup');
    await runDatabaseBackupJob();
  });

  console.log('[Scheduler] Scheduled tasks registered:');
  console.log('  - 🎂 Birthday Greetings & Loyalty Bonus: Daily @ 09:00 AM');
  console.log('  - 📦 Kitchen Inventory Low Stock Alert: Daily @ 11:00 AM');
  console.log('  - 🌙 Day-End Shift & Order Audit: Daily @ 11:30 PM');
  console.log('  - 💾 Automated Database Backup: Daily @ 02:00 AM');
};

module.exports = {
  initCronScheduler,
  runBirthdayOfferJob,
  runLowStockCheckJob,
  runDayEndReconciliationJob,
  runDatabaseBackupJob
};

