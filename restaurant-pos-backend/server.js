const express = require('express');
const cors = require('cors');
const http = require('http'); 
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('./config/db');
const expenseRoutes = require('./routes/expenseRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const staffRoutes = require('./routes/staffRoutes');
const { authenticate, authorize } = require('./middleware/authMiddleware');

const app = express();
const server = http.createServer(app); 

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
app.use('/api/orders', authenticate, authorize('admin', 'manager', 'waiter', 'cashier', 'chef', 'delivery'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/tables', authenticate, authorize('admin', 'manager', 'waiter', 'cashier'));
app.use('/api/tables', require('./routes/tableRoutes'));
app.use('/api/online-orders', authenticate, authorize('admin', 'manager', 'delivery'), onlineOrderRoutes);
app.use('/api/coupons', authenticate, authorize('admin', 'manager'));
app.use('/api/coupons', require('./routes/couponRoutes'));
app.use('/api/ingredients', authenticate, authorize('admin', 'manager', 'inventory_manager'));
app.use('/api/ingredients', require('./routes/ingredientRoutes'));
app.use('/api/customers', authenticate, authorize('admin', 'manager', 'waiter', 'cashier'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/recipes', authenticate, authorize('admin', 'manager', 'inventory_manager'));
app.use('/api/recipes', require('./routes/recipeRoutes'));
app.use('/api/delivery-partners', authenticate, authorize('admin', 'manager', 'delivery'));
app.use('/api/delivery-partners', require('./routes/deliveryRoutes'));
app.use('/api/payments', authenticate, authorize('admin', 'manager', 'cashier'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/communications', authenticate, authorize('admin', 'manager', 'cashier'), require('./routes/communicationRoutes'));
app.use('/api/audit-logs', authenticate, authorize('admin', 'manager'));
app.use('/api/audit-logs', require('./routes/auditRoutes'));
app.use('/api/expenses', authenticate, authorize('admin', 'manager'));
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

const startServer = async () => {
  await connectDB();
  // Older orders may have been created with invoiceNumber: ''. An empty
  // string is still indexed by MongoDB and blocks every subsequent KOT.
  await mongoose.connection.collection('orders').updateMany(
    { invoiceNumber: '' },
    { $unset: { invoiceNumber: '' } }
  );
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down server...`);
  server.close(async () => {
    await mongoose.connection.close();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer().catch((error) => {
  console.error(`Server startup failed: ${error.message}`);
  process.exit(1);
});