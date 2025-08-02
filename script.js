// CONFIGURATION - UPDATE THESE VALUES
const VENMO_USERNAME = 'audreycrisp'; // Your mom's Venmo username

// Global variables
let currentUser = null;
let userData = null;
let cart = [];
let locationVerified = false;
let verifiedLocationArea = null; // To store the user's specific location
let locationCheckInProgress = false;
const notificationTimers = {}; // For stacking notifications

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCwgwgWwD_NLVQtvvQxb-vIwkvbfmG6imc",
  authDomain: "bakery-f6650.firebaseapp.com",
  projectId: "bakery-f6650",
  storageBucket: "bakery-f6650.firebasestorage.app",
  messagingSenderId: "300373370370",
  appId: "1:300373370370:web:55ff7da416898ed065e91b",
  measurementId: "G-C41TKNP37H"
};

// All function definitions moved up to avoid ReferenceErrors

// Helper functions
function showStatus(message, type = 'success') {
    const statusDiv = document.getElementById('status-messages');
    const messageKey = `${type}-${message.replace(/\s+/g, '-')}`;
    let existingMessageDiv = document.querySelector(`.status-message[data-key="${messageKey}"]`);

    if (existingMessageDiv) {
        let count = parseInt(existingMessageDiv.getAttribute('data-count') || '1') + 1;
        existingMessageDiv.setAttribute('data-count', count);
        existingMessageDiv.textContent = `${message} (x${count})`;

        if (notificationTimers[messageKey]) {
            clearTimeout(notificationTimers[messageKey]);
        }

        notificationTimers[messageKey] = setTimeout(() => {
            existingMessageDiv.remove();
            delete notificationTimers[messageKey];
        }, 5000);
    } else {
        const messageDiv = document.createElement('div');
        messageDiv.className = `status-message status-${type}`;
        messageDiv.textContent = message;
        messageDiv.setAttribute('data-key', messageKey);
        messageDiv.setAttribute('data-count', '1');
        statusDiv.appendChild(messageDiv);

        notificationTimers[messageKey] = setTimeout(() => {
            messageDiv.remove();
            delete notificationTimers[messageKey];
        }, 5000);
    }
}

function showLoading(buttonElement) {
  const originalText = buttonElement.textContent;
  buttonElement.innerHTML = '<span class="loading"></span> Loading...';
  buttonElement.disabled = true;
  return () => {
    buttonElement.textContent = originalText;
    buttonElement.disabled = false;
  };
}

function getStatusColor(status) {
  switch (status) {
    case 'pending-payment': return '#ff9800';
    case 'pending': return '#ffc107';
    case 'preparing': return '#17a2b8';
    case 'completed': return '#28a745';
    case 'cancelled': return '#dc3545';
    default: return '#6c757d';
  }
}

function showItemUpdateSuccess(itemId) {
  const itemDiv = document.querySelector(`#edit-form-${itemId}`).closest('.admin-menu-item');
  itemDiv.classList.add('admin-action-success');
  setTimeout(() => {
    itemDiv.classList.remove('admin-action-success');
  }, 2000);
}

/**
 * Fetches all active deals for a given menu item from Firestore.
 * @param {string} itemId - The ID of the menu item.
 * @returns {Promise<Array>} A promise that resolves to an array of deal objects.
 */
async function getActiveDealsForItem(itemId) {
  try {
    const dealsSnapshot = await firebase.firestore().collection('deals')
      .where('isActive', '==', true)
      .where('menuItemId', '==', itemId)
      .get();

    if (dealsSnapshot.empty) {
      return [];
    }

    const deals = [];
    dealsSnapshot.forEach(doc => {
      deals.push({ dealId: doc.id, ...doc.data() });
    });
    return deals;
  } catch (err) {
    console.error("Error fetching active deals:", err);
    showStatus('Could not fetch item deals.', 'error');
    return []; // Return an empty array on error to prevent crashes
  }
}

/**
 * Applies a discount deal to a cart item.
 * @param {object} item - The original cart item.
 * @param {object} deal - The deal object to apply.
 * @returns {object} The new item with the discount applied.
 */
function applyDealToItem(item, deal) {
  let newItem = { ...item, dealId: deal.dealId, dealType: deal.type };

  switch (deal.type) {
    case 'percentage':
      const discount = newItem.price * (deal.percentage / 100);
      newItem.price = parseFloat((newItem.price - discount).toFixed(2));
      newItem.dealInfo = `${deal.percentage}% off`;
      break;
    case 'fixed-discount':
      newItem.price = parseFloat(Math.max(0, newItem.price - deal.fixedAmount).toFixed(2));
      newItem.dealInfo = `$${deal.fixedAmount.toFixed(2)} off`;
      break;
    // 'buy-get' type is handled by adding free items, not by changing the price here.
  }
  return newItem;
}

// *** START: EMPLOYEE MANAGEMENT FUNCTIONS ***

/**
 * Loads and displays the list of employees from Firestore.
 * Requires admin privileges.
 */
async function loadEmployees() {
  if (!userData || userData.role !== 'admin') {
    showStatus("You don't have permission to view this.", 'error');
    return;
  }
  
  const employeesDiv = document.getElementById('employees-list');
  employeesDiv.innerHTML = '<div class="empty-state"><span class="loading"></span> Loading employees...</div>';
  
  try {
    const snapshot = await firebase.firestore().collection('employees').orderBy('name').get();
    
    if (snapshot.empty) {
      employeesDiv.innerHTML = '<div class="empty-state"><p>No employees found. Add one to get started!</p></div>';
      return;
    }

    employeesDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const employee = doc.data();
      const employeeDiv = document.createElement('div');
      employeeDiv.className = 'admin-menu-item'; // Re-using style for consistency
      
      let detailsHTML = `<p><strong>Role:</strong> ${employee.role}</p>`;
      if (employee.email) detailsHTML += `<p><strong>Email:</strong> ${employee.email}</p>`;
      if (employee.phone) detailsHTML += `<p><strong>Phone:</strong> ${employee.phone}</p>`;
      if (employee.hourlyRate) detailsHTML += `<p><strong>Rate:</strong> $${parseFloat(employee.hourlyRate).toFixed(2)}/hr</p>`;

      employeeDiv.innerHTML = `
        <div class="menu-item-header">
          <div class="menu-item-emoji">👤</div>
          <div class="menu-item-info">
            <h3>${employee.name}</h3>
          </div>
        </div>
        <div class="menu-item-description">${detailsHTML}</div>
        <div class="item-controls">
          <button class="btn btn-danger" onclick="deleteEmployee('${doc.id}', '${employee.name}')">🗑️ Delete</button>
        </div>
      `;
      employeesDiv.appendChild(employeeDiv);
    });
  } catch (err) {
    console.error("Error loading employees:", err);
    showStatus("Failed to load employee list.", 'error');
    employeesDiv.innerHTML = '<div class="empty-state"><p>Error loading employees. Check console.</p></div>';
  }
}

/**
 * Shows the form for adding a new employee.
 */
function showAddEmployeeForm() {
  document.getElementById('add-employee-form').style.display = 'block';
}

/**
 * Hides the form for adding a new employee.
 */
function hideAddEmployeeForm() {
  document.getElementById('add-employee-form').style.display = 'none';
}

/**
 * Submits the new employee data to Firestore.
 */
async function submitNewEmployee() {
  const name = document.getElementById('employee-name').value.trim();
  const role = document.getElementById('employee-role').value.trim();
  
  if (!name || !role) {
    showStatus("Employee Name and Role are required.", 'warning');
    return;
  }
  
  const employeeData = {
    name,
    role,
    email: document.getElementById('employee-email').value.trim() || null,
    phone: document.getElementById('employee-phone').value.trim() || null,
    hourlyRate: parseFloat(document.getElementById('employee-hourly-rate').value) || null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  const btn = event.target;
  const stopLoading = showLoading(btn);

  try {
    await firebase.firestore().collection('employees').add(employeeData);
    showStatus('Employee added successfully!', 'success');
    
    // Clear form
    document.getElementById('employee-name').value = '';
    document.getElementById('employee-role').value = '';
    document.getElementById('employee-email').value = '';
    document.getElementById('employee-phone').value = '';
    document.getElementById('employee-hourly-rate').value = '';
    
    hideAddEmployeeForm();
    loadEmployees(); // Refresh the list
  } catch (err) {
    console.error("Error adding employee:", err);
    showStatus("Failed to add employee.", 'error');
  } finally {
    stopLoading();
  }
}

/**
 * Deletes an employee from Firestore.
 * @param {string} id - The document ID of the employee to delete.
 * @param {string} name - The name of the employee for the confirmation message.
 */
async function deleteEmployee(id, name) {
  if (!confirm(`Are you sure you want to delete employee: ${name}?`)) {
    return;
  }

  const btn = event.target;
  const stopLoading = showLoading(btn);

  try {
    await firebase.firestore().collection('employees').doc(id).delete();
    showStatus('Employee deleted successfully.', 'success');
    loadEmployees(); // Refresh the list
  } catch (err) {
    console.error("Error deleting employee:", err);
    showStatus('Failed to delete employee.', 'error');
  } finally {
    stopLoading();
  }
}

// *** END: EMPLOYEE MANAGEMENT FUNCTIONS ***

// *** START: PROFIT CALCULATION FUNCTIONS ***
async function calculateAndShowProfit() {
    if (!userData || userData.role !== 'admin') {
        showStatus("You don't have permission to view this.", 'error');
        return;
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const revenueEl = document.getElementById('profit-revenue');
    const costsEl = document.getElementById('profit-costs');
    const netEl = document.getElementById('profit-net');
    const ordersListEl = document.getElementById('profit-orders-list');

    // Reset UI
    revenueEl.innerHTML = '<span class="loading"></span>';
    costsEl.innerHTML = '<span class="loading"></span>';
    netEl.innerHTML = '<span class="loading"></span>';
    ordersListEl.innerHTML = '<div class="empty-state"><span class="loading"></span> Loading orders...</div>';

    try {
        // Fetch all menu items to get their costs
        const menuItemsSnapshot = await firebase.firestore().collection('menuItems').get();
        const itemCosts = {};
        menuItemsSnapshot.forEach(doc => {
            itemCosts[doc.id] = doc.data().cost || 0;
        });

        // Fetch completed orders for today
        const ordersSnapshot = await firebase.firestore().collection('orders')
            .where('status', '==', 'completed')
            .where('createdAt', '>=', startOfDay)
            .where('createdAt', '<=', endOfDay)
            .get();

        if (ordersSnapshot.empty) {
            revenueEl.textContent = '$0.00';
            costsEl.textContent = '$0.00';
            netEl.textContent = '$0.00';
            ordersListEl.innerHTML = '<div class="empty-state"><p>No completed orders today.</p></div>';
            return;
        }

        let totalRevenue = 0;
        let totalCosts = 0;
        let ordersHTML = '';

        ordersSnapshot.forEach(doc => {
            const order = doc.data();
            totalRevenue += order.total || 0;

            let orderCost = 0;
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    // Don't include cost for free items
                    if (!item.isFree) {
                        const cost = itemCosts[item.id] || 0;
                        orderCost += cost;
                    }
                });
            }
            totalCosts += orderCost;
            
            // Build HTML for order breakdown
             ordersHTML += `
                <div class="order-summary-item">
                    <span>Order #${order.orderId || doc.id.slice(-6)}</span>
                    <span>Revenue: $${(order.total || 0).toFixed(2)}</span>
                    <span>Cost: $${orderCost.toFixed(2)}</span>
                    <span>Profit: $${((order.total || 0) - orderCost).toFixed(2)}</span>
                </div>
            `;
        });
        
        const netProfit = totalRevenue - totalCosts;

        revenueEl.textContent = `$${totalRevenue.toFixed(2)}`;
        costsEl.textContent = `$${totalCosts.toFixed(2)}`;
        netEl.textContent = `$${netProfit.toFixed(2)}`;
        ordersListEl.innerHTML = ordersHTML;
        
        const netProfitCard = netEl.parentElement;
        netProfitCard.classList.remove('profit-positive', 'profit-negative');
        if (netProfit > 0) {
            netProfitCard.classList.add('profit-positive');
        } else if (netProfit < 0) {
            netProfitCard.classList.add('profit-negative');
        }

    } catch (err) {
        console.error("Error calculating profit:", err);
        showStatus("Failed to calculate profit.", 'error');
        revenueEl.textContent = 'Error';
        costsEl.textContent = 'Error';
        netEl.textContent = 'Error';
        ordersListEl.innerHTML = '<div class="empty-state"><p>Error loading profit data.</p></div>';
    }
}
// *** END: PROFIT CALCULATION FUNCTIONS ***


function initializeVenmoPayment() {
  console.log('💳 Initializing Venmo payment system...');
  
  // Update username display
  const usernameDisplay = document.getElementById('venmo-username-display');
  if (usernameDisplay) {
    usernameDisplay.textContent = VENMO_USERNAME;
  }
  
  // Update initial Venmo link
  const venmoLink = document.getElementById('venmo-payment-link');
  if (venmoLink) {
    venmoLink.href = `https://venmo.com/u/${VENMO_USERNAME}`;
  }
  
  console.log('✅ Venmo payment system initialized with username:', VENMO_USERNAME);
}

function toggleDealFields() {
  const dealType = document.getElementById('deal-type').value;
  
  // Hide all field groups
  document.getElementById('percentage-fields').style.display = 'none';
  document.getElementById('buy-get-fields').style.display = 'none';
  document.getElementById('fixed-discount-fields').style.display = 'none';
  
  // Show relevant fields based on deal type
  if (dealType === 'percentage') {
    document.getElementById('percentage-fields').style.display = 'block';
  } else if (dealType === 'buy-get') {
    document.getElementById('buy-get-fields').style.display = 'block';
  } else if (dealType === 'fixed-discount') {
    document.getElementById('fixed-discount-fields').style.display = 'block';
  }
}

// *** START: MENU ITEM MANAGEMENT FUNCTIONS ***
function showAddItemForm() {
  document.getElementById('add-item-form').style.display = 'block';
}

function hideAddItemForm() {
  document.getElementById('add-item-form').style.display = 'none';
}

