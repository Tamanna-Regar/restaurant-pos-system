import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const shiftOptions = ['Morning (9 AM - 5 PM)', 'Evening (5 PM - 1 AM)', 'General Shift'];

export default function StaffPayrollModule() {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [payrollApprovalStatus, setPayrollApprovalStatus] = useState({});

  // Calendar View States inside Modal
  const [calendarStaffId, setCalendarStaffId] = useState('');
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [salarySlip, setSalarySlip] = useState(null);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [overtimeRequests, setOvertimeRequests] = useState([]);

  const [newStaff, setNewStaff] = useState({ 
    name: '', 
    role: 'Head Chef', 
    shift: 'Morning (9 AM - 5 PM)',
    phone: '', 
    email: '',
    profilePhoto: '',
    basicSalary: '', 
    workingDays: 26,
    presentDays: 26,
    absentDays: 0,
    overtimeHours: 0,
    advanceTaken: 0
  });

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/staff');
      const data = res.data;
      const normalizedData = Array.isArray(data) ? data : [];
      setStaffList(normalizedData);
      const [leaveResponse, overtimeResponse] = await Promise.all([
        api.get('/staff/leave-requests').catch(() => ({ data: { data: [] } })),
        api.get('/staff/overtime-requests').catch(() => ({ data: { data: [] } }))
      ]);
      setLeaveRequests(leaveResponse.data?.data || []);
      setOvertimeRequests(overtimeResponse.data?.data || []);
      if (!selectedStaffId && normalizedData[0]) setSelectedStaffId(normalizedData[0]._id);
      if (!calendarStaffId && normalizedData[0]) setCalendarStaffId(normalizedData[0]._id);
    } catch (err) {
      console.error('Error fetching staff data:', err);
      setStaffList([]);
      setSelectedStaffId('');
      setCalendarStaffId('');
    } finally {
      setLoading(false);
    }
  }, [calendarStaffId, selectedStaffId]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleImageChange = (e, isEdit = false) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (isEdit) {
          setEditingStaff(prev => ({ ...prev, profilePhoto: reader.result }));
        } else {
          setNewStaff(prev => ({ ...prev, profilePhoto: reader.result }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const calculateNetPay = (staff) => {
    const basic = Number(staff.basicSalary || 0);
    const workingDays = Number(staff.workingDays || 26);
    const present = Number(staff.presentDays || 0);
    const incentive = Number(staff.incentive || 0);
    const perDay = workingDays > 0 ? basic / workingDays : 0;
    const earnedBasic = perDay * present;
    const overtimePay = Number(staff.overtimeHours || 0) * 100;
    const deductions = Number(staff.advanceTaken || 0);

    return Math.max(0, Math.round((earnedBasic + overtimePay + incentive) - deductions));
  };

  const totalNetPayable = staffList.reduce((acc, curr) => acc + calculateNetPay(curr), 0);
  const totalOvertime = staffList.reduce((acc, curr) => acc + Number(curr.overtimeHours || 0), 0);
  const totalLeaveRequests = staffList.reduce((acc, curr) => acc + Number(curr.leaveDays || 0), 0);
  const presentEmployees = staffList.filter((staff) => String(staff.attendanceStatus || 'Present').toLowerCase() !== 'absent').length;
  const approvedPayrollCount = Object.values(payrollApprovalStatus).filter(status => status === 'Approved').length;

  const handleAttendancePunch = async (staffId, status) => {
    try {
      await api.post(`/staff/${staffId}/clock`, { date: new Date().toISOString().slice(0, 10), status: status.toLowerCase() });
    } catch (error) {
      alert(error.response?.data?.message || 'Attendance save failed.');
      return;
    }
    setStaffList(prev => prev.map(staff => {
      if (staff._id !== staffId) return staff;
      const presentDays = status === 'Present' ? Math.max(Number(staff.presentDays || 0), Number(staff.presentDays || 0) + 1) : Number(staff.presentDays || 0);
      const absentDays = status === 'Absent' ? Number(staff.absentDays || 0) + 1 : Number(staff.absentDays || 0);
      return {
        ...staff,
        attendanceStatus: status,
        presentDays,
        absentDays,
        leaveDays: status === 'Leave' ? Number(staff.leaveDays || 0) + 1 : Number(staff.leaveDays || 0)
      };
    }));
  };

  const handleShiftAssignment = async (staffId, shift) => {
    try {
      await api.post(`/staff/${staffId}/roster`, { date: new Date().toISOString().slice(0, 10), shift });
    } catch (error) {
      alert(error.response?.data?.message || 'Shift roster save failed.');
      return;
    }
    setStaffList(prev => prev.map(staff => staff._id === staffId ? { ...staff, shift } : staff));
  };

  const handleLeaveManagement = async (staffId, leaveDays) => {
    const days = Number(leaveDays || 0);
    if (days > 0) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        await api.post(`/staff/${staffId}/leave-requests`, { fromDate: today, toDate: today, days, reason: 'Leave entered from HRM' });
      } catch (error) {
        alert(error.response?.data?.message || 'Leave request save failed.');
        return;
      }
    }
    setStaffList(prev => prev.map(staff => staff._id === staffId ? { ...staff, leaveDays: Number(leaveDays || 0), attendanceStatus: 'Leave' } : staff));
  };

  const handleIncentiveUpdate = (staffId, amount) => {
    setStaffList(prev => prev.map(staff => staff._id === staffId ? { ...staff, incentive: Number(amount || 0) } : staff));
  };

  const handlePayrollApproval = (staffId) => {
    setPayrollApprovalStatus(prev => ({
      ...prev,
      [staffId]: prev[staffId] === 'Approved' ? 'Pending' : 'Approved'
    }));
  };

  const recordSalaryPayment = async (staff) => {
    const month = new Date().toISOString().slice(0, 7);
    const amount = Number(window.prompt(`Salary payment amount for ${staff.name}:`, String(calculateNetPay(staff))));
    if (!Number.isFinite(amount) || amount <= 0) return;
    try {
      await api.post(`/staff/${staff._id}/salary-payments`, { month, amount, paymentMode: 'Bank Transfer' });
      alert('Salary payment recorded successfully.');
    } catch (error) {
      alert(error.response?.data?.message || 'Salary payment save failed.');
    }
  };

  const recordOvertimeApproval = async (staff) => {
    const hours = Number(window.prompt(`Approved overtime hours for ${staff.name}:`, String(staff.overtimeHours || 0)));
    if (!Number.isFinite(hours) || hours < 0) return;
    try {
      await api.post(`/staff/${staff._id}/overtime-requests`, { month: new Date().toISOString().slice(0, 7), hours, ratePerHour: staff.overtimeRatePerHour || 100, reason: 'Monthly overtime approval' });
      alert('Overtime request recorded for manager review.');
    } catch (error) {
      alert(error.response?.data?.message || 'Overtime request save failed.');
    }
  };

  const reviewRequest = async (type, requestId, status) => {
    try {
      await api.patch(`/staff/${type}-requests/${requestId}`, { status });
      await fetchStaff();
    } catch (error) {
      alert(error.response?.data?.message || 'Request review failed.');
    }
  };

  const exportPayrollReport = () => {
    const headers = ['Name', 'Role', 'Basic Salary', 'Overtime Hours', 'Incentive', 'Advance', 'Net Pay', 'Status'];
    const rows = staffList.map(staff => [
      staff.name,
      staff.role,
      Number(staff.basicSalary || 0),
      Number(staff.overtimeHours || 0),
      Number(staff.incentive || 0),
      Number(staff.advanceTaken || 0),
      calculateNetPay(staff),
      payrollApprovalStatus[staff._id] === 'Approved' ? 'Approved' : 'Pending'
    ]);

    const csv = [headers, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tamanna-payroll-report.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const getRecentAttendanceHistory = (staffId) => {
    const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const history = [];

    for (let day = Math.max(1, daysInCurrentMonth - 6); day <= daysInCurrentMonth; day += 1) {
      const key = `${staffId}_${currentYear}_${currentMonth}_${day}`;
      let status = attendanceRecords[key] || 'P';

      if (!attendanceRecords[key]) {
        const staff = staffList.find(item => item._id === staffId);
        const presentDays = Number(staff?.presentDays || 0);
        const absentDays = Number(staff?.absentDays || 0);
        const leaveDays = Number(staff?.leaveDays || 0);

        if (day <= presentDays) status = 'P';
        else if (day <= presentDays + absentDays) status = 'A';
        else if (day <= presentDays + absentDays + leaveDays) status = 'L';
      }

      history.push({
        day,
        status,
        label: status === 'P' ? 'Present' : status === 'A' ? 'Absent' : status === 'L' ? 'Leave' : 'Holiday'
      });
    }

    return history;
  };

  const generateSalarySlip = () => {
    if (!selectedEmployee) return;

    const basicSalary = Number(selectedEmployee.basicSalary || 0);
    const presentDays = Number(selectedEmployee.presentDays || 0);
    const workingDays = Number(selectedEmployee.workingDays || 26);
    const earnedBasic = (basicSalary / workingDays) * presentDays;
    const overtimePay = (Number(selectedEmployee.overtimeHours || 0) * 100);
    const incentive = Number(selectedEmployee.incentive || 0);
    const advanceTaken = Number(selectedEmployee.advanceTaken || 0);
    const netPay = calculateNetPay(selectedEmployee);

    setSalarySlip({
      employee: selectedEmployee,
      month: monthNames[currentMonth],
      year: currentYear,
      earnedBasic,
      overtimePay,
      incentive,
      advanceTaken,
      netPay,
      history: getRecentAttendanceHistory(selectedEmployee._id)
    });
  };

  const exportPayrollCSV = () => {
    const headers = ['Name', 'Role', 'Shift', 'Basic Salary', 'Overtime Hours', 'Incentive', 'Advance', 'Net Pay'];
    const rows = staffList.map(staff => [
      staff.name,
      staff.role,
      staff.shift,
      Number(staff.basicSalary || 0),
      Number(staff.overtimeHours || 0),
      Number(staff.incentive || 0),
      Number(staff.advanceTaken || 0),
      calculateNetPay(staff)
    ]);

    const csv = [headers, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tamanna-payroll.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (!newStaff.name || !newStaff.phone || !newStaff.basicSalary) {
      alert('Please fill all mandatory fields (Name, Phone, Basic Salary)');
      return;
    }
    
    try {
      const payload = {
        ...newStaff,
        basicSalary: Number(newStaff.basicSalary),
        workingDays: Number(newStaff.workingDays || 26),
        presentDays: Number(newStaff.presentDays || 26),
        absentDays: Number(newStaff.absentDays || 0),
        overtimeHours: Number(newStaff.overtimeHours || 0),
        advanceTaken: Number(newStaff.advanceTaken || 0)
      };

      await api.post('/staff', payload);
      await fetchStaff();
      setNewStaff({ 
        name: '', role: 'Head Chef', shift: 'Morning (9 AM - 5 PM)', 
        phone: '', email: '', profilePhoto: '', basicSalary: '',
        workingDays: 26, presentDays: 26, absentDays: 0, overtimeHours: 0, advanceTaken: 0 
      });
      setShowAddModal(false);
    } catch (err) {
      console.error('Error adding staff:', err);
    }
  };

  const handleUpdateStaff = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/staff/${editingStaff._id}`, editingStaff);
      await fetchStaff();
      setEditingStaff(null);
    } catch (err) {
      console.error('Error updating staff:', err);
    }
  };

  const handleDeleteStaff = async (id, e) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this staff member?')) {
      try {
        await api.delete(`/staff/${id}`);
        await fetchStaff();
        if (selectedStaffId === id) setSelectedStaffId(null);
      } catch (err) {
        console.error('Error deleting staff:', err);
      }
    }
  };

  // Explicitly mark status for selected day (Present / Absent buttons)
  const setDayStatus = (status) => {
    const key = `${calendarStaffId}_${currentYear}_${currentMonth}_${selectedDay}`;
    const updatedRecords = { ...attendanceRecords, [key]: status };
    setAttendanceRecords(updatedRecords);

    // Recalculate totals
    let pCount = 0;
    let aCount = 0;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    for (let d = 1; d <= daysInMonth; d++) {
      const k = `${calendarStaffId}_${currentYear}_${currentMonth}_${d}`;
      if (updatedRecords[k] === 'P') pCount++;
      if (updatedRecords[k] === 'A') aCount++;
    }

    setStaffList(prev => prev.map(s => {
      if (s._id === calendarStaffId) {
        return { 
          ...s, 
          presentDays: Math.max(0, pCount > 0 ? pCount : s.presentDays),
          absentDays: aCount 
        };
      }
      return s;
    }));
  };

  // Save permanently to Backend Database
  const handleSaveCalendarAttendance = async () => {
    try {
      const staffToUpdate = staffList.find(s => s._id === calendarStaffId);
      if (staffToUpdate) {
        await api.put(`/staff/${staffToUpdate._id}`, staffToUpdate);
        alert('Attendance history saved successfully to database!');
        setShowCalendarModal(false);
        fetchStaff();
      }
    } catch (err) {
      console.error('Error saving attendance:', err);
      alert('Failed to save attendance history.');
    }
  };

  const selectedEmployee = staffList.find(s => s._id === selectedStaffId) || staffList[0] || null;

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div className="staff-payroll-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', boxSizing: 'border-box', background: '#f8fafc', overflowY: 'auto', padding: '24px', fontFamily: 'Inter, sans-serif' }}>
      <div className="staff-payroll-shell" style={{ maxWidth: '1400px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>
        
        {/* Top Header Card */}
        <div className="staff-payroll-header-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', alignItems: 'stretch' }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div className="staff-payroll-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>📋</span> Staff Payroll & Management
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Manage staff details, permanent database attendance history and net monthly payouts.</p>
              </div>
              <div className="staff-payroll-header-actions" style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => setShowCalendarModal(true)}
                  style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '9px 14px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  📅 Attendance Calendar
                </button>
                <button 
                  onClick={() => setShowAddModal(true)}
                  style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '12px' }}
                >
                  + Add Staff
                </button>
              </div>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#334155' }}>📅 {monthNames[currentMonth]} {currentYear}</span>
              <span style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>● Permanent DB Connected</span>
            </div>
          </div>

          <div style={{ background: '#0f172a', color: '#fff', padding: '24px', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.2)' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Payroll (This Month)</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '6px', color: '#38bdf8' }}>
              ₹{totalNetPayable.toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        <div className="staff-payroll-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(180px, 1fr))', gap: '12px' }}>
          {[
            { label: 'Total Staff', value: staffList.length, sub: 'Active employees', tone: '#2563eb' },
            { label: 'Present Today', value: presentEmployees, sub: 'Checked in', tone: '#16a34a' },
            { label: 'Overtime Hours', value: `${totalOvertime}h`, sub: 'Weekly', tone: '#f59e0b' },
            { label: 'Leave Days', value: totalLeaveRequests, sub: 'Approved / pending', tone: '#ef4444' },
            { label: 'Payroll Total', value: `₹${totalNetPayable.toLocaleString('en-IN')}`, sub: 'Net salary', tone: '#0f172a' }
          ].map((card) => (
            <div key={card.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', boxShadow: '0 4px 10px rgba(15, 23, 42, 0.03)' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px' }}>{card.label}</div>
              <div style={{ marginTop: '10px', fontSize: '22px', fontWeight: '800', color: card.tone }}>{card.value}</div>
              <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b' }}>{card.sub}</div>
            </div>
          ))}
        </div>

        <div className="staff-payroll-toolbar" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowCalendarModal(true)} style={{ background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: '8px', padding: '10px 14px', fontWeight: '700', cursor: 'pointer' }}>📅 Attendance Punch</button>
          <button onClick={exportPayrollCSV} style={{ background: '#dcfce7', color: '#166534', border: 'none', borderRadius: '8px', padding: '10px 14px', fontWeight: '700', cursor: 'pointer' }}>⬇️ Export Payroll CSV</button>
          <button onClick={exportPayrollReport} style={{ background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: '8px', padding: '10px 14px', fontWeight: '700', cursor: 'pointer' }}>📄 Export Payroll Report</button>
        </div>

        {(leaveRequests.some((request) => request.status === 'Pending') || overtimeRequests.some((request) => request.status === 'Pending')) && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '14px' }}>
            <strong style={{ fontSize: '13px', color: '#9a3412' }}>Pending HR approvals</strong>
            {leaveRequests.filter((request) => request.status === 'Pending').map((request) => <div key={request._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 12 }}><span>Leave: {request.staffId?.name || 'Staff'} · {request.days} day(s) · {request.reason}</span><span><button onClick={() => reviewRequest('leave', request._id, 'Approved')} style={{ marginRight: 5 }}>Approve</button><button onClick={() => reviewRequest('leave', request._id, 'Rejected')}>Reject</button></span></div>)}
            {overtimeRequests.filter((request) => request.status === 'Pending').map((request) => <div key={request._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 12 }}><span>Overtime: {request.staffId?.name || 'Staff'} · {request.hours} hour(s)</span><span><button onClick={() => reviewRequest('overtime', request._id, 'Approved')} style={{ marginRight: 5 }}>Approve</button><button onClick={() => reviewRequest('overtime', request._id, 'Rejected')}>Reject</button></span></div>)}
          </div>
        )}

        {/* Main Staff Table */}
        <div className="staff-payroll-table-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>Loading staff records...</div>
          ) : staffList.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
              <div style={{ fontSize: '40px', marginBottom: '10px' }}>📂</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>No Staff Found</div>
              <p style={{ fontSize: '13px', margin: '5px 0 15px' }}>Click "+ Add Staff" to register your restaurant team.</p>
            </div>
          ) : (
            <div className="staff-payroll-table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '12px 16px' }}>#</th>
                  <th style={{ padding: '12px 16px' }}>Name</th>
                  <th style={{ padding: '12px 16px' }}>Role</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Attendance (P / A)</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Basic Salary (₹)</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Overtime (₹)</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Deductions (₹)</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Net Salary (₹)</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((staff, index) => {
                  const netSalary = calculateNetPay(staff);
                  const isSelected = selectedStaffId === staff._id;
                  const overtimePay = (staff.overtimeHours || 0) * 100;
                  const deductions = staff.advanceTaken || 0;

                  return (
                    <tr 
                      key={staff._id}
                      onClick={() => setSelectedStaffId(staff._id)}
                      style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: isSelected ? '#f8fafc' : '#fff', transition: 'background 0.1s' }}
                    >
                      <td style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>{index + 1}</td>
                      <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {staff.profilePhoto ? (
                          <img src={staff.profilePhoto} alt={staff.name} style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '13px' }}>
                            {staff.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: '600', color: '#0f172a' }}>{staff.name}</div>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>{staff.phone}</div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#334155', fontWeight: '500' }}>{staff.role}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600' }}>
                        <span style={{ color: '#16a34a' }}>{staff.presentDays || 26}P</span> / <span style={{ color: '#dc2626' }}>{staff.absentDays || 0}A</span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#334155' }}>{staff.basicSalary?.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#16a34a' }}>{overtimePay}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#dc2626' }}>{deductions}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>
                        {netSalary.toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button onClick={() => setEditingStaff(staff)} style={{ padding: '4px 8px', background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>Edit</button>
                          <button onClick={(e) => handleDeleteStaff(staff._id, e)} style={{ padding: '4px 8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>Del</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Selected Employee Detailed Inspector Card */}
        {selectedEmployee && (
          <div className="staff-payroll-inspector" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '30px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
              {selectedEmployee.profilePhoto ? (
                <img src={selectedEmployee.profilePhoto} alt="" style={{ width: '55px', height: '55px', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '55px', height: '55px', borderRadius: '50%', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold' }}>
                  {selectedEmployee.name.charAt(0)}
                </div>
              )}
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '700' }}>{selectedEmployee.name}</h3>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{selectedEmployee.role} | Shift: {selectedEmployee.shift}</div>
                <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 'bold', marginTop: '4px' }}>● {selectedEmployee.attendanceStatus || 'Present'}</div>
                <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>Phone: {selectedEmployee.phone}</div>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>Salary Breakdown</h4>
              <div style={{ fontSize: '12px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>Basic Salary: <strong>₹{selectedEmployee.basicSalary}</strong></div>
                <div>Overtime Pay: <strong style={{ color: '#16a34a' }}>+ ₹{(selectedEmployee.overtimeHours || 0) * 100}</strong></div>
                <div>Incentive: <strong style={{ color: '#2563eb' }}>+ ₹{selectedEmployee.incentive || 0}</strong></div>
                <div>Deductions (Advance): <strong style={{ color: '#dc2626' }}>- ₹{selectedEmployee.advanceTaken || 0}</strong></div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#2563eb', marginTop: '4px' }}>
                  Net Payout: ₹{calculateNetPay(selectedEmployee).toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>Operations</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: '700' }}>Shift Assignment</div>
                  <select value={selectedEmployee.shift} onChange={(e) => handleShiftAssignment(selectedEmployee._id, e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}>
                    {shiftOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: '700' }}>Punch Attendance</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleAttendancePunch(selectedEmployee._id, 'Present')} style={{ flex: 1, background: '#dcfce7', color: '#166534', border: 'none', borderRadius: '6px', padding: '7px 8px', fontWeight: '700', cursor: 'pointer' }}>Present</button>
                    <button onClick={() => api.post(`/staff/${selectedEmployee._id}/clock`, { date: new Date().toISOString().slice(0, 10), status: 'present', action: 'clock-out' }).then(() => alert('Clock-out saved.')).catch(() => alert('Clock-out failed.'))} style={{ flex: 1, background: '#e0f2fe', color: '#075985', border: 'none', borderRadius: '6px', padding: '7px 8px', fontWeight: '700', cursor: 'pointer' }}>Clock Out</button>
                    <button onClick={() => handleAttendancePunch(selectedEmployee._id, 'Absent')} style={{ flex: 1, background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '6px', padding: '7px 8px', fontWeight: '700', cursor: 'pointer' }}>Absent</button>
                    <button onClick={() => handleAttendancePunch(selectedEmployee._id, 'Leave')} style={{ flex: 1, background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: '6px', padding: '7px 8px', fontWeight: '700', cursor: 'pointer' }}>Leave</button>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: '700' }}>Leave Days</div>
                  <input type="number" min="0" value={selectedEmployee.leaveDays || 0} onChange={(e) => handleLeaveManagement(selectedEmployee._id, e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: '700' }}>Incentive (₹)</div>
                  <input type="number" min="0" value={selectedEmployee.incentive || 0} onChange={(e) => handleIncentiveUpdate(selectedEmployee._id, e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>Payroll Approval</div>
                  <button
                    onClick={() => handlePayrollApproval(selectedEmployee._id)}
                    style={{
                      background: payrollApprovalStatus[selectedEmployee._id] === 'Approved' ? '#dcfce7' : '#fef3c7',
                      color: payrollApprovalStatus[selectedEmployee._id] === 'Approved' ? '#166534' : '#92400e',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    {payrollApprovalStatus[selectedEmployee._id] === 'Approved' ? '✓ Approved' : 'Pending Approval'}
                  </button>
                  <button onClick={() => recordOvertimeApproval(selectedEmployee)} style={{ background: '#eff6ff', color: '#1d4ed8', border: 'none', borderRadius: '6px', padding: '8px', fontWeight: '700', cursor: 'pointer' }}>
                    Submit Overtime
                  </button>
                  <button onClick={() => recordSalaryPayment(selectedEmployee)} style={{ background: '#ecfdf5', color: '#166534', border: 'none', borderRadius: '6px', padding: '8px', fontWeight: '700', cursor: 'pointer' }}>
                    Record Salary Payment
                  </button>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>
                    Approved: {approvedPayrollCount} / {staffList.length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedEmployee && (
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Attendance History</div>
                <h3 style={{ margin: '6px 0 0', fontSize: '18px', color: '#0f172a', fontWeight: '700' }}>{selectedEmployee.name}</h3>
              </div>
              <button
                onClick={generateSalarySlip}
                style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }}
              >
                Generate Salary Slip
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(70px, 1fr))', gap: '8px' }}>
              {getRecentAttendanceHistory(selectedEmployee._id).map((entry) => (
                <div
                  key={`${selectedEmployee._id}-${entry.day}`}
                  style={{
                    background: entry.status === 'P' ? '#dcfce7' : entry.status === 'A' ? '#fee2e2' : '#fef3c7',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '10px 8px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '700' }}>Day {entry.day}</div>
                  <div style={{ marginTop: '6px', fontSize: '12px', fontWeight: '800', color: '#0f172a' }}>{entry.label.slice(0, 3)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {salarySlip && (
          <div style={{ position: 'fixed', inset: '0', background: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
            <div style={{ width: '480px', background: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Tamanna Restaurant</div>
                  <h3 style={{ margin: '4px 0 0', fontSize: '20px', color: '#0f172a', fontWeight: '800' }}>Salary Slip</h3>
                </div>
                <button onClick={() => setSalarySlip(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
              </div>

              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#334155', marginBottom: '6px' }}>
                  <span>Employee</span>
                  <strong>{salarySlip.employee.name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#334155', marginBottom: '6px' }}>
                  <span>Role</span>
                  <strong>{salarySlip.employee.role}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#334155' }}>
                  <span>Month</span>
                  <strong>{salarySlip.month} {salarySlip.year}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#334155' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Earned Basic</span><strong>₹{salarySlip.earnedBasic.toLocaleString('en-IN')}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Overtime Pay</span><strong style={{ color: '#16a34a' }}>+ ₹{salarySlip.overtimePay.toLocaleString('en-IN')}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Incentive</span><strong style={{ color: '#2563eb' }}>+ ₹{salarySlip.incentive.toLocaleString('en-IN')}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Advance Taken</span><strong style={{ color: '#dc2626' }}>- ₹{salarySlip.advanceTaken.toLocaleString('en-IN')}</strong></div>
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>
                  <span>Net Salary</span>
                  <span>₹{salarySlip.netPay.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
                <button
                  onClick={() => window.print()}
                  style={{ flex: 1, background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px', cursor: 'pointer', fontWeight: '700' }}
                >
                  Print / Save PDF
                </button>
                <button
                  onClick={() => setSalarySlip(null)}
                  style={{ flex: 1, background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: '8px', padding: '10px', cursor: 'pointer', fontWeight: '700' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Interactive Calendar Attendance Modal */}
        {showCalendarModal && (
          <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '620px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '700' }}>📅 Staff Monthly Attendance Calendar</h3>
                <button onClick={() => setShowCalendarModal(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
              </div>

              {/* Staff Selector & Month Navigation */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Select Staff Member</label>
                  <select 
                    value={calendarStaffId} 
                    onChange={e => setCalendarStaffId(e.target.value)} 
                    style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: '600' }}
                  >
                    {staffList.map(s => (
                      <option key={s._id} value={s._id}>{s.name} ({s.role})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Select Month & Year</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <select 
                      value={currentMonth} 
                      onChange={e => setCurrentMonth(Number(e.target.value))}
                      style={{ flex: 1, padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
                    >
                      {monthNames.map((m, idx) => (
                        <option key={idx} value={idx}>{m}</option>
                      ))}
                    </select>
                    <select 
                      value={currentYear} 
                      onChange={e => setCurrentYear(Number(e.target.value))}
                      style={{ width: '80px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
                    >
                      <option value={2025}>2025</option>
                      <option value={2026}>2026</option>
                      <option value={2027}>2027</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Selected Day Control Bar */}
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                  Selected Date: <span style={{ color: '#2563eb' }}>{selectedDay} {monthNames[currentMonth]} {currentYear}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    type="button" 
                    onClick={() => setDayStatus('P')}
                    style={{ padding: '6px 14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}
                  >
                    ✓ Mark Present
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setDayStatus('A')}
                    style={{ padding: '6px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}
                  >
                    ✕ Mark Absent
                  </button>
                </div>
              </div>

              {/* Calendar Grid Header */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', textAlign: 'center', marginBottom: '6px', fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>
                <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
              </div>

              {/* Calendar Days Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '20px' }}>
                {Array.from({ length: firstDayIndex }).map((_, i) => (
                  <div key={`empty-${i}`} style={{ height: '40px' }}></div>
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const key = `${calendarStaffId}_${currentYear}_${currentMonth}_${dayNum}`;
                  const status = attendanceRecords[key];
                  const isSelectedDay = selectedDay === dayNum;

                  let bg = '#f1f5f9';
                  let color = '#334155';
                  let border = isSelectedDay ? '2px solid #2563eb' : '1px solid #e2e8f0';

                  if (status === 'P') {
                    bg = '#dcfce7';
                    color = '#166534';
                  } else if (status === 'A') {
                    bg = '#fee2e2';
                    color = '#991b1b';
                  }

                  return (
                    <button
                      key={dayNum}
                      onClick={() => setSelectedDay(dayNum)}
                      style={{
                        height: '40px',
                        background: bg,
                        color: color,
                        border: border,
                        borderRadius: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '12px'
                      }}
                    >
                      <span>{dayNum}</span>
                      <span style={{ fontSize: '8px', fontWeight: 'normal' }}>
                        {status === 'P' ? 'P' : status === 'A' ? 'A' : '-'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Modal Footer Actions */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={handleSaveCalendarAttendance} style={{ flex: 1, padding: '10px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Save & Sync to Database</button>
                <button type="button" onClick={() => setShowCalendarModal(false)} style={{ flex: 1, padding: '10px', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Add Modal */}
        {showAddModal && (
          <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '460px', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '18px', color: '#0f172a', fontWeight: '700' }}>Add New Restaurant Staff</h3>
              <form onSubmit={handleAddStaff} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Full Name *</label>
                  <input type="text" value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} placeholder="e.g. Rahul Sharma" style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} required />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Role / Designation</label>
                    <select value={newStaff.role} onChange={e => setNewStaff({...newStaff, role: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                      <option value="Head Chef">Head Chef</option>
                      <option value="Line Cook">Line Cook</option>
                      <option value="Tandoori Master">Tandoori Master</option>
                      <option value="Captain">Captain</option>
                      <option value="Waiter">Waiter</option>
                      <option value="Cashier">Cashier</option>
                      <option value="Cleaner">Cleaner</option>
                      <option value="Delivery Boy">Delivery Boy</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Shift Timing</label>
                    <select value={newStaff.shift} onChange={e => setNewStaff({...newStaff, shift: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                      <option value="Morning (9 AM - 5 PM)">Morning (9 AM - 5 PM)</option>
                      <option value="Evening (5 PM - 1 AM)">Evening (5 PM - 1 AM)</option>
                      <option value="General Shift">General Shift</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Phone Number *</label>
                    <input type="text" value={newStaff.phone} onChange={e => setNewStaff({...newStaff, phone: e.target.value})} placeholder="10-digit number" style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} required />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Profile Photo</label>
                    <input type="file" accept="image/*" onChange={(e) => handleImageChange(e, false)} style={{ width: '100%', padding: '5px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box', fontSize: '11px' }} />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Basic Monthly Salary (₹) *</label>
                  <input type="number" value={newStaff.basicSalary} onChange={e => setNewStaff({...newStaff, basicSalary: e.target.value})} placeholder="e.g. 25000" style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} required />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button type="submit" style={{ flex: 1, padding: '10px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Save to Database</button>
                  <button type="button" onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: '10px', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingStaff && (
          <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '460px', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '18px', color: '#0f172a', fontWeight: '700' }}>Edit Staff Details</h3>
              <form onSubmit={handleUpdateStaff} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Full Name</label>
                  <input type="text" value={editingStaff.name} onChange={e => setEditingStaff({...editingStaff, name: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Role</label>
                    <select value={editingStaff.role} onChange={e => setEditingStaff({...editingStaff, role: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                      <option value="Head Chef">Head Chef</option>
                      <option value="Line Cook">Line Cook</option>
                      <option value="Tandoori Master">Tandoori Master</option>
                      <option value="Captain">Captain</option>
                      <option value="Waiter">Waiter</option>
                      <option value="Cashier">Cashier</option>
                      <option value="Cleaner">Cleaner</option>
                      <option value="Delivery Boy">Delivery Boy</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Shift</label>
                    <select value={editingStaff.shift} onChange={e => setEditingStaff({...editingStaff, shift: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                      <option value="Morning (9 AM - 5 PM)">Morning (9 AM - 5 PM)</option>
                      <option value="Evening (5 PM - 1 AM)">Evening (5 PM - 1 AM)</option>
                      <option value="General Shift">General Shift</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Update Photo</label>
                  <input type="file" accept="image/*" onChange={(e) => handleImageChange(e, true)} style={{ width: '100%', padding: '5px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Basic Salary (₹)</label>
                  <input type="number" value={editingStaff.basicSalary} onChange={e => setEditingStaff({...editingStaff, basicSalary: Number(e.target.value)})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} required />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button type="submit" style={{ flex: 1, padding: '10px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Update Details</button>
                  <button type="button" onClick={() => setEditingStaff(null)} style={{ flex: 1, padding: '10px', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}