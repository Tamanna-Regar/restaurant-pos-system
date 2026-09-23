/**
 * Tamanna Restaurant POS - Tally ERP / TallyPrime XML Export Utility
 * Generates official Tally-compatible XML vouchers for accounting import.
 */

function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatTallyDate(date) {
  const d = date ? new Date(date) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Builds Tally ERP compatible XML for Sales Vouchers
 * @param {Array} payments - Array of settled Payment documents
 * @param {Object} options - { companyName, from, to }
 * @returns {String} Tally XML string
 */
function generateTallySalesXml(payments = [], options = {}) {
  const companyName = options.companyName || 'Tamanna Restaurant';

  let vouchersXml = '';

  for (const p of payments) {
    const vchDate = formatTallyDate(p.settledAt || p.createdAt);
    const invoiceNo = escapeXml(p.invoiceNumber || p.billNumber || `TAM-${p._id.toString().slice(-6).toUpperCase()}`);
    const partyName = escapeXml(p.customerName || (p.paymentMode === 'Cash' ? 'Cash' : `${p.paymentMode} Inflow`));
    const grandTotal = Number(p.grandTotal || 0).toFixed(2);
    const subTotal = Number(p.subTotal || (p.grandTotal - (p.tax || 0))).toFixed(2);
    const totalTax = Number(p.tax || 0);
    const cgst = Number(p.cgst || (totalTax / 2)).toFixed(2);
    const sgst = Number(p.sgst || (totalTax / 2)).toFixed(2);
    const discount = Number(p.discount || 0).toFixed(2);
    const narration = escapeXml(`Sales settlement via ${p.paymentMode || 'Cash'} for Order ${p.orderId ? (p.orderId.orderNumber || p.orderId) : ''}`);

    // Map payment mode to standard Tally ledger
    let paymentLedger = 'Cash';
    if (p.paymentMode === 'UPI' || p.paymentMode === 'Razorpay' || p.paymentMode === 'Online') {
      paymentLedger = 'Bank Account / UPI';
    } else if (p.paymentMode === 'Card') {
      paymentLedger = 'Card Collection Account';
    }

    vouchersXml += `
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${vchDate}</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${invoiceNo}</VOUCHERNUMBER>
            <REFERENCE>${invoiceNo}</REFERENCE>
            <PARTYLEDGERNAME>${escapeXml(paymentLedger)}</PARTYLEDGERNAME>
            <BASICBUYERNAME>${partyName}</BASICBUYERNAME>
            <NARRATION>${narration}</NARRATION>
            
            <!-- Debit: Receiving Ledger (Negative in Tally) -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${escapeXml(paymentLedger)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${grandTotal}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>

            <!-- Credit: Pure Veg Food Sales -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Food Sales (Restaurant)</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${subTotal}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
`;

    // CGST entry
    if (Number(cgst) > 0) {
      vouchersXml += `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Output CGST 2.5%</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${cgst}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
`;
    }

    // SGST entry
    if (Number(sgst) > 0) {
      vouchersXml += `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Output SGST 2.5%</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${sgst}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
`;
    }

    // Discount entry (if any)
    if (Number(discount) > 0) {
      vouchersXml += `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Discount Allowed</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${discount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
`;
    }

    vouchersXml += `          </VOUCHER>
        </TALLYMESSAGE>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(companyName)}</STATICVARIABLES>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${vouchersXml}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

module.exports = {
  generateTallySalesXml,
  formatTallyDate
};

