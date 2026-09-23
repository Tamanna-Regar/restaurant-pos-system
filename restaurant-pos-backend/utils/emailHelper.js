const nodemailer = require('nodemailer');

/**
 * Returns configured nodemailer transporter.
 * Falls back gracefully to ethereal / console logger if SMTP is not set up in .env
 */
const getTransporter = () => {
  const host = process.env.EMAIL_HOST;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const port = process.env.EMAIL_PORT || 587;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      auth: { user, pass }
    });
  }

  // Fallback simulator transporter
  return {
    sendMail: async (mailOptions) => {
      console.log('📧 [Email Simulator] Sending Email:');
      console.log(`   To: ${mailOptions.to}`);
      console.log(`   Subject: ${mailOptions.subject}`);
      console.log(`   Preview Text: ${mailOptions.text || '(HTML Content)'}`);
      return { messageId: `mock_${Date.now()}` };
    }
  };
};

/**
 * 1. Send Password Reset Email with Token
 */
const sendPasswordResetEmail = async (toEmail, resetToken, userName = 'Staff Member') => {
  try {
    const transporter = getTransporter();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="background: #16a34a; padding: 15px; border-radius: 8px; text-align: center; color: #ffffff;">
          <h2 style="margin: 0;">Tamanna Restaurant POS</h2>
          <p style="margin: 4px 0 0; font-size: 13px;">100% Pure Vegetarian Fine Dining</p>
        </div>
        <div style="padding: 20px 10px;">
          <h3 style="color: #0f172a;">Password Reset Request</h3>
          <p>Hello <strong>${userName}</strong>,</p>
          <p>We received a request to reset your password for your staff account. Use the secret reset token below:</p>
          <div style="background: #f1f5f9; padding: 12px 18px; border-radius: 8px; font-size: 18px; font-weight: bold; letter-spacing: 3px; color: #0f172a; text-align: center; margin: 18px 0;">
            ${resetToken}
          </div>
          <p style="font-size: 12px; color: #64748b;">This reset token will expire in <strong>15 minutes</strong>. If you did not request this, please notify your restaurant manager immediately.</p>
        </div>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center;">
          © ${new Date().getFullYear()} Tamanna Restaurant Management System
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"Tamanna Restaurant Security" <${process.env.EMAIL_FROM || 'noreply@tamannarestaurant.com'}>`,
      to: toEmail,
      subject: '🔑 Password Reset Request - Tamanna Restaurant POS',
      text: `Your password reset token is: ${resetToken}. It expires in 15 minutes.`,
      html: htmlContent
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Send Password Reset Email Error:', error);
    throw error;
  }
};

/**
 * 2. Send Low Stock Alert Email to Kitchen & Inventory Managers
 */
const sendLowStockAlertEmail = async (lowStockItems = [], managerEmail) => {
  try {
    if (!managerEmail || lowStockItems.length === 0) return;
    const transporter = getTransporter();

    const itemsRows = lowStockItems.map(i => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${i.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #dc2626; font-weight: bold;">${i.currentStock} ${i.unit}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${i.minStockAlert} ${i.unit}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <div style="background: #dc2626; padding: 15px; border-radius: 8px; text-align: center; color: #ffffff;">
          <h2 style="margin: 0;">⚠️ Low Stock Inventory Alert</h2>
          <p style="margin: 4px 0 0; font-size: 13px;">Tamanna Pure Veg Kitchen</p>
        </div>
        <p style="margin-top: 18px;">The following ingredients have breached minimum buffer thresholds and require immediate purchase replenishment:</p>
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; margin: 16px 0;">
          <thead>
            <tr style="background: #f8fafc; font-weight: bold;">
              <th style="padding: 8px;">Ingredient</th>
              <th style="padding: 8px;">Current Stock</th>
              <th style="padding: 8px;">Min Alert Limit</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
        <p style="font-size: 12px; color: #64748b;">Please generate a purchase order from your Inventory Management portal.</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Tamanna Inventory Alert" <${process.env.EMAIL_FROM || 'alerts@tamannarestaurant.com'}>`,
      to: managerEmail,
      subject: `🚨 [URGENT] ${lowStockItems.length} Ingredients Low on Stock - Tamanna Restaurant`,
      html: htmlContent
    });
  } catch (error) {
    console.error('Send Low Stock Email Error:', error);
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendLowStockAlertEmail
};

