
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";

function AdminDashboard({ handleLogout }) {
  const [activeTab, setActiveTab] = useState("overview");

  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [loginActivity, setLoginActivity] = useState([]);
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", role: "waiter", branchId: "" });
  const [editingUser, setEditingUser] = useState(null);
  const [permissionForm, setPermissionForm] = useState({});
  const [editingMenuItem, setEditingMenuItem] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branchSummary, setBranchSummary] = useState([]);
  const [branchForm, setBranchForm] = useState({ name: "", code: "", address: "", phone: "", gstin: "" });
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [branchInventory, setBranchInventory] = useState([]);
  const [transferForm, setTransferForm] = useState({ ingredientId: "", fromBranchId: "", toBranchId: "", quantity: "", note: "" });

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [restaurant, setRestaurant] = useState(() => {
    try {
      return (
        JSON.parse(
          localStorage.getItem("restaurantSettings") || "null"
        ) || {
          name: "",
          address: "",
          phone: "",
          gstin: "",
        }
      );
    } catch {
      return {
        name: "",
        address: "",
        phone: "",
        gstin: "",
      };

    }
  });

  const [newItem, setNewItem] = useState({
    name: "",
    price: "",
    category: "Main Course",
    halfPrice: "",
    image: "",
    hsnSac: "",
    taxRate: "5",
    taxCategory: "taxable",
    addons: "",
  });

  const [newTable, setNewTable] = useState({
    tableNumber: "",
    capacity: "4",
    floor: "Floor 1",
    type: "Dining",
  });

  const loadData = async () => {
    try {
      setLoading(true);

      const [ordersRes, tablesRes, menuRes, branchesRes, comparisonRes] =
        await Promise.all([
          api
            .get("/orders/active")
            .catch(() => ({ data: { data: [] } })),

          api
            .get("/tables")
            .catch(() => ({ data: { data: [] } })),

          api
            .get("/menu")
            .catch(() => ({ data: { data: [] } })),
          api.get("/branches").catch(() => ({ data: { data: [] } })),
          api.get("/branches/comparison/summary").catch(() => ({ data: { data: [] } })),
        ]);

      const [usersRes, activityRes] = await Promise.all([
        api.get("/auth/users").catch(() => ({ data: { data: [] } })),
        api.get("/auth/login-activity?limit=50").catch(() => ({ data: { data: [] } }))
      ]);

      setOrders(
        ordersRes.data?.data ||
          ordersRes.data ||
          []
      );

      setTables(
        tablesRes.data?.data ||
          tablesRes.data ||
          []
      );

      setMenuItems(
        menuRes.data?.data ||
          menuRes.data ||
          []
      );
      setBranches(branchesRes.data?.data || []);
      setBranchSummary(comparisonRes.data?.data || []);
      setUsers(usersRes.data?.data || []);
      setLoginActivity(activityRes.data?.data || []);
    } catch (error) {
      console.error(error);
      setMessage("Unable to load data.");
    } finally {
      setLoading(false);
    }
  };

  const saveBranch = async (event) => {
    event.preventDefault();
    try {
      const response = await api.post("/branches", branchForm);
      setBranches((current) => [...current, response.data.data].sort((a, b) => a.name.localeCompare(b.name)));
      setBranchSummary((current) => [...current, { ...response.data.data, sales: 0, bills: 0, orders: 0, staff: 0, lowStock: 0 }]);
      setBranchForm({ name: "", code: "", address: "", phone: "", gstin: "" });
      setMessage("Branch created successfully.");
    } catch (error) {
      setMessage(error.response?.data?.message || "Branch could not be created.");
    }
  };

  useEffect(() => {
    if (!selectedBranchId) {
      setBranchInventory([]);
      return;
    }
    api.get(`/branches/${selectedBranchId}/inventory`)
      .then((response) => setBranchInventory(response.data?.data || []))
      .catch(() => setBranchInventory([]));
  }, [selectedBranchId]);

  const transferBetweenBranches = async (event) => {
    event.preventDefault();
    try {
      await api.post("/branches/transfers", { ...transferForm, quantity: Number(transferForm.quantity) });
      setMessage("Inter-branch stock transfer recorded.");
      setTransferForm((current) => ({ ...current, quantity: "", note: "" }));
      if (selectedBranchId) {
        const response = await api.get(`/branches/${selectedBranchId}/inventory`);
        setBranchInventory(response.data?.data || []);
      }
    } catch (error) {
      setMessage(error.response?.data?.message || "Inter-branch transfer failed.");
    }
  };

  const saveUser = async (event) => {
    event.preventDefault();
    try {
      if (editingUser) {
        const response =         await api.patch(`/auth/users/${editingUser._id}`, { name: userForm.name, role: userForm.role, branchId: userForm.branchId || null, isActive: editingUser.isActive, permissions: permissionForm });
        setUsers((current) => current.map((user) => user._id === editingUser._id ? response.data.data : user));
      } else {
        const response = await api.post("/auth/users", userForm);
        setUsers((current) => [response.data.data, ...current]);
      }
      setEditingUser(null);
      setUserForm({ name: "", email: "", password: "", role: "waiter", branchId: "" });
      setPermissionForm({});
      setMessage("User saved successfully.");
    } catch (error) {
      setMessage(error.response?.data?.message || "User could not be saved.");
    }
  };

  const toggleUser = async (user) => {
    try {
      const response = await api.patch(`/auth/users/${user._id}`, { isActive: !user.isActive });
      setUsers((current) => current.map((item) => item._id === user._id ? response.data.data : item));
    } catch (error) {
      setMessage(error.response?.data?.message || "User status could not be updated.");
    }
  };

  const resetUserPassword = async (user) => {
    const newPassword = window.prompt(`New password for ${user.email}:`, "");
    if (newPassword === null) return;
    try {
      await api.post(`/auth/users/${user._id}/password`, { newPassword });
      setMessage("Password reset successfully.");
    } catch (error) {
      setMessage(error.response?.data?.message || "Password could not be reset.");
    }
  };

  useEffect(() => {
    loadData();

    const interval = setInterval(loadData, 15000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    api.get('/settings/restaurant').then((response) => {
      if (response.data?.data) setRestaurant(response.data.data);
    }).catch(() => {});
  }, []);

  const saveRestaurant = async () => {
    try {
      const response = await api.put('/settings/restaurant', restaurant);
      setRestaurant(response.data?.data || restaurant);
      setMessage("Restaurant settings saved successfully.");
    } catch (error) {
      setMessage(error.response?.data?.message || "Restaurant settings could not be saved.");
    }

    setTimeout(() => setMessage(""), 2500);
  };

  const addMenuItem = async (e) => {
    e.preventDefault();

    if (!newItem.name || !newItem.price) {
      setMessage("Item name aur price required hai.");
      return;
    }

    try {
      const payload = {
        ...newItem,
        price: Number(newItem.price),
        halfPrice:
          newItem.halfPrice === ""
            ? undefined
            : Number(newItem.halfPrice),
        taxRate: Number(newItem.taxRate || 0),
        addons: String(newItem.addons || '').split(',').map((value) => {
          const [name, price] = value.split(':');
          return Number(price) > 0 ? { name: name.trim(), price: Number(price) } : name.trim();
        }).filter((value) => typeof value === 'string' ? value : value.name)
      };
      if (editingMenuItem) {
        await api.put(`/menu/${editingMenuItem._id}`, { ...editingMenuItem, ...payload });
      } else {
        await api.post("/menu", payload);
      }

      setNewItem({
        name: "",
        price: "",
        category: "Main Course",
        halfPrice: "",
        image: "",
        hsnSac: "",
        taxRate: "5",
        taxCategory: "taxable",
        addons: "",
      });

      setEditingMenuItem(null);
      setMessage(editingMenuItem ? "Menu item updated successfully." : "Menu item added successfully.");
      loadData();
    } catch (error) {
      console.error(error);
      setMessage(
        error.response?.data?.message ||
          "Menu item could not be added."
      );
    }
  };

  const editMenuItem = (item) => {
    setEditingMenuItem(item);
    setNewItem({
      name: item.name || '',
      price: item.price ?? '',
      category: item.category || 'Main Course',
      halfPrice: item.halfPrice ?? '',
      image: item.image || '',
      hsnSac: item.hsnSac || '',
      taxRate: String(item.taxRate ?? 5),
      taxCategory: item.taxCategory || 'taxable',
      addons: (item.addons || []).map((addon) => typeof addon === 'string' ? addon : `${addon.name}${Number(addon.price || 0) ? `:${addon.price}` : ''}`).join(', ')
    });
  };

  const addTable = async (e) => {
    e.preventDefault();

    if (!newTable.tableNumber) {
      setMessage("Table number required hai.");
      return;
    }

    try {
      await api.post("/tables", {
        ...newTable,
        tableNumber: String(newTable.tableNumber),
        capacity: Number(newTable.capacity),
      });

      setNewTable({
        tableNumber: "",
        capacity: "4",
        floor: "Floor 1",
        type: "Dining",
      });

      setMessage("Table added successfully.");
      loadData();
    } catch (error) {
      console.error(error);
      setMessage(
        error.response?.data?.message ||
          "Table could not be added."
      );
    }
  };

  const toggleMenuAvailability = async (item) => {
    try {
      await api.put(`/menu/${item._id}`, {
        ...item,
        isAvailable: item.isAvailable === false,
      });

      loadData();
    } catch (error) {
      console.error(error);
      setMessage("Item status could not be updated.");
    }
  };

  const deleteMenuItem = async (id) => {
    if (!window.confirm("Delete this item?")) {
      return;
    }

    try {
      await api.delete(`/menu/${id}`);
      setMessage("Menu item deleted.");
      loadData();
    } catch (error) {
      console.error(error);
      setMessage("Item could not be deleted.");
    }
  };

  const totalRevenue = orders.reduce(
    (sum, order) =>
      sum +
      Number(
        order.grandTotal ||
          order.totalAmount ||
          order.total ||
          0
      ),
    0
  );

  const occupiedTables = tables.filter(
    (table) =>
      String(table.status || "").toLowerCase() ===
      "occupied"
  ).length;

  const availableTables =
    tables.length - occupiedTables;

  const activeItems = menuItems.filter(
    (item) => item.isAvailable !== false
  ).length;

  const categories = useMemo(() => {
    return [
      ...new Set(
        menuItems
          .map((item) => item.category)
          .filter(Boolean)
      ),
    ];
  }, [menuItems]);

  const money = (value) =>
    `₹${Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div className="admin-dashboard" style={styles.page}>

      {/* HEADER */}
      <header className="admin-dashboard__header" style={styles.header}>

        <div>
          <div style={styles.brand}>
            🍽️ Tamanna Restaurant
          </div>

          <div style={styles.title}>
            Admin Control Panel
          </div>
        </div>

        <div className="admin-dashboard__header-actions" style={styles.headerActions}>
          <button
            onClick={loadData}
            style={styles.refreshButton}
          >
            🔄 Refresh
          </button>

          <button
            onClick={handleLogout}
            style={styles.logoutButton}
          >
            Logout
          </button>
        </div>
      </header>

      {/* NAVIGATION */}
      <div className="admin-dashboard__nav" style={styles.nav}>
        {[
          ["overview", "📊 Overview"],
          ["menu", "🍽️ Menu"],
          ["tables", "🪑 Tables"],
          ["orders", "🧾 Orders"],
          ["users", "👥 Staff Users"],
          ["branches", "🏢 Branches"],
          ["settings", "⚙️ Settings"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={
              activeTab === key
                ? styles.navActive
                : styles.navButton
            }
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <div style={styles.message}>
          {message}
        </div>
      )}

      {activeTab === "branches" && (
        <>
          <div style={styles.pageHeading}><div><h2>Multi-Branch Management</h2><p>Manage branches, branch-wise staff, inventory and performance comparison.</p></div></div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 0.7fr) minmax(520px, 1.3fr)", gap: 18 }}>
            <form onSubmit={saveBranch} style={styles.card}>
              <h3>Add Restaurant Branch</h3>
              <div style={styles.form}>
                <label>Branch Name<input required value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} placeholder="Downtown Branch" /></label>
                <label>Branch Code<input required value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value.toUpperCase() })} placeholder="DT01" /></label>
                <label>Address<textarea value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} /></label>
                <label>Phone<input value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} /></label>
                <label>GSTIN<input value={branchForm.gstin} onChange={(e) => setBranchForm({ ...branchForm, gstin: e.target.value.toUpperCase() })} /></label>
                <button type="submit" style={styles.primaryButton}>Create Branch</button>
              </div>
            </form>
            <div style={styles.card}>
              <h3>Branch Comparison Dashboard</h3>
              <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr>{["Branch", "Sales", "Bills", "Orders", "Staff", "Low Stock"].map((header) => <th key={header} style={styles.tableCell}>{header}</th>)}</tr></thead><tbody>{branchSummary.map((branch) => <tr key={branch._id}><td style={styles.tableCell}><strong>{branch.name}</strong><div style={{ color: "#64748b", fontSize: 11 }}>{branch.code}</div></td><td style={styles.tableCell}>{money(branch.sales)}</td><td style={styles.tableCell}>{branch.bills}</td><td style={styles.tableCell}>{branch.orders}</td><td style={styles.tableCell}>{branch.staff}</td><td style={{ ...styles.tableCell, color: branch.lowStock ? "#b91c1c" : "#15803d" }}>{branch.lowStock}</td></tr>)}</tbody></table></div>
            </div>
          </div>
          <div style={{ ...styles.card, marginTop: 18 }}><h3>Active Branches</h3><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>{branches.map((branch) => <div key={branch._id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12 }}><strong>{branch.name}</strong><div style={{ color: "#64748b", fontSize: 12 }}>{branch.code} · {branch.phone || "No phone"}</div><div style={{ color: branch.isActive ? "#15803d" : "#b91c1c", fontSize: 12, marginTop: 5 }}>{branch.isActive ? "Active" : "Inactive"}</div></div>)}</div></div>
          <div style={{ ...styles.card, marginTop: 18 }}>
            <h3>Branch-wise Inventory</h3>
            <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)} style={{ ...styles.input, maxWidth: 320 }}><option value="">Select branch</option>{branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}</select>
            {selectedBranchId && <div style={{ overflowX: "auto", marginTop: 12 }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr><th style={styles.tableCell}>Ingredient</th><th style={styles.tableCell}>Stock</th><th style={styles.tableCell}>Unit</th><th style={styles.tableCell}>Alert At</th></tr></thead><tbody>{branchInventory.map((row) => <tr key={row._id}><td style={styles.tableCell}>{row.ingredientId?.name}</td><td style={{ ...styles.tableCell, color: row.quantity <= row.minStockAlert ? "#b91c1c" : "#15803d" }}>{Number(row.quantity || 0).toFixed(2)}</td><td style={styles.tableCell}>{row.ingredientId?.unit}</td><td style={styles.tableCell}>{row.minStockAlert}</td></tr>)}</tbody></table></div>}
          </div>
          <form onSubmit={transferBetweenBranches} style={{ ...styles.card, marginTop: 18 }}>
            <h3>Inter-Branch Stock Transfer</h3>
            <div style={{ ...styles.form, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <label>Ingredient ID<input required value={transferForm.ingredientId} onChange={(e) => setTransferForm({ ...transferForm, ingredientId: e.target.value })} placeholder="Mongo ingredient ID" /></label>
              <label>From Branch<select required value={transferForm.fromBranchId} onChange={(e) => setTransferForm({ ...transferForm, fromBranchId: e.target.value })}><option value="">Select source</option>{branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}</select></label>
              <label>To Branch<select required value={transferForm.toBranchId} onChange={(e) => setTransferForm({ ...transferForm, toBranchId: e.target.value })}><option value="">Select destination</option>{branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}</select></label>
              <label>Quantity<input required type="number" min="0.0001" step="0.0001" value={transferForm.quantity} onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })} /></label>
              <label>Note<input value={transferForm.note} onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })} /></label>
              <button type="submit" style={styles.primaryButton}>Transfer Stock</button>
            </div>
          </form>
        </>
      )}

      <main className="admin-dashboard__content" style={styles.content}>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <>
            <div style={styles.pageHeading}>
              <div>
                <h2>Restaurant Overview</h2>
                <p>
                  Manage your restaurant from one place.
                </p>
              </div>
            </div>

            <div style={styles.statsGrid}>

              <div style={styles.statCard}>
                <div style={styles.statIcon}>
                  💰
                </div>

                <div>
                  <span>Total Sales</span>
                  <strong>
                    {money(totalRevenue)}
                  </strong>
                </div>
              </div>

              <div style={styles.statCard}>
                <div style={styles.statIcon}>
                  🧾
                </div>

                <div>
                  <span>Active Orders</span>
                  <strong>
                    {orders.length}
                  </strong>
                </div>
              </div>

              <div style={styles.statCard}>
                <div style={styles.statIcon}>
                  🍽️
                </div>

                <div>
                  <span>Available Items</span>
                  <strong>
                    {activeItems}
                  </strong>
                </div>
              </div>

              <div style={styles.statCard}>
                <div style={styles.statIcon}>
                  🪑
                </div>

                <div>
                  <span>Available Tables</span>
                  <strong>
                    {availableTables}
                  </strong>
                </div>
              </div>
            </div>

            <div style={styles.grid2}>

              <div style={styles.card}>
                <h3>Restaurant Information</h3>

                <div style={styles.infoList}>
                  <div>
                    <span>Name</span>
                    <strong>
                      {restaurant.name}
                    </strong>
                  </div>

                  <div>
                    <span>Phone</span>
                    <strong>
                      {restaurant.phone || "Not set"}
                    </strong>
                  </div>

                  <div>
                    <span>GSTIN</span>
                    <strong>
                      {restaurant.gstin || "Not set"}
                    </strong>
                  </div>

                  <div>
                    <span>Address</span>
                    <strong>
                      {restaurant.address || "Not set"}
                    </strong>
                  </div>
                </div>
              </div>

              <div style={styles.card}>
                <h3>Quick Stats</h3>

                <div style={styles.progressRow}>
                  <span>Occupied Tables</span>
                  <strong>
                    {occupiedTables}/{tables.length}
                  </strong>
                </div>

                <div style={styles.progress}>
                  <div
                    style={{
                      ...styles.progressFill,
                      width:
                        tables.length > 0
                          ? `${
                              (occupiedTables /
                                tables.length) *
                              100
                            }%`
                          : "0%",
                    }}
                  />
                </div>

                <div style={styles.progressRow}>
                  <span>Menu Categories</span>
                  <strong>
                    {categories.length}
                  </strong>
                </div>
              </div>

            </div>
          </>
        )}

        {/* MENU */}
        {activeTab === "menu" && (
          <>
            <div style={styles.pageHeading}>
              <div>
                <h2>Menu Management</h2>
                <p>
                  Add, edit and manage restaurant menu.
                </p>
              </div>
            </div>

            <div style={styles.grid2}>

              <div style={styles.card}>
                <h3>Add New Item</h3>

                <form
                  onSubmit={addMenuItem}
                  style={styles.form}
                >
                  <label>
                    Item Name
                    <input
                      value={newItem.name}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          name: e.target.value,
                        })
                      }
                      placeholder="Paneer Butter Masala"
                    />
                  </label>

                  <label>
                    Price
                    <input
                      type="number"
                      value={newItem.price}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          price: e.target.value,
                        })
                      }
                      placeholder="250"
                    />
                  </label>

                  <label>
                    Half Price
                    <input
                      type="number"
                      value={newItem.halfPrice}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          halfPrice: e.target.value,
                        })
                      }
                      placeholder="150"
                    />
                  </label>

                  <label>
                    Category
                    <select
                      value={newItem.category}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          category: e.target.value,
                        })
                      }
                    >
                      <option>
                        Main Course
                      </option>
                      <option>
                        Starter
                      </option>
                      <option>
                        Fast Food
                      </option>
                      <option>
                        Beverage
                      </option>
                      <option>
                        Dessert
                      </option>
                    </select>
                  </label>

                  <label>
                    Image URL
                    <input
                      value={newItem.image}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          image: e.target.value,
                        })
                      }
                      placeholder="https://..."
                    />
                  </label>

                  <label>
                    HSN/SAC Code
                    <input value={newItem.hsnSac} onChange={(e) => setNewItem({ ...newItem, hsnSac: e.target.value.toUpperCase() })} placeholder="Optional" />
                  </label>

                  <label>
                    GST Rate (%)
                    <input type="number" min="0" max="100" value={newItem.taxRate} onChange={(e) => setNewItem({ ...newItem, taxRate: e.target.value })} />
                  </label>

                  <label>
                    Tax Category
                    <select value={newItem.taxCategory} onChange={(e) => setNewItem({ ...newItem, taxCategory: e.target.value })}>
                      <option value="taxable">Taxable</option>
                      <option value="exempt">Exempt</option>
                      <option value="zero-rated">Zero Rated</option>
                    </select>
                  </label>

                  <label>
                    Add-ons (comma separated)
                    <input value={newItem.addons} onChange={(e) => setNewItem({ ...newItem, addons: e.target.value })} placeholder="Extra Cheese, Less Spicy" />
                  </label>

                  <button
                    type="submit"
                    style={styles.primaryButton}
                  >
                    {editingMenuItem ? 'Save Menu Item' : '+ Add Menu Item'}
                  </button>
                  {editingMenuItem && <button type="button" onClick={() => { setEditingMenuItem(null); setNewItem({ name: '', price: '', category: 'Main Course', halfPrice: '', image: '', hsnSac: '', taxRate: '5', taxCategory: 'taxable', addons: '' }); }} style={styles.secondaryButton}>Cancel Edit</button>}
                </form>
              </div>

              <div style={styles.card}>
                <h3>
                  Menu Items ({menuItems.length})
                </h3>

                <div style={styles.itemList}>
                  {loading ? (
                    <p>Loading...</p>
                  ) : menuItems.length === 0 ? (
                    <p style={styles.muted}>
                      No menu items found.
                    </p>
                  ) : (
                    menuItems.map((item) => (
                      <div
                        key={item._id}
                        style={styles.itemRow}
                      >
                        <div>
                          <strong>
                            {item.name}
                          </strong>

                          <small>
                            {item.category || "Other"}{" "}
                            • {money(item.price)}
                          </small>
                        </div>

                        <div
                          style={
                            styles.itemActions
                          }
                        >
                          <button
                            onClick={() => editMenuItem(item)}
                            style={styles.secondaryButton}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() =>
                              toggleMenuAvailability(
                                item
                              )
                            }
                            style={
                              item.isAvailable === false
                                ? styles.offButton
                                : styles.onButton
                            }
                          >
                            {item.isAvailable === false
                              ? "Unavailable"
                              : "Available"}
                          </button>

                          <button
                            onClick={() =>
                              deleteMenuItem(
                                item._id
                              )
                            }
                            style={styles.deleteButton}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </>
        )}

        {/* TABLES */}
        {activeTab === "tables" && (
          <>
            <div style={styles.pageHeading}>
              <div>
                <h2>Table Management</h2>
                <p>
                  Manage restaurant tables and floors.
                </p>
              </div>
            </div>

            <div style={styles.card}>
              <h3>Add New Table</h3>

              <form
                onSubmit={addTable}
                style={styles.inlineForm}
              >
                <input
                  value={newTable.tableNumber}
                  onChange={(e) =>
                    setNewTable({
                      ...newTable,
                      tableNumber: e.target.value,
                    })
                  }
                  placeholder="Table No."
                />

                <input
                  type="number"
                  value={newTable.capacity}
                  onChange={(e) =>
                    setNewTable({
                      ...newTable,
                      capacity: e.target.value,
                    })
                  }
                  placeholder="Capacity"
                />

                <select
                  value={newTable.floor}
                  onChange={(e) =>
                    setNewTable({
                      ...newTable,
                      floor: e.target.value,
                    })
                  }
                >
                  <option>Floor 1</option>
                  <option>Floor 2</option>
                  <option>Rooftop</option>
                </select>

                <button
                  type="submit"
                  style={styles.primaryButton}
                >
                  + Add Table
                </button>
              </form>
            </div>

            <div style={styles.tableGrid}>
              {tables.map((table) => {
                const occupied =
                  String(table.status || "")
                    .toLowerCase() ===
                  "occupied";

                return (
                  <div
                    key={table._id}
                    style={{
                      ...styles.tableCard,
                      borderColor: occupied
                        ? "#fecaca"
                        : "#bbf7d0",
                      background: occupied
                        ? "#fff7f7"
                        : "#f7fff9",
                    }}
                  >
                    <div style={styles.tableIcon}>
                      🪑
                    </div>

                    <strong>
                      Table {table.tableNumber}
                    </strong>

                    <span>
                      Capacity:{" "}
                      {table.capacity || 4}
                    </span>

                    <span>
                      {table.floor || "Floor 1"}
                    </span>

                    <b
                      style={{
                        color: occupied
                          ? "#dc2626"
                          : "#16a34a",
                      }}
                    >
                      {occupied
                        ? "Occupied"
                        : "Available"}
                    </b>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ORDERS */}
        {activeTab === "orders" && (
          <>
            <div style={styles.pageHeading}>
              <div>
                <h2>Order Management</h2>
                <p>
                  Monitor active restaurant orders.
                </p>
              </div>
            </div>

            <div style={styles.card}>
              {orders.length === 0 ? (
                <div style={styles.empty}>
                  🍽️ No active orders.
                </div>
              ) : (
                <div style={styles.orderList}>
                  {orders.map((order) => (
                    <div
                      key={order._id}
                      style={styles.orderRow}
                    >
                      <div>
                        <strong>
                          #
                          {String(order._id).slice(
                            -6
                          )}
                        </strong>

                        <small>
                          {order.customerName ||
                            "Walk-in Customer"}
                        </small>
                      </div>

                      <span>
                        {order.orderType ||
                          "Dine-In"}
                      </span>

                      <span>
                        {order.paymentMode ||
                          "Cash"}
                      </span>

                      <strong>
                        {money(
                          order.grandTotal ||
                            order.totalAmount ||
                            order.total
                        )}
                      </strong>

                      <span style={styles.status}>
                        {order.orderStatus ||
                          order.status ||
                          "Pending"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* USERS */}
        {activeTab === "users" && (
          <>
            <div style={styles.pageHeading}>
              <div>
                <h2>Staff User Management</h2>
                <p>Create accounts, assign roles, deactivate access and review login activity.</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 0.8fr) minmax(420px, 1.2fr)", gap: 18 }}>
              <form onSubmit={saveUser} style={styles.card}>
                <h3>{editingUser ? "Edit User" : "Create Staff Account"}</h3>
                <div style={styles.form}>
                  <label>Name<input value={userForm.name} required onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} /></label>
                  {!editingUser && <label>Email<input type="email" value={userForm.email} required onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} /></label>}
                  {!editingUser && <label>Temporary Password<input type="password" minLength="6" value={userForm.password} required onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} /></label>}
                  <label>Role<select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>{['admin', 'manager', 'cashier', 'waiter', 'chef', 'inventory_manager', 'delivery'].map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
                  <label>Assigned Branch<select value={userForm.branchId || ""} onChange={(e) => setUserForm({ ...userForm, branchId: e.target.value })}><option value="">Central / All branches</option>{branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name} ({branch.code})</option>)}</select></label>
                  {editingUser && (
                    <fieldset style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                      <legend style={{ fontSize: 12, fontWeight: 700 }}>Permissions</legend>
                      {[
                        ['applyDiscount', 'Apply discount'],
                        ['priceOverride', 'Override item price'],
                        ['refund', 'Process refunds'],
                        ['cancelBill', 'Cancel bills'],
                        ['approveStock', 'Approve stock adjustments'],
                        ['approveExpense', 'Approve expenses'],
                        ['viewReports', 'View reports']
                      ].map(([key, label]) => <label key={key} style={{ display: 'block', fontSize: 12, margin: '6px 0' }}><input type="checkbox" checked={Boolean(permissionForm[key])} onChange={(e) => setPermissionForm({ ...permissionForm, [key]: e.target.checked })} /> {label}</label>)}
                    </fieldset>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" style={styles.primaryButton}>{editingUser ? "Save Changes" : "Create User"}</button>
                    {editingUser && <button type="button" onClick={() => { setEditingUser(null); setUserForm({ name: "", email: "", password: "", role: "waiter", branchId: "" }); }} style={styles.secondaryButton}>Cancel</button>}
                  </div>
                </div>
              </form>
              <div style={styles.card}>
                <h3>Restaurant Users</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {users.map((user) => <div key={user._id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.7fr auto", gap: 8, alignItems: "center", padding: 10, border: "1px solid #e5e7eb", borderRadius: 8 }}>
                    <div><strong>{user.name}</strong><div style={{ fontSize: 12, color: "#6b7280" }}>{user.email}</div><div style={{ fontSize: 11, color: "#64748b" }}>{branches.find((branch) => branch._id === user.branchId)?.name || "Central / All branches"}</div></div>
                    <span style={{ fontSize: 12, textTransform: "capitalize" }}>{user.role}</span>
                    <span style={{ color: user.isActive ? "#15803d" : "#b91c1c", fontSize: 12 }}>{user.isActive ? "Active" : "Inactive"}</span>
                    <div style={{ display: "flex", gap: 4 }}><button onClick={() => { setEditingUser(user); setPermissionForm(user.permissions || {}); setUserForm({ name: user.name, email: user.email, password: "", role: user.role, branchId: user.branchId || "" }); }} style={styles.smallButton}>Edit</button><button onClick={() => toggleUser(user)} style={styles.smallButton}>{user.isActive ? "Disable" : "Enable"}</button><button onClick={() => resetUserPassword(user)} style={styles.smallButton}>Reset</button></div>
                  </div>)}
                </div>
              </div>
            </div>
            <div style={{ ...styles.card, marginTop: 18 }}>
              <h3>Recent Login Activity</h3>
              <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr><th style={styles.tableCell}>Time</th><th style={styles.tableCell}>User</th><th style={styles.tableCell}>Result</th><th style={styles.tableCell}>Reason</th><th style={styles.tableCell}>IP</th></tr></thead><tbody>{loginActivity.map((entry) => <tr key={entry._id}><td style={styles.tableCell}>{new Date(entry.createdAt).toLocaleString()}</td><td style={styles.tableCell}>{entry.userId?.name || entry.email}</td><td style={{ ...styles.tableCell, color: entry.success ? "#15803d" : "#b91c1c" }}>{entry.success ? "Success" : "Failed"}</td><td style={styles.tableCell}>{entry.failureReason || "-"}</td><td style={styles.tableCell}>{entry.ipAddress || "-"}</td></tr>)}</tbody></table></div>
            </div>
          </>
        )}

        {/* SETTINGS */}
        {activeTab === "settings" && (
          <>
            <div style={styles.pageHeading}>
              <div>
                <h2>Restaurant Settings</h2>
                <p>
                  These details will appear on bills
                  and receipts.
                </p>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.form}>

                <label>
                  Restaurant Name
                  <input
                    value={restaurant.name}
                    onChange={(e) =>
                      setRestaurant({
                        ...restaurant,
                        name: e.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Address
                  <textarea
                    value={restaurant.address}
                    onChange={(e) =>
                      setRestaurant({
                        ...restaurant,
                        address: e.target.value,
                      })
                    }
                    rows="3"
                  />
                </label>

                <label>
                  Phone
                  <input
                    value={restaurant.phone}
                    onChange={(e) =>
                      setRestaurant({
                        ...restaurant,
                        phone: e.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  GSTIN
                  <input
                    value={restaurant.gstin}
                    onChange={(e) =>
                      setRestaurant({
                        ...restaurant,
                        gstin: e.target.value,
                      })
                    }
                  />
                </label>

                <button
                  onClick={saveRestaurant}
                  style={styles.primaryButton}
                >
                  💾 Save Restaurant Settings
                </button>

              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}

const styles = {
  page: {
    height: "100%",
    minHeight: 0,
    background: "#f6f7fb",
    color: "#111827",
    fontFamily:
      "Inter, Segoe UI, Arial, sans-serif",
    overflowY: "auto",
    overflowX: "hidden",
    boxSizing: "border-box",
  },

  header: {
    background: "#fff",
    borderBottom: "1px solid #e5e7eb",
    padding: "16px 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },

  brand: {
    color: "#f97316",
    fontSize: "12px",
    fontWeight: "800",
  },

  title: {
    fontSize: "23px",
    fontWeight: "800",
    marginTop: "4px",
  },

  headerActions: {
    display: "flex",
    gap: "10px",
  },

  refreshButton: {
    border: "1px solid #e5e7eb",
    background: "#fff",
    padding: "9px 14px",
    borderRadius: "8px",
    cursor: "pointer",
  },

  logoutButton: {
    border: 0,
    background: "#fee2e2",
    color: "#dc2626",
    padding: "9px 15px",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "700",
  },

  nav: {
    background: "#fff",
    borderBottom: "1px solid #e5e7eb",
    padding: "0 24px",
    display: "flex",
    gap: "5px",
    overflowX: "auto",
    scrollbarWidth: "thin",
  },

  navButton: {
    border: 0,
    background: "transparent",
    padding: "14px 17px",
    cursor: "pointer",
    color: "#6b7280",
    fontSize: "13px",
  },

  navActive: {
    border: 0,
    background: "#fff1e8",
    color: "#f97316",
    padding: "14px 17px",
    cursor: "pointer",
    fontWeight: "800",
    fontSize: "13px",
    borderBottom: "2px solid #f97316",
  },

  message: {
    margin: "15px 28px 0",
    padding: "11px 15px",
    background: "#ecfdf5",
    color: "#047857",
    borderRadius: "8px",
    fontSize: "13px",
  },

  content: {
    padding: "24px",
    maxWidth: "1500px",
    margin: "0 auto",
    width: "100%",
    minHeight: "calc(100% - 132px)",
    boxSizing: "border-box",
  },

  pageHeading: {
    marginBottom: "20px",
  },

  "pageHeading h2": {
    margin: 0,
  },

  "pageHeading p": {
    margin: "5px 0 0",
    color: "#9ca3af",
    fontSize: "12px",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
    marginBottom: "20px",
  },

  statCard: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "18px",
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },

  statIcon: {
    width: "45px",
    height: "45px",
    borderRadius: "11px",
    background: "#fff1e8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "20px",
  },

  statCardSpan: {
    display: "block",
    fontSize: "10px",
    color: "#9ca3af",
  },

  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "20px",
  },

  grid2: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "20px",
  },

  infoList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },

  progressRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "13px",
    marginBottom: "8px",
  },

  progress: {
    height: "8px",
    background: "#f3f4f6",
    borderRadius: "10px",
    overflow: "hidden",
    marginBottom: "20px",
  },

  progressFill: {
    height: "100%",
    background: "#f97316",
    borderRadius: "10px",
  },

  form: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },

  formLabel: {
    fontSize: "12px",
    fontWeight: "700",
  },

  inlineForm: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    marginTop: "6px",
    outline: "none",
  },

  primaryButton: {
    border: 0,
    background: "#f97316",
    color: "#fff",
    padding: "11px 16px",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "700",
  },

  secondaryButton: {
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#374151",
    padding: "11px 16px",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "700",
  },

  smallButton: {
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#374151",
    padding: "5px 7px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "11px",
  },

  tableCell: {
    textAlign: "left",
    padding: "8px",
    borderBottom: "1px solid #e5e7eb",
  },

  itemList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxHeight: "500px",
    overflowY: "auto",
  },

  itemRow: {
    border: "1px solid #f0f0f0",
    padding: "12px",
    borderRadius: "8px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
  },

  itemActions: {
    display: "flex",
    gap: "6px",
    alignItems: "center",
  },

  onButton: {
    border: 0,
    background: "#dcfce7",
    color: "#15803d",
    padding: "6px 9px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "10px",
  },

  offButton: {
    border: 0,
    background: "#fee2e2",
    color: "#dc2626",
    padding: "6px 9px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "10px",
  },

  deleteButton: {
    border: 0,
    background: "#fff",
    cursor: "pointer",
  },

  tableGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fill, minmax(160px, 1fr))",
    gap: "15px",
  },

  tableCard: {
    border: "2px solid",
    borderRadius: "12px",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    textAlign: "center",
  },

  tableIcon: {
    fontSize: "30px",
  },

  orderList: {
    display: "flex",
    flexDirection: "column",
  },

  orderRow: {
    display: "grid",
    gridTemplateColumns:
      "1.5fr 1.5fr 100px 120px 110px",
    gap: "10px",
    alignItems: "center",
    padding: "13px 5px",
    borderBottom: "1px solid #f3f4f6",
    fontSize: "12px",
  },

  status: {
    background: "#fff7ed",
    color: "#c2410c",
    padding: "6px 9px",
    borderRadius: "20px",
    fontSize: "10px",
    textAlign: "center",
  },

  empty: {
    textAlign: "center",
    padding: "40px",
    color: "#9ca3af",
  },

  muted: {
    color: "#9ca3af",
  },
};

export default AdminDashboard;