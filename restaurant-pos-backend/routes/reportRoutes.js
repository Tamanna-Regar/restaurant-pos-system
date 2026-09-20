const express = require('express');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const Expense = require('../models/Expense');
const OnlineOrder = require('../models/OnlineOrder');
const Recipe = require('../models/Recipe');
const Ingredient = require('../models/Ingredient');
const InventoryLedger = require('../models/InventoryLedger');
const SalaryPayment = require('../models/SalaryPayment');
const { getBranchScope } = require('../utils/branchScope');

const router = express.Router();

const getRange = (req) => {
  const from = String(req.query.from || new Date().toISOString().slice(0, 10));
  const to = String(req.query.to || from);
  const start = new Date(`${from}T00:00:00.000`);
  const end = new Date(`${to}T23:59:59.999`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) throw new Error('Invalid from/to date');
  return { from, to, range: { $gte: start, $lte: end } };
};

router.get('/sales', async (req, res) => {
  try {
    const { from, to, range } = getRange(req);
    const branch = getBranchScope(req);
    const [summary, payments, orderTypes, items] = await Promise.all([
      Payment.aggregate([{ $match: { ...branch, status: 'paid', settledAt: range } }, { $group: { _id: null, grossSales: { $sum: '$grandTotal' }, subtotal: { $sum: '$subTotal' }, tax: { $sum: '$tax' }, discounts: { $sum: '$discount' }, orders: { $sum: 1 } } }]),
      Payment.aggregate([{ $match: { ...branch, status: 'paid', settledAt: range } }, { $group: { _id: '$paymentMode', amount: { $sum: '$grandTotal' }, count: { $sum: 1 } } }, { $sort: { amount: -1 } }]),
      Payment.aggregate([{ $match: { ...branch, status: 'paid', settledAt: range } }, { $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', as: 'order' } }, { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } }, { $group: { _id: { $ifNull: ['$order.orderType', 'Unknown'] }, amount: { $sum: '$grandTotal' }, count: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { ...branch, createdAt: range } }, { $unwind: '$items' }, { $group: { _id: '$items.name', quantity: { $sum: '$items.quantity' }, sales: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } }, { $sort: { sales: -1 } }, { $limit: 100 }])
    ]);
    res.json({ success: true, data: { from, to, totals: summary[0] || { grossSales: 0, subtotal: 0, tax: 0, discounts: 0, orders: 0 }, paymentModes: payments, orderTypes, topItems: items } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/profit-loss', async (req, res) => {
  try {
    const { from, to, range } = getRange(req);
    const branch = getBranchScope(req);
    const [sales, expenses, commission] = await Promise.all([
      Payment.aggregate([{ $match: { ...branch, status: 'paid', settledAt: range } }, { $group: { _id: null, amount: { $sum: '$grandTotal' } } }]),
      Expense.aggregate([{ $match: { createdAt: range } }, { $group: { _id: '$category', amount: { $sum: '$amount' } } }]),
      OnlineOrder.aggregate([{ $match: { createdAt: range } }, { $group: { _id: null, amount: { $sum: '$commissionAmount' } } }])
    ]);
    const totalExpenses = expenses.reduce((sum, row) => sum + row.amount, 0);
    const platformCommission = commission[0]?.amount || 0;
    const salesAmount = sales[0]?.amount || 0;
    res.json({ success: true, data: { from, to, sales: salesAmount, expenses, totalExpenses, onlineCommission: platformCommission, estimatedProfit: Number((salesAmount - totalExpenses - platformCommission).toFixed(2)) } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/owner-profit', async (req, res) => {
  try {
    const { from, to, range } = getRange(req);
    const branch = getBranchScope(req);
    const [sales, ledger, expenses, salaries, commissions, inventory] = await Promise.all([
      Payment.aggregate([
        { $match: { ...branch, status: 'paid', settledAt: range } },
        { $group: { _id: null, revenue: { $sum: '$grandTotal' }, tax: { $sum: '$tax' }, bills: { $sum: 1 } } }
      ]),
      InventoryLedger.aggregate([
        { $match: { createdAt: range, type: { $in: ['sale', 'waste', 'purchase'] } } },
        { $lookup: { from: 'ingredients', localField: 'ingredientId', foreignField: '_id', as: 'ingredient' } },
        { $unwind: { path: '$ingredient', preserveNullAndEmptyArrays: true } },
        { $group: {
          _id: '$type',
          quantity: { $sum: { $abs: '$quantity' } },
          value: { $sum: { $multiply: [{ $abs: '$quantity' }, { $ifNull: ['$ingredient.costPerUnit', 0] }] } }
        } }
      ]),
      Expense.aggregate([
        { $addFields: { expenseDate: { $dateFromString: { dateString: '$date', onError: '$createdAt', onNull: '$createdAt' } } } },
        { $match: { expenseDate: range } },
        { $group: { _id: '$category', amount: { $sum: '$amount' } } }
      ]),
      SalaryPayment.aggregate([
        { $match: { paidAt: range } },
        { $group: { _id: null, amount: { $sum: '$amount' }, payments: { $sum: 1 } } }
      ]),
      OnlineOrder.aggregate([
        { $match: { createdAt: range } },
        { $group: { _id: null, amount: { $sum: { $ifNull: ['$commissionAmount', 0] } } } }
      ]),
      Ingredient.aggregate([
        { $project: { name: 1, unit: 1, currentStock: 1, value: { $multiply: ['$currentStock', '$costPerUnit'] } } },
        { $group: { _id: null, stockValue: { $sum: '$value' }, ingredients: { $push: '$$ROOT' } } }
      ])
    ]);

    const byType = Object.fromEntries(ledger.map((entry) => [entry._id, entry]));
    const totalRevenue = Number(sales[0]?.revenue || 0);
    const foodUsed = Number(byType.sale?.value || 0);
    const wasteCost = Number(byType.waste?.value || 0);
    const purchases = Number(byType.purchase?.value || 0);
    const expenseRows = expenses.map((row) => ({ category: row._id || 'Other', amount: Number(row.amount || 0) }));
    const operatingExpenses = expenseRows.reduce((sum, row) => sum + row.amount, 0);
    const salaryCost = Number(salaries[0]?.amount || 0);
    const onlineCommission = Number(commissions[0]?.amount || 0);
    const totalCosts = foodUsed + wasteCost + operatingExpenses + salaryCost + onlineCommission;

    res.json({
      success: true,
      data: {
        from, to,
        revenue: totalRevenue,
        bills: Number(sales[0]?.bills || 0),
        tax: Number(sales[0]?.tax || 0),
        inventory: {
          usedQuantity: Number(byType.sale?.quantity || 0),
          usedCost: foodUsed,
          wasteQuantity: Number(byType.waste?.quantity || 0),
          wasteCost,
          purchasesQuantity: Number(byType.purchase?.quantity || 0),
          purchasesCost: purchases,
          currentStockValue: Number(inventory[0]?.stockValue || 0),
          ingredients: inventory[0]?.ingredients || []
        },
        salaryCost,
        salaryPayments: Number(salaries[0]?.payments || 0),
        operatingExpenses,
        onlineCommission,
        expenseRows,
        totalCosts,
        netProfit: Number((totalRevenue - totalCosts).toFixed(2)),
        profitMargin: totalRevenue ? Number((((totalRevenue - totalCosts) / totalRevenue) * 100).toFixed(2)) : 0
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/tax', async (req, res) => {
  try {
    const { from, to, range } = getRange(req);
    const match = { ...getBranchScope(req), status: 'paid', settledAt: range };
    const [rows, rateBreakdown, invoiceTypes] = await Promise.all([
      Payment.aggregate([{ $match: match }, { $group: { _id: null, taxableSales: { $sum: '$subTotal' }, taxCollected: { $sum: '$tax' }, cgst: { $sum: '$cgst' }, sgst: { $sum: '$sgst' }, igst: { $sum: '$igst' }, invoices: { $sum: 1 } } }]),
      Payment.aggregate([{ $match: match }, { $group: { _id: '$gstRate', taxableSales: { $sum: '$subTotal' }, taxCollected: { $sum: '$tax' }, cgst: { $sum: '$cgst' }, sgst: { $sum: '$sgst' }, igst: { $sum: '$igst' }, invoices: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Payment.aggregate([{ $match: match }, { $group: { _id: { $cond: [{ $and: [{ $ne: ['$customerGstin', ''] }, { $ne: ['$customerGstin', null] }] }, 'B2B', 'B2C'] }, invoices: { $sum: 1 }, taxableSales: { $sum: '$subTotal' }, taxCollected: { $sum: '$tax' } } }])
    ]);
    res.json({ success: true, data: { from, to, ...(rows[0] || { taxableSales: 0, taxCollected: 0, cgst: 0, sgst: 0, igst: 0, invoices: 0 }), rateBreakdown, invoiceTypes } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/food-cost', async (req, res) => {
  try {
    const { from, to, range } = getRange(req);
    const [sales, recipes, ingredients] = await Promise.all([
      Order.aggregate([
        { $match: { createdAt: range, orderStatus: { $ne: 'cancelled' } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.itemId', name: { $first: '$items.name' }, quantity: { $sum: '$items.quantity' }, sales: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } }
      ]),
      Recipe.find().lean(),
      Ingredient.find().select('name costPerUnit unit').lean()
    ]);
    const ingredientMap = new Map(ingredients.map((ingredient) => [String(ingredient._id), ingredient]));
    const recipeMap = new Map(recipes.map((recipe) => [String(recipe.itemId), recipe]));
    const rows = sales.map((sale) => {
      const recipe = recipeMap.get(String(sale._id));
      const unitCost = (recipe?.ingredients || []).reduce((sum, entry) => {
        const ingredient = ingredientMap.get(String(entry.ingredientId));
        return sum + Number(entry.quantityRequired || 0) * Number(ingredient?.costPerUnit || 0);
      }, 0);
      const cost = unitCost * Number(sale.quantity || 0);
      return { ...sale, unitCost: Number(unitCost.toFixed(2)), cost: Number(cost.toFixed(2)), margin: Number((sale.sales - cost).toFixed(2)) };
    });
    const totalSales = rows.reduce((sum, row) => sum + row.sales, 0);
    const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
    res.json({ success: true, data: { from, to, rows, totalSales, totalCost, foodCostPercent: totalSales ? Number(((totalCost / totalSales) * 100).toFixed(2)) : 0, grossMargin: Number((totalSales - totalCost).toFixed(2)) } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
