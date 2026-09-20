const Customer = require('../models/Customer');

// Har bill settlement par customer record auto-update karna aur points add karna
const updateCustomerCRM = async (phone, name, billAmount) => {
  if (!phone) return null;

  try {
    // Rule: Har ₹100 spents par 1 Loyalty Point
    const pointsEarned = Math.floor(billAmount / 100);

    const customer = await Customer.findOneAndUpdate(
      { phone },
      {
        $set: { name: name || 'Guest Customer' },
        $inc: {
          totalOrders: 1,
          totalSpent: billAmount,
          loyaltyPoints: pointsEarned
        }
      },
      { upsert: true, new: true }
    );

    const totalSpent = Number(customer?.totalSpent || 0);
    const membershipTier = totalSpent >= 100000 ? 'Platinum' : totalSpent >= 50000 ? 'Gold' : totalSpent >= 20000 ? 'Silver' : 'Regular';
    if (customer && customer.membershipTier !== membershipTier) {
      customer.membershipTier = membershipTier;
      await customer.save();
    }
    return customer;
  } catch (error) {
    console.error('CRM Update Error:', error);
    return null;
  }
};

module.exports = { updateCustomerCRM };