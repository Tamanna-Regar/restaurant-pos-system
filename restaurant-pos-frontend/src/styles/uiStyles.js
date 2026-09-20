// ---------------------------------------------------------------------------
// Clean, high-density POS UI styling.
// Palette: orange-red brand primary, white surfaces, dark ink text.
// ---------------------------------------------------------------------------
export const ui = {
  container: { display: 'flex', flexDirection: 'row', width: '100%', maxWidth: '100vw', height: '100vh', minHeight: 0, overflow: 'hidden', fontFamily: "'Inter', system-ui, sans-serif", backgroundColor: '#f8fafc', color: '#0f172a' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' },
  navBtn: { backgroundColor: 'transparent', color: '#64748b', border: '1px solid transparent', padding: '8px 10px', cursor: 'pointer', borderRadius: '8px', fontSize: '12px', fontWeight: '600' },
  navBtnActive: { backgroundColor: '#fff1ec', color: '#ea4615', border: '1px solid #fed7c7', padding: '8px 10px', cursor: 'pointer', borderRadius: '8px', fontSize: '12px', fontWeight: '700', boxShadow: '0 1px 2px rgba(252,79,26,0.08)' },
  logoutBtn: { backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '8px 10px', cursor: 'pointer', borderRadius: '8px', fontSize: '12px', fontWeight: '700' },
  floorTabBtn: { padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' },
  menuCard: { border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  menuImg: { width: '100%', height: '80px', objectFit: 'cover', display: 'block' },
  cartSidebar: { flex: '0 0 310px', width: '310px', minWidth: '280px', boxSizing: 'border-box', backgroundColor: '#ffffff', borderLeft: '1px solid #e2e8f0', padding: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflowY: 'auto', boxShadow: '-2px 0 5px rgba(0,0,0,0.02)' },
  inputField: { padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#0f172a', fontSize: '13px', outline: 'none' },
  categoryBtn: { padding: '5px 10px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#64748b', borderRadius: '16px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: '500' },
  categoryBtnActive: { padding: '5px 10px', border: 'none', backgroundColor: '#fc4f1a', color: '#fff', borderRadius: '16px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' },
  qtyBtn: { border: '1px solid #cbd5e1', backgroundColor: '#f1f5f9', color: '#0f172a', width: '22px', height: '22px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' },
  billRow: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', margin: '3px 0', color: '#64748b' },
  orderBtn: { width: '100%', padding: '8px', backgroundColor: '#fc4f1a', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px' },
  submitBtn: { padding: '7px 12px', backgroundColor: '#fc4f1a', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' },
  statCard: { backgroundColor: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  labelStyle: { fontSize: '11px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' },
  inputFieldFull: { padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#0f172a', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' },
  adminFormFull: { backgroundColor: '#ffffff', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(15,23,42,0.04)' },
  adminListFull: { backgroundColor: '#ffffff', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(15,23,42,0.04)' }
};