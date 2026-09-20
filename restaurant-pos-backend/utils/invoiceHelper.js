const Counter = require('../models/Counter');

const getNextInvoiceNumber = async (date = new Date()) => {
  const dateKey = date.toISOString().slice(0, 10).replace(/-/g, '');
  const counter = await Counter.findOneAndUpdate(
    { key: `invoice:${dateKey}` },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return `INV-${dateKey}-${String(counter.value).padStart(4, '0')}`;
};

module.exports = { getNextInvoiceNumber };
