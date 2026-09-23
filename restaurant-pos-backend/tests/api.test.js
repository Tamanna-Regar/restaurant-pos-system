const request = require('supertest');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { app } = require('../server');
const { generateInvoicePDFBuffer } = require('../utils/pdfInvoiceGenerator');
const { generateSalesExcelReport, generateInventoryExcelReport } = require('../utils/excelExportHelper');
const { generateOTP, verifyOTP } = require('../utils/smsHelper');
const { runBirthdayOfferJob, runLowStockCheckJob, runDayEndReconciliationJob } = require('../utils/cronScheduler');

describe('Tamanna Restaurant POS - Automated Test Suite', () => {

  beforeAll(async () => {
    await connectDB();
  }, 20000);

  afterAll(async () => {
    try {
      await mongoose.connection.close();
    } catch (err) {}
  });

  // 1. Healthcheck & Swagger
  describe('System & Documentation Endpoints', () => {
    it('GET /health should return 200 OK and service metadata', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.service).toBe('restaurant-pos-backend');
    });

    it('GET /api/docs/ should serve Swagger documentation UI', async () => {
      const res = await request(app).get('/api/docs/');
      expect([200, 301, 302]).toContain(res.statusCode);
    });
  });

  // 2. Authentication & OTP
  describe('Authentication & SMS/OTP Service', () => {
    const testPhone = '9876543210';

    it('POST /api/auth/send-otp should generate and send OTP', async () => {
      const res = await request(app)
        .post('/api/auth/send-otp')
        .send({ phone: testPhone });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('OTP sent successfully');
    });

    it('POST /api/auth/verify-otp should fail with wrong OTP', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ phone: testPhone, otp: '999999' });

      expect([400, 401]).toContain(res.statusCode);
      expect(res.body.success).toBe(false);
    });

    it('Helper verifyOTP should correctly validate generated OTP', () => {
      const otp = generateOTP(testPhone);
      expect(otp).toHaveLength(6);
      const isValid = verifyOTP(testPhone, otp);
      expect(isValid).toBe(true);
    });
  });

  // 3. Online Payments (Razorpay)
  describe('Razorpay Online Payment Gateway', () => {
    it('POST /api/payments/razorpay/create-order should return order details', async () => {
      const res = await request(app)
        .post('/api/payments/razorpay/create-order')
        .send({ amount: 350 });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.keyId).toBeDefined();
      expect(res.body.currency).toBe('INR');
      expect(res.body.amount).toBe(35000); // In paise
    });
  });

  // 4. PDF Invoice Generation
  describe('PDF Invoice Generator Engine', () => {
    it('should generate a valid PDF buffer with %PDF magic header', async () => {
      const mockOrder = {
        _id: 'testorder123456',
        invoiceNumber: 'INV-2026-TEST',
        createdAt: new Date(),
        customerName: 'Rohit Sharma',
        customerPhone: '9876543210',
        tableLabel: 'Table 4',
        waiterName: 'Raju',
        paymentMode: 'UPI',
        items: [
          { name: 'Special Paneer Thali (Pure Veg)', quantity: 2, price: 250, portion: 'Full' },
          { name: 'Butter Tandoori Roti', quantity: 4, price: 25, portion: 'Full' }
        ],
        subTotal: 600,
        tax: 30,
        grandTotal: 630
      };

      const pdfBuffer = await generateInvoicePDFBuffer(mockOrder);
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(500);

      // Verify PDF header magic bytes %PDF-
      const header = pdfBuffer.slice(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });
  });

  // 5. Excel Multi-Sheet Export Engine
  describe('Excel Export Engine (exceljs)', () => {
    it('should generate valid .xlsx binary workbook buffer for sales report', async () => {
      const mockOrders = [
        {
          invoiceNumber: 'INV-001',
          createdAt: new Date(),
          customerName: 'Priya',
          customerPhone: '9812345678',
          tableLabel: 'Table 2',
          paymentMode: 'Cash',
          subTotal: 500,
          discountAmt: 50,
          tax: 22.5,
          grandTotal: 472.5,
          status: 'settled',
          items: [{ name: 'Dal Makhani', quantity: 1, price: 220 }]
        }
      ];

      const excelBuffer = await generateSalesExcelReport(mockOrders, {
        totalRevenue: 472.5,
        totalOrders: 1,
        totalDiscount: 50,
        totalTax: 22.5
      });

      expect(Buffer.isBuffer(excelBuffer)).toBe(true);
      expect(excelBuffer.length).toBeGreaterThan(1000);
      // Verify ZIP/XLSX magic bytes (PK..)
      expect(excelBuffer[0]).toBe(0x50); // 'P'
      expect(excelBuffer[1]).toBe(0x4B); // 'K'
    });

    it('should generate valid .xlsx binary workbook buffer for inventory stock report', async () => {
      const mockIngredients = [
        {
          name: 'Amul Butter',
          category: 'Dairy',
          unit: 'kg',
          currentStock: 12,
          minStockAlert: 5,
          costPerUnit: 520
        },
        {
          name: 'Basmati Rice',
          category: 'Grains',
          unit: 'kg',
          currentStock: 3,
          minStockAlert: 10,
          costPerUnit: 90
        }
      ];

      const excelBuffer = await generateInventoryExcelReport(mockIngredients);
      expect(Buffer.isBuffer(excelBuffer)).toBe(true);
      expect(excelBuffer.length).toBeGreaterThan(1000);
      expect(excelBuffer[0]).toBe(0x50);
      expect(excelBuffer[1]).toBe(0x4B);
    });
  });

  // 6. Automated Background Scheduling Jobs
  describe('Automated Scheduler Functions (node-cron)', () => {
    it('runBirthdayOfferJob should execute without unhandled rejection', async () => {
      const res = await runBirthdayOfferJob(null);
      expect(res.success).toBe(true);
      expect(typeof res.count).toBe('number');
    });

    it('runLowStockCheckJob should execute and return stock alert status', async () => {
      const res = await runLowStockCheckJob(null);
      expect(res.success).toBe(true);
      expect(typeof res.count).toBe('number');
    });

    it('runDayEndReconciliationJob should calculate open and settled orders', async () => {
      const res = await runDayEndReconciliationJob(null);
      expect(res.success).toBe(true);
      expect(typeof res.settledCount).toBe('number');
    });
  });

});
