const express = require('express');
const cors = require('cors');
const http = require('http'); 
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('./config/db');
const Table = require('./models/Table');
const expenseRoutes = require('./routes/expenseRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const staffRoutes = require('./routes/staffRoutes');
const { authenticate, authorize, optionalAuthenticate } = require('./middleware/authMiddleware');
const path = require('path');
const morgan = require('morgan');
const YAML = require('yamljs');
const swaggerUi = require('swagger-ui-express');
const logger = require('./utils/logger');
const { initCronScheduler, runBirthdayOfferJob, runLowStockCheckJob, runDayEndReconciliationJob } = require('./utils/cronScheduler');
const { simulateIncomingDeliveryOrder, pushOrderStatusToDeliveryPartner } = require('./utils/deliveryApiHelper');

const app = express();
const server = http.createServer(app); 

// Serve static files from public directory & uploads directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:3000,http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

// Socket.io initialize kiya with the same origins as the HTTP API.
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  }
});

app.set('io', io);

// Middleware
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(morgan('combined', { stream: logger.stream }));

// Swagger Documentation UI
try {
  const swaggerDocument = YAML.load(path.join(__dirname, 'docs', 'swagger.yaml'));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (swgErr) {
  logger.warn(`Could not load Swagger documentation: ${swgErr.message}`);
}

app.use('/api', apiLimiter);

app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'restaurant-pos-backend',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Public auth routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/settings', authenticate, authorize('admin', 'manager', 'cashier', 'waiter'), require('./routes/settingsRoutes'));
app.use('/api/branches', authenticate, authorize('admin', 'manager', 'inventory_manager'), require('./routes/branchRoutes'));

// Public integrations must authenticate with their own signed secret, not a staff JWT.
const onlineOrderRoutes = require('./routes/onlineOrderRoutes');
app.post('/api/online-orders/webhook', onlineOrderRoutes.webhookHandler);
app.use('/api/orders/public/qr', require('./routes/publicOrderRoutes'));
app.use('/api/feedback', require('./routes/feedbackRoutes'));

// Protected business routes
app.use('/api/menu', require('./routes/menuRoutes'));
app.use('/api/orders', (req, res, next) => {
  if (req.path.includes('/pdf')) {
    return optionalAuthenticate(req, res, next);
  }
  return authenticate(req, res, () => {
    authorize('admin', 'manager', 'waiter', 'cashier', 'chef', 'delivery')(req, res, next);
  });
});
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/tables', authenticate, authorize('admin', 'manager', 'waiter', 'cashier'));
app.use('/api/tables', require('./routes/tableRoutes'));
app.use('/api/online-orders', authenticate, authorize('admin', 'manager', 'cashier', 'delivery'), onlineOrderRoutes);
app.use('/api/coupons', authenticate, authorize('admin', 'manager', 'cashier', 'waiter'), require('./routes/couponRoutes'));
app.use('/api/ingredients', authenticate, authorize('admin', 'manager', 'inventory_manager'));
app.use('/api/ingredients', require('./routes/ingredientRoutes'));
app.use('/api/customers', authenticate, authorize('admin', 'manager', 'waiter', 'cashier'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/recipes', authenticate, authorize('admin', 'manager', 'inventory_manager'));
app.use('/api/recipes', require('./routes/recipeRoutes'));
app.use('/api/delivery-partners', authenticate, authorize('admin', 'manager', 'delivery'));
app.use('/api/delivery-partners', require('./routes/deliveryRoutes'));
app.use('/api/payments', (req, res, next) => {
  if (req.path.startsWith('/razorpay')) {
    return optionalAuthenticate(req, res, next);
  }
  return authenticate(req, res, () => {
    authorize('admin', 'manager', 'cashier', 'waiter')(req, res, next);
  });
});
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/communications', authenticate, authorize('admin', 'manager', 'cashier'), require('./routes/communicationRoutes'));
app.use('/api/audit-logs', authenticate, authorize('admin', 'manager'));
app.use('/api/audit-logs', require('./routes/auditRoutes'));
app.use('/api/expenses', authenticate, authorize('admin', 'manager', 'inventory_manager', 'cashier'));
app.use('/api/expenses', expenseRoutes);
app.use('/api/day-end', authenticate, authorize('admin', 'manager', 'cashier'), require('./routes/dayEndRoutes'));
app.use('/api/shifts', authenticate, authorize('admin', 'manager', 'cashier'), require('./routes/shiftRoutes'));
app.use('/api/reports', authenticate, authorize('admin', 'manager'), require('./routes/reportRoutes'));
app.use('/api/reservations', authenticate, authorize('admin', 'manager', 'waiter'));
app.use('/api/reservations', reservationRoutes);
app.use('/api/staff', authenticate, authorize('admin', 'manager'));
app.use('/api/staff', staffRoutes);
app.use('/api/purchase-orders', authenticate, authorize('admin', 'manager', 'inventory_manager'));
app.use('/api/purchase-orders', require('./routes/purchaseRoutes'));
app.use('/api/suppliers', authenticate, authorize('admin', 'manager', 'inventory_manager'), require('./routes/supplierRoutes'));
app.use('/api/inventory-batches', authenticate, authorize('admin', 'manager', 'inventory_manager'), require('./routes/batchRoutes'));
app.use('/api/stock-transfers', authenticate, authorize('admin', 'manager', 'inventory_manager'), require('./routes/stockTransferRoutes'));
app.use('/api/stock-adjustments', authenticate, authorize('admin', 'manager', 'inventory_manager'));
app.use('/api/stock-adjustments', require('./routes/stockAdjustmentRoutes'));
app.use('/api/stock-audits', authenticate, authorize('admin', 'manager', 'inventory_manager'));
app.use('/api/stock-audits', require('./routes/stockAuditRoutes'));
app.use('/api/upload', authenticate, require('./routes/uploadRoutes'));
app.use('/api/admin/backups', authenticate, authorize('admin'), require('./routes/backupRoutes'));

// Online Orders Simulator (Zomato / Swiggy demo feed)
app.post('/api/online-orders/simulator/new-order', optionalAuthenticate, async (req, res) => {
  const result = await simulateIncomingDeliveryOrder(req.body || {}, io);
  res.json(result);
});

// Admin triggers for scheduled background jobs
app.post('/api/admin/trigger-birthday-offers', authenticate, authorize('admin', 'manager'), async (req, res) => {
  const result = await runBirthdayOfferJob(io);
  res.json(result);
});

app.post('/api/admin/trigger-low-stock-check', authenticate, authorize('admin', 'manager'), async (req, res) => {
  const result = await runLowStockCheckJob(io);
  res.json(result);
});

app.post('/api/admin/trigger-day-end-audit', authenticate, authorize('admin', 'manager'), async (req, res) => {
  const result = await runDayEndReconciliationJob(io);
  res.json(result);
});

app.post('/api/admin/trigger-database-backup', authenticate, authorize('admin'), async (req, res) => {
  const { runDatabaseBackupJob } = require('./utils/cronScheduler');
  const result = await runDatabaseBackupJob();
  res.json(result);
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'API route not found' });
});

app.use((error, req, res, next) => {
  console.error('Unhandled API error:', error);
  if (res.headersSent) return next(error);
  res.status(error.statusCode || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
  });
});

