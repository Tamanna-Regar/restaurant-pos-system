import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { announceAuditEvent, playTone } from '../utils/audioAlert';

const emptyRow = { ingredientId: '', quantityRequired: '' };

const NON_FOOD_CATEGORIES = ['Decorations', 'Party Packages', 'Party Add-ons'];

// Green under 30% food cost, yellow 30-40%, red above 40% — standard restaurant benchmark bands.
const foodCostColor = (percent) => {
  if (percent === null || percent === undefined) return { bg: '#f1f5f9', fg: '#475569', border: '#e2e8f0' };
  if (percent < 25) return { bg: '#eff6ff', fg: '#1e40af', border: '#bfdbfe' }; // High profit
  if (percent <= 35) return { bg: '#dcfce7', fg: '#166534', border: '#bbf7d0' }; // Optimal standard
  if (percent <= 42) return { bg: '#fef9c3', fg: '#92400e', border: '#fde68a' }; // Moderate
  return { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' }; // High food cost
};

const getAdvisorBadge = (percent) => {
  if (percent === null || percent === undefined) return null;
  if (percent < 25) {
    return {
      title: '🔵 High Profit Margin (<25%)',
      desc: 'Super high gross margin! Great item to feature on specials and combos.'
    };
  }
  if (percent <= 35) {
    return {
      title: '🟢 Optimal Industry Standard (25% - 35%)',
      desc: 'Ideal food cost ratio for a successful Indian dining restaurant.'
    };
  }
  if (percent <= 42) {
    return {
      title: '🟡 Moderate Margin (35% - 42%)',
      desc: 'Acceptable for rich paneer/ghee specialty dishes, but monitor raw material prices.'
    };
  }
  return {
    title: '🔴 High Food Cost Alert (>42%)',
    desc: 'Warning: Margin is tight. Consider slightly increasing menu price or reducing costly portions.'
  };
};

/* ─── Kitchen SOP Recipe Print Modal ─── */
function RecipePrintModal({ item, recipe, costData, onClose }) {
  if (!item) return null;
  const handlePrint = () => window.print();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 30, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        
        {/* Actions bar (hidden in print) */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>📋 Kitchen SOP Recipe Card</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handlePrint} style={{ padding: '8px 16px', background: '#0f172a', color: '#fff', border: 0, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              🖨️ Print / Save PDF
            </button>
            <button onClick={onClose} style={{ padding: '8px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              ✕ Close
            </button>
          </div>
        </div>

        {/* Printable Card */}
        <div style={{ fontFamily: 'Inter, sans-serif', color: '#0f172a' }}>
          <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: 14, marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Tamanna Restaurant</h2>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Official Kitchen Standard Operating Procedure (SOP)</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            <div><strong>Dish Name:</strong> {item.name}</div>
            <div><strong>Category:</strong> {item.category || 'General'}</div>
            <div><strong>Portion Size:</strong> {recipe?.portionSize || '1 Serving'}</div>
            <div><strong>Selling Price:</strong> ₹{Number(item.price || 0).toFixed(2)}</div>
            <div><strong>Total Recipe Cost:</strong> ₹{Number(costData?.cost || 0).toFixed(2)}</div>
            <div><strong>Food Cost %:</strong> {costData?.foodCostPercent != null ? `${costData.foodCostPercent}%` : 'N/A'}</div>
          </div>

          <h4 style={{ margin: '14px 0 8px', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            🥣 Required Ingredients (Per Portion)
          </h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px' }}>#</th>
                <th style={{ padding: '6px 8px' }}>Ingredient</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Quantity</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {(costData?.breakdown || []).map((b, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '7px 8px', color: '#64748b' }}>{idx + 1}</td>
                  <td style={{ padding: '7px 8px', fontWeight: 600 }}>{b.name}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>{b.quantity} {b.unit}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600 }}>₹{b.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {recipe?.instructions && (
            <div style={{ marginTop: 14, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px' }}>
              <strong style={{ fontSize: 13, color: '#92400e', display: 'block', marginBottom: 4 }}>👨‍🍳 Chef Cooking &amp; Presentation Notes:</strong>
              <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{recipe.instructions}</div>
            </div>
          )}

          <div style={{ marginTop: 24, paddingTop: 10, borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
            <span>Standardized Recipe Document</span>
            <span>Printed: {new Date().toLocaleDateString('en-IN')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RecipeBuilder() {
  const [menuItems, setMenuItems] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [recipes, setRecipes] = useState([]);

  const [selectedItem, setSelectedItem] = useState('');
  const [currentRecipeId, setCurrentRecipeId] = useState(null);
  const [rows, setRows] = useState([{ ...emptyRow }]);
  const [recipeCost, setRecipeCost] = useState(null);
  const [instructions, setInstructions] = useState('');
  const [portionSize, setPortionSize] = useState('1 Serving');

  const [message, setMessage] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState('builder'); // 'builder' | 'all'
  const [allRecipesCosts, setAllRecipesCosts] = useState({});
  const [allRecipesSearch, setAllRecipesSearch] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [hideNonFood, setHideNonFood] = useState(true);

  const [batchMode, setBatchMode] = useState(false);
  const [batchYield, setBatchYield] = useState(1);
  const [copyFromId, setCopyFromId] = useState('');
  const [printModalOpen, setPrintModalOpen] = useState(false);

  // Quick-add modal for creating a brand new ingredient
  const [addIngredientRow, setAddIngredientRow] = useState(null);
  const [newIngredientForm, setNewIngredientForm] = useState({ name: '', unit: 'kg', category: 'Other', costPerUnit: '', stock: '0', minLimit: '5' });
  const [addingIngredient, setAddingIngredient] = useState(false);

  const selectedMenuItem = useMemo(
    () => menuItems.find((item) => String(item._id) === String(selectedItem)),
    [menuItems, selectedItem]
  );

  const ingredientById = useMemo(() => {
    const map = new Map();
    ingredients.forEach((ing) => map.set(String(ing._id), ing));
    return map;
  }, [ingredients]);

  const recipesByItemId = useMemo(() => {
    const map = new Map();
    recipes.forEach((recipe) => {
      const itemId = recipe.itemId?._id || recipe.itemId;
      if (itemId) map.set(String(itemId), recipe);
    });
    return map;
  }, [recipes]);

  // Client-side cost calc from a populated recipe
  const computeRecipeCost = (recipe, menuItem) => {
    if (!recipe) return null;
    const breakdown = (recipe.ingredients || []).map((entry) => {
      const ingredient = entry.ingredientId && entry.ingredientId.name ? entry.ingredientId : ingredientById.get(String(entry.ingredientId));
      const quantity = Number(entry.quantityRequired || 0);
      const unitCost = Number(ingredient?.costPerUnit || 0);
      return {
        ingredientId: ingredient?._id,
        name: ingredient?.name || 'Unknown',
        unit: ingredient?.unit || '',
        quantity,
        unitCost,
        cost: Number((quantity * unitCost).toFixed(2))
      };
    });
    const cost = breakdown.reduce((sum, entry) => sum + entry.cost, 0);
    const sellingPrice = Number(menuItem?.price || 0);
    return {
      breakdown,
      cost: Number(cost.toFixed(2)),
      sellingPrice,
      margin: Number((sellingPrice - cost).toFixed(2)),
      foodCostPercent: sellingPrice > 0 ? Number(((cost / sellingPrice) * 100).toFixed(2)) : null,
      instructions: recipe.instructions || '',
      portionSize: recipe.portionSize || '1 Serving'
    };
  };

  const loadData = async () => {
    setInitialLoading(true);
    try {
      const [menuResponse, ingredientResponse, recipeResponse] = await Promise.all([
        api.get('/menu'),
        api.get('/ingredients'),
        api.get('/recipes')
      ]);
      const menu = menuResponse.data?.data || menuResponse.data || [];
      const stock = ingredientResponse.data?.data || ingredientResponse.data || [];
      const allRecipes = recipeResponse.data?.data || [];
      setMenuItems(Array.isArray(menu) ? menu : []);
      setIngredients(Array.isArray(stock) ? stock : []);
      setRecipes(Array.isArray(allRecipes) ? allRecipes : []);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Menu items or ingredients could not be loaded.');
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const applyRecipeToForm = (recipe) => {
    setCurrentRecipeId(recipe?._id || null);
    setInstructions(recipe?.instructions || '');
    setPortionSize(recipe?.portionSize || '1 Serving');
    setRows(recipe?.ingredients?.length
      ? recipe.ingredients.map((entry) => ({
          ingredientId: entry.ingredientId?._id || entry.ingredientId,
          quantityRequired: entry.quantityRequired
        }))
      : [{ ...emptyRow }]);
    setBatchMode(false);
    setBatchYield(1);
  };

  const loadExistingRecipe = async (itemId) => {
    setRecipeCost(null);
    setCurrentRecipeId(null);
    if (!itemId) {
      setRows([{ ...emptyRow }]);
      setInstructions('');
      setPortionSize('1 Serving');
      return;
    }
    setDetailLoading(true);
    try {
      const recipe = recipesByItemId.get(String(itemId));
      applyRecipeToForm(recipe);
      if (recipe) {
        const costResponse = await api.get(`/recipes/cost/${itemId}`).catch(() => null);
        setRecipeCost(costResponse?.data?.data || null);
      }
    } catch (error) {
      setMessage(error.response?.data?.message || 'Recipe could not be loaded.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectItem = (itemId) => {
    if (dirty && !window.confirm('Aapke unsaved changes lost ho jayenge. Continue karein?')) {
      return;
    }
    setSelectedItem(itemId);
    setDirty(false);
    setMessage('');
    setCopyFromId('');
    loadExistingRecipe(itemId);
  };

  const updateRow = (index, key, value) => {
    setDirty(true);
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  };

  const handleIngredientSelect = (index, value) => {
    if (value === '__add_new__') {
      setAddIngredientRow(index);
      setNewIngredientForm({ name: '', unit: 'kg', category: 'Other', costPerUnit: '', stock: '0', minLimit: '5' });
      return;
    }
    updateRow(index, 'ingredientId', value);
  };

  const submitNewIngredient = async (event) => {
    event.preventDefault();
    const name = newIngredientForm.name.trim();
    if (!name) {
      setMessage('Ingredient ka naam likhna zaroori hai.');
      return;
    }
    setAddingIngredient(true);
    try {
      const response = await api.post('/ingredients', {
        name,
        unit: newIngredientForm.unit,
        category: newIngredientForm.category,
        costPerUnit: Number(newIngredientForm.costPerUnit || 0),
        stock: Number(newIngredientForm.stock || 0),
        currentStock: Number(newIngredientForm.stock || 0),
        minLimit: Number(newIngredientForm.minLimit || 0),
        minStockAlert: Number(newIngredientForm.minLimit || 0)
      });
      const created = response.data?.data || response.data;
      if (!created?._id) throw new Error('Ingredient create response was unexpected.');

      setIngredients((prev) => [...prev, created]);
      if (addIngredientRow !== null) {
        updateRow(addIngredientRow, 'ingredientId', created._id);
      }
      setAddIngredientRow(null);
      setMessage(`"${created.name}" ingredient add ho gaya aur is row mein select bhi ho gaya.`);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Naya ingredient create nahi ho paaya.');
    } finally {
      setAddingIngredient(false);
    }
  };

  const addRow = () => {
    setDirty(true);
    setRows((current) => [...current, { ...emptyRow }]);
  };

  const removeRow = (index) => {
    setDirty(true);
    setRows((current) => (current.length === 1 ? [{ ...emptyRow }] : current.filter((_, rowIndex) => rowIndex !== index)));
  };

  const duplicateIngredientIds = useMemo(() => {
    const seen = new Map();
    rows.forEach((row) => {
      if (!row.ingredientId) return;
      seen.set(row.ingredientId, (seen.get(row.ingredientId) || 0) + 1);
    });
    return new Set([...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id));
  }, [rows]);

  const hasDuplicates = duplicateIngredientIds.size > 0;

  const effectiveQuantity = (row) => {
    const qty = Number(row.quantityRequired || 0);
    if (!batchMode) return qty;
    const yieldCount = Number(batchYield || 0);
    return yieldCount > 0 ? qty / yieldCount : 0;
  };

  const rowCostPreview = (row) => {
    const ingredient = ingredientById.get(row.ingredientId);
    if (!ingredient) return null;
    const qty = effectiveQuantity(row);
    if (!qty) return null;
    return Number((qty * Number(ingredient.costPerUnit || 0)).toFixed(2));
  };

  const servingsFromStock = useMemo(() => {
    const usable = rows.filter((row) => row.ingredientId && effectiveQuantity(row) > 0);
    if (!usable.length) return null;
    let min = Infinity;
    usable.forEach((row) => {
      const ingredient = ingredientById.get(row.ingredientId);
      const qty = effectiveQuantity(row);
      if (!ingredient || !qty) return;
      const possible = Math.floor(Number(ingredient.currentStock || 0) / qty);
      if (possible < min) min = possible;
    });
    return Number.isFinite(min) ? min : null;
  }, [rows, ingredientById, batchMode, batchYield]);

  const copyRecipeFrom = (fromItemId) => {
    const sourceRecipe = recipesByItemId.get(String(fromItemId));
    if (!sourceRecipe) {
      setMessage('Selected item ki koi recipe nahi mili copy karne ke liye.');
      return;
    }
    setRows(sourceRecipe.ingredients.map((entry) => ({
      ingredientId: entry.ingredientId?._id || entry.ingredientId,
      quantityRequired: entry.quantityRequired
    })));
    setInstructions(sourceRecipe.instructions || '');
    setPortionSize(sourceRecipe.portionSize || '1 Serving');
    setBatchMode(false);
    setBatchYield(1);
    setDirty(true);
    setMessage('Recipe copy ho gayi — save karne se pehle quantities check kar lein.');
  };

  const saveRecipe = async (event) => {
    event.preventDefault();
    if (hasDuplicates) {
      setMessage('Ek hi ingredient multiple rows mein select hai — pehle usko theek karein.');
      return;
    }
    const usableRows = rows
      .filter((row) => row.ingredientId && Number(row.quantityRequired) > 0)
      .map((row) => ({ ingredientId: row.ingredientId, quantityRequired: effectiveQuantity(row) }))
      .filter((row) => row.quantityRequired > 0);

    if (!selectedItem || !usableRows.length) {
      setMessage('Menu item aur kam se kam ek valid ingredient required hai.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const response = await api.post('/recipes', {
        itemId: selectedItem,
        ingredients: usableRows,
        instructions,
        portionSize
      });
      const savedRecipe = response.data?.data;
      setCurrentRecipeId(savedRecipe?._id || null);

      const costResponse = await api.get(`/recipes/cost/${selectedItem}`);
      setRecipeCost(costResponse.data?.data || null);
      setMessage('Recipe successfully save ho gayi.');
      announceAuditEvent('RECIPE_UPDATE', { dishName: selectedMenuItem?.name });
      setDirty(false);
      setBatchMode(false);
      setBatchYield(1);
      await loadData();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Recipe could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const deleteRecipe = async () => {
    if (!currentRecipeId) return;
    if (!window.confirm(`${selectedMenuItem?.name || 'Ye'} ki recipe delete karna chahte hain?`)) return;
    setDeleting(true);
    try {
      await api.delete(`/recipes/${currentRecipeId}`);
      setMessage('Recipe delete ho gayi.');
      announceAuditEvent('RECIPE_DELETE', { dishName: selectedMenuItem?.name });
      setCurrentRecipeId(null);
      setRows([{ ...emptyRow }]);
      setRecipeCost(null);
      setInstructions('');
      setPortionSize('1 Serving');
      setDirty(false);
      await loadData();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Recipe delete nahi ho paayi.');
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (view !== 'all' || !menuItems.length) return;
    const costs = {};
    menuItems.forEach((item) => {
      const recipe = recipesByItemId.get(String(item._id));
      costs[item._id] = recipe ? computeRecipeCost(recipe, item) : null;
    });
    setAllRecipesCosts(costs);
  }, [view, menuItems, recipesByItemId, ingredientById]);

  // Categories extracted from menu items
  const categories = useMemo(() => {
    const cats = new Set();
    menuItems.forEach((i) => {
      if (i.category) cats.add(i.category);
    });
    return ['All', ...Array.from(cats).sort()];
  }, [menuItems]);

  const visibleMenuItems = useMemo(() => {
    return hideNonFood ? menuItems.filter((i) => !NON_FOOD_CATEGORIES.includes(i.category)) : menuItems;
  }, [menuItems, hideNonFood]);

  const missingRecipeCount = visibleMenuItems.filter((item) => !recipesByItemId.has(String(item._id))).length;
  const definedRecipeCount = visibleMenuItems.length - missingRecipeCount;

  const avgFoodCostPercent = useMemo(() => {
    const values = Object.values(allRecipesCosts)
      .filter((cost) => cost && cost.foodCostPercent !== null && cost.foodCostPercent !== undefined)
      .map((cost) => cost.foodCostPercent);
    if (!values.length) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }, [allRecipesCosts]);

  const filteredMenuItems = useMemo(() => {
    const term = allRecipesSearch.trim().toLowerCase();
    return visibleMenuItems.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      const hasRecipe = recipesByItemId.has(String(item._id));
      if (missingOnly && hasRecipe) return false;
      if (term && !item.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [visibleMenuItems, recipesByItemId, allRecipesSearch, missingOnly, selectedCategory]);

  const copyCandidates = menuItems.filter((item) => String(item._id) !== String(selectedItem) && recipesByItemId.has(String(item._id)));

  return (
    <div style={{ flex: 1, height: '100%', width: '100%', boxSizing: 'border-box', background: '#f8fafc', overflowY: 'auto', padding: '24px 28px' }}>
      {/* Recipe Print / SOP Modal */}
      {printModalOpen && selectedMenuItem && (
        <RecipePrintModal
          item={selectedMenuItem}
          recipe={{ portionSize, instructions }}
          costData={recipeCost}
          onClose={() => setPrintModalOpen(false)}
        />
      )}

      <div style={{ maxWidth: 1040, margin: '0 auto', paddingBottom: 60 }}>
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, color: '#0f172a', fontWeight: 900 }}>🍲 Recipe Builder &amp; Food Costing</h2>
            <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Configure exact portion ingredients, calculate live food cost % and manage kitchen SOPs.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setView('builder')}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: view === 'builder' ? '#0f172a' : '#fff', color: view === 'builder' ? '#fff' : '#334155', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              🛠️ Recipe Builder
            </button>
            <button
              onClick={() => setView('all')}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: view === 'all' ? '#0f172a' : '#fff', color: view === 'all' ? '#fff' : '#334155', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              📑 All Recipes {missingRecipeCount > 0 && <span style={{ marginLeft: 6, background: '#fee2e2', color: '#b91c1c', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 800 }}>{missingRecipeCount} missing</span>}
            </button>
          </div>
        </div>

        {message && (
          <div style={{ padding: '10px 14px', margin: '14px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, background: message.includes('successfully') || message.includes('ho gayi') ? '#dcfce7' : '#fee2e2', color: message.includes('successfully') || message.includes('ho gayi') ? '#166534' : '#991b1b', border: `1px solid ${message.includes('successfully') || message.includes('ho gayi') ? '#86efac' : '#fca5a5'}` }}>
            {message}
          </div>
        )}

        {initialLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Loading menu, ingredients aur recipes...</div>
        ) : view === 'all' ? (
          <div style={{ marginTop: 14 }}>
            {/* Summary KPI Bar */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={{ flex: '1 1 140px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Active Food Dishes</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{visibleMenuItems.length}</div>
              </div>
              <div style={{ flex: '1 1 140px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 11, color: '#059669', fontWeight: 700, textTransform: 'uppercase' }}>✅ Recipes Configured</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#065f46', marginTop: 2 }}>{definedRecipeCount}</div>
              </div>
              <div style={{ flex: '1 1 140px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, textTransform: 'uppercase' }}>⚠️ Needs Recipe</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#991b1b', marginTop: 2 }}>{missingRecipeCount}</div>
              </div>
              <div style={{ flex: '1 1 140px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Average Food Cost %</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{avgFoodCostPercent !== null ? `${avgFoodCostPercent.toFixed(1)}%` : '—'}</div>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', background: '#fff', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <input
                type="text"
                placeholder="🔍 Search dish by name..."
                value={allRecipesSearch}
                onChange={(e) => setAllRecipesSearch(e.target.value)}
                style={{ flex: '1 1 200px', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, outline: 'none' }}
              />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{ padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, background: '#fff', minWidth: 150 }}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c === 'All' ? '📂 All Categories' : c}</option>
                ))}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', fontWeight: 700, cursor: 'pointer' }}>
                <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
                Missing Only
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', fontWeight: 700, cursor: 'pointer', marginLeft: 8 }}>
                <input type="checkbox" checked={hideNonFood} onChange={(e) => setHideNonFood(e.target.checked)} />
                Hide Non-Food (Decor &amp; Packages)
              </label>
            </div>

            {/* All Recipes Table */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left', color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '10px 14px' }}>Dish Name</th>
                    <th style={{ padding: '10px 14px' }}>Category</th>
                    <th style={{ padding: '10px 14px' }}>Selling Price</th>
                    <th style={{ padding: '10px 14px' }}>Food Cost</th>
                    <th style={{ padding: '10px 14px' }}>Food Cost %</th>
                    <th style={{ padding: '10px 14px' }}>Status</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMenuItems.map((item) => {
                    const hasRecipe = recipesByItemId.has(String(item._id));
                    const cost = allRecipesCosts[item._id];
                    const colors = foodCostColor(cost?.foodCostPercent);
                    return (
                      <tr key={item._id} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>{item.name}</td>
                        <td style={{ padding: '10px 14px', color: '#64748b', fontSize: 12 }}>{item.category || '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#0f172a', fontWeight: 600 }}>₹{Number(item.price || 0).toFixed(2)}</td>
                        <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 600 }}>{hasRecipe ? `₹${Number(cost?.cost || 0).toFixed(2)}` : '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {hasRecipe ? (
                            <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}` }}>
                              {cost?.foodCostPercent !== null && cost?.foodCostPercent !== undefined ? `${cost.foodCostPercent.toFixed(1)}%` : 'N/A'}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {hasRecipe ? (
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: 4 }}>
                              ✅ Configured
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>
                              ⚠️ Missing
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <button
                            onClick={() => { setView('builder'); handleSelectItem(item._id); }}
                            style={{ padding: '5px 12px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', color: '#0f172a', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                          >
                            {hasRecipe ? '✏️ Edit' : '+ Add Recipe'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredMenuItems.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No items match your search/filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            <form onSubmit={saveRecipe} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 22, marginTop: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 14, alignItems: 'flex-start' }}>
                <label style={{ display: 'block', fontSize: 12, color: '#475569', fontWeight: 700 }}>Select Menu Item
                  <select
                    value={selectedItem}
                    onChange={(event) => handleSelectItem(event.target.value)}
                    style={{ display: 'block', width: '100%', marginTop: 6, padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, background: '#fff' }}
                  >
                    <option value="">-- Choose item to build recipe --</option>
                    {menuItems.map((item) => (
                      <option value={item._id} key={item._id}>
                        {recipesByItemId.has(String(item._id)) ? '✅ ' : '⚠️ '}{item.name} — ₹{item.price} ({item.category})
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'block', fontSize: 12, color: '#475569', fontWeight: 700 }}>Portion / Serving Size
                  <input
                    type="text"
                    placeholder="e.g. 1 Plate (300g)"
                    value={portionSize}
                    onChange={(e) => { setPortionSize(e.target.value); setDirty(true); }}
                    style={{ display: 'block', width: '100%', marginTop: 6, padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </label>
              </div>

              {selectedItem && copyCandidates.length > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, padding: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <span style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>📋 Copy recipe from another item:</span>
                  <select value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)} style={{ flex: 1, padding: 7, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, background: '#fff' }}>
                    <option value="">Select item to duplicate recipe</option>
                    {copyCandidates.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
                  </select>
                  <button type="button" disabled={!copyFromId} onClick={() => copyRecipeFrom(copyFromId)} style={{ padding: '7px 14px', borderRadius: 6, border: 0, background: copyFromId ? '#0f172a' : '#cbd5e1', color: '#fff', fontSize: 12, fontWeight: 700, cursor: copyFromId ? 'pointer' : 'not-allowed' }}>Copy</button>
                </div>
              )}

              {selectedItem && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 12, color: '#475569', fontWeight: 700 }}>
                  <input type="checkbox" checked={batchMode} onChange={(e) => { setBatchMode(e.target.checked); setDirty(true); }} />
                  Enter as Batch Quantities (e.g. a large gravy prepared for multiple portions at once)
                  {batchMode && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                      Yield:
                      <input
                        type="number"
                        min="1"
                        value={batchYield}
                        onChange={(e) => { setBatchYield(e.target.value); setDirty(true); }}
                        style={{ width: 70, padding: 6, border: '1px solid #cbd5e1', borderRadius: 6, fontWeight: 700 }}
                      />
                      portions
                    </span>
                  )}
                </label>
              )}

              {/* Recipe Ingredient Rows */}
              <div style={{ marginTop: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 110px 40px', gap: 8, paddingBottom: 6, borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  <span>Raw Material / Ingredient</span>
                  <span>{batchMode ? 'Batch Qty' : 'Portion Qty'}</span>
                  <span style={{ textAlign: 'right' }}>Calculated Cost</span>
                  <span />
                </div>

                <div style={{ marginTop: 8 }}>
                  {detailLoading ? (
                    <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading recipe data...</div>
                  ) : (
                    rows.map((row, index) => {
                      const isDuplicate = row.ingredientId && duplicateIngredientIds.has(row.ingredientId);
                      const preview = rowCostPreview(row);
                      return (
                        <div key={index} style={{ marginBottom: 8 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 110px 40px', gap: 8, alignItems: 'center' }}>
                            <select
                              value={row.ingredientId}
                              onChange={(event) => handleIngredientSelect(index, event.target.value)}
                              style={{ padding: '9px 10px', border: `1px solid ${isDuplicate ? '#fca5a5' : '#cbd5e1'}`, borderRadius: 8, background: isDuplicate ? '#fef2f2' : '#fff', fontSize: 13 }}
                            >
                              <option value="">-- Select ingredient --</option>
                              {ingredients.map((ingredient) => (
                                <option value={ingredient._id} key={ingredient._id}>
                                  {ingredient.name} ({ingredient.unit}) — ₹{ingredient.costPerUnit || 0}/{ingredient.unit}
                                </option>
                              ))}
                              <option value="__add_new__" style={{ fontWeight: 800, color: '#0f172a' }}>➕ Create New Ingredient</option>
                            </select>
                            <input
                              type="number"
                              min="0.001"
                              step="0.001"
                              placeholder={batchMode ? 'Batch Qty' : 'Portion Qty'}
                              value={row.quantityRequired}
                              onChange={(event) => updateRow(index, 'quantityRequired', event.target.value)}
                              style={{ padding: '9px 10px', border: `1px solid ${isDuplicate ? '#fca5a5' : '#cbd5e1'}`, borderRadius: 8, fontSize: 13 }}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 13, color: '#0f172a', fontWeight: 700 }}>
                              {preview !== null ? `₹${preview.toFixed(2)}` : '—'}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeRow(index)}
                              title="Remove row"
                              style={{ border: 0, borderRadius: 8, background: '#fee2e2', color: '#b91c1c', cursor: 'pointer', height: 36, fontWeight: 800, fontSize: 16 }}
                            >
                              ×
                            </button>
                          </div>
                          {isDuplicate && (
                            <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 3 }}>⚠️ Ye ingredient already ek aur row mein select hai — cost double count ho jayega.</div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {servingsFromStock !== null && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12, color: '#1e40af', fontWeight: 600 }}>
                  📦 Current inventory stock allows preparing approximately <strong>{servingsFromStock} {batchMode ? 'batches' : 'servings'}</strong> of this item.
                </div>
              )}

              {/* Chef SOP Instructions */}
              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#475569', fontWeight: 700, marginBottom: 6 }}>
                  👨‍🍳 Chef Cooking &amp; Preparation Instructions (Kitchen SOP Notes)
                </label>
                <textarea
                  rows="3"
                  placeholder="e.g. Sauté garlic in butter on high flame, simmer tomato gravy for 5 mins, add paneer and finish with fresh cream."
                  value={instructions}
                  onChange={(e) => { setInstructions(e.target.value); setDirty(true); }}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" onClick={addRow} style={{ padding: '9px 14px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                  + Add Ingredient
                </button>
                <button
                  type="submit"
                  disabled={saving || hasDuplicates || !selectedItem}
                  style={{
                    padding: '9px 18px', border: 0, borderRadius: 8,
                    background: saving || hasDuplicates || !selectedItem ? '#94a3b8' : '#0f172a',
                    color: '#fff', cursor: saving || hasDuplicates || !selectedItem ? 'not-allowed' : 'pointer',
                    fontWeight: 700, fontSize: 13
                  }}
                >
                  {saving ? 'Saving...' : '💾 Save Recipe'}
                </button>

                {currentRecipeId && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPrintModalOpen(true)}
                      style={{ padding: '9px 14px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                    >
                      🖨️ Print Recipe Card (SOP)
                    </button>
                    <button
                      type="button"
                      onClick={deleteRecipe}
                      disabled={deleting}
                      style={{ padding: '9px 14px', border: '1px solid #fecaca', borderRadius: 8, background: '#fef2f2', color: '#b91c1c', cursor: deleting ? 'not-allowed' : 'pointer', marginLeft: 'auto', fontWeight: 700, fontSize: 13 }}
                    >
                      {deleting ? 'Deleting...' : '🗑 Delete Recipe'}
                    </button>
                  </>
                )}
              </div>
            </form>

            {/* Cost & Profitability Summary Card */}
            {recipeCost && selectedMenuItem && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 22, marginTop: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <h3 style={{ margin: 0, color: '#0f172a', fontSize: 18, fontWeight: 800 }}>{selectedMenuItem.name} — Cost Summary</h3>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Portion: <strong>{portionSize || '1 Serving'}</strong></div>
                  </div>
                  {(() => {
                    const colors = foodCostColor(recipeCost.foodCostPercent);
                    return recipeCost.foodCostPercent !== null && recipeCost.foodCostPercent !== undefined ? (
                      <span style={{ padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 800, background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}` }}>
                        {recipeCost.foodCostPercent.toFixed(1)}% Food Cost
                      </span>
                    ) : null;
                  })()}
                </div>

                {/* Smart Advisor Alert */}
                {(() => {
                  const advisor = getAdvisorBadge(recipeCost.foodCostPercent);
                  if (!advisor) return null;
                  return (
                    <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13 }}>
                      <strong style={{ color: '#0f172a' }}>{advisor.title}</strong>
                      <div style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>{advisor.desc}</div>
                    </div>
                  );
                })()}

                {/* 3 Metric Pills */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>RAW MATERIAL COST</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#991b1b', marginTop: 2 }}>₹{Number(recipeCost.cost || 0).toFixed(2)}</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>SELLING PRICE</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>₹{Number(recipeCost.sellingPrice || 0).toFixed(2)}</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>GROSS MARGIN (PROFIT)</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#166534', marginTop: 2 }}>₹{Number(recipeCost.margin || 0).toFixed(2)}</div>
                  </div>
                </div>

                {/* Ingredient Breakdown List */}
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Ingredient Cost Breakdown</div>
                  {recipeCost.breakdown?.map((entry) => (
                    <div key={String(entry.ingredientId)} style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', padding: '8px 0', fontSize: 13 }}>
                      <span>{entry.name} · {entry.quantity} {entry.unit}</span>
                      <b>₹{Number(entry.cost || 0).toFixed(2)}</b>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Quick Add Ingredient Modal */}
      {addIngredientRow !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 26, borderRadius: 14, width: 420, maxWidth: 'calc(100vw - 28px)', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 17, color: '#0f172a', fontWeight: 800 }}>➕ Add New Ingredient</h3>
              <button onClick={() => setAddIngredientRow(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 0, marginBottom: 14 }}>
              Ye ingredient Inventory mein bhi ban jayega, aur is recipe row mein automatically select ho jayega.
            </p>
            <form onSubmit={submitNewIngredient} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Ingredient Name</label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="e.g. Desi Ghee"
                  value={newIngredientForm.name}
                  onChange={(e) => setNewIngredientForm({ ...newIngredientForm, name: e.target.value })}
                  style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Unit</label>
                  <select
                    value={newIngredientForm.unit}
                    onChange={(e) => setNewIngredientForm({ ...newIngredientForm, unit: e.target.value })}
                    style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', background: '#fff' }}
                  >
                    <option value="kg">kg</option>
                    <option value="ltr">ltr</option>
                    <option value="pcs">pcs</option>
                    <option value="pack">pack</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Category</label>
                  <select
                    value={newIngredientForm.category}
                    onChange={(e) => setNewIngredientForm({ ...newIngredientForm, category: e.target.value })}
                    style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', background: '#fff' }}
                  >
                    <option value="Vegetables">Vegetables</option>
                    <option value="Dairy">Dairy</option>
                    <option value="Grains &amp; Pulses">Grains &amp; Pulses</option>
                    <option value="Dry Goods">Dry Goods</option>
                    <option value="Beverages">Beverages</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Opening Stock</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={newIngredientForm.stock}
                    onChange={(e) => setNewIngredientForm({ ...newIngredientForm, stock: e.target.value })}
                    style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Min Limit</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={newIngredientForm.minLimit}
                    onChange={(e) => setNewIngredientForm({ ...newIngredientForm, minLimit: e.target.value })}
                    style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Cost per Unit (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Used for recipe costing"
                  value={newIngredientForm.costPerUnit}
                  onChange={(e) => setNewIngredientForm({ ...newIngredientForm, costPerUnit: e.target.value })}
                  style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <button type="button" onClick={() => setAddIngredientRow(null)} style={{ padding: '10px 16px', background: '#f1f5f9', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13, color: '#475569' }}>Cancel</button>
                <button type="submit" disabled={addingIngredient} style={{ padding: '10px 16px', background: addingIngredient ? '#64748b' : '#0f172a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: addingIngredient ? 'not-allowed' : 'pointer', fontSize: 13 }}>
                  {addingIngredient ? 'Adding...' : 'Add &amp; Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}