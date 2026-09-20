import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const emptyRow = { ingredientId: '', quantityRequired: '' };

export default function RecipeBuilder() {
  const [menuItems, setMenuItems] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [rows, setRows] = useState([{ ...emptyRow }]);
  const [recipeCost, setRecipeCost] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedMenuItem = useMemo(() => menuItems.find((item) => String(item._id) === String(selectedItem)), [menuItems, selectedItem]);

  const loadData = async () => {
    try {
      const [menuResponse, ingredientResponse] = await Promise.all([api.get('/menu'), api.get('/ingredients')]);
      const menu = menuResponse.data?.data || menuResponse.data || [];
      const stock = ingredientResponse.data?.data || ingredientResponse.data || [];
      setMenuItems(Array.isArray(menu) ? menu : []);
      setIngredients(Array.isArray(stock) ? stock : []);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Menu items or ingredients could not be loaded.');
    }
  };

  useEffect(() => { loadData(); }, []);

  const loadExistingRecipe = async (itemId) => {
    setRecipeCost(null);
    if (!itemId) {
      setRows([{ ...emptyRow }]);
      return;
    }
    try {
      const response = await api.get('/recipes');
      const recipes = response.data?.data || [];
      const recipe = recipes.find((entry) => String(entry.itemId?._id || entry.itemId) === String(itemId));
      setRows(recipe?.ingredients?.length ? recipe.ingredients.map((entry) => ({
        ingredientId: entry.ingredientId?._id || entry.ingredientId,
        quantityRequired: entry.quantityRequired
      })) : [{ ...emptyRow }]);
      const costResponse = await api.get(`/recipes/cost/${itemId}`).catch(() => null);
      setRecipeCost(costResponse?.data?.data || null);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Recipe could not be loaded.');
    }
  };

  const updateRow = (index, key, value) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));

  const saveRecipe = async (event) => {
    event.preventDefault();
    const usableRows = rows.filter((row) => row.ingredientId && Number(row.quantityRequired) > 0);
    if (!selectedItem || !usableRows.length) {
      setMessage('Menu item aur kam se kam ek valid ingredient required hai.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      await api.post('/recipes', {
        itemId: selectedItem,
        ingredients: usableRows.map((row) => ({ ingredientId: row.ingredientId, quantityRequired: Number(row.quantityRequired) }))
      });
      const costResponse = await api.get(`/recipes/cost/${selectedItem}`);
      setRecipeCost(costResponse.data?.data || null);
      setMessage('Recipe successfully save ho gayi.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Recipe could not be saved.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: '#f8fafc' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h2 style={{ margin: 0, color: '#0f172a' }}>🍲 Recipe Builder & Costing</h2>
        <p style={{ color: '#64748b', fontSize: 13 }}>Set the exact ingredient quantity for each menu item.</p>
        {message && <div style={{ padding: 10, margin: '12px 0', borderRadius: 7, background: message.includes('successfully') ? '#dcfce7' : '#fee2e2', color: message.includes('successfully') ? '#166534' : '#991b1b' }}>{message}</div>}
        <form onSubmit={saveRecipe} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#475569', fontWeight: 700 }}>Menu Item
            <select value={selectedItem} onChange={(event) => { setSelectedItem(event.target.value); loadExistingRecipe(event.target.value); }} style={{ display: 'block', width: '100%', marginTop: 6, padding: 10, border: '1px solid #cbd5e1', borderRadius: 7 }}>
              <option value="">Select menu item</option>
              {menuItems.map((item) => <option value={item._id} key={item._id}>{item.name} — ₹{item.price}</option>)}
            </select>
          </label>
          <div style={{ marginTop: 16 }}>
            {rows.map((row, index) => (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 40px', gap: 8, marginBottom: 8 }}>
                <select value={row.ingredientId} onChange={(event) => updateRow(index, 'ingredientId', event.target.value)} style={{ padding: 9, border: '1px solid #cbd5e1', borderRadius: 7 }}>
                  <option value="">Select ingredient</option>
                  {ingredients.map((ingredient) => <option value={ingredient._id} key={ingredient._id}>{ingredient.name} ({ingredient.unit})</option>)}
                </select>
                <input type="number" min="0.001" step="0.001" placeholder="Qty per item" value={row.quantityRequired} onChange={(event) => updateRow(index, 'quantityRequired', event.target.value)} style={{ padding: 9, border: '1px solid #cbd5e1', borderRadius: 7 }} />
                <button type="button" onClick={() => setRows((current) => current.length === 1 ? [{ ...emptyRow }] : current.filter((_, rowIndex) => rowIndex !== index))} style={{ border: 0, borderRadius: 7, background: '#fee2e2', color: '#b91c1c', cursor: 'pointer' }}>×</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => setRows((current) => [...current, { ...emptyRow }])} style={{ padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', cursor: 'pointer' }}>+ Ingredient</button>
            <button type="submit" disabled={loading} style={{ padding: '9px 14px', border: 0, borderRadius: 7, background: '#0f172a', color: '#fff', cursor: 'pointer' }}>{loading ? 'Saving...' : 'Save Recipe'}</button>
          </div>
        </form>
        {recipeCost && selectedMenuItem && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, marginTop: 16 }}>
            <h3 style={{ margin: 0, color: '#0f172a' }}>{selectedMenuItem.name} Cost Summary</h3>
            <p style={{ color: '#64748b', fontSize: 13 }}>Food cost: <b>₹{Number(recipeCost.cost || 0).toFixed(2)}</b> · Selling price: <b>₹{Number(recipeCost.sellingPrice || 0).toFixed(2)}</b> · Food cost %: <b>{Number(recipeCost.foodCostPercent || 0).toFixed(2)}%</b></p>
            {recipeCost.breakdown?.map((entry) => <div key={String(entry.ingredientId)} style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', padding: '8px 0', fontSize: 13 }}><span>{entry.name} · {entry.quantity} {entry.unit}</span><b>₹{Number(entry.cost || 0).toFixed(2)}</b></div>)}
          </div>
        )}
      </div>
    </div>
  );
}
