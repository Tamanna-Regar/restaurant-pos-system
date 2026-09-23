import React, { useState, useEffect } from 'react';

export const DEFAULT_RBAC_MATRIX = {
  admin: ['tables', 'billing', 'kot', 'online', 'waiters', 'analytics', 'reports', 'recipes', 'payments', 'dayend', 'shifts', 'admin', 'inventory', 'expenses', 'reservations', 'staff', 'customers', 'audit'],
  manager: ['tables', 'billing', 'kot', 'online', 'analytics', 'reports', 'recipes', 'payments', 'shifts', 'inventory', 'expenses', 'reservations', 'staff', 'customers', 'audit'],
  cashier: ['tables', 'billing', 'kot', 'payments', 'dayend', 'shifts', 'customers'],
  waiter: ['tables', 'billing', 'kot', 'customers'],
  chef: ['kot'],
  inventory_manager: ['inventory', 'expenses', 'analytics', 'reports', 'recipes', 'payments'],
  delivery: ['tables', 'billing', 'online', 'payments', 'analytics']
};

export const PERMISSION_MODULES = [
  { key: 'tables', label: '🪑 Floor & Tables', desc: 'View floors, vacant/occupied table status' },
  { key: 'billing', label: '⚡ POS Billing', desc: 'Create KOTs, punch bills, apply discounts' },
  { key: 'kot', label: '👨‍🍳 Kitchen KDS', desc: 'View kitchen display, mark food ready' },
  { key: 'online', label: '🛵 Online Orders', desc: 'Manage Zomato/Swiggy delivery aggregator' },
  { key: 'payments', label: '💳 Payments & Settle', desc: 'Settle bills, record cash/UPI/card' },
  { key: 'dayend', label: '📋 Day-End Z-Report', desc: 'Close restaurant register and view daily reconciliation' },
  { key: 'shifts', label: '💼 Cashier Shifts', desc: 'Start/close cashier shifts and physical cash count' },
  { key: 'inventory', label: '📦 Inventory & Stock', desc: 'Purchase orders, stock tracking, batches' },
  { key: 'expenses', label: '💸 Expense Logging', desc: 'Log daily cash petty expenses' },
  { key: 'reservations', label: '📅 Reservations', desc: 'Book table slots and party events' },
  { key: 'staff', label: '👥 Staff & Payroll', desc: 'HRM, salary payments, shifts roster' },
  { key: 'customers', label: '👥 CRM & Loyalty', desc: 'Customer points lookup, birthday offers' },
  { key: 'recipes', label: '🍲 Recipe Builder', desc: 'Ingredient consumption per dish (BOM)' },
  { key: 'analytics', label: '📈 Analytics', desc: 'Peak hours heatmap, food combos' },
  { key: 'reports', label: '📊 Food Cost & Tax', desc: 'GST reports, Tally XML, Excel export' },
  { key: 'admin', label: '⚙️ Admin Settings', desc: 'System configuration, backups, branches' },
  { key: 'audit', label: '🛡️ Audit Logs', desc: 'Anti-theft tracking, deleted items, voice alerts' }
];

export const ROLES = [
  { key: 'admin', label: '👑 Admin (Owner)', badge: 'bg-purple-100 text-purple-800' },
  { key: 'manager', label: '👔 Manager', badge: 'bg-blue-100 text-blue-800' },
  { key: 'cashier', label: '💼 Cashier', badge: 'bg-emerald-100 text-emerald-800' },
  { key: 'waiter', label: '🏃 Waiter / Captain', badge: 'bg-amber-100 text-amber-800' },
  { key: 'chef', label: '👨‍🍳 Chef / Cook', badge: 'bg-rose-100 text-rose-800' },
  { key: 'inventory_manager', label: '📦 Store In-charge', badge: 'bg-cyan-100 text-cyan-800' },
  { key: 'delivery', label: '🛵 Delivery Rider', badge: 'bg-slate-100 text-slate-800' }
];

export function getActiveRbacMatrix() {
  try {
    const saved = localStorage.getItem('tamanna_rbac_matrix');
    return saved ? JSON.parse(saved) : DEFAULT_RBAC_MATRIX;
  } catch (e) {
    return DEFAULT_RBAC_MATRIX;
  }
}

export default function RbacMatrixManager() {
  const [matrix, setMatrix] = useState(() => getActiveRbacMatrix());
  const [saveStatus, setSaveStatus] = useState('');

  const togglePermission = (roleKey, moduleKey) => {
    setMatrix(prev => {
      const currentRolePerms = prev[roleKey] || [];
      const hasPerm = currentRolePerms.includes(moduleKey);
      const updated = hasPerm
        ? currentRolePerms.filter(k => k !== moduleKey)
        : [...currentRolePerms, moduleKey];

      return { ...prev, [roleKey]: updated };
    });
  };

  const handleSave = () => {
    localStorage.setItem('tamanna_rbac_matrix', JSON.stringify(matrix));
    window.dispatchEvent(new CustomEvent('tamanna-rbac-updated', { detail: matrix }));
    setSaveStatus('✅ Permissions Matrix saved successfully! Applied across all active sessions.');
    setTimeout(() => setSaveStatus(''), 4000);
  };

  const handleReset = () => {
    if (window.confirm('Reset all permissions to factory recommended defaults?')) {
      setMatrix(DEFAULT_RBAC_MATRIX);
      localStorage.setItem('tamanna_rbac_matrix', JSON.stringify(DEFAULT_RBAC_MATRIX));
      window.dispatchEvent(new CustomEvent('tamanna-rbac-updated', { detail: DEFAULT_RBAC_MATRIX }));
      setSaveStatus('🔄 Reset to default permissions matrix.');
      setTimeout(() => setSaveStatus(''), 4000);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>🛡️</span> Granular Role-Based Access Control (RBAC)
          </h3>
          <p className="text-xs text-slate-500">
            Define exact tab and feature permissions for each restaurant employee role.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-semibold rounded-lg transition"
          >
            Reset to Defaults
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-md transition flex items-center space-x-1.5"
          >
            <span>💾</span>
            <span>Save Matrix</span>
          </button>
        </div>
      </div>

      {saveStatus && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold">
          {saveStatus}
        </div>
      )}

      {/* Permissions Matrix Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="py-3 px-4 font-bold text-slate-700 min-w-[200px]">Module / Tab Feature</th>
              {ROLES.map(role => (
                <th key={role.key} className="py-3 px-3 text-center min-w-[110px]">
                  <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${role.badge}`}>
                    {role.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {PERMISSION_MODULES.map(mod => (
              <tr key={mod.key} className="hover:bg-slate-50/80 transition">
                <td className="py-3 px-4">
                  <div className="font-bold text-slate-800">{mod.label}</div>
                  <div className="text-[10px] text-slate-400">{mod.desc}</div>
                </td>
                {ROLES.map(role => {
                  const isChecked = (matrix[role.key] || []).includes(mod.key);
                  const isSuperAdmin = role.key === 'admin' && mod.key === 'admin';

                  return (
                    <td key={role.key} className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isSuperAdmin}
                        onChange={() => togglePermission(role.key, mod.key)}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer disabled:opacity-50"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

