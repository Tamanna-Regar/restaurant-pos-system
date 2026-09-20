const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  empId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  role: { type: String, required: true }, // Waiter, Chef, Captain, etc.
  shift: { type: String, default: 'General (Morning - Evening)' }, // Morning, Evening, General
  phone: { type: String, required: true },
  email: { type: String, default: '' },
  profilePhoto: { type: String, default: '' }, // Profile picture URL
  
  // Salary Details
  basicSalary: { type: Number, required: true },
  perDaySalary: { type: Number, default: 0 },
  
  // Attendance & Month Stats
  workingDays: { type: Number, default: 26 }, // Total working days in month
  presentDays: { type: Number, default: 26 },
  absentDays: { type: Number, default: 0 },
  leaveDays: { type: Number, default: 0 },
  
  // Overtime & Deductions
  overtimeHours: { type: Number, default: 0 },
  overtimeRatePerHour: { type: Number, default: 100 }, // Per hour overtime rate
  advanceTaken: { type: Number, default: 0 }, // Advance salary taken
  otherDeductions: { type: Number, default: 0 }, // Fine or Uniform deduction
  
  status: { type: String, default: 'Active' }, // Active, On Leave, Terminated
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  joiningDate: { type: String, default: () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
}, { timestamps: true });

module.exports = mongoose.model('Staff', staffSchema);