// 5. Socket connection listener
io.on('connection', (socket) => {
  console.log('A client connected for real-time alerts:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;

const ensureDefaultTables = async () => {
  const defaultTables = [
    { tableNo: 1, tableNumber: 1, capacity: 2, floor: 'Veg Floor', type: 'Cafe', status: 'available' },
    { tableNo: 2, tableNumber: 2, capacity: 4, floor: 'Veg Floor', type: 'Dining', status: 'available' },
    { tableNo: 3, tableNumber: 3, capacity: 4, floor: 'Veg Floor', type: 'Dining', status: 'available' },
    { tableNo: 4, tableNumber: 4, capacity: 6, floor: 'Veg Floor', type: 'Dining', status: 'available' },
    { tableNo: 5, tableNumber: 5, capacity: 4, floor: 'Veg Floor', type: 'Dining', status: 'available' },
    { tableNo: 6, tableNumber: 6, capacity: 4, floor: 'Veg Floor', type: 'Dining', status: 'available' },
    { tableNo: 7, tableNumber: 7, capacity: 4, floor: 'Veg Floor', type: 'Dining', status: 'available' },
    { tableNo: 8, tableNumber: 8, capacity: 6, floor: 'Veg Floor', type: 'Dining', status: 'available' },
    { tableNo: 9, tableNumber: 9, capacity: 6, floor: 'Veg Floor', type: 'Dining', status: 'available' },
    { tableNo: 101, tableNumber: 101, capacity: 12, floor: 'Birthday Party Zone', type: 'Party Hall', status: 'available' },
    { tableNo: 102, tableNumber: 102, capacity: 20, floor: 'Birthday Party Zone', type: 'Birthday Zone', status: 'available' }
  ];

  const existingTables = await Table.find({}, 'tableNo');
  const existingNumbers = new Set(existingTables.map((table) => Number(table.tableNo)));
  const missingTables = defaultTables.filter((table) => !existingNumbers.has(Number(table.tableNo)));

  if (missingTables.length === 0) return;

  await Table.insertMany(missingTables);
  console.log(`Seeded ${missingTables.length} missing default tables.`);
};

const startServer = async () => {
  await connectDB();
  await ensureDefaultTables();
  // Older orders may have been created with invoiceNumber: ''. An empty
  // string is still indexed by MongoDB and blocks every subsequent KOT.
  await mongoose.connection.collection('orders').updateMany(
    { invoiceNumber: '' },
    { $unset: { invoiceNumber: '' } }
  );
  initCronScheduler(io);
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    console.log(`Server running on port ${PORT}`);
    console.log(`Swagger API Docs available at http://localhost:${PORT}/api/docs`);
  });
};

let isShuttingDown = false;
const shutdown = async (signal) => {
  if (isShuttingDown) {
    console.log('Force exiting immediately...');
    process.exit(0);
  }
  isShuttingDown = true;
  console.log(`${signal} received. Shutting down server...`);

  const forceExitTimer = setTimeout(() => {
    process.exit(0);
  }, 1000);
  forceExitTimer.unref();

  try {
    if (io) {
      io.disconnectSockets(true);
      io.close();
    }
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    server.close(async () => {
      try {
        await mongoose.connection.close();
      } catch (err) {}
      process.exit(0);
    });
  } catch (err) {
    process.exit(0);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

if (require.main === module) {
  startServer().catch((error) => {
    console.error(`Server startup failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { app, server, startServer };