async function submitNewItem() {
  const name = document.getElementById('item-name').value.trim();
  const description = document.getElementById('item-description').value.trim();
  const price = parseFloat(document.getElementById('item-price').value);
  const cost = parseFloat(document.getElementById('item-cost').value);
  const stock = parseInt(document.getElementById('item-stock').value);
  const emoji = document.getElementById('item-emoji').value.trim();

  if (!name || !description || isNaN(price) || isNaN(stock) || isNaN(cost)) {
    showStatus('Please fill out all fields correctly.', 'warning');
    return;
  }

  const btn = event.target;
  const stopLoading = showLoading(btn);

  try {
    await firebase.firestore().collection('menuItems').add({
      name,
      description,
      price,
      cost: cost || 0,
      stock,
      emoji,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showStatus('Menu item added successfully!', 'success');
    hideAddItemForm();
    loadAdminMenuItems();
    refreshMenu(); // Refresh customer view
  } catch (err) {
    console.error("Error adding menu item:", err);
    showStatus('Failed to add menu item.', 'error');
  } finally {
    stopLoading();
  }
}

function editMenuItem(id) {
  document.getElementById(`edit-form-${id}`).style.display = 'block';
}

function cancelEditMenuItem(id) {
  document.getElementById(`edit-form-${id}`).style.display = 'none';
}

async function saveMenuItem(id) {
  const name = document.getElementById(`edit-name-${id}`).value.trim();
  const description = document.getElementById(`edit-description-${id}`).value.trim();
  const price = parseFloat(document.getElementById(`edit-price-${id}`).value);
  const cost = parseFloat(document.getElementById(`edit-cost-${id}`).value);
  const stock = parseInt(document.getElementById(`edit-stock-${id}`).value);
  const emoji = document.getElementById(`edit-emoji-${id}`).value.trim();

  if (!name || !description || isNaN(price) || isNaN(stock) || isNaN(cost)) {
    showStatus('Please fill out all fields correctly.', 'warning');
    return;
  }

  const btn = event.target;
  const stopLoading = showLoading(btn);

  try {
    await firebase.firestore().collection('menuItems').doc(id).update({
      name,
      description,
      price,
      cost: cost || 0,
      stock,
      emoji
    });
    showStatus('Item updated successfully!', 'success');
    cancelEditMenuItem(id);
    loadAdminMenuItems();
    refreshMenu();
  } catch (err) {
    console.error("Error saving item:", err);
    showStatus('Failed to save item.', 'error');
  } finally {
    stopLoading();
  }
}

async function deleteMenuItem(id, name) {
  if (!confirm(`Are you sure you want to delete ${name}?`)) {
    return;
  }
  try {
    await firebase.firestore().collection('menuItems').doc(id).delete();
    showStatus(`${name} deleted successfully.`, 'success');
    loadAdminMenuItems();
    refreshMenu();
  } catch (err) {
    console.error("Error deleting item:", err);
    showStatus(`Failed to delete ${name}.`, 'error');
  }
}
// *** END: MENU ITEM MANAGEMENT FUNCTIONS ***

// *** START: DEAL MANAGEMENT FUNCTIONS ***
function showAddDealForm() {
  document.getElementById('add-deal-form').style.display = 'block';
}

function hideAddDealForm() {
  document.getElementById('add-deal-form').style.display = 'none';
}

async function submitNewDeal() {
  const name = document.getElementById('deal-name').value.trim();
  const type = document.getElementById('deal-type').value;
  const menuItemId = document.getElementById('deal-menu-item').value;
  const description = document.getElementById('deal-description').value.trim();

  if (!name || !menuItemId) {
    showStatus('Deal Name and Menu Item are required.', 'warning');
    return;
  }

  let dealData = {
    name,
    type,
    menuItemId,
    description,
    isActive: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (type === 'percentage') {
    dealData.percentage = parseInt(document.getElementById('deal-percentage').value);
    if (isNaN(dealData.percentage)) {
      showStatus('Please enter a valid percentage.', 'warning');
      return;
    }
  } else if (type === 'buy-get') {
    dealData.buyQuantity = parseInt(document.getElementById('deal-buy-quantity').value);
    dealData.freeQuantity = parseInt(document.getElementById('deal-free-quantity').value);
    if (isNaN(dealData.buyQuantity) || isNaN(dealData.freeQuantity)) {
      showStatus('Please enter valid quantities for the deal.', 'warning');
      return;
    }
  } else if (type === 'fixed-discount') {
    dealData.fixedAmount = parseFloat(document.getElementById('deal-fixed-amount').value);
    if (isNaN(dealData.fixedAmount)) {
      showStatus('Please enter a valid discount amount.', 'warning');
      return;
    }
  }

  const btn = event.target;
  const stopLoading = showLoading(btn);

  try {
    await firebase.firestore().collection('deals').add(dealData);
    showStatus('Deal created successfully!', 'success');
    hideAddDealForm();
    loadDeals();
    refreshMenu();
  } catch (err) {
    console.error("Error creating deal:", err);
    showStatus('Failed to create deal.', 'error');
  } finally {
    stopLoading();
  }
}

async function loadDeals() {
  if (!userData || userData.role !== 'admin') return;

  const dealsDiv = document.getElementById('deals-list');
  dealsDiv.innerHTML = '<div class="empty-state"><span class="loading"></span> Loading deals...</div>';

  try {
    const snapshot = await firebase.firestore().collection('deals').orderBy('createdAt', 'desc').get();
    if (snapshot.empty) {
      dealsDiv.innerHTML = '<div class="empty-state"><p>No deals found.</p></div>';
      return;
    }

    dealsDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const deal = doc.data();
      const dealDiv = document.createElement('div');
      dealDiv.className = 'admin-menu-item';
      dealDiv.innerHTML = `
        <h3>${deal.name}</h3>
        <p>${deal.description || ''}</p>
        <div class="item-controls">
          <button class="btn btn-danger" onclick="deleteDeal('${doc.id}', '${deal.name}')">🗑️ Delete</button>
        </div>
      `;
      dealsDiv.appendChild(dealDiv);
    });
  } catch (err) {
    console.error("Error loading deals:", err);
    showStatus("Failed to load deals.", 'error');
  }
}

async function deleteDeal(id, name) {
  if (!confirm(`Are you sure you want to delete the deal: ${name}?`)) {
    return;
  }
  try {
    await firebase.firestore().collection('deals').doc(id).delete();
    showStatus('Deal deleted successfully.', 'success');
    loadDeals();
    refreshMenu();
  } catch (err) {
    console.error("Error deleting deal:", err);
    showStatus('Failed to delete deal.', 'error');
  }
}

async function loadMenuItemsForDeals() {
  const select = document.getElementById('deal-menu-item');
  select.innerHTML = '<option value="">Loading...</option>';
  try {
    const snapshot = await firebase.firestore().collection('menuItems').orderBy('name').get();
    select.innerHTML = '<option value="">Select an item</option>';
    snapshot.forEach(doc => {
      const item = doc.data();
      select.innerHTML += `<option value="${doc.id}">${item.name}</option>`;
    });
  } catch (err) {
    console.error("Error loading menu items for deals:", err);
    select.innerHTML = '<option value="">Error loading items</option>';
  }
}
// *** END: DEAL MANAGEMENT FUNCTIONS ***


// Admin functions
async function loadAdminMenuItems() {
  if (!userData || userData.role !== 'admin') return;
  
  try {
    const snapshot = await firebase.firestore().collection('menuItems').orderBy('createdAt', 'desc').get();
    const menuDiv = document.getElementById('admin-menu-items');
    
    if (snapshot.empty) {
      menuDiv.innerHTML = '<div class="empty-state"><p>No menu items yet.</p></div>';
      return;
    }

    menuDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const item = doc.data();
      const itemDiv = document.createElement('div');
      itemDiv.className = `admin-menu-item ${item.stock <= 0 ? 'out-of-stock' : ''}`;
      itemDiv.innerHTML = `
        <div class="stock-indicator ${item.stock > 0 ? 'in-stock' : 'out-of-stock'}">
          ${item.stock > 0 ? `${item.stock} in Stock` : 'Out of Stock'}
        </div>
        <div class="menu-item-header">
          <div class="menu-item-emoji">${item.emoji || '🍰'}</div>
          <div class="menu-item-info">
            <h3>${item.name}</h3>
            <div class="menu-item-price">$${item.price.toFixed(2)}</div>
          </div>
        </div>
        <div class="menu-item-description">${item.description}</div>
        <div class="item-controls">
          <button class="btn btn-primary" onclick="editMenuItem('${doc.id}')">✏️ Edit</button>
          <button class="btn btn-danger" onclick="deleteMenuItem('${doc.id}', '${item.name}')">🗑️ Delete</button>
        </div>
        <div id="edit-form-${doc.id}" class="edit-form" style="display: none;">
          <input id="edit-name-${doc.id}" value="${item.name}" placeholder="Name">
          <input id="edit-description-${doc.id}" value="${item.description}" placeholder="Description">
          <input id="edit-price-${doc.id}" type="number" step="0.01" value="${item.price}" placeholder="Price">
          <input id="edit-cost-${doc.id}" type="number" step="0.01" value="${item.cost || 0}" placeholder="Cost">
          <input id="edit-stock-${doc.id}" type="number" value="${item.stock}" placeholder="Stock">
          <input id="edit-emoji-${doc.id}" value="${item.emoji || ''}" placeholder="Emoji">
          <div style="margin-top: 10px;">
            <button class="btn btn-success" onclick="saveMenuItem('${doc.id}')">💾 Save</button>
            <button class="btn btn-secondary" onclick="cancelEditMenuItem('${doc.id}')">❌ Cancel</button>
          </div>
        </div>
      `;
      menuDiv.appendChild(itemDiv);
    });
  } catch (err) {
    console.error("Error loading admin menu items:", err);
    showStatus("Failed to load menu items.", 'error');
  }
}

async function loadAdminOrders(filter = 'all') {
    if (!userData || userData.role !== 'admin') return;
    
    console.log('📋 Loading admin orders with filter:', filter);
    
    try {
        let query = firebase.firestore().collection('orders');
        
        if (filter !== 'all') {
            query = query.where('status', '==', filter);
        }
        
        const snapshot = await query.get();
        const ordersDiv = document.getElementById('admin-orders-list');
        
        if (snapshot.empty) {
            ordersDiv.innerHTML = `<div class="empty-state"><p>No ${filter} orders found.</p></div>`;
            return;
        }

        let orders = [];
        snapshot.forEach(doc => {
            orders.push({ id: doc.id, ...doc.data() });
        });

        // Sort by creation date client-side
        orders.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

        ordersDiv.innerHTML = '';
        orders.forEach(order => {
            const docId = order.id;
            const orderDiv = document.createElement('div');
            orderDiv.style.cssText = 'background: white; padding: 20px; border-radius: 10px; margin-bottom: 15px; border: 1px solid #e0e0e0;';
            
            const itemsList = order.items?.map(item => `${item.emoji} ${item.name} - $${item.price.toFixed(2)}`).join('<br>') || 'No items';
            const orderDate = order.createdAt ? order.createdAt.toDate().toLocaleDateString() : 'Recent';
            const orderTime = order.createdAt ? order.createdAt.toDate().toLocaleTimeString() : '';
            
            const paymentInfo = order.paymentMethod === 'venmo' 
                ? `<small style="color: #3D95CE;">💳 Venmo Payment</small>` 
                : `<small style="color: #666;">Payment: ${order.paymentMethod || 'N/A'}</small>`;
            
            const statusColor = getStatusColor(order.status || 'pending');
            const statusText = (order.status || 'pending').replace('-', ' ').toUpperCase();
            
            const deliveryInfo = order.deliveryDetails ? 
                `<small style="color: #666;">📍 ${order.deliveryDetails.type === 'delivery' ? 'Delivery to: ' + order.deliveryDetails.address : 'Pickup at: ' + order.deliveryDetails.location}</small><br>` : '';
            
            orderDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #e0e0e0;">
                    <div>
                        <strong>Order #${order.orderId || docId.slice(-6)}</strong><br>
                        <small style="color: #666;">${orderDate} ${orderTime}</small><br>
                        <small style="color: #666;">Customer: ${order.userEmail}</small><br>
                        ${deliveryInfo}
                        ${paymentInfo}
                    </div>
                    <div style="padding: 5px 15px; border-radius: 20px; font-size: 0.9rem; font-weight: bold; background: ${statusColor}; color: white;">
                        ${statusText}
                    </div>
                </div>
                <div style="margin: 15px 0;">${itemsList}</div>
                <div style="font-weight: bold; color: #28a745; margin-bottom: 15px;">
                    Subtotal: $${order.subtotal?.toFixed(2) || '0.00'} | 
                    Delivery: $${order.deliveryDetails?.fee?.toFixed(2) || '0.00'} | 
                    Total: $${order.total?.toFixed(2) || '0.00'}
                </div>
                <div class="order-actions">
                    ${order.status === 'pending-payment' ? 
                        `<button class="btn btn-success" onclick="updateOrderStatus('${docId}', 'pending')" style="background: #28a745;">✅ Payment Received</button>` : 
                        `<button class="btn btn-primary" onclick="updateOrderStatus('${docId}', 'pending')">📋 Pending</button>`
                    }
                    <button class="btn btn-secondary" onclick="updateOrderStatus('${docId}', 'preparing')">👨‍🍳 Preparing</button>
                    <button class="btn btn-success" onclick="updateOrderStatus('${docId}', 'completed')">✅ Completed</button>
                    <button class="btn btn-danger" onclick="updateOrderStatus('${docId}', 'cancelled')">❌ Cancel</button>
                    <button class="btn btn-danger" onclick="deleteOrder('${docId}', 'admin')" style="background: #8b0000;">🗑️ Delete Order</button>
                </div>
            `;
            ordersDiv.appendChild(orderDiv);
        });
    } catch (err) {
        console.error("❌ Error loading admin orders:", err);
        showStatus(`Failed to load orders: ${err.message}`, 'error');
        document.getElementById('admin-orders-list').innerHTML = `<div class="empty-state"><p>Error loading orders. Check console for details.</p></div>`;
    }
}

function toggleAdminSection(sectionName) {
    // Hide all admin sections
    document.querySelectorAll('.admin-section').forEach(section => {
        section.style.display = 'none';
    });

    // Show the selected section
    const sectionToShow = document.getElementById(`admin-${sectionName}-section`);
    if (sectionToShow) {
        sectionToShow.style.display = 'block';
    }

    // Load data for the selected section
    if (sectionName === 'menu') {
        loadAdminMenuItems();
    } else if (sectionName === 'orders') {
        loadAdminOrders('all');
    } else if (sectionName === 'deals') {
        loadDeals();
        loadMenuItemsForDeals();
    } else if (sectionName === 'employees') {
        loadEmployees();
    } else if (sectionName === 'profit') {
        calculateAndShowProfit();
    }
}

function switchTab(tabName) {
  if (tabName !== 'cart' && !requireLocationVerification()) return;
  
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
  
  document.getElementById(tabName + '-tab').classList.add('active');
  document.getElementById(tabName + '-panel').classList.add('active');
  
  if (tabName === 'menu') {
    refreshMenu();
  } else if (tabName === 'cart') {
    setTimeout(() => {
      forceUpdateTotals();
    }, 200);
  } else if (tabName === 'orders' && currentUser) {
    loadUserOrders();
  } else if (tabName === 'admin' && userData?.role === 'admin') {
    toggleAdminSection('menu'); // Set default view for admin panel
  }
}

// Payment and Cart UI Functions
function updateDeliveryOption() {
  console.log('📍 updateDeliveryOption called - AUTO REFRESHING');
  const selectedOption = document.querySelector('input[name="delivery-option"]:checked')?.value;
  console.log('📍 Selected delivery option:', selectedOption);
  
  const addressSection = document.getElementById('address-section');
  
  if (selectedOption === 'delivery') {
    if (addressSection) addressSection.style.display = 'block';
  } else {
    if (addressSection) addressSection.style.display = 'none';
  }
  
  // IMMEDIATE refresh when delivery option changes
  console.log('🔄 Auto-refreshing totals due to delivery change');
  setTimeout(() => {
    forceUpdateTotals();
  }, 50);
}

function updateVenmoLink(orderNumber = null) {
  console.log('🔗 updateVenmoLink called');
  const venmoLink = document.getElementById('venmo-payment-link');
  if (venmoLink && cart.length > 0) {
    const subtotal = cart.reduce((sum, item) => sum + (item.isFree ? 0 : parseFloat(item.price)), 0);
    const deliveryFee = getDeliveryFee();
    const total = subtotal + deliveryFee;
    
    // Generate order summary for Venmo note with order number
    const orderSummary = generateOrderSummary(orderNumber);
    const encodedNote = encodeURIComponent(orderSummary);
    
    // Use proper Venmo Payment API format
    if (VENMO_USERNAME === 'YOUR_VENMO_USERNAME') {
      console.log('⚠️ Warning: Please update VENMO_USERNAME in the configuration section!');
    }
    
    venmoLink.href = `https://venmo.com/u/${VENMO_USERNAME}?txn=pay&amount=${total.toFixed(2)}&note=${encodedNote}`;
    
    console.log('✅ Updated Venmo payment link:');
    console.log('   Username:', VENMO_USERNAME);
    console.log('   Amount:', total.toFixed(2));
    console.log('   Note:', orderSummary);
    console.log('   Full URL:', venmoLink.href);
  } else if (!venmoLink) {
    console.log('❌ Venmo payment link element not found');
  } else {
    console.log('⚠️ Cart is empty, not updating Venmo link');
  }
}

function forceUpdateTotals() {
  console.log('🔄 === FORCE UPDATE TOTALS ===');
  try {
    console.log('📦 Current cart state:', cart);
    console.log('📦 Cart array length:', cart?.length || 'undefined');
    
    if (!cart || cart.length === 0) {
      console.log('⚠️ Cart is empty or undefined');
      setTimeout(() => {
        const subtotalEl = document.getElementById('cart-subtotal');
        const totalEl = document.getElementById('venmo-total');
        const deliveryEl = document.getElementById('delivery-fee-display');
        
        if (subtotalEl) subtotalEl.textContent = '0.00';
        if (totalEl) totalEl.textContent = '0.00';
        if (deliveryEl) deliveryEl.textContent = 'Free Pickup';
        console.log('✅ Reset all totals to zero');
      }, 50);
      return;
    }
    
    updateVenmoTotal();
    updateVenmoLink();
    console.log('✅ Force update completed');
  } catch (error) {
    console.error('❌ Error in forceUpdateTotals:', error);
  }
}

function getDeliveryFee() {
  const isDelivery = document.querySelector('input[name="delivery-option"]:checked')?.value === 'delivery';
  const fee = isDelivery ? 4.00 : 0;
  console.log('🚚 getDeliveryFee returning:', fee, 'for option:', isDelivery ? 'delivery' : 'pickup');
  return fee;
}

function updateVenmoTotal() {
  console.log('💰 updateVenmoTotal called');
  
  // Calculate subtotal using actual prices from cart (includes deal discounts)
  const subtotal = cart.reduce((sum, item) => sum + (item.isFree ? 0 : parseFloat(item.price)), 0);
  console.log('📊 Calculated subtotal with deals applied:', subtotal);
  
  // Get delivery fee
  const deliveryFee = getDeliveryFee();
  console.log('🚚 Delivery fee:', deliveryFee);
  
  // Calculate total
  const total = subtotal + deliveryFee;
  console.log('💯 Final total:', total);
  
  // Update all elements
  const subtotalEl = document.getElementById('cart-subtotal');
  const deliveryEl = document.getElementById('delivery-fee-display');
  const totalEl = document.getElementById('venmo-total');
  
  if (subtotalEl) {
    subtotalEl.textContent = subtotal.toFixed(2);
    console.log('✅ Updated subtotal element to:', subtotal.toFixed(2));
  } else {
    console.log('❌ cart-subtotal element not found');
  }
  
  if (deliveryEl) {
    deliveryEl.textContent = deliveryFee > 0 ? `$${deliveryFee.toFixed(2)}` : 'Free Pickup';
    console.log('✅ Updated delivery element to:', deliveryFee > 0 ? `$${deliveryFee.toFixed(2)}` : 'Free Pickup');
  } else {
    console.log('❌ delivery-fee-display element not found');
  }
  
  if (totalEl) {
    totalEl.textContent = total.toFixed(2);
    console.log('✅ Updated total element to:', total.toFixed(2));
  } else {
    console.log('❌ venmo-total element not found');
  }
}

function generateOrderSummary(orderNumber = null) {
    const itemGroups = {};
    cart.forEach(item => {
        const groupKey = item.id + (item.isFree ? '-free' : '');
        if (!itemGroups[groupKey]) {
            itemGroups[groupKey] = { ...item, quantity: 0 };
        }
        itemGroups[groupKey].quantity++;
    });

    const orderItems = Object.values(itemGroups).map(group => {
        const priceText = group.isFree ? "(FREE)" : `($${parseFloat(group.price).toFixed(2)} each)`;
        const quantityText = group.quantity > 1 ? ` (x${group.quantity})` : '';
        return `${group.emoji} ${group.name}${quantityText}`;
    }).join(', ');

    const subtotal = cart.reduce((sum, item) => sum + (item.isFree ? 0 : parseFloat(item.price)), 0);
    const deliveryFee = getDeliveryFee();
    const total = subtotal + deliveryFee;
    const deliveryType = document.querySelector('input[name="delivery-option"]:checked')?.value || 'pickup';
    const deliveryText = deliveryType === 'delivery' ? 'Delivery' : 'Pick-up';
    const orderNum = orderNumber || ('ORDER-' + Date.now().toString().slice(-6));
    
    return `Covenant Hills Bakery | ${orderItems} | Delivery Type: ${deliveryText} | Order #: ${orderNum} | Total: $${total.toFixed(2)}`;
}

function renderCart() {
    const cartDiv = document.getElementById('cart');
    if (cart.length === 0) {
        cartDiv.innerHTML = '<div class="empty-state"><p>Your cart is empty. Add some delicious items!</p></div>';
        document.getElementById('checkout-section').style.display = 'none';
        updateCartCount();
        return;
    }

    document.getElementById('checkout-section').style.display = 'block';
    resetCheckoutUI();

    const paidItems = cart.filter(item => !item.isFree);
    const freeItems = cart.filter(item => item.isFree);

    const groupItems = (items) => {
        const itemGroups = {};
        items.forEach((item, index) => {
            const groupKey = `${item.id}-${item.price.toFixed(2)}`;
            if (!itemGroups[groupKey]) {
                itemGroups[groupKey] = { item, quantity: 0, indices: [] };
            }
            itemGroups[groupKey].quantity++;
            // Find original index in main cart array for removal
            itemGroups[groupKey].indices.push(cart.findIndex(cartItem => cartItem === item));
        });
        return Object.values(itemGroups);
    };

    const paidGroups = groupItems(paidItems);
    const freeGroups = groupItems(freeItems);

    let cartHTML = '';

    // Render paid items
    paidGroups.forEach(group => {
        const { item, quantity, indices } = group;
        const indexToRemove = indices[indices.length - 1]; // Get last index for removal
        const priceDisplay = `$${parseFloat(item.price).toFixed(2)}`;
        const quantityDisplay = quantity > 1 ? ` <strong style="color: #18181b;">(x${quantity})</strong>` : '';
        cartHTML += `
            <div class="cart-item">
                <div>
                    <span style="font-size: 1.5rem; margin-right: 10px;">${item.emoji}</span>
                    <span>
                        <strong>${item.name}</strong>${quantityDisplay} - ${priceDisplay}
                    </span>
                </div>
                <button class="btn btn-danger" style="padding: 5px 10px; font-size: 0.9rem;" onclick="removeFromCart(${indexToRemove})">Remove</button>
            </div>
        `;
    });

    // Render free items header and items
    if (freeGroups.length > 0) {
        cartHTML += `<h3 style="text-align:center; color: #28a745; margin-top: 20px; margin-bottom: 10px;">🎉 Free Items!</h3>`;
        freeGroups.forEach(group => {
            const { item, quantity } = group;
            const priceDisplay = `<span style="color: #28a745; font-weight: bold;">FREE!</span>`;
            const quantityDisplay = quantity > 1 ? ` <strong style="color: #28a745;">(x${quantity})</strong>` : '';
            cartHTML += `
                <div class="cart-item has-deal">
                    <div>
                        <span style="font-size: 1.5rem; margin-right: 10px;">${item.emoji}</span>
                        <span>
                            <strong>${item.name}</strong>${quantityDisplay} - ${priceDisplay}
                        </span>
                    </div>
                </div>
            `;
        });
    }

    const total = cart.reduce((sum, item) => sum + (item.isFree ? 0 : parseFloat(item.price)), 0);
    cartHTML += `<div class="cart-total">Cart Items Total: $${total.toFixed(2)}</div>`;
    cartDiv.innerHTML = cartHTML;
    
    updateCartCount();
    forceUpdateTotals();
}

function updateFreeItemsInCart() {
    const buyGetDealsInCart = cart.reduce((acc, item) => {
        if (item.dealType === 'buy-get' && !acc.some(d => d.dealId === item.dealId)) {
            acc.push(item);
        }
        return acc;
    }, []);

    buyGetDealsInCart.forEach(deal => {
        const paidItemsForDeal = cart.filter(item => !item.isFree && item.dealId === deal.dealId);
        const freeItemsForDeal = cart.filter(item => item.isFree && item.dealId === deal.dealId);

        const paidCount = paidItemsForDeal.length;
        const expectedFreeCount = Math.floor(paidCount / deal.buyQuantity) * deal.freeQuantity;
        const currentFreeCount = freeItemsForDeal.length;

        if (currentFreeCount < expectedFreeCount) {
            // Add missing free items
            const itemsToAdd = expectedFreeCount - currentFreeCount;
            for (let i = 0; i < itemsToAdd; i++) {
                const freeItem = {
                    ...deal,
                    price: 0,
                    isFree: true,
                    dealInfo: `Free with ${deal.name}`
                };
                cart.push(freeItem);
            }
        } else if (currentFreeCount > expectedFreeCount) {
            // Remove excess free items
            const itemsToRemove = currentFreeCount - expectedFreeCount;
            for (let i = 0; i < itemsToRemove; i++) {
                const lastFreeItemIndex = cart.findLastIndex(item => item.isFree && item.dealId === deal.dealId);
                if (lastFreeItemIndex > -1) {
                    cart.splice(lastFreeItemIndex, 1);
                }
            }
        }
    });
}

function resetCheckoutUI() {
  console.log('Checkout UI reset (Venmo mode)');
}

function updateCartCount() {
  // Show total number of individual items, not grouped items
  const totalItems = cart.length;
  const cartCountEl = document.getElementById('cart-count');
  
  if (cartCountEl) {
    cartCountEl.textContent = totalItems;
    
    // Add a subtle animation when count changes
    cartCountEl.style.transform = 'scale(1.2)';
    cartCountEl.style.transition = 'transform 0.2s ease';
    setTimeout(() => {
      cartCountEl.style.transform = 'scale(1)';
    }, 200);
  }
  
  // Also log for debugging
  console.log('📊 Cart count updated:', totalItems);
}

function forceRefreshCart() {
  console.log('🔄 === FORCE REFRESH CART ===');
  
  // Clear ALL cached data
  window.processedCartForCalculations = null;
  window.finalCartTotal = undefined;
  window.itemGroupsMap = null;
  
  console.log('🧹 Cleared all cached cart data');
  
  // Force complete re-render
  renderCart();
  
  showStatus('Cart completely refreshed! Check if items are now stacked.', 'success');
}

function testVenmoPayment() {
  console.log('🧪 Testing Venmo payment link...');
  
  if (cart.length === 0) {
    console.log('⚠️ Cannot test Venmo payment - cart is empty');
    showStatus('Add items to cart to test Venmo payment', 'warning');
    return;
  }
  
  // Force update the processed cart
  if (window.processedCartForCalculations) {
    console.log('🔄 Using processed cart with deals for test');
  }
  
  updateVenmoLink();
  
  const venmoLink = document.getElementById('venmo-payment-link');
  if (venmoLink) {
    console.log('✅ Venmo test complete. Link URL:', venmoLink.href);
    showStatus('Venmo payment link updated successfully! Check console for details.', 'success');
    
    // Show test results in console
    const cartToUse = window.processedCartForCalculations || cart;
    const subtotal = cartToUse.reduce((sum, item) => sum + parseFloat(item.price), 0);
    console.log('💰 Test Results:');
    console.log('   Cart items:', cartToUse.length);
    console.log('   Subtotal with deals:', subtotal.toFixed(2));
    console.log('   Delivery fee:', getDeliveryFee().toFixed(2));
    console.log('   Final total:', (subtotal + getDeliveryFee()).toFixed(2));
  } else {
    console.log('❌ Venmo link element not found');
    showStatus('Error: Venmo payment link not found', 'error');
  }
}

// Location verification functions
function requestLocation() {
  if (locationCheckInProgress) return;
  
  locationCheckInProgress = true;
  const statusDiv = document.getElementById('location-status');
  const locationBtn = document.getElementById('location-btn');
  
  statusDiv.innerHTML = '<span class="loading"></span> Checking your location...';
  statusDiv.style.color = '#d4691a';
  locationBtn.disabled = true;

  if (!navigator.geolocation) {
    showLocationError('Geolocation is not supported by your browser.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    verifyLocation,
    handleLocationError,
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000
    }
  );
}

function verifyLocation(position) {
  const { latitude, longitude } = position.coords;
  
  const allowedAreas = [
    {
      name: "Covenant Hills",
      centerLat: 33.5567,
      centerLng: -117.6648,
      radius: 3,
      delivery: true
    },
    {
      name: "Ladera Ranch", 
      centerLat: 33.5453,
      centerLng: -117.6489,
      radius: 3.5,
      delivery: false
    }
  ];

  let isInServiceArea = false;
  let nearestArea = null;

  for (const area of allowedAreas) {
    const distance = calculateDistance(latitude, longitude, area.centerLat, area.centerLng);
    if (distance <= area.radius) {
      isInServiceArea = true;
      nearestArea = area.name;
      verifiedLocationArea = area;
      break;
    }
  }

  locationCheckInProgress = false;

  if (isInServiceArea) {
    locationVerified = true;
    showLocationSuccess(nearestArea);
    hideLocationVerification();
    showMainContent();
    updateDeliveryOptionsUI();
  } else {
    verifiedLocationArea = null;
    showLocationDenied();
  }
}

function updateDeliveryOptionsUI() {
    const deliveryLabel = document.querySelector('label:has(input[value="delivery"])');
    const deliveryInput = document.querySelector('input[value="delivery"]');
    const pickupInput = document.querySelector('input[value="pickup"]');

    if (!deliveryLabel || !deliveryInput || !pickupInput) {
        console.error("Delivery option elements not found.");
        return;
    }

    if (verifiedLocationArea && verifiedLocationArea.delivery) {
        deliveryLabel.style.display = 'flex';
    } else {
        deliveryLabel.style.display = 'none';
        if (deliveryInput.checked) {
            pickupInput.checked = true;
            updateDeliveryOption();
        }
    }
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function handleLocationError(error) {
  locationCheckInProgress = false;
  let errorMessage = '';
  
  switch(error.code) {
    case error.PERMISSION_DENIED:
      errorMessage = 'Location access denied. Please enable location services and refresh the page.';
      break;
    case error.POSITION_UNAVAILABLE:
      errorMessage = 'Location information unavailable. Please try again.';
      break;
    case error.TIMEOUT:
      errorMessage = 'Location request timed out. Please try again.';
      break;
    default:
      errorMessage = 'An unknown error occurred while retrieving your location.';
      break;
  }
  
  showLocationError(errorMessage);
}

function showLocationError(message) {
  const statusDiv = document.getElementById('location-status');
  const locationBtn = document.getElementById('location-btn');
  
  statusDiv.textContent = message;
  statusDiv.style.color = '#dc3545';
  locationBtn.disabled = false;
  locationBtn.textContent = '📍 Try Again';
}

function showLocationSuccess(area) {
  const statusDiv = document.getElementById('location-status');
  statusDiv.innerHTML = `✅ Location verified! Welcome to our ${area} service area.`;
  statusDiv.style.color = '#28a745';
}

function showLocationVerification() {
  document.getElementById('location-verification').style.display = 'flex';
  document.getElementById('location-denied').style.display = 'none';
  document.getElementById('main-content').style.display = 'none';
}

function hideLocationVerification() {
  document.getElementById('location-verification').style.display = 'none';
}

function showLocationDenied() {
  document.getElementById('location-verification').style.display = 'none';
  document.getElementById('location-denied').style.display = 'flex';
  document.getElementById('main-content').style.display = 'none';
}

function showMainContent() {
  document.getElementById('main-content').style.display = 'block';
  document.getElementById('location-verification').style.display = 'none';
  document.getElementById('location-denied').style.display = 'none';
}

function checkLocationAgain() {
  showLocationVerification();
  const locationBtn = document.getElementById('location-btn');
  const statusDiv = document.getElementById('location-status');
  locationBtn.disabled = false;
  locationBtn.textContent = '📍 Share My Location';
  statusDiv.textContent = '';
  locationCheckInProgress = false;
}

function requireLocationVerification() {
  if (!locationVerified) {
    showStatus('Please verify your location first to access this feature.', 'warning');
    return false;
  }
  return true;
}

// Auth functions
async function signInWithGoogle() {
  if (!requireLocationVerification()) return;
  
  const googleBtn = event.target;
  const stopLoading = showLoading(googleBtn);

  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    const result = await firebase.auth().signInWithPopup(provider);
    showStatus(`Welcome ${result.user.displayName || result.user.email}!`, 'success');
  } catch (error) {
    console.error("Google sign in error:", error);
    if (error.code === 'auth/popup-blocked') {
      showStatus("Popup was blocked. Please allow popups for this site and try again.", 'error');
    } else if (error.code === 'auth/popup-closed-by-user') {
      showStatus("Sign in was cancelled.", 'warning');
    } else {
      showStatus("Google sign in failed. Please try again.", 'error');
    }
  } finally {
    stopLoading();
  }
}

async function signUp() {
  if (!requireLocationVerification()) return;
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  if (!email || !password) {
    showStatus('Please enter both email and password.', 'warning');
    return;
  }

  const signUpBtn = event.target;
  const stopLoading = showLoading(signUpBtn);

  try {
    const result = await firebase.auth().createUserWithEmailAndPassword(email, password);
    await firebase.firestore().collection('users').doc(result.user.uid).set({
      email,
      role: 'customer',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showStatus("Account created successfully!", 'success');
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    stopLoading();
  }
}

async function signIn() {
  if (!requireLocationVerification()) return;
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  if (!email || !password) {
    showStatus('Please enter both email and password.', 'warning');
    return;
  }

  const signInBtn = event.target;
  const stopLoading = showLoading(signInBtn);

  try {
    await firebase.auth().signInWithEmailAndPassword(email, password);
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    showStatus('Signed in successfully!', 'success');
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    stopLoading();
  }
}

function signOut() {
  firebase.auth().signOut();
  cart = [];
  renderCart();
  showStatus('Signed out successfully!', 'success');
}

// REVISED: addToCart and removeFromCart now use the new updateFreeItemsInCart function
async function addToCart(id, name, price, emoji, stock) {
    if (!requireLocationVerification()) return;
    
    const itemsInCart = cart.filter(item => item.id === id).length;
    if (itemsInCart >= stock) {
      showStatus(`No more stock for ${name}!`, 'error');
      return;
    }

    try {
        const deals = await getActiveDealsForItem(id);
        let finalItem = { id, name, price: parseFloat(price), emoji, isFree: false };

        if (deals.length > 0) {
            const bestDeal = deals[0]; 
            if (bestDeal.type === 'buy-get') {
                finalItem = { ...finalItem, ...bestDeal, dealType: 'buy-get' };
            } else {
                finalItem = applyDealToItem(finalItem, bestDeal);
            }
        }

        cart.push(finalItem);
        updateFreeItemsInCart(); // Centralized logic for updating deals
        renderCart();
        
        showStatus(`${name} added to cart`, 'success');
    } catch (err) {
        console.error("Error adding item to cart:", err);
        showStatus("Failed to add item to cart.", 'error');
    }
}

function removeFromCart(index) {
    const item = cart[index];
    cart.splice(index, 1);
    updateFreeItemsInCart(); // Re-evaluate deals after removal
    renderCart();
    showStatus(`${item.name} removed from cart.`, 'warning');
}

async function submitVenmoOrder() {
  if (!requireLocationVerification()) return;
  
  if (!currentUser) {
    showStatus("Please sign in to place an order.", 'warning');
    switchTab('account');
    return;
  }
  
  if (cart.length === 0) {
    showStatus("Your cart is empty.", 'warning');
    return;
  }

  const selectedOption = document.querySelector('input[name="delivery-option"]:checked')?.value;
  let deliveryDetails = {};

  if (selectedOption === 'delivery') {
    const address = document.getElementById('delivery-address')?.value?.trim();
    if (!address) {
      showStatus("Please enter a delivery address.", 'warning');
      document.getElementById('delivery-address')?.focus();
      return;
    }
    
    deliveryDetails = {
      type: 'delivery',
      address: address,
      instructions: document.getElementById('delivery-instructions')?.value?.trim() || '',
      fee: 4.00
    };
  } else {
    deliveryDetails = {
      type: 'pickup',
      location: '7 Moonlight Isle',
      fee: 0
    };
  }

  const submitBtn = document.getElementById('submit-order-btn');
  const stopLoading = showLoading(submitBtn);

  try {
    const db = firebase.firestore();
    await db.runTransaction(async (transaction) => {
      const orderId = 'ORDER-' + Date.now().toString().slice(-6);
      const subtotal = cart.reduce((sum, item) => sum + (item.isFree ? 0 : item.price), 0);
      const total = subtotal + deliveryDetails.fee;
      
      const itemQuantities = cart.reduce((acc, item) => {
        if (!item.isFree) {
          acc[item.id] = (acc[item.id] || 0) + 1;
        }
        return acc;
      }, {});

      const itemRefs = {};
      for (const itemId in itemQuantities) {
        itemRefs[itemId] = db.collection('menuItems').doc(itemId);
      }

      const itemDocs = await Promise.all(Object.values(itemRefs).map(ref => transaction.get(ref)));

      for (const itemDoc of itemDocs) {
        const currentStock = itemDoc.data().stock;
        const quantityOrdered = itemQuantities[itemDoc.id];
        if (currentStock < quantityOrdered) {
          throw new Error(`Not enough stock for ${itemDoc.data().name}.`);
        }
      }

      for (const itemId in itemQuantities) {
        const newStock = firebase.firestore.FieldValue.increment(-itemQuantities[itemId]);
        transaction.update(itemRefs[itemId], { stock: newStock });
      }

      const orderRef = db.collection('orders').doc();
      transaction.set(orderRef, {
        userId: currentUser.uid,
        userEmail: userData.email,
        items: cart,
        subtotal: subtotal,
        deliveryDetails: deliveryDetails,
        total: total,
        status: 'pending-payment',
        paymentMethod: 'venmo',
        orderId: orderId,
        customerInstructions: 'Payment via Venmo - pending verification',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Only if transaction succeeds, show success UI
      cart = [];
      renderCart();
      
      const deliveryText = deliveryDetails.type === 'delivery' 
        ? `📍 Delivery to: ${deliveryDetails.address}` 
        : `🏪 Pickup at: ${deliveryDetails.location}`;
      
      showStatus(`🎉 Order ${orderId} submitted! We'll confirm payment and contact you soon.`, 'success');
      
      document.getElementById('checkout-section').innerHTML = `
        <div style="background: linear-gradient(135deg, #28a745, #20c997); color: white; padding: 30px; border-radius: 20px; text-align: center;">
          <h3 style="margin-bottom: 15px;">✅ Order Submitted Successfully!</h3>
          <p style="margin-bottom: 10px;"><strong>Order ID:</strong> ${orderId}</p>
          <p style="margin-bottom: 10px;"><strong>Total Paid:</strong> $${total.toFixed(2)}</p>
          <p style="margin-bottom: 20px;">${deliveryText}</p>
          <p style="margin-bottom: 20px;">Thank you! We'll confirm your Venmo payment and start preparing your delicious items.</p>
          <p style="font-size: 0.9rem; opacity: 0.9;">You'll receive an update once we verify payment.</p>
        </div>
      `;
    });
  } catch (err) {
    console.error("Order submission error:", err);
    showStatus(`Failed to submit order: ${err.message}`, 'error');
    refreshMenu(); // Refresh menu to show updated stock
  } finally {
    stopLoading();
  }
}

async function updateOrderStatus(orderId, newStatus) {
  const btn = event.target;
  const stopLoading = showLoading(btn);

  try {
    await firebase.firestore().collection('orders').doc(orderId).update({
      status: newStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showStatus(`✅ Order status updated to ${newStatus}!`, 'success');
    
    loadAdminOrders('all');
    
  } catch (err) {
    console.error("Failed to update order status:", err);
    showStatus("❌ Failed to update order status.", 'error');
  } finally {
    stopLoading();
  }
}

async function deleteOrder(orderId, userType) {
  const confirmMessage = userType === 'admin' 
    ? `Are you sure you want to permanently delete this order? This action cannot be undone.`
    : `Are you sure you want to delete this order? This action cannot be undone.`;
  
  if (!confirm(confirmMessage)) {
    return;
  }

  const btn = event.target;
  const stopLoading = showLoading(btn);

  try {
    if (userType === 'user') {
      const orderDoc = await firebase.firestore().collection('orders').doc(orderId).get();
      if (!orderDoc.exists) {
        showStatus("Order not found.", 'error');
        return;
      }
      
      const orderData = orderDoc.data();
      if (orderData.userId !== currentUser.uid) {
        showStatus("You can only delete your own orders.", 'error');
        return;
      }
    }

    await firebase.firestore().collection('orders').doc(orderId).delete();
    
    showStatus("✅ Order deleted successfully!", 'success');
    
    if (userType === 'admin') {
      loadAdminOrders('all');
    } else {
      loadUserOrders();
    }
    
    // After deleting, reset the cart view to avoid softlock
    resetCartView();
    
  } catch (err) {
    console.error("Failed to delete order:", err);
    showStatus("❌ Failed to delete order. Please try again.", 'error');
  } finally {
    stopLoading();
  }
}

/**
 * Resets the cart and checkout UI to its default empty state.
 */
function resetCartView() {
  const cartDiv = document.getElementById('cart');
  const checkoutSection = document.getElementById('checkout-section');
  
  // Original checkout section HTML for restoration
  const originalCheckoutHTML = `
    <!-- Delivery Options -->
    <div style="background: rgba(255, 255, 255, 0.9); padding: 25px; border-radius: 15px; margin-bottom: 20px; border: 1px solid rgba(0, 0, 0, 0.1);">
      <h4 style="color: #d4691a; margin-bottom: 20px; text-align: center;">📍 Delivery Options</h4>
      <div style="display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; justify-content: center;">
        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 15px; background: rgba(102, 126, 234, 0.1); border-radius: 10px; transition: all 0.3s ease;">
          <input type="radio" name="delivery-option" value="pickup" checked onchange="updateDeliveryOption(); console.log('📍 Pickup selected - triggering update');">
          <span style="font-weight: 600; color: #667eea;">🏪 Pickup at 7 Moonlight Isle</span>
        </label>
        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 15px; background: rgba(102, 126, 234, 0.1); border-radius: 10px; transition: all 0.3s ease;">
          <input type="radio" name="delivery-option" value="delivery" onchange="updateDeliveryOption(); console.log('📍 Delivery selected - triggering update');">
          <span style="font-weight: 600; color: #667eea;">🚚 Delivery (+$1.50)</span>
        </label>
      </div>
      <div id="address-section" style="display: none; background: rgba(248, 249, 250, 0.9); padding: 20px; border-radius: 10px; margin-top: 15px;">
        <h5 style="color: #667eea; margin-bottom: 15px;">📍 Delivery Address</h5>
        <input id="delivery-address" type="text" placeholder="Enter your full address in Covenant Hills or Ladera Ranch" style="width: 100%; padding: 15px; border: 2px solid #e0e0e0; border-radius: 10px; font-size: 1rem; margin-bottom: 10px;">
        <input id="delivery-instructions" type="text" placeholder="Delivery instructions (optional)" style="width: 100%; padding: 15px; border: 2px solid #e0e0e0; border-radius: 10px; font-size: 1rem;">
      </div>
    </div>
    <!-- Payment Instructions -->
    <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 30px; border-radius: 20px; color: white; text-align: center; margin-bottom: 20px;">
      <h3 style="margin-bottom: 15px; font-family: 'Playfair Display', serif;">💳 Payment Instructions</h3>
      <p style="margin-bottom: 20px; opacity: 0.9;">To complete your order, please send payment via Venmo:</p>
      <a id="venmo-payment-link" href="https://venmo.com/u/YOUR_VENMO_USERNAME" target="_blank" style="display: inline-block; background: #3D95CE; color: white; padding: 15px 30px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 1.1rem; margin: 10px; transition: all 0.3s ease; box-shadow: 0 5px 15px rgba(61, 149, 206, 0.4);">
        📱 Pay with Venmo
      </a>
      <div style="background: rgba(255, 255, 255, 0.1); padding: 20px; border-radius: 15px; margin-top: 20px;">
        <p style="margin-bottom: 10px;"><strong>Venmo Username:</strong> @<span id="venmo-username-display">YOUR_VENMO_USERNAME</span></p>
        <p style="margin-bottom: 10px;"><strong>Subtotal:</strong> $<span id="cart-subtotal">0.00</span></p>
        <p style="margin-bottom: 10px;"><strong>Delivery:</strong> <span id="delivery-fee-display">Free Pickup</span></p>
        <p style="margin-bottom: 15px; font-size: 1.2rem;"><strong>Total Amount:</strong> $<span id="venmo-total">0.00</span></p>
        <p style="font-size: 0.9rem; opacity: 0.8;">⚠️ Please include your order details in the Venmo note!</p>
      </div>
    </div>
    <!-- Order Confirmation -->
    <div style="background: rgba(255, 255, 255, 0.9); padding: 25px; border-radius: 15px; text-align: center;">
      <h4 style="color: #d4691a; margin-bottom: 15px;">📋 After Payment</h4>
      <p style="margin-bottom: 20px; color: #666;">Once you've sent the Venmo payment, click below to submit your order:</p>
      <button class="btn btn-success" onclick="submitVenmoOrder()" id="submit-order-btn" style="font-size: 1.2rem; padding: 15px 30px;">✅ Confirm Order Placed</button>
      <p style="margin-top: 15px; font-size: 0.9rem; color: #888;">We'll confirm receipt of payment and prepare your order!</p>
    </div>
  `;
  
  if (cartDiv) {
    cartDiv.innerHTML = '<div class="empty-state"><p>Your cart is empty. Add some delicious items!</p></div>';
  }
  if (checkoutSection) {
    checkoutSection.innerHTML = originalCheckoutHTML;
    checkoutSection.style.display = 'none';
  }
  
  // Re-initialize any event listeners if needed
  initializeVenmoPayment();
  
  // Finally, update cart count and totals
  renderCart();
}

// Load menu items with deals
async function refreshMenu() {
  try {
    const snapshot = await firebase.firestore().collection('menuItems').where('stock', '>', 0).get();
    const menuDiv = document.getElementById('menu');
    
    if (snapshot.empty) {
      menuDiv.innerHTML = '<div class="empty-state"><p>No items available right now. Check back soon!</p></div>';
      return;
    }

    // Get all active deals
    const dealsSnapshot = await firebase.firestore().collection('deals').where('isActive', '==', true).get();
    const dealsByItem = {};
    
    dealsSnapshot.forEach(doc => {
      const deal = doc.data();
      if (!dealsByItem[deal.menuItemId]) {
        dealsByItem[deal.menuItemId] = [];
      }
      dealsByItem[deal.menuItemId].push({ id: doc.id, ...deal });
    });

    menuDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const item = doc.data();
      const itemDeals = dealsByItem[doc.id] || [];
      
      const itemDiv = document.createElement('div');
      itemDiv.className = `menu-item ${itemDeals.length > 0 ? 'has-deal' : ''}`;
      
      // Generate deal badges and descriptions
      let dealBadges = '';
      let dealDescriptions = '';
      
      itemDeals.forEach(deal => {
        let badgeText = '';
        if (deal.type === 'percentage') {
          badgeText = `${deal.percentage}% OFF`;
        } else if (deal.type === 'buy-get') {
          badgeText = `Buy ${deal.buyQuantity} Get ${deal.freeQuantity} FREE`;
        } else if (deal.type === 'fixed-discount') {
          badgeText = `$${deal.fixedAmount.toFixed(2)} OFF`;
        }
        
        dealBadges += `<div class="deal-badge">${badgeText}</div>`;
        
        if (deal.description) {
          dealDescriptions += `<div class="deal-description">🏷️ ${deal.description}</div>`;
        }
      });
      
      itemDiv.innerHTML = `
        ${dealBadges}
        <div class="stock-indicator in-stock">${item.stock} in stock</div>
        <div class="menu-item-header">
          <div class="menu-item-emoji">${item.emoji || '🍰'}</div>
          <div class="menu-item-info">
            <h3>${item.name}</h3>
            <div class="menu-item-price">$${item.price.toFixed(2)}</div>
          </div>
        </div>
        <div class="menu-item-description">${item.description}</div>
        ${dealDescriptions}
        <button class="btn btn-primary" onclick="addToCart('${doc.id}', '${item.name}', ${item.price}, '${item.emoji || '🍰'}', ${item.stock})">Add to Cart</button>
      `;
      menuDiv.appendChild(itemDiv);
    });
  } catch (err) {
    console.error("Error loading menu items:", err);
    showStatus("Failed to load menu items.", 'error');
  }
}

async function loadMenuItems() {
    await refreshMenu();
}

async function loadUserOrders() {
  if (!currentUser) return;
  
  try {
    const snapshot = await firebase.firestore().collection('orders')
      .where('userId', '==', currentUser.uid)
      .orderBy('createdAt', 'desc')
      .get();
    
    const ordersDiv = document.getElementById('orders-list');
    
    if (snapshot.empty) {
      ordersDiv.innerHTML = '<div class="empty-state"><p>You haven\'t placed any orders yet.</p></div>';
      return;
    }

    ordersDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const order = doc.data();
      const orderDiv = document.createElement('div');
      orderDiv.style.cssText = 'background: white; padding: 20px; border-radius: 10px; margin-bottom: 15px; border: 1px solid #e0e0e0;';
      
      const itemsList = order.items.map(item => `${item.emoji} ${item.name} - $${item.price.toFixed(2)}`).join('<br>');
      const orderDate = order.createdAt ? order.createdAt.toDate().toLocaleDateString() : 'Recent';
      
      orderDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <strong>Order from ${orderDate}</strong>
          <div style="padding: 5px 10px; border-radius: 15px; font-size: 0.8rem; font-weight: bold; background: ${getStatusColor(order.status || 'pending')}; color: white;">
            ${(order.status || 'pending').toUpperCase()}
          </div>
        </div>
        <div style="margin: 10px 0;">${itemsList}</div>
        <div style="font-weight: bold; color: #28a745; margin-bottom: 15px;">Total: $${order.total.toFixed(2)}</div>
        <div style="text-align: right;">
          <button class="btn btn-danger" onclick="deleteOrder('${doc.id}', 'user')" style="padding: 8px 15px; font-size: 0.9rem;">🗑️ Delete Order</button>
        </div>
      `;
      ordersDiv.appendChild(orderDiv);
    });
  } catch (err) {
    console.error("Error loading orders:", err);
    showStatus("Failed to load orders.", 'error');
  }
}

async function handleAuthStateChange(user) {
  try {
    if (user) {
      currentUser = user;
      
      const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
      
      if (!userDoc.exists) {
        await firebase.firestore().collection('users').doc(user.uid).set({
          email: user.email,
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          role: 'customer',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        userData = {
          email: user.email,
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          role: 'customer'
        };
      } else {
        userData = userDoc.data();
      }

      document.getElementById('signed-out-view').style.display = 'none';
      document.getElementById('signed-in-view').style.display = 'block';
      document.getElementById('user-email-display').textContent = userData.email;
      document.getElementById('user-role-display').textContent = `Role: ${userData.role}`;
      
      const avatarDiv = document.getElementById('user-avatar');
      if (userData.photoURL) {
        avatarDiv.innerHTML = `<img src="${userData.photoURL}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" alt="Profile">`;
      } else {
        const initial = (userData.displayName || userData.email).charAt(0).toUpperCase();
        avatarDiv.textContent = initial;
        avatarDiv.style.background = '#d4691a';
        avatarDiv.style.color = 'white';
      }
      
      document.getElementById('orders-tab').style.display = 'block';
      if (userData.role === 'admin') {
        document.getElementById('admin-tab').style.display = 'block';
      }

      await loadMenuItems();
    } else {
      currentUser = null;
      userData = null;
      verifiedLocationArea = null;
      updateDeliveryOptionsUI();
      
      document.getElementById('signed-out-view').style.display = 'block';
      document.getElementById('signed-in-view').style.display = 'none';
      document.getElementById('orders-tab').style.display = 'none';
      document.getElementById('admin-tab').style.display = 'none';
      
      document.getElementById('menu').innerHTML = '<div class="empty-state"><p>Sign in to view our delicious menu items!</p></div>';
      cart = [];
      renderCart();
      switchTab('account');
    }
  } catch (error) {
    console.error("Auth state change error:", error);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  try {
    firebase.initializeApp(firebaseConfig);
    firebase.auth().onAuthStateChanged(handleAuthStateChange);
    updateCartCount();
    
    // Initialize Venmo payment system
    initializeVenmoPayment();
    
    console.log('🔥 Firebase initialized successfully!');
    
    showLocationVerification();
    
    // Initialize deal form fields toggle
    setTimeout(() => {
      if (document.getElementById('deal-type')) {
        toggleDealFields();
      }
    }, 1000);
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    showStatus('Failed to load the application. Please refresh the page.', 'error');
  }
});

document.addEventListener('keypress', function(e) {
  if (e.target.id === 'email' || e.target.id === 'password') {
    if (e.key === 'Enter') {
      signIn();
    }
  }
});
" in the Canvas. Can you help me with a query about it?
The user wants to make the following changes:
1.  **Delivery option:** Only show the delivery option if the user is in "Covenant Hills".
2.  **Pickup option:** The pickup option should be available for users in both "Covenant Hills" and "Ladera Ranch".
3.  **Delivery fee:** Change the delivery fee to $4.00.

To implement this, I need to modify the `script.js` file.

Here's the plan:
1.  **Store the user's verified location:** When the location is verified in the `verifyLocation` function, I need to store which area they are in (e.g., "Covenant Hills" or "Ladera Ranch"). I can use a global variable for this, let's say `verifiedLocationArea`.
2.  **Update `verifyLocation` function:**
    * Modify the loop to check for both areas.
    * When a location is verified, set `verifiedLocationArea` to the name of the area (e.g., "Covenant Hills").
    * After successful verification, call a new function, let's call it `updateDeliveryOptionsUI()`, to show/hide the delivery option based on the `verifiedLocationArea`.
3.  **Create `updateDeliveryOptionsUI()` function:**
    * This function will check the value of `verifiedLocationArea`.
    * It will get the delivery option's radio button and its label.
    * If `verifiedLocationArea` is "Covenant Hills", it will make sure the delivery option is visible.
    * If `verifiedLocationArea` is "Ladera Ranch", it will hide the delivery option.
    * It should also handle the case where the delivery option was selected but then becomes hidden (e.g., if the user re-checks their location), making sure to switch back to pickup.
4.  **Update `getDeliveryFee()` function:**
    * Change the hardcoded fee from `1.50` to `4.00`.
5.  **Update `submitVenmoOrder()` function:**
    * Change the hardcoded delivery fee from `1.50` to `4.00`.
6.  **Modify the HTML (`index.html`):**
    * Update the text for the delivery option to show the new fee of $4.00.

Let's break down the code changes in `script.js`.

**Global variables:**
Add `let verifiedLocationArea = null;`

**`verifyLocation(position)` function:**
```javascript
function verifyLocation(position) {
  const { latitude, longitude } = position.coords;
  
  const allowedAreas = [
    {
      name: "Covenant Hills",
      centerLat: 33.5567,
      centerLng: -117.6648,
      radius: 3,
      delivery: true // Add a flag for delivery
    },
    {
      name: "Ladera Ranch", 
      centerLat: 33.5453,
      centerLng: -117.6489,
      radius: 3.5,
      delivery: false // No delivery here
    }
  ];

  let isInServiceArea = false;
  let nearestArea = null;

  for (const area of allowedAreas) {
    const distance = calculateDistance(latitude, longitude, area.centerLat, area.centerLng);
    if (distance <= area.radius) {
      isInServiceArea = true;
      nearestArea = area.name;
      verifiedLocationArea = area; // Store the whole area object
      break;
    }
  }

  locationCheckInProgress = false;

  if (isInServiceArea) {
    locationVerified = true;
    showLocationSuccess(nearestArea);
    hideLocationVerification();
    showMainContent();
    updateDeliveryOptionsUI(); // NEW function call
  } else {
    verifiedLocationArea = null; // Reset if not in area
    showLocationDenied();
  }
}
```

**New function `updateDeliveryOptionsUI()`:**
```javascript
function updateDeliveryOptionsUI() {
    const deliveryLabel = document.querySelector('label:has(input[value="delivery"])');
    const deliveryInput = document.querySelector('input[value="delivery"]');
    const pickupInput = document.querySelector('input[value="pickup"]');

    if (!deliveryLabel || !deliveryInput || !pickupInput) {
        console.error("Delivery option elements not found.");
        return;
    }

    if (verifiedLocationArea && verifiedLocationArea.delivery) {
        // User is in Covenant Hills, show delivery option
        deliveryLabel.style.display = 'flex';
    } else {
        // User is in Ladera Ranch or location is unknown, hide delivery option
        deliveryLabel.style.display = 'none';
        // If delivery was selected, switch to pickup
        if (deliveryInput.checked) {
            pickupInput.checked = true;
            updateDeliveryOption(); // This will update totals
        }
    }
}
```

**`getDeliveryFee()` function:**
Change `1.50` to `4.00`.
```javascript
function getDeliveryFee() {
  const isDelivery = document.querySelector('input[name="delivery-option"]:checked')?.value === 'delivery';
  const fee = isDelivery ? 4.00 : 0; // Updated fee
  console.log('🚚 getDeliveryFee returning:', fee, 'for option:', isDelivery ? 'delivery' : 'pickup');
  return fee;
}
```

**`submitVenmoOrder()` function:**
Change `1.50` to `4.00`.
```javascript
//...
    deliveryDetails = {
      type: 'delivery',
      address: address,
      instructions: document.getElementById('delivery-instructions')?.value?.trim() || '',
      fee: 4.00 // Updated fee
    };
//...
```

**`handleAuthStateChange(user)` function:**
When a user signs out, we should reset the delivery options.
```javascript
//...
} else {
      currentUser = null;
      userData = null;
      verifiedLocationArea = null; // Reset location
      updateDeliveryOptionsUI(); // Hide delivery options on sign out
//...
```
I also need to call `updateDeliveryOptionsUI()` when the main content is shown after verification. I already added that to `verifyLocation`.

Now for the HTML changes in `index.html`.

**`index.html`:**
Update the delivery fee text.
```html
<label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 15px; background: #f0f0f0; border-radius: 10px; transition: all 0.3s ease;">
  <input type="radio" name="delivery-option" value="delivery" onchange="updateDeliveryOption();">
  <span style="font-weight: 600; color: #18181b;">🚚 Delivery (+$4.00)</span>
</label>
```

This seems complete. I will now generate the response with the updated `script.js` and `index.html` files. I will not touch the CSS file as no styling changes are required beyond what `style.display` can do.

I need to be careful with the `verifyLocation` function. The user is in Ladera Ranch, so the delivery option should be hidden for them. The logic I've planned should handle this correctly.

Let's review the `script.js` changes one more time.

1.  Add `verifiedLocationArea` global variable.
2.  Modify `verifyLocation` to store the area object and call `updateDeliveryOptionsUI`.
3.  Add the new `updateDeliveryOptionsUI` function to toggle the visibility of the delivery option.
4.  Update `getDeliveryFee` and `submitVenmoOrder` with the new $4.00 fee.
5.  Reset `verifiedLocationArea` on sign out in `handleAuthStateChange`.

This looks solid. I will now construct the final response.Of course. I can implement those delivery rules and update the fee for you.

I've updated the logic to check the user's verified location. The delivery option will now only appear for users within Covenant Hills, while pickup remains available for everyone in the service area. I've also adjusted the delivery fee to $4.00.

Here are the updated files.

### `script.js`

I've modified the location verification logic to store the user's specific area and a new function to control the visibility of the delivery option based on that area. The delivery fee has also been updated in the relevant functions.


```javascript
// CONFIGURATION - UPDATE THESE VALUES
const VENMO_USERNAME = 'audreycrisp'; // Your mom's Venmo username

// Global variables
let currentUser = null;
let userData = null;
let cart = [];
let locationVerified = false;
let verifiedLocationArea = null; // To store the user's specific location
let locationCheckInProgress = false;
const notificationTimers = {}; // For stacking notifications

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCwgwgWwD_NLVQtvvQxb-vIwkvbfmG6imc",
  authDomain: "bakery-f6650.firebaseapp.com",
  projectId: "bakery-f6650",
  storageBucket: "bakery-f6650.firebasestorage.app",
  messagingSenderId: "300373370370",
  appId: "1:300373370370:web:55ff7da416898ed065e91b",
  measurementId: "G-C41TKNP37H"
};

// All function definitions moved up to avoid ReferenceErrors

// Helper functions
function showStatus(message, type = 'success') {
    const statusDiv = document.getElementById('status-messages');
    const messageKey = `${type}-${message.replace(/\s+/g, '-')}`;
    let existingMessageDiv = document.querySelector(`.status-message[data-key="${messageKey}"]`);

    if (existingMessageDiv) {
        let count = parseInt(existingMessageDiv.getAttribute('data-count') || '1') + 1;
        existingMessageDiv.setAttribute('data-count', count);
        existingMessageDiv.textContent = `${message} (x${count})`;

        if (notificationTimers[messageKey]) {
            clearTimeout(notificationTimers[messageKey]);
        }

        notificationTimers[messageKey] = setTimeout(() => {
            existingMessageDiv.remove();
            delete notificationTimers[messageKey];
        }, 5000);
    } else {
        const messageDiv = document.createElement('div');
        messageDiv.className = `status-message status-${type}`;
        messageDiv.textContent = message;
        messageDiv.setAttribute('data-key', messageKey);
        messageDiv.setAttribute('data-count', '1');
        statusDiv.appendChild(messageDiv);

        notificationTimers[messageKey] = setTimeout(() => {
            messageDiv.remove();
            delete notificationTimers[messageKey];
        }, 5000);
    }
}

function showLoading(buttonElement) {
  const originalText = buttonElement.textContent;
  buttonElement.innerHTML = '<span class="loading"></span> Loading...';
  buttonElement.disabled = true;
  return () => {
    buttonElement.textContent = originalText;
    buttonElement.disabled = false;
  };
}

function getStatusColor(status) {
  switch (status) {
    case 'pending-payment': return '#ff9800';
    case 'pending': return '#ffc107';
    case 'preparing': return '#17a2b8';
    case 'completed': return '#28a745';
    case 'cancelled': return '#dc3545';
    default: return '#6c757d';
  }
}

function showItemUpdateSuccess(itemId) {
  const itemDiv = document.querySelector(`#edit-form-${itemId}`).closest('.admin-menu-item');
  itemDiv.classList.add('admin-action-success');
  setTimeout(() => {
    itemDiv.classList.remove('admin-action-success');
  }, 2000);
}

/**
 * Fetches all active deals for a given menu item from Firestore.
 * @param {string} itemId - The ID of the menu item.
 * @returns {Promise<Array>} A promise that resolves to an array of deal objects.
 */
async function getActiveDealsForItem(itemId) {
  try {
    const dealsSnapshot = await firebase.firestore().collection('deals')
      .where('isActive', '==', true)
      .where('menuItemId', '==', itemId)
      .get();

    if (dealsSnapshot.empty) {
      return [];
    }

    const deals = [];
    dealsSnapshot.forEach(doc => {
      deals.push({ dealId: doc.id, ...doc.data() });
    });
    return deals;
  } catch (err) {
    console.error("Error fetching active deals:", err);
    showStatus('Could not fetch item deals.', 'error');
    return []; // Return an empty array on error to prevent crashes
  }
}

/**
 * Applies a discount deal to a cart item.
 * @param {object} item - The original cart item.
 * @param {object} deal - The deal object to apply.
 * @returns {object} The new item with the discount applied.
 */
function applyDealToItem(item, deal) {
  let newItem = { ...item, dealId: deal.dealId, dealType: deal.type };

  switch (deal.type) {
    case 'percentage':
      const discount = newItem.price * (deal.percentage / 100);
      newItem.price = parseFloat((newItem.price - discount).toFixed(2));
      newItem.dealInfo = `${deal.percentage}% off`;
      break;
    case 'fixed-discount':
      newItem.price = parseFloat(Math.max(0, newItem.price - deal.fixedAmount).toFixed(2));
      newItem.dealInfo = `$${deal.fixedAmount.toFixed(2)} off`;
      break;
    // 'buy-get' type is handled by adding free items, not by changing the price here.
  }
  return newItem;
}

// *** START: EMPLOYEE MANAGEMENT FUNCTIONS ***

/**
 * Loads and displays the list of employees from Firestore.
 * Requires admin privileges.
 */
async function loadEmployees() {
  if (!userData || userData.role !== 'admin') {
    showStatus("You don't have permission to view this.", 'error');
    return;
  }
  
  const employeesDiv = document.getElementById('employees-list');
  employeesDiv.innerHTML = '<div class="empty-state"><span class="loading"></span> Loading employees...</div>';
  
  try {
    const snapshot = await firebase.firestore().collection('employees').orderBy('name').get();
    
    if (snapshot.empty) {
      employeesDiv.innerHTML = '<div class="empty-state"><p>No employees found. Add one to get started!</p></div>';
      return;
    }

    employeesDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const employee = doc.data();
      const employeeDiv = document.createElement('div');
      employeeDiv.className = 'admin-menu-item'; // Re-using style for consistency
      
      let detailsHTML = `<p><strong>Role:</strong> ${employee.role}</p>`;
      if (employee.email) detailsHTML += `<p><strong>Email:</strong> ${employee.email}</p>`;
      if (employee.phone) detailsHTML += `<p><strong>Phone:</strong> ${employee.phone}</p>`;
      if (employee.hourlyRate) detailsHTML += `<p><strong>Rate:</strong> $${parseFloat(employee.hourlyRate).toFixed(2)}/hr</p>`;

      employeeDiv.innerHTML = `
        <div class="menu-item-header">
          <div class="menu-item-emoji">👤</div>
          <div class="menu-item-info">
            <h3>${employee.name}</h3>
          </div>
        </div>
        <div class="menu-item-description">${detailsHTML}</div>
        <div class="item-controls">
          <button class="btn btn-danger" onclick="deleteEmployee('${doc.id}', '${employee.name}')">🗑️ Delete</button>
        </div>
      `;
      employeesDiv.appendChild(employeeDiv);
    });
  } catch (err) {
    console.error("Error loading employees:", err);
    showStatus("Failed to load employee list.", 'error');
    employeesDiv.innerHTML = '<div class="empty-state"><p>Error loading employees. Check console.</p></div>';
  }
}

/**
 * Shows the form for adding a new employee.
 */
function showAddEmployeeForm() {
  document.getElementById('add-employee-form').style.display = 'block';
}

/**
 * Hides the form for adding a new employee.
 */
function hideAddEmployeeForm() {
  document.getElementById('add-employee-form').style.display = 'none';
}

/**
 * Submits the new employee data to Firestore.
 */
async function submitNewEmployee() {
  const name = document.getElementById('employee-name').value.trim();
  const role = document.getElementById('employee-role').value.trim();
  
  if (!name || !role) {
    showStatus("Employee Name and Role are required.", 'warning');
    return;
  }
  
  const employeeData = {
    name,
    role,
    email: document.getElementById('employee-email').value.trim() || null,
    phone: document.getElementById('employee-phone').value.trim() || null,
    hourlyRate: parseFloat(document.getElementById('employee-hourly-rate').value) || null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  const btn = event.target;
  const stopLoading = showLoading(btn);

  try {
    await firebase.firestore().collection('employees').add(employeeData);
    showStatus('Employee added successfully!', 'success');
    
    // Clear form
    document.getElementById('employee-name').value = '';
    document.getElementById('employee-role').value = '';
    document.getElementById('employee-email').value = '';
    document.getElementById('employee-phone').value = '';
    document.getElementById('employee-hourly-rate').value = '';
    
    hideAddEmployeeForm();
    loadEmployees(); // Refresh the list
  } catch (err) {
    console.error("Error adding employee:", err);
    showStatus("Failed to add employee.", 'error');
  } finally {
    stopLoading();
  }
}

/**
 * Deletes an employee from Firestore.
 * @param {string} id - The document ID of the employee to delete.
 * @param {string} name - The name of the employee for the confirmation message.
 */
async function deleteEmployee(id, name) {
  if (!confirm(`Are you sure you want to delete employee: ${name}?`)) {
    return;
  }

  const btn = event.target;
  const stopLoading = showLoading(btn);

  try {
    await firebase.firestore().collection('employees').doc(id).delete();
    showStatus('Employee deleted successfully.', 'success');
    loadEmployees(); // Refresh the list
  } catch (err) {
    console.error("Error deleting employee:", err);
    showStatus('Failed to delete employee.', 'error');
  } finally {
    stopLoading();
  }
}

// *** END: EMPLOYEE MANAGEMENT FUNCTIONS ***

// *** START: PROFIT CALCULATION FUNCTIONS ***
async function calculateAndShowProfit() {
    if (!userData || userData.role !== 'admin') {
        showStatus("You don't have permission to view this.", 'error');
        return;
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const revenueEl = document.getElementById('profit-revenue');
    const costsEl = document.getElementById('profit-costs');
    const netEl = document.getElementById('profit-net');
    const ordersListEl = document.getElementById('profit-orders-list');

    // Reset UI
    revenueEl.innerHTML = '<span class="loading"></span>';
    costsEl.innerHTML = '<span class="loading"></span>';
    netEl.innerHTML = '<span class="loading"></span>';
    ordersListEl.innerHTML = '<div class="empty-state"><span class="loading"></span> Loading orders...</div>';

    try {
        // Fetch all menu items to get their costs
        const menuItemsSnapshot = await firebase.firestore().collection('menuItems').get();
        const itemCosts = {};
        menuItemsSnapshot.forEach(doc => {
            itemCosts[doc.id] = doc.data().cost || 0;
        });

        // Fetch completed orders for today
        const ordersSnapshot = await firebase.firestore().collection('orders')
            .where('status', '==', 'completed')
            .where('createdAt', '>=', startOfDay)
            .where('createdAt', '<=', endOfDay)
            .get();

        if (ordersSnapshot.empty) {
            revenueEl.textContent = '$0.00';
            costsEl.textContent = '$0.00';
            netEl.textContent = '$0.00';
            ordersListEl.innerHTML = '<div class="empty-state"><p>No completed orders today.</p></div>';
            return;
        }

        let totalRevenue = 0;
        let totalCosts = 0;
        let ordersHTML = '';

        ordersSnapshot.forEach(doc => {
            const order = doc.data();
            totalRevenue += order.total || 0;

            let orderCost = 0;
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    // Don't include cost for free items
                    if (!item.isFree) {
                        const cost = itemCosts[item.id] || 0;
                        orderCost += cost;
                    }
                });
            }
            totalCosts += orderCost;
            
            // Build HTML for order breakdown
             ordersHTML += `
                <div class="order-summary-item">
                    <span>Order #${order.orderId || doc.id.slice(-6)}</span>
                    <span>Revenue: $${(order.total || 0).toFixed(2)}</span>
                    <span>Cost: $${orderCost.toFixed(2)}</span>
                    <span>Profit: $${((order.total || 0) - orderCost).toFixed(2)}</span>
                </div>
            `;
        });
        
        const netProfit = totalRevenue - totalCosts;

        revenueEl.textContent = `$${totalRevenue.toFixed(2)}`;
        costsEl.textContent = `$${totalCosts.toFixed(2)}`;
        netEl.textContent = `$${netProfit.toFixed(2)}`;
        ordersListEl.innerHTML = ordersHTML;
        
        const netProfitCard = netEl.parentElement;
        netProfitCard.classList.remove('profit-positive', 'profit-negative');
        if (netProfit > 0) {
            netProfitCard.classList.add('profit-positive');
        } else if (netProfit < 0) {
            netProfitCard.classList.add('profit-negative');
        }

    } catch (err) {
        console.error("Error calculating profit:", err);
        showStatus("Failed to calculate profit.", 'error');
        revenueEl.textContent = 'Error';
        costsEl.textContent = 'Error';
        netEl.textContent = 'Error';
        ordersListEl.innerHTML = '<div class="empty-state"><p>Error loading profit data.</p></div>';
    }
}
// *** END: PROFIT CALCULATION FUNCTIONS ***


function initializeVenmoPayment() {
  console.log('💳 Initializing Venmo payment system...');
  
  // Update username display
  const usernameDisplay = document.getElementById('venmo-username-display');
  if (usernameDisplay) {
    usernameDisplay.textContent = VENMO_USERNAME;
  }
  
  // Update initial Venmo link
  const venmoLink = document.getElementById('venmo-payment-link');
  if (venmoLink) {
    venmoLink.href = `https://venmo.com/u/${VENMO_USERNAME}`;
  }
  
  console.log('✅ Venmo payment system initialized with username:', VENMO_USERNAME);
}

function toggleDealFields() {
  const dealType = document.getElementById('deal-type').value;
  
  // Hide all field groups
  document.getElementById('percentage-fields').style.display = 'none';
  document.getElementById('buy-get-fields').style.display = 'none';
  document.getElementById('fixed-discount-fields').style.display = 'none';
  
  // Show relevant fields based on deal type
  if (dealType === 'percentage') {
    document.getElementById('percentage-fields').style.display = 'block';
  } else if (dealType === 'buy-get') {
    document.getElementById('buy-get-fields').style.display = 'block';
  } else if (dealType === 'fixed-discount') {
    document.getElementById('fixed-discount-fields').style.display = 'block';
  }
}

// *** START: MENU ITEM MANAGEMENT FUNCTIONS ***
function showAddItemForm() {
  document.getElementById('add-item-form').style.display = 'block';
}

function hideAddItemForm() {
  document.getElementById('add-item-form').style.display = 'none';
}

async function submitNewItem() {
  const name = document.getElementById('item-name').value.trim();
  const description = document.getElementById('item-description').value.trim();
  const price = parseFloat(document.getElementById('item-price').value);
  const cost = parseFloat(document.getElementById('item-cost').value);
  const stock = parseInt(document.getElementById('item-stock').value);
  const emoji = document.getElementById('item-emoji').value.trim();

  if (!name || !description || isNaN(price) || isNaN(stock) || isNaN(cost)) {
    showStatus('Please fill out all fields correctly.', 'warning');
    return;
  }

  const btn = event.target;
  const stopLoading = showLoading(btn);

  try {
    await firebase.firestore().collection('menuItems').add({
      name,
      description,
      price,
      cost: cost || 0,
      stock,
      emoji,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showStatus('Menu item added successfully!', 'success');
    hideAddItemForm();
    loadAdminMenuItems();
    refreshMenu(); // Refresh customer view
  } catch (err) {
    console.error("Error adding menu item:", err);
    showStatus('Failed to add menu item.', 'error');
  } finally {
    stopLoading();
  }
}

function editMenuItem(id) {
  document.getElementById(`edit-form-${id}`).style.display = 'block';
}

function cancelEditMenuItem(id) {
  document.getElementById(`edit-form-${id}`).style.display = 'none';
}

async function saveMenuItem(id) {
  const name = document.getElementById(`edit-name-${id}`).value.trim();
  const description = document.getElementById(`edit-description-${id}`).value.trim();
  const price = parseFloat(document.getElementById(`edit-price-${id}`).value);
  const cost = parseFloat(document.getElementById(`edit-cost-${id}`).value);
  const stock = parseInt(document.getElementById(`edit-stock-${id}`).value);
  const emoji = document.getElementById(`edit-emoji-${id}`).value.trim();

  if (!name || !description || isNaN(price) || isNaN(stock) || isNaN(cost)) {
    showStatus('Please fill out all fields correctly.', 'warning');
    return;
  }

  const btn = event.target;
  const stopLoading = showLoading(btn);

  try {
    await firebase.firestore().collection('menuItems').doc(id).update({
      name,
      description,
      price,
      cost: cost || 0,
      stock,
      emoji
    });
    showStatus('Item updated successfully!', 'success');
    cancelEditMenuItem(id);
    loadAdminMenuItems();
    refreshMenu();
  } catch (err) {
    console.error("Error saving item:", err);
    showStatus('Failed to save item.', 'error');
  } finally {
    stopLoading();
  }
}

async function deleteMenuItem(id, name) {
  if (!confirm(`Are you sure you want to delete ${name}?`)) {
    return;
  }
  try {
    await firebase.firestore().collection('menuItems').doc(id).delete();
    showStatus(`${name} deleted successfully.`, 'success');
    loadAdminMenuItems();
    refreshMenu();
  } catch (err) {
    console.error("Error deleting item:", err);
    showStatus(`Failed to delete ${name}.`, 'error');
  }
}
// *** END: MENU ITEM MANAGEMENT FUNCTIONS ***

// *** START: DEAL MANAGEMENT FUNCTIONS ***
function showAddDealForm() {
  document.getElementById('add-deal-form').style.display = 'block';
}

function hideAddDealForm() {
  document.getElementById('add-deal-form').style.display = 'none';
}

async function submitNewDeal() {
  const name = document.getElementById('deal-name').value.trim();
  const type = document.getElementById('deal-type').value;
  const menuItemId = document.getElementById('deal-menu-item').value;
  const description = document.getElementById('deal-description').value.trim();

  if (!name || !menuItemId) {
    showStatus('Deal Name and Menu Item are required.', 'warning');
    return;
  }

  let dealData = {
    name,
    type,
    menuItemId,
    description,
    isActive: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (type === 'percentage') {
    dealData.percentage = parseInt(document.getElementById('deal-percentage').value);
    if (isNaN(dealData.percentage)) {
      showStatus('Please enter a valid percentage.', 'warning');
      return;
    }
  } else if (type === 'buy-get') {
    dealData.buyQuantity = parseInt(document.getElementById('deal-buy-quantity').value);
    dealData.freeQuantity = parseInt(document.getElementById('deal-free-quantity').value);
    if (isNaN(dealData.buyQuantity) || isNaN(dealData.freeQuantity)) {
      showStatus('Please enter valid quantities for the deal.', 'warning');
      return;
    }
  } else if (type === 'fixed-discount') {
    dealData.fixedAmount = parseFloat(document.getElementById('deal-fixed-amount').value);
    if (isNaN(dealData.fixedAmount)) {
      showStatus('Please enter a valid discount amount.', 'warning');
      return;
    }
  }

  const btn = event.target;
  const stopLoading = showLoading(btn);

  try {
    await firebase.firestore().collection('deals').add(dealData);
    showStatus('Deal created successfully!', 'success');
    hideAddDealForm();
    loadDeals();
    refreshMenu();
  } catch (err) {
    console.error("Error creating deal:", err);
    showStatus('Failed to create deal.', 'error');
  } finally {
    stopLoading();
  }
}

async function loadDeals() {
  if (!userData || userData.role !== 'admin') return;

  const dealsDiv = document.getElementById('deals-list');
  dealsDiv.innerHTML = '<div class="empty-state"><span class="loading"></span> Loading deals...</div>';

  try {
    const snapshot = await firebase.firestore().collection('deals').orderBy('createdAt', 'desc').get();
    if (snapshot.empty) {
      dealsDiv.innerHTML = '<div class="empty-state"><p>No deals found.</p></div>';
      return;
    }

    dealsDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const deal = doc.data();
      const dealDiv = document.createElement('div');
      dealDiv.className = 'admin-menu-item';
      dealDiv.innerHTML = `
        <h3>${deal.name}</h3>
        <p>${deal.description || ''}</p>
        <div class="item-controls">
          <button class="btn btn-danger" onclick="deleteDeal('${doc.id}', '${deal.name}')">🗑️ Delete</button>
        </div>
      `;
      dealsDiv.appendChild(dealDiv);
    });
  } catch (err) {
    console.error("Error loading deals:", err);
    showStatus("Failed to load deals.", 'error');
  }
}

async function deleteDeal(id, name) {
  if (!confirm(`Are you sure you want to delete the deal: ${name}?`)) {
    return;
  }
  try {
    await firebase.firestore().collection('deals').doc(id).delete();
    showStatus('Deal deleted successfully.', 'success');
    loadDeals();
    refreshMenu();
  } catch (err) {
    console.error("Error deleting deal:", err);
    showStatus('Failed to delete deal.', 'error');
  }
}

async function loadMenuItemsForDeals() {
  const select = document.getElementById('deal-menu-item');
  select.innerHTML = '<option value="">Loading...</option>';
  try {
    const snapshot = await firebase.firestore().collection('menuItems').orderBy('name').get();
    select.innerHTML = '<option value="">Select an item</option>';
    snapshot.forEach(doc => {
      const item = doc.data();
      select.innerHTML += `<option value="${doc.id}">${item.name}</option>`;
    });
  } catch (err) {
    console.error("Error loading menu items for deals:", err);
    select.innerHTML = '<option value="">Error loading items</option>';
  }
}
// *** END: DEAL MANAGEMENT FUNCTIONS ***


// Admin functions
async function loadAdminMenuItems() {
  if (!userData || userData.role !== 'admin') return;
  
  try {
    const snapshot = await firebase.firestore().collection('menuItems').orderBy('createdAt', 'desc').get();
    const menuDiv = document.getElementById('admin-menu-items');
    
    if (snapshot.empty) {
      menuDiv.innerHTML = '<div class="empty-state"><p>No menu items yet.</p></div>';
      return;
    }

    menuDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const item = doc.data();
      const itemDiv = document.createElement('div');
      itemDiv.className = `admin-menu-item ${item.stock <= 0 ? 'out-of-stock' : ''}`;
      itemDiv.innerHTML = `
        <div class="stock-indicator ${item.stock > 0 ? 'in-stock' : 'out-of-stock'}">
          ${item.stock > 0 ? `${item.stock} in Stock` : 'Out of Stock'}
        </div>
        <div class="menu-item-header">
          <div class="menu-item-emoji">${item.emoji || '🍰'}</div>
          <div class="menu-item-info">
            <h3>${item.name}</h3>
            <div class="menu-item-price">$${item.price.toFixed(2)}</div>
          </div>
        </div>
        <div class="menu-item-description">${item.description}</div>
        <div class="item-controls">
          <button class="btn btn-primary" onclick="editMenuItem('${doc.id}')">✏️ Edit</button>
          <button class="btn btn-danger" onclick="deleteMenuItem('${doc.id}', '${item.name}')">🗑️ Delete</button>
        </div>
        <div id="edit-form-${doc.id}" class="edit-form" style="display: none;">
          <input id="edit-name-${doc.id}" value="${item.name}" placeholder="Name">
          <input id="edit-description-${doc.id}" value="${item.description}" placeholder="Description">
          <input id="edit-price-${doc.id}" type="number" step="0.01" value="${item.price}" placeholder="Price">
          <input id="edit-cost-${doc.id}" type="number" step="0.01" value="${item.cost || 0}" placeholder="Cost">
          <input id="edit-stock-${doc.id}" type="number" value="${item.stock}" placeholder="Stock">
          <input id="edit-emoji-${doc.id}" value="${item.emoji || ''}" placeholder="Emoji">
          <div style="margin-top: 10px;">
            <button class="btn btn-success" onclick="saveMenuItem('${doc.id}')">💾 Save</button>
            <button class="btn btn-secondary" onclick="cancelEditMenuItem('${doc.id}')">❌ Cancel</button>
          </div>
        </div>
      `;
      menuDiv.appendChild(itemDiv);
    });
  } catch (err) {
    console.error("Error loading admin menu items:", err);
    showStatus("Failed to load menu items.", 'error');
  }
}

async function loadAdminOrders(filter = 'all') {
    if (!userData || userData.role !== 'admin') return;
    
    console.log('📋 Loading admin orders with filter:', filter);
    
    try {
        let query = firebase.firestore().collection('orders');
        
        if (filter !== 'all') {
            query = query.where('status', '==', filter);
        }
        
        const snapshot = await query.get();
        const ordersDiv = document.getElementById('admin-orders-list');
        
        if (snapshot.empty) {
            ordersDiv.innerHTML = `<div class="empty-state"><p>No ${filter} orders found.</p></div>`;
            return;
        }

        let orders = [];
        snapshot.forEach(doc => {
            orders.push({ id: doc.id, ...doc.data() });
        });

        // Sort by creation date client-side
        orders.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

        ordersDiv.innerHTML = '';
        orders.forEach(order => {
            const docId = order.id;
            const orderDiv = document.createElement('div');
            orderDiv.style.cssText = 'background: white; padding: 20px; border-radius: 10px; margin-bottom: 15px; border: 1px solid #e0e0e0;';
            
            const itemsList = order.items?.map(item => `${item.emoji} ${item.name} - $${item.price.toFixed(2)}`).join('<br>') || 'No items';
            const orderDate = order.createdAt ? order.createdAt.toDate().toLocaleDateString() : 'Recent';
            const orderTime = order.createdAt ? order.createdAt.toDate().toLocaleTimeString() : '';
            
            const paymentInfo = order.paymentMethod === 'venmo' 
                ? `<small style="color: #3D95CE;">💳 Venmo Payment</small>` 
                : `<small style="color: #666;">Payment: ${order.paymentMethod || 'N/A'}</small>`;
            
            const statusColor = getStatusColor(order.status || 'pending');
            const statusText = (order.status || 'pending').replace('-', ' ').toUpperCase();
            
            const deliveryInfo = order.deliveryDetails ? 
                `<small style="color: #666;">📍 ${order.deliveryDetails.type === 'delivery' ? 'Delivery to: ' + order.deliveryDetails.address : 'Pickup at: ' + order.deliveryDetails.location}</small><br>` : '';
            
            orderDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #e0e0e0;">
                    <div>
                        <strong>Order #${order.orderId || docId.slice(-6)}</strong><br>
                        <small style="color: #666;">${orderDate} ${orderTime}</small><br>
                        <small style="color: #666;">Customer: ${order.userEmail}</small><br>
                        ${deliveryInfo}
                        ${paymentInfo}
                    </div>
                    <div style="padding: 5px 15px; border-radius: 20px; font-size: 0.9rem; font-weight: bold; background: ${statusColor}; color: white;">
                        ${statusText}
                    </div>
                </div>
                <div style="margin: 15px 0;">${itemsList}</div>
                <div style="font-weight: bold; color: #28a745; margin-bottom: 15px;">
                    Subtotal: $${order.subtotal?.toFixed(2) || '0.00'} | 
                    Delivery: $${order.deliveryDetails?.fee?.toFixed(2) || '0.00'} | 
                    Total: $${order.total?.toFixed(2) || '0.00'}
                </div>
                <div class="order-actions">
                    ${order.status === 'pending-payment' ? 
                        `<button class="btn btn-success" onclick="updateOrderStatus('${docId}', 'pending')" style="background: #28a745;">✅ Payment Received</button>` : 
                        `<button class="btn btn-primary" onclick="updateOrderStatus('${docId}', 'pending')">📋 Pending</button>`
                    }
                    <button class="btn btn-secondary" onclick="updateOrderStatus('${docId}', 'preparing')">👨‍🍳 Preparing</button>
                    <button class="btn btn-success" onclick="updateOrderStatus('${docId}', 'completed')">✅ Completed</button>
                    <button class="btn btn-danger" onclick="updateOrderStatus('${docId}', 'cancelled')">❌ Cancel</button>
                    <button class="btn btn-danger" onclick="deleteOrder('${docId}', 'admin')" style="background: #8b0000;">🗑️ Delete Order</button>
                </div>
            `;
            ordersDiv.appendChild(orderDiv);
        });
    } catch (err) {
        console.error("❌ Error loading admin orders:", err);
        showStatus(`Failed to load orders: ${err.message}`, 'error');
        document.getElementById('admin-orders-list').innerHTML = `<div class="empty-state"><p>Error loading orders. Check console for details.</p></div>`;
    }
}

function toggleAdminSection(sectionName) {
    // Hide all admin sections
    document.querySelectorAll('.admin-section').forEach(section => {
        section.style.display = 'none';
    });

    // Show the selected section
    const sectionToShow = document.getElementById(`admin-${sectionName}-section`);
    if (sectionToShow) {
        sectionToShow.style.display = 'block';
    }

    // Load data for the selected section
    if (sectionName === 'menu') {
        loadAdminMenuItems();
    } else if (sectionName === 'orders') {
        loadAdminOrders('all');
    } else if (sectionName === 'deals') {
        loadDeals();
        loadMenuItemsForDeals();
    } else if (sectionName === 'employees') {
        loadEmployees();
    } else if (sectionName === 'profit') {
        calculateAndShowProfit();
    }
}

function switchTab(tabName) {
  if (tabName !== 'cart' && !requireLocationVerification()) return;
  
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
  
  document.getElementById(tabName + '-tab').classList.add('active');
  document.getElementById(tabName + '-panel').classList.add('active');
  
  if (tabName === 'menu') {
    refreshMenu();
  } else if (tabName === 'cart') {
    setTimeout(() => {
      forceUpdateTotals();
    }, 200);
  } else if (tabName === 'orders' && currentUser) {
    loadUserOrders();
  } else if (tabName === 'admin' && userData?.role === 'admin') {
    toggleAdminSection('menu'); // Set default view for admin panel
  }
}

// Payment and Cart UI Functions
function updateDeliveryOption() {
  console.log('📍 updateDeliveryOption called - AUTO REFRESHING');
  const selectedOption = document.querySelector('input[name="delivery-option"]:checked')?.value;
  console.log('📍 Selected delivery option:', selectedOption);
  
  const addressSection = document.getElementById('address-section');
  
  if (selectedOption === 'delivery') {
    if (addressSection) addressSection.style.display = 'block';
  } else {
    if (addressSection) addressSection.style.display = 'none';
  }
  
  // IMMEDIATE refresh when delivery option changes
  console.log('🔄 Auto-refreshing totals due to delivery change');
  setTimeout(() => {
    forceUpdateTotals();
  }, 50);
}

function updateVenmoLink(orderNumber = null) {
  console.log('🔗 updateVenmoLink called');
  const venmoLink = document.getElementById('venmo-payment-link');
  if (venmoLink && cart.length > 0) {
    const subtotal = cart.reduce((sum, item) => sum + (item.isFree ? 0 : parseFloat(item.price)), 0);
    const deliveryFee = getDeliveryFee();
    const total = subtotal + deliveryFee;
    
    // Generate order summary for Venmo note with order number
    const orderSummary = generateOrderSummary(orderNumber);
    const encodedNote = encodeURIComponent(orderSummary);
    
    // Use proper Venmo Payment API format
    if (VENMO_USERNAME === 'YOUR_VENMO_USERNAME') {
      console.log('⚠️ Warning: Please update VENMO_USERNAME in the configuration section!');
    }
    
    venmoLink.href = `https://venmo.com/u/${VENMO_USERNAME}?txn=pay&amount=${total.toFixed(2)}&note=${encodedNote}`;
    
    console.log('✅ Updated Venmo payment link:');
    console.log('   Username:', VENMO_USERNAME);
    console.log('   Amount:', total.toFixed(2));
    console.log('   Note:', orderSummary);
    console.log('   Full URL:', venmoLink.href);
  } else if (!venmoLink) {
    console.log('❌ Venmo payment link element not found');
  } else {
    console.log('⚠️ Cart is empty, not updating Venmo link');
  }
}

function forceUpdateTotals() {
  console.log('🔄 === FORCE UPDATE TOTALS ===');
  try {
    console.log('📦 Current cart state:', cart);
    console.log('📦 Cart array length:', cart?.length || 'undefined');
    
    if (!cart || cart.length === 0) {
      console.log('⚠️ Cart is empty or undefined');
      setTimeout(() => {
        const subtotalEl = document.getElementById('cart-subtotal');
        const totalEl = document.getElementById('venmo-total');
        const deliveryEl = document.getElementById('delivery-fee-display');
        
        if (subtotalEl) subtotalEl.textContent = '0.00';
        if (totalEl) totalEl.textContent = '0.00';
        if (deliveryEl) deliveryEl.textContent = 'Free Pickup';
        console.log('✅ Reset all totals to zero');
      }, 50);
      return;
    }
    
    updateVenmoTotal();
    updateVenmoLink();
    console.log('✅ Force update completed');
  } catch (error) {
    console.error('❌ Error in forceUpdateTotals:', error);
  }
}

function getDeliveryFee() {
  const isDelivery = document.querySelector('input[name="delivery-option"]:checked')?.value === 'delivery';
  const fee = isDelivery ? 4.00 : 0;
  console.log('🚚 getDeliveryFee returning:', fee, 'for option:', isDelivery ? 'delivery' : 'pickup');
  return fee;
}

function updateVenmoTotal() {
  console.log('💰 updateVenmoTotal called');
  
  // Calculate subtotal using actual prices from cart (includes deal discounts)
  const subtotal = cart.reduce((sum, item) => sum + (item.isFree ? 0 : parseFloat(item.price)), 0);
  console.log('📊 Calculated subtotal with deals applied:', subtotal);
  
  // Get delivery fee
  const deliveryFee = getDeliveryFee();
  console.log('🚚 Delivery fee:', deliveryFee);
  
  // Calculate total
  const total = subtotal + deliveryFee;
  console.log('💯 Final total:', total);
  
  // Update all elements
  const subtotalEl = document.getElementById('cart-subtotal');
  const deliveryEl = document.getElementById('delivery-fee-display');
  const totalEl = document.getElementById('venmo-total');
  
  if (subtotalEl) {
    subtotalEl.textContent = subtotal.toFixed(2);
    console.log('✅ Updated subtotal element to:', subtotal.toFixed(2));
  } else {
    console.log('❌ cart-subtotal element not found');
  }
  
  if (deliveryEl) {
    deliveryEl.textContent = deliveryFee > 0 ? `$${deliveryFee.toFixed(2)}` : 'Free Pickup';
    console.log('✅ Updated delivery element to:', deliveryFee > 0 ? `$${deliveryFee.toFixed(2)}` : 'Free Pickup');
  } else {
    console.log('❌ delivery-fee-display element not found');
  }
  
  if (totalEl) {
    totalEl.textContent = total.toFixed(2);
    console.log('✅ Updated total element to:', total.toFixed(2));
  } else {
    console.log('❌ venmo-total element not found');
  }
}

function generateOrderSummary(orderNumber = null) {
    const itemGroups = {};
    cart.forEach(item => {
        const groupKey = item.id + (item.isFree ? '-free' : '');
        if (!itemGroups[groupKey]) {
            itemGroups[groupKey] = { ...item, quantity: 0 };
        }
        itemGroups[groupKey].quantity++;
    });

    const orderItems = Object.values(itemGroups).map(group => {
        const priceText = group.isFree ? "(FREE)" : `($${parseFloat(group.price).toFixed(2)} each)`;
        const quantityText = group.quantity > 1 ? ` (x${group.quantity})` : '';
        return `${group.emoji} ${group.name}${quantityText}`;
    }).join(', ');

    const subtotal = cart.reduce((sum, item) => sum + (item.isFree ? 0 : parseFloat(item.price)), 0);
    const deliveryFee = getDeliveryFee();
    const total = subtotal + deliveryFee;
    const deliveryType = document.querySelector('input[name="delivery-option"]:checked')?.value || 'pickup';
    const deliveryText = deliveryType === 'delivery' ? 'Delivery' : 'Pick-up';
    const orderNum = orderNumber || ('ORDER-' + Date.now().toString().slice(-6));
    
    return `Covenant Hills Bakery | ${orderItems} | Delivery Type: ${deliveryText} | Order #: ${orderNum} | Total: $${total.toFixed(2)}`;
}

function renderCart() {
    const cartDiv = document.getElementById('cart');
    if (cart.length === 0) {
        cartDiv.innerHTML = '<div class="empty-state"><p>Your cart is empty. Add some delicious items!</p></div>';
        document.getElementById('checkout-section').style.display = 'none';
        updateCartCount();
        return;
    }

    document.getElementById('checkout-section').style.display = 'block';
    resetCheckoutUI();

    const paidItems = cart.filter(item => !item.isFree);
    const freeItems = cart.filter(item => item.isFree);

    const groupItems = (items) => {
        const itemGroups = {};
        items.forEach((item, index) => {
            const groupKey = `${item.id}-${item.price.toFixed(2)}`;
            if (!itemGroups[groupKey]) {
                itemGroups[groupKey] = { item, quantity: 0, indices: [] };
            }
            itemGroups[groupKey].quantity++;
            // Find original index in main cart array for removal
            itemGroups[groupKey].indices.push(cart.findIndex(cartItem => cartItem === item));
        });
        return Object.values(itemGroups);
    };

    const paidGroups = groupItems(paidItems);
    const freeGroups = groupItems(freeItems);

    let cartHTML = '';

    // Render paid items
    paidGroups.forEach(group => {
        const { item, quantity, indices } = group;
        const indexToRemove = indices[indices.length - 1]; // Get last index for removal
        const priceDisplay = `$${parseFloat(item.price).toFixed(2)}`;
        const quantityDisplay = quantity > 1 ? ` <strong style="color: #18181b;">(x${quantity})</strong>` : '';
        cartHTML += `
            <div class="cart-item">
                <div>
                    <span style="font-size: 1.5rem; margin-right: 10px;">${item.emoji}</span>
                    <span>
                        <strong>${item.name}</strong>${quantityDisplay} - ${priceDisplay}
                    </span>
                </div>
                <button class="btn btn-danger" style="padding: 5px 10px; font-size: 0.9rem;" onclick="removeFromCart(${indexToRemove})">Remove</button>
            </div>
        `;
    });

    // Render free items header and items
    if (freeGroups.length > 0) {
        cartHTML += `<h3 style="text-align:center; color: #28a745; margin-top: 20px; margin-bottom: 10px;">🎉 Free Items!</h3>`;
        freeGroups.forEach(group => {
            const { item, quantity } = group;
            const priceDisplay = `<span style="color: #28a745; font-weight: bold;">FREE!</span>`;
            const quantityDisplay = quantity > 1 ? ` <strong style="color: #28a745;">(x${quantity})</strong>` : '';
            cartHTML += `
                <div class="cart-item has-deal">
                    <div>
                        <span style="font-size: 1.5rem; margin-right: 10px;">${item.emoji}</span>
                        <span>
                            <strong>${item.name}</strong>${quantityDisplay} - ${priceDisplay}
                        </span>
                    </div>
                </div>
            `;
        });
    }

    const total = cart.reduce((sum, item) => sum + (item.isFree ? 0 : parseFloat(item.price)), 0);
    cartHTML += `<div class="cart-total">Cart Items Total: $${total.toFixed(2)}</div>`;
    cartDiv.innerHTML = cartHTML;
    
    updateCartCount();
    forceUpdateTotals();
}

function updateFreeItemsInCart() {
    const buyGetDealsInCart = cart.reduce((acc, item) => {
        if (item.dealType === 'buy-get' && !acc.some(d => d.dealId === item.dealId)) {
            acc.push(item);
        }
        return acc;
    }, []);

    buyGetDealsInCart.forEach(deal => {
        const paidItemsForDeal = cart.filter(item => !item.isFree && item.dealId === deal.dealId);
        const freeItemsForDeal = cart.filter(item => item.isFree && item.dealId === deal.dealId);

        const paidCount = paidItemsForDeal.length;
        const expectedFreeCount = Math.floor(paidCount / deal.buyQuantity) * deal.freeQuantity;
        const currentFreeCount = freeItemsForDeal.length;

        if (currentFreeCount < expectedFreeCount) {
            // Add missing free items
            const itemsToAdd = expectedFreeCount - currentFreeCount;
            for (let i = 0; i < itemsToAdd; i++) {
                const freeItem = {
                    ...deal,
                    price: 0,
                    isFree: true,
                    dealInfo: `Free with ${deal.name}`
                };
                cart.push(freeItem);
            }
        } else if (currentFreeCount > expectedFreeCount) {
            // Remove excess free items
            const itemsToRemove = currentFreeCount - expectedFreeCount;
            for (let i = 0; i < itemsToRemove; i++) {
                const lastFreeItemIndex = cart.findLastIndex(item => item.isFree && item.dealId === deal.dealId);
                if (lastFreeItemIndex > -1) {
                    cart.splice(lastFreeItemIndex, 1);
                }
            }
        }
    });
}

function resetCheckoutUI() {
  console.log('Checkout UI reset (Venmo mode)');
}

function updateCartCount() {
  // Show total number of individual items, not grouped items
  const totalItems = cart.length;
  const cartCountEl = document.getElementById('cart-count');
  
  if (cartCountEl) {
    cartCountEl.textContent = totalItems;
    
    // Add a subtle animation when count changes
    cartCountEl.style.transform = 'scale(1.2)';
    cartCountEl.style.transition = 'transform 0.2s ease';
    setTimeout(() => {
      cartCountEl.style.transform = 'scale(1)';
    }, 200);
  }
  
  // Also log for debugging
  console.log('📊 Cart count updated:', totalItems);
}

function forceRefreshCart() {
  console.log('🔄 === FORCE REFRESH CART ===');
  
  // Clear ALL cached data
  window.processedCartForCalculations = null;
  window.finalCartTotal = undefined;
  window.itemGroupsMap = null;
  
  console.log('🧹 Cleared all cached cart data');
  
  // Force complete re-render
  renderCart();
  
  showStatus('Cart completely refreshed! Check if items are now stacked.', 'success');
}

function testVenmoPayment() {
  console.log('🧪 Testing Venmo payment link...');
  
  if (cart.length === 0) {
    console.log('⚠️ Cannot test Venmo payment - cart is empty');
    showStatus('Add items to cart to test Venmo payment', 'warning');
    return;
  }
  
  // Force update the processed cart
  if (window.processedCartForCalculations) {
    console.log('🔄 Using processed cart with deals for test');
  }
  
  updateVenmoLink();
  
  const venmoLink = document.getElementById('venmo-payment-link');
  if (venmoLink) {
    console.log('✅ Venmo test complete. Link URL:', venmoLink.href);
    showStatus('Venmo payment link updated successfully! Check console for details.', 'success');
    
    // Show test results in console
    const cartToUse = window.processedCartForCalculations || cart;
    const subtotal = cartToUse.reduce((sum, item) => sum + parseFloat(item.price), 0);
    console.log('💰 Test Results:');
    console.log('   Cart items:', cartToUse.length);
    console.log('   Subtotal with deals:', subtotal.toFixed(2));
    console.log('   Delivery fee:', getDeliveryFee().toFixed(2));
    console.log('   Final total:', (subtotal + getDeliveryFee()).toFixed(2));
  } else {
    console.log('❌ Venmo link element not found');
    showStatus('Error: Venmo payment link not found', 'error');
  }
}

// Location verification functions
function requestLocation() {
  if (locationCheckInProgress) return;
  
  locationCheckInProgress = true;
  const statusDiv = document.getElementById('location-status');
  const locationBtn = document.getElementById('location-btn');
  
  statusDiv.innerHTML = '<span class="loading"></span> Checking your location...';
  statusDiv.style.color = '#d4691a';
  locationBtn.disabled = true;

  if (!navigator.geolocation) {
    showLocationError('Geolocation is not supported by your browser.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    verifyLocation,
    handleLocationError,
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000
    }
  );
}

function verifyLocation(position) {
  const { latitude, longitude } = position.coords;
  
  const allowedAreas = [
    {
      name: "Covenant Hills",
      centerLat: 33.5567,
      centerLng: -117.6648,
      radius: 3,
      delivery: true
    },
    {
      name: "Ladera Ranch", 
      centerLat: 33.5453,
      centerLng: -117.6489,
      radius: 3.5,
      delivery: false
    }
  ];

  let isInServiceArea = false;
  let nearestArea = null;

  for (const area of allowedAreas) {
    const distance = calculateDistance(latitude, longitude, area.centerLat, area.centerLng);
    if (distance <= area.radius) {
      isInServiceArea = true;
      nearestArea = area.name;
      verifiedLocationArea = area;
      break;
    }
  }

  locationCheckInProgress = false;

  if (isInServiceArea) {
    locationVerified = true;
    showLocationSuccess(nearestArea);
    hideLocationVerification();
    showMainContent();
    updateDeliveryOptionsUI();
  } else {
    verifiedLocationArea = null;
    showLocationDenied();
  }
}

function updateDeliveryOptionsUI() {
    const deliveryLabel = document.querySelector('label:has(input[value="delivery"])');
    const deliveryInput = document.querySelector('input[value="delivery"]');
    const pickupInput = document.querySelector('input[value="pickup"]');

    if (!deliveryLabel || !deliveryInput || !pickupInput) {
        console.error("Delivery option elements not found.");
        return;
    }

    if (verifiedLocationArea && verifiedLocationArea.delivery) {
        deliveryLabel.style.display = 'flex';
    } else {
        deliveryLabel.style.display = 'none';
        if (deliveryInput.checked) {
            pickupInput.checked = true;
            updateDeliveryOption();
        }
    }
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function handleLocationError(error) {
  locationCheckInProgress = false;
  let errorMessage = '';
  
  switch(error.code) {
    case error.PERMISSION_DENIED:
      errorMessage = 'Location access denied. Please enable location services and refresh the page.';
      break;
    case error.POSITION_UNAVAILABLE:
      errorMessage = 'Location information unavailable. Please try again.';
      break;
    case error.TIMEOUT:
      errorMessage = 'Location request timed out. Please try again.';
      break;
    default:
      errorMessage = 'An unknown error occurred while retrieving your location.';
      break;
  }
  
  showLocationError(errorMessage);
}

function showLocationError(message) {
  const statusDiv = document.getElementById('location-status');
  const locationBtn = document.getElementById('location-btn');
  
  statusDiv.textContent = message;
  statusDiv.style.color = '#dc3545';
  locationBtn.disabled = false;
  locationBtn.textContent = '📍 Try Again';
}

function showLocationSuccess(area) {
  const statusDiv = document.getElementById('location-status');
  statusDiv.innerHTML = `✅ Location verified! Welcome to our ${area} service area.`;
  statusDiv.style.color = '#28a745';
}

function showLocationVerification() {
  document.getElementById('location-verification').style.display = 'flex';
  document.getElementById('location-denied').style.display = 'none';
  document.getElementById('main-content').style.display = 'none';
}

function hideLocationVerification() {
  document.getElementById('location-verification').style.display = 'none';
}

function showLocationDenied() {
  document.getElementById('location-verification').style.display = 'none';
  document.getElementById('location-denied').style.display = 'flex';
  document.getElementById('main-content').style.display = 'none';
}

function showMainContent() {
  document.getElementById('main-content').style.display = 'block';
  document.getElementById('location-verification').style.display = 'none';
  document.getElementById('location-denied').style.display = 'none';
}

function checkLocationAgain() {
  showLocationVerification();
  const locationBtn = document.getElementById('location-btn');
  const statusDiv = document.getElementById('location-status');
  locationBtn.disabled = false;
  locationBtn.textContent = '📍 Share My Location';
  statusDiv.textContent = '';
  locationCheckInProgress = false;
}

function requireLocationVerification() {
  if (!locationVerified) {
    showStatus('Please verify your location first to access this feature.', 'warning');
    return false;
  }
  return true;
}

// Auth functions
async function signInWithGoogle() {
  if (!requireLocationVerification()) return;
  
  const googleBtn = event.target;
  const stopLoading = showLoading(googleBtn);

  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    const result = await firebase.auth().signInWithPopup(provider);
    showStatus(`Welcome ${result.user.displayName || result.user.email}!`, 'success');
  } catch (error) {
    console.error("Google sign in error:", error);
    if (error.code === 'auth/popup-blocked') {
      showStatus("Popup was blocked. Please allow popups for this site and try again.", 'error');
    } else if (error.code === 'auth/popup-closed-by-user') {
      showStatus("Sign in was cancelled.", 'warning');
    } else {
      showStatus("Google sign in failed. Please try again.", 'error');
    }
  } finally {
    stopLoading();
  }
}

async function signUp() {
  if (!requireLocationVerification()) return;
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  if (!email || !password) {
    showStatus('Please enter both email and password.', 'warning');
    return;
  }

  const signUpBtn = event.target;
  const stopLoading = showLoading(signUpBtn);

  try {
    const result = await firebase.auth().createUserWithEmailAndPassword(email, password);
    await firebase.firestore().collection('users').doc(result.user.uid).set({
      email,
      role: 'customer',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showStatus("Account created successfully!", 'success');
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    stopLoading();
  }
}

async function signIn() {
  if (!requireLocationVerification()) return;
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  if (!email || !password) {
    showStatus('Please enter both email and password.', 'warning');
    return;
  }

  const signInBtn = event.target;
  const stopLoading = showLoading(signInBtn);

  try {
    await firebase.auth().signInWithEmailAndPassword(email, password);
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    showStatus('Signed in successfully!', 'success');
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    stopLoading();
  }
}

function signOut() {
  firebase.auth().signOut();
  cart = [];
  renderCart();
  showStatus('Signed out successfully!', 'success');
}

// REVISED: addToCart and removeFromCart now use the new updateFreeItemsInCart function
async function addToCart(id, name, price, emoji, stock) {
    if (!requireLocationVerification()) return;
    
    const itemsInCart = cart.filter(item => item.id === id).length;
    if (itemsInCart >= stock) {
      showStatus(`No more stock for ${name}!`, 'error');
      return;
    }

    try {
        const deals = await getActiveDealsForItem(id);
        let finalItem = { id, name, price: parseFloat(price), emoji, isFree: false };

        if (deals.length > 0) {
            const bestDeal = deals[0]; 
            if (bestDeal.type === 'buy-get') {
                finalItem = { ...finalItem, ...bestDeal, dealType: 'buy-get' };
            } else {
                finalItem = applyDealToItem(finalItem, bestDeal);
            }
        }

        cart.push(finalItem);
        updateFreeItemsInCart(); // Centralized logic for updating deals
        renderCart();
        
        showStatus(`${name} added to cart`, 'success');
    } catch (err) {
        console.error("Error adding item to cart:", err);
        showStatus("Failed to add item to cart.", 'error');
    }
}

function removeFromCart(index) {
    const item = cart[index];
    cart.splice(index, 1);
    updateFreeItemsInCart(); // Re-evaluate deals after removal
    renderCart();
    showStatus(`${item.name} removed from cart.`, 'warning');
}

async function submitVenmoOrder() {
  if (!requireLocationVerification()) return;
  
  if (!currentUser) {
    showStatus("Please sign in to place an order.", 'warning');
    switchTab('account');
    return;
  }
  
  if (cart.length === 0) {
    showStatus("Your cart is empty.", 'warning');
    return;
  }

  const selectedOption = document.querySelector('input[name="delivery-option"]:checked')?.value;
  let deliveryDetails = {};

  if (selectedOption === 'delivery') {
    const address = document.getElementById('delivery-address')?.value?.trim();
    if (!address) {
      showStatus("Please enter a delivery address.", 'warning');
      document.getElementById('delivery-address')?.focus();
      return;
    }
    
    deliveryDetails = {
      type: 'delivery',
      address: address,
      instructions: document.getElementById('delivery-instructions')?.value?.trim() || '',
      fee: 4.00
    };
  } else {
    deliveryDetails = {
      type: 'pickup',
      location: '7 Moonlight Isle',
      fee: 0
    };
  }

  const submitBtn = document.getElementById('submit-order-btn');
  const stopLoading = showLoading(submitBtn);

  try {
    const db = firebase.firestore();
    await db.runTransaction(async (transaction) => {
      const orderId = 'ORDER-' + Date.now().toString().slice(-6);
      const subtotal = cart.reduce((sum, item) => sum + (item.isFree ? 0 : item.price), 0);
      const total = subtotal + deliveryDetails.fee;
      
      const itemQuantities = cart.reduce((acc, item) => {
        if (!item.isFree) {
          acc[item.id] = (acc[item.id] || 0) + 1;
        }
        return acc;
      }, {});

      const itemRefs = {};
      for (const itemId in itemQuantities) {
        itemRefs[itemId] = db.collection('menuItems').doc(itemId);
      }

      const itemDocs = await Promise.all(Object.values(itemRefs).map(ref => transaction.get(ref)));

      for (const itemDoc of itemDocs) {
        const currentStock = itemDoc.data().stock;
        const quantityOrdered = itemQuantities[itemDoc.id];
        if (currentStock < quantityOrdered) {
          throw new Error(`Not enough stock for ${itemDoc.data().name}.`);
        }
      }

      for (const itemId in itemQuantities) {
        const newStock = firebase.firestore.FieldValue.increment(-itemQuantities[itemId]);
        transaction.update(itemRefs[itemId], { stock: newStock });
      }

      const orderRef = db.collection('orders').doc();
      transaction.set(orderRef, {
        userId: currentUser.uid,
        userEmail: userData.email,
        items: cart,
        subtotal: subtotal,
        deliveryDetails: deliveryDetails,
        total: total,
        status: 'pending-payment',
        paymentMethod: 'venmo',
        orderId: orderId,
        customerInstructions: 'Payment via Venmo - pending verification',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Only if transaction succeeds, show success UI
      cart = [];
      renderCart();
      
      const deliveryText = deliveryDetails.type === 'delivery' 
        ? `📍 Delivery to: ${deliveryDetails.address}` 
        : `🏪 Pickup at: ${deliveryDetails.location}`;
      
      showStatus(`🎉 Order ${orderId} submitted! We'll confirm payment and contact you soon.`, 'success');
      
      document.getElementById('checkout-section').innerHTML = `
        <div style="background: linear-gradient(135deg, #28a745, #20c997); color: white; padding: 30px; border-radius: 20px; text-align: center;">
          <h3 style="margin-bottom: 15px;">✅ Order Submitted Successfully!</h3>
          <p style="margin-bottom: 10px;"><strong>Order ID:</strong> ${orderId}</p>
          <p style="margin-bottom: 10px;"><strong>Total Paid:</strong> $${total.toFixed(2)}</p>
          <p style="margin-bottom: 20px;">${deliveryText}</p>
          <p style="margin-bottom: 20px;">Thank you! We'll confirm your Venmo payment and start preparing your delicious items.</p>
          <p style="font-size: 0.9rem; opacity: 0.9;">You'll receive an update once we verify payment.</p>
        </div>
      `;
    });
  } catch (err) {
    console.error("Order submission error:", err);
    showStatus(`Failed to submit order: ${err.message}`, 'error');
    refreshMenu(); // Refresh menu to show updated stock
  } finally {
    stopLoading();
  }
}

async function updateOrderStatus(orderId, newStatus) {
  const btn = event.target;
  const stopLoading = showLoading(btn);

  try {
    await firebase.firestore().collection('orders').doc(orderId).update({
      status: newStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showStatus(`✅ Order status updated to ${newStatus}!`, 'success');
    
    loadAdminOrders('all');
    
  } catch (err) {
    console.error("Failed to update order status:", err);
    showStatus("❌ Failed to update order status.", 'error');
  } finally {
    stopLoading();
  }
}

async function deleteOrder(orderId, userType) {
  const confirmMessage = userType === 'admin' 
    ? `Are you sure you want to permanently delete this order? This action cannot be undone.`
    : `Are you sure you want to delete this order? This action cannot be undone.`;
  
  if (!confirm(confirmMessage)) {
    return;
  }

  const btn = event.target;
  const stopLoading = showLoading(btn);

  try {
    if (userType === 'user') {
      const orderDoc = await firebase.firestore().collection('orders').doc(orderId).get();
      if (!orderDoc.exists) {
        showStatus("Order not found.", 'error');
        return;
      }
      
      const orderData = orderDoc.data();
      if (orderData.userId !== currentUser.uid) {
        showStatus("You can only delete your own orders.", 'error');
        return;
      }
    }

    await firebase.firestore().collection('orders').doc(orderId).delete();
    
    showStatus("✅ Order deleted successfully!", 'success');
    
    if (userType === 'admin') {
      loadAdminOrders('all');
    } else {
      loadUserOrders();
    }
    
    // After deleting, reset the cart view to avoid softlock
    resetCartView();
    
  } catch (err) {
    console.error("Failed to delete order:", err);
    showStatus("❌ Failed to delete order. Please try again.", 'error');
  } finally {
    stopLoading();
  }
}

/**
 * Resets the cart and checkout UI to its default empty state.
 */
function resetCartView() {
  const cartDiv = document.getElementById('cart');
  const checkoutSection = document.getElementById('checkout-section');
  
  // Original checkout section HTML for restoration
  const originalCheckoutHTML = `
    <!-- Delivery Options -->
    <div style="background: rgba(255, 255, 255, 0.9); padding: 25px; border-radius: 15px; margin-bottom: 20px; border: 1px solid rgba(0, 0, 0, 0.1);">
      <h4 style="color: #d4691a; margin-bottom: 20px; text-align: center;">📍 Delivery Options</h4>
      <div style="display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; justify-content: center;">
        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 15px; background: rgba(102, 126, 234, 0.1); border-radius: 10px; transition: all 0.3s ease;">
          <input type="radio" name="delivery-option" value="pickup" checked onchange="updateDeliveryOption(); console.log('📍 Pickup selected - triggering update');">
          <span style="font-weight: 600; color: #667eea;">🏪 Pickup at 7 Moonlight Isle</span>
        </label>
        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 15px; background: rgba(102, 126, 234, 0.1); border-radius: 10px; transition: all 0.3s ease;">
          <input type="radio" name="delivery-option" value="delivery" onchange="updateDeliveryOption(); console.log('📍 Delivery selected - triggering update');">
          <span style="font-weight: 600; color: #667eea;">🚚 Delivery (+$1.50)</span>
        </label>
      </div>
      <div id="address-section" style="display: none; background: rgba(248, 249, 250, 0.9); padding: 20px; border-radius: 10px; margin-top: 15px;">
        <h5 style="color: #667eea; margin-bottom: 15px;">📍 Delivery Address</h5>
        <input id="delivery-address" type="text" placeholder="Enter your full address in Covenant Hills or Ladera Ranch" style="width: 100%; padding: 15px; border: 2px solid #e0e0e0; border-radius: 10px; font-size: 1rem; margin-bottom: 10px;">
        <input id="delivery-instructions" type="text" placeholder="Delivery instructions (optional)" style="width: 100%; padding: 15px; border: 2px solid #e0e0e0; border-radius: 10px; font-size: 1rem;">
      </div>
    </div>
    <!-- Payment Instructions -->
    <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 30px; border-radius: 20px; color: white; text-align: center; margin-bottom: 20px;">
      <h3 style="margin-bottom: 15px; font-family: 'Playfair Display', serif;">💳 Payment Instructions</h3>
      <p style="margin-bottom: 20px; opacity: 0.9;">To complete your order, please send payment via Venmo:</p>
      <a id="venmo-payment-link" href="[https://venmo.com/u/YOUR_VENMO_USERNAME](https://venmo.com/u/YOUR_VENMO_USERNAME)" target="_blank" style="display: inline-block; background: #3D95CE; color: white; padding: 15px 30px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 1.1rem; margin: 10px; transition: all 0.3s ease; box-shadow: 0 5px 15px rgba(61, 149, 206, 0.4);">
        📱 Pay with Venmo
      </a>
      <div style="background: rgba(255, 255, 255, 0.1); padding: 20px; border-radius: 15px; margin-top: 20px;">
        <p style="margin-bottom: 10px;"><strong>Venmo Username:</strong> @<span id="venmo-username-display">YOUR_VENMO_USERNAME</span></p>
        <p style="margin-bottom: 10px;"><strong>Subtotal:</strong> $<span id="cart-subtotal">0.00</span></p>
        <p style="margin-bottom: 10px;"><strong>Delivery:</strong> <span id="delivery-fee-display">Free Pickup</span></p>
        <p style="margin-bottom: 15px; font-size: 1.2rem;"><strong>Total Amount:</strong> $<span id="venmo-total">0.00</span></p>
        <p style="font-size: 0.9rem; opacity: 0.8;">⚠️ Please include your order details in the Venmo note!</p>
      </div>
    </div>
    <!-- Order Confirmation -->
    <div style="background: rgba(255, 255, 255, 0.9); padding: 25px; border-radius: 15px; text-align: center;">
      <h4 style="color: #d4691a; margin-bottom: 15px;">📋 After Payment</h4>
      <p style="margin-bottom: 20px; color: #666;">Once you've sent the Venmo payment, click below to submit your order:</p>
      <button class="btn btn-success" onclick="submitVenmoOrder()" id="submit-order-btn" style="font-size: 1.2rem; padding: 15px 30px;">✅ Confirm Order Placed</button>
      <p style="margin-top: 15px; font-size: 0.9rem; color: #888;">We'll confirm receipt of payment and prepare your order!</p>
    </div>
  `;
  
  if (cartDiv) {
    cartDiv.innerHTML = '<div class="empty-state"><p>Your cart is empty. Add some delicious items!</p></div>';
  }
  if (checkoutSection) {
    checkoutSection.innerHTML = originalCheckoutHTML;
    checkoutSection.style.display = 'none';
  }
  
  // Re-initialize any event listeners if needed
  initializeVenmoPayment();
  
  // Finally, update cart count and totals
  renderCart();
}

// Load menu items with deals
async function refreshMenu() {
  try {
    const snapshot = await firebase.firestore().collection('menuItems').where('stock', '>', 0).get();
    const menuDiv = document.getElementById('menu');
    
    if (snapshot.empty) {
      menuDiv.innerHTML = '<div class="empty-state"><p>No items available right now. Check back soon!</p></div>';
      return;
    }

    // Get all active deals
    const dealsSnapshot = await firebase.firestore().collection('deals').where('isActive', '==', true).get();
    const dealsByItem = {};
    
    dealsSnapshot.forEach(doc => {
      const deal = doc.data();
      if (!dealsByItem[deal.menuItemId]) {
        dealsByItem[deal.menuItemId] = [];
      }
      dealsByItem[deal.menuItemId].push({ id: doc.id, ...deal });
    });

    menuDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const item = doc.data();
      const itemDeals = dealsByItem[doc.id] || [];
      
      const itemDiv = document.createElement('div');
      itemDiv.className = `menu-item ${itemDeals.length > 0 ? 'has-deal' : ''}`;
      
      // Generate deal badges and descriptions
      let dealBadges = '';
      let dealDescriptions = '';
      
      itemDeals.forEach(deal => {
        let badgeText = '';
        if (deal.type === 'percentage') {
          badgeText = `${deal.percentage}% OFF`;
        } else if (deal.type === 'buy-get') {
          badgeText = `Buy ${deal.buyQuantity} Get ${deal.freeQuantity} FREE`;
        } else if (deal.type === 'fixed-discount') {
          badgeText = `$${deal.fixedAmount.toFixed(2)} OFF`;
        }
        
        dealBadges += `<div class="deal-badge">${badgeText}</div>`;
        
        if (deal.description) {
          dealDescriptions += `<div class="deal-description">🏷️ ${deal.description}</div>`;
        }
      });
      
      itemDiv.innerHTML = `
        ${dealBadges}
        <div class="stock-indicator in-stock">${item.stock} in stock</div>
        <div class="menu-item-header">
          <div class="menu-item-emoji">${item.emoji || '🍰'}</div>
          <div class="menu-item-info">
            <h3>${item.name}</h3>
            <div class="menu-item-price">$${item.price.toFixed(2)}</div>
          </div>
        </div>
        <div class="menu-item-description">${item.description}</div>
        ${dealDescriptions}
        <button class="btn btn-primary" onclick="addToCart('${doc.id}', '${item.name}', ${item.price}, '${item.emoji || '🍰'}', ${item.stock})">Add to Cart</button>
      `;
      menuDiv.appendChild(itemDiv);
    });
  } catch (err) {
    console.error("Error loading menu items:", err);
    showStatus("Failed to load menu items.", 'error');
  }
}

async function loadMenuItems() {
    await refreshMenu();
}

async function loadUserOrders() {
  if (!currentUser) return;
  
  try {
    const snapshot = await firebase.firestore().collection('orders')
      .where('userId', '==', currentUser.uid)
      .orderBy('createdAt', 'desc')
      .get();
    
    const ordersDiv = document.getElementById('orders-list');
    
    if (snapshot.empty) {
      ordersDiv.innerHTML = '<div class="empty-state"><p>You haven\'t placed any orders yet.</p></div>';
      return;
    }

    ordersDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const order = doc.data();
      const orderDiv = document.createElement('div');
      orderDiv.style.cssText = 'background: white; padding: 20px; border-radius: 10px; margin-bottom: 15px; border: 1px solid #e0e0e0;';
      
      const itemsList = order.items.map(item => `${item.emoji} ${item.name} - $${item.price.toFixed(2)}`).join('<br>');
      const orderDate = order.createdAt ? order.createdAt.toDate().toLocaleDateString() : 'Recent';
      
      orderDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <strong>Order from ${orderDate}</strong>
          <div style="padding: 5px 10px; border-radius: 15px; font-size: 0.8rem; font-weight: bold; background: ${getStatusColor(order.status || 'pending')}; color: white;">
            ${(order.status || 'pending').toUpperCase()}
          </div>
        </div>
        <div style="margin: 10px 0;">${itemsList}</div>
        <div style="font-weight: bold; color: #28a745; margin-bottom: 15px;">Total: $${order.total.toFixed(2)}</div>
        <div style="text-align: right;">
          <button class="btn btn-danger" onclick="deleteOrder('${doc.id}', 'user')" style="padding: 8px 15px; font-size: 0.9rem;">🗑️ Delete Order</button>
        </div>
      `;
      ordersDiv.appendChild(orderDiv);
    });
  } catch (err) {
    console.error("Error loading orders:", err);
    showStatus("Failed to load orders.", 'error');
  }
}

async function handleAuthStateChange(user) {
  try {
    if (user) {
      currentUser = user;
      
      const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
      
      if (!userDoc.exists) {
        await firebase.firestore().collection('users').doc(user.uid).set({
          email: user.email,
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          role: 'customer',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        userData = {
          email: user.email,
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          role: 'customer'
        };
      } else {
        userData = userDoc.data();
      }

      document.getElementById('signed-out-view').style.display = 'none';
      document.getElementById('signed-in-view').style.display = 'block';
      document.getElementById('user-email-display').textContent = userData.email;
      document.getElementById('user-role-display').textContent = `Role: ${userData.role}`;
      
      const avatarDiv = document.getElementById('user-avatar');
      if (userData.photoURL) {
        avatarDiv.innerHTML = `<img src="${userData.photoURL}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" alt="Profile">`;
      } else {
        const initial = (userData.displayName || userData.email).charAt(0).toUpperCase();
        avatarDiv.textContent = initial;
        avatarDiv.style.background = '#d4691a';
        avatarDiv.style.color = 'white';
      }
      
      document.getElementById('orders-tab').style.display = 'block';
      if (userData.role === 'admin') {
        document.getElementById('admin-tab').style.display = 'block';
      }

      await loadMenuItems();
    } else {
      currentUser = null;
      userData = null;
      verifiedLocationArea = null;
      updateDeliveryOptionsUI();
      
      document.getElementById('signed-out-view').style.display = 'block';
      document.getElementById('signed-in-view').style.display = 'none';
      document.getElementById('orders-tab').style.display = 'none';
      document.getElementById('admin-tab').style.display = 'none';
      
      document.getElementById('menu').innerHTML = '<div class="empty-state"><p>Sign in to view our delicious menu items!</p></div>';
      cart = [];
      renderCart();
      switchTab('account');
    }
  } catch (error) {
    console.error("Auth state change error:", error);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  try {
    firebase.initializeApp(firebaseConfig);
    firebase.auth().onAuthStateChanged(handleAuthStateChange);
    updateCartCount();
    
    // Initialize Venmo payment system
    initializeVenmoPayment();
    
    console.log('🔥 Firebase initialized successfully!');
    
    showLocationVerification();
    
    // Initialize deal form fields toggle
    setTimeout(() => {
      if (document.getElementById('deal-type')) {
        toggleDealFields();
      }
    }, 1000);
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    showStatus('Failed to load the application. Please refresh the page.', 'error');
  }
});

document.addEventListener('keypress', function(e) {
  if (e.target.id === 'email' || e.target.id === 'password') {
    if (e.key === 'Enter') {
      signIn();
    }
  }
});
