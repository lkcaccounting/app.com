/* =============================================
   LKC ACCOUNTING — APP LOGIC
   ============================================= */

// ===== DATA LAYER =====
const DB = {
  get: (key) => { try { return JSON.parse(localStorage.getItem('lkc_' + key)); } catch { return null; } },
  set: (key, val) => localStorage.setItem('lkc_' + key, JSON.stringify(val)),
  del: (key) => localStorage.removeItem('lkc_' + key)
};

// Persistent data accessors
const getData = (key, def = []) => DB.get(key) || def;
const setData = (key, val) => DB.set(key, val);

// ===== ID GENERATOR =====
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ===== HASH PASSWORD =====
async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin + 'lkc_salt_2024'));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== STATE =====
let currentPinEntry = '';
let currentPage = 'dashboard';
let invoiceItemsCount = 0;
let receiptItemsCount = 0;
let currentInvoiceFilter = 'all';
let deleteCallback = null;
let viewingInvoiceId = null;
let viewingReceiptId = null;

// ===== INIT =====
window.addEventListener('DOMContentLoaded', async () => {
  const setup = DB.get('setup_complete');
  if (!setup) {
    showScreen('setup-screen');
    document.getElementById('setup-date') && (document.getElementById('setup-date').value = today());
    return;
  }
  // Check if activated on this device
  const activated = DB.get('device_activated');
  if (!activated) {
    showScreen('admin-verify-screen');
    return;
  }
  showPinScreen();
  checkLowStock();
});

function showScreen(id) {
  ['setup-screen','admin-verify-screen','pin-screen','app'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.add('hidden');
  });
  const target = document.getElementById(id);
  if (target) target.classList.remove('hidden');
}

// ===== SETUP =====
async function completeSetup() {
  const biz = val('setup-business-name');
  const owner = val('setup-owner');
  const email = val('setup-email');
  const phone = val('setup-phone');
  const currency = val('setup-currency');
  const adminPass = val('setup-admin-pass');
  const adminConfirm = val('setup-admin-confirm');
  const pin = val('setup-pin');
  const pinConfirm = val('setup-pin-confirm');

  if (!biz || !adminPass || !pin) return showSetupError('Business name, password, and PIN are required.');
  if (adminPass !== adminConfirm) return showSetupError('Administration passwords do not match.');
  if (adminPass.length < 6) return showSetupError('Administration password must be at least 6 characters.');
  if (pin.length < 4) return showSetupError('PIN must be at least 4 digits.');
  if (!/^\d+$/.test(pin)) return showSetupError('PIN must contain digits only.');
  if (pin !== pinConfirm) return showSetupError('PINs do not match.');

  const adminHash = await hashPin(adminPass);
  const pinHash = await hashPin(pin);

  DB.set('setup_complete', true);
  DB.set('device_activated', true);
  DB.set('admin_hash', adminHash);
  DB.set('pin_hash', pinHash);
  DB.set('business', { name: biz, owner, email, phone, currency, address: '' });

  showPinScreen();
}
function showSetupError(msg) {
  const el = document.getElementById('setup-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ===== ADMIN VERIFY =====
async function verifyAdminPassword() {
  const pass = val('admin-verify-pass');
  const stored = DB.get('admin_hash');
  const hash = await hashPin(pass);
  if (hash === stored) {
    DB.set('device_activated', true);
    showPinScreen();
  } else {
    const el = document.getElementById('admin-verify-error');
    el.textContent = 'Incorrect administration password. Contact LKC Accounting for access.';
    el.classList.remove('hidden');
  }
}

// ===== PIN SCREEN =====
function showPinScreen() {
  const biz = DB.get('business');
  document.getElementById('pin-biz-name').textContent = biz ? biz.name : 'LKC Accounting';
  currentPinEntry = '';
  updatePinDots();
  showScreen('pin-screen');
}

function pinInput(digit) {
  const pinHash = DB.get('pin_hash');
  if (!pinHash) { launchApp(); return; }
  const len = pinHash.length > 0 ? 6 : 4;
  if (currentPinEntry.length >= 6) return;
  currentPinEntry += digit;
  updatePinDots();
  if (currentPinEntry.length >= 4) {
    setTimeout(() => checkPin(), 100);
  }
}

function pinBackspace() {
  currentPinEntry = currentPinEntry.slice(0, -1);
  updatePinDots();
}

function updatePinDots() {
  const dots = document.querySelectorAll('#pin-dots span');
  dots.forEach((d, i) => {
    d.classList.toggle('filled', i < currentPinEntry.length);
  });
}

async function checkPin() {
  const pinHash = DB.get('pin_hash');
  const hash = await hashPin(currentPinEntry);
  if (hash === pinHash) {
    launchApp();
  } else {
    document.getElementById('pin-error').textContent = 'Incorrect PIN. Try again.';
    document.getElementById('pin-error').classList.remove('hidden');
    currentPinEntry = '';
    updatePinDots();
    setTimeout(() => document.getElementById('pin-error').classList.add('hidden'), 2000);
  }
}

function lockApp() {
  showPinScreen();
}

// ===== LAUNCH APP =====
function launchApp() {
  showScreen('app');
  loadSettings();
  navigate('dashboard');
  checkLowStock();
}

// ===== NAVIGATION =====
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-menu a').forEach(a => a.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');
  const navEl = document.querySelector(`[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');
  const titles = { dashboard: 'Dashboard', income: 'Income', expenses: 'Expenses', invoices: 'Invoices', receipts: 'Receipts', inventory: 'Inventory', reports: 'P&L Reports', customers: 'Customers', settings: 'Settings' };
  document.getElementById('page-title').textContent = titles[page] || page;
  closeSidebarOnMobile();
  renderPage(page);
}

function renderPage(page) {
  switch(page) {
    case 'dashboard': renderDashboard(); break;
    case 'income': renderIncome(); break;
    case 'expenses': renderExpenses(); break;
    case 'invoices': renderInvoices(); break;
    case 'receipts': renderReceipts(); break;
    case 'inventory': renderInventory(); break;
    case 'reports':
      setDefaultReportDates();
      generateReport();
      break;
    case 'customers': renderCustomers(); break;
    case 'settings': loadSettings(); break;
  }
}

// ===== SIDEBAR =====
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  sb.classList.toggle('open');
  ov.classList.toggle('show');
}
function closeSidebarOnMobile() {
  if (window.innerWidth <= 900) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('show');
  }
}

// ===== MODALS =====
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  if (id === 'income-modal') {
    document.getElementById('inc-date').value = today();
    populateCustomerDropdown('inc-customer');
  }
  if (id === 'expense-modal') document.getElementById('exp-date').value = today();
  if (id === 'invoice-modal') {
    document.getElementById('inv-date').value = today();
    const due = new Date(); due.setDate(due.getDate() + 30);
    document.getElementById('inv-due').value = due.toISOString().slice(0, 10);
    document.getElementById('inv-number').value = nextDocNumber('invoices', 'INV');
    populateCustomerDropdown('inv-customer');
    resetInvoiceItems();
  }
  if (id === 'receipt-modal') {
    document.getElementById('rec-date').value = today();
    document.getElementById('rec-number').value = nextDocNumber('receipts', 'REC');
    populateCustomerDropdown('rec-customer');
    resetReceiptItems();
  }
  if (id === 'inventory-modal') {
    document.getElementById('inventory-modal-title').textContent = 'Add Stock Item';
    document.getElementById('inv-edit-id').value = '';
    clearForm(['item-name','item-sku','item-category','item-price','item-qty','item-low','item-unit','item-desc']);
  }
  if (id === 'sale-modal') {
    document.getElementById('sale-date').value = today();
    populateInventoryDropdown('sale-item');
    populateCustomerDropdown('sale-customer');
  }
  if (id === 'customer-modal') {
    document.getElementById('customer-modal-title').textContent = 'Add Customer';
    document.getElementById('cust-edit-id').value = '';
    clearForm(['cust-name','cust-email','cust-phone','cust-address','cust-notes']);
  }
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function clearForm(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

// ===== CUSTOMERS =====
function saveCustomer() {
  const name = val('cust-name');
  if (!name) return showToast('Customer name is required', 'error');
  const id = val('cust-edit-id') || genId();
  const customers = getData('customers');
  const existing = customers.findIndex(c => c.id === id);
  const customer = {
    id, name,
    email: val('cust-email'),
    phone: val('cust-phone'),
    address: val('cust-address'),
    notes: val('cust-notes')
  };
  if (existing >= 0) customers[existing] = customer;
  else customers.push(customer);
  setData('customers', customers);
  closeModal('customer-modal');
  renderCustomers();
  showToast('Customer saved successfully', 'success');
}

function editCustomer(id) {
  const c = getData('customers').find(c => c.id === id);
  if (!c) return;
  document.getElementById('customer-modal-title').textContent = 'Edit Customer';
  setVal('cust-edit-id', id);
  setVal('cust-name', c.name);
  setVal('cust-email', c.email || '');
  setVal('cust-phone', c.phone || '');
  setVal('cust-address', c.address || '');
  setVal('cust-notes', c.notes || '');
  openModal('customer-modal');
}

function deleteCustomer(id) {
  confirmDelete('Delete this customer?', () => {
    setData('customers', getData('customers').filter(c => c.id !== id));
    renderCustomers();
    showToast('Customer deleted', 'success');
  });
}

function renderCustomers(filter = '') {
  let customers = getData('customers');
  if (filter) customers = customers.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
  const grid = document.getElementById('customers-grid');
  const empty = document.getElementById('customers-empty');
  if (!customers.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  grid.innerHTML = customers.map(c => `
    <div class="customer-card">
      <div class="customer-avatar">${c.name.charAt(0).toUpperCase()}</div>
      <div class="customer-name">${esc(c.name)}</div>
      ${c.email ? `<div class="customer-detail">${esc(c.email)}</div>` : ''}
      ${c.phone ? `<div class="customer-detail">${esc(c.phone)}</div>` : ''}
      ${c.address ? `<div class="customer-detail">${esc(c.address)}</div>` : ''}
      <div class="customer-card-actions">
        <button class="action-btn edit" onclick="editCustomer('${c.id}')">Edit</button>
        <button class="action-btn delete" onclick="deleteCustomer('${c.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function filterCustomers(v) { renderCustomers(v); }

function populateCustomerDropdown(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const customers = getData('customers');
  const current = sel.value;
  sel.innerHTML = '<option value="">-- Select Customer --</option>' + customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  sel.value = current;
}

// ===== INCOME =====
function saveIncome() {
  const date = val('inc-date');
  const desc = val('inc-desc');
  const amount = parseFloat(val('inc-amount'));
  if (!date || !desc || isNaN(amount) || amount <= 0) return showToast('Date, description and valid amount are required', 'error');
  const id = val('income-edit-id') || genId();
  const incomes = getData('income');
  const existing = incomes.findIndex(i => i.id === id);
  const record = { id, date, desc, amount, category: val('inc-category'), customerId: val('inc-customer'), notes: val('inc-notes') };
  if (existing >= 0) incomes[existing] = record;
  else incomes.push(record);
  setData('income', incomes);
  closeModal('income-modal');
  renderIncome();
  renderDashboard();
  showToast('Income recorded successfully', 'success');
}

function editIncome(id) {
  const item = getData('income').find(i => i.id === id);
  if (!item) return;
  document.getElementById('income-modal-title').textContent = 'Edit Income';
  setVal('income-edit-id', id);
  setVal('inc-date', item.date);
  setVal('inc-desc', item.desc);
  setVal('inc-amount', item.amount);
  setVal('inc-category', item.category);
  setVal('inc-notes', item.notes || '');
  populateCustomerDropdown('inc-customer');
  setVal('inc-customer', item.customerId || '');
  openModal('income-modal');
  document.getElementById('inc-date').value = item.date;
}

function deleteIncome(id) {
  confirmDelete('Delete this income record?', () => {
    setData('income', getData('income').filter(i => i.id !== id));
    renderIncome();
    renderDashboard();
    showToast('Income record deleted', 'success');
  });
}

function renderIncome(filter = '') {
  let items = getData('income').sort((a, b) => b.date.localeCompare(a.date));
  if (filter) items = items.filter(i => i.desc.toLowerCase().includes(filter.toLowerCase()) || (i.category || '').toLowerCase().includes(filter.toLowerCase()));
  const biz = DB.get('business') || {};
  const currency = biz.currency || 'KES';
  const tbody = document.getElementById('income-table-body');
  const empty = document.getElementById('income-empty');
  if (!items.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  const customers = getData('customers');
  tbody.innerHTML = items.map(i => {
    const cust = customers.find(c => c.id === i.customerId);
    return `<tr>
      <td>${formatDate(i.date)}</td>
      <td>${esc(i.desc)}</td>
      <td><span class="badge badge-success">${esc(i.category || 'Other')}</span></td>
      <td>${cust ? esc(cust.name) : '—'}</td>
      <td class="amount-cell positive">${currency} ${fmt(i.amount)}</td>
      <td><div class="actions-cell">
        <button class="action-btn edit" onclick="editIncome('${i.id}')">Edit</button>
        <button class="action-btn delete" onclick="deleteIncome('${i.id}')">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

function filterList(type, v) {
  if (type === 'income') renderIncome(v);
  if (type === 'expenses') renderExpenses(v);
}

// ===== EXPENSES =====
function saveExpense() {
  const date = val('exp-date');
  const desc = val('exp-desc');
  const amount = parseFloat(val('exp-amount'));
  if (!date || !desc || isNaN(amount) || amount <= 0) return showToast('Date, description and valid amount are required', 'error');
  const id = val('expense-edit-id') || genId();
  const expenses = getData('expenses');
  const existing = expenses.findIndex(e => e.id === id);
  const record = { id, date, desc, amount, category: val('exp-category'), vendor: val('exp-vendor'), notes: val('exp-notes') };
  if (existing >= 0) expenses[existing] = record;
  else expenses.push(record);
  setData('expenses', expenses);
  closeModal('expense-modal');
  renderExpenses();
  renderDashboard();
  showToast('Expense recorded successfully', 'success');
}

function editExpense(id) {
  const item = getData('expenses').find(e => e.id === id);
  if (!item) return;
  document.getElementById('expense-modal-title').textContent = 'Edit Expense';
  setVal('expense-edit-id', id);
  setVal('exp-date', item.date);
  setVal('exp-desc', item.desc);
  setVal('exp-amount', item.amount);
  setVal('exp-category', item.category);
  setVal('exp-vendor', item.vendor || '');
  setVal('exp-notes', item.notes || '');
  openModal('expense-modal');
  document.getElementById('exp-date').value = item.date;
}

function deleteExpense(id) {
  confirmDelete('Delete this expense record?', () => {
    setData('expenses', getData('expenses').filter(e => e.id !== id));
    renderExpenses();
    renderDashboard();
    showToast('Expense record deleted', 'success');
  });
}

function renderExpenses(filter = '') {
  let items = getData('expenses').sort((a, b) => b.date.localeCompare(a.date));
  if (filter) items = items.filter(i => i.desc.toLowerCase().includes(filter.toLowerCase()) || (i.category || '').toLowerCase().includes(filter.toLowerCase()));
  const biz = DB.get('business') || {};
  const currency = biz.currency || 'KES';
  const tbody = document.getElementById('expense-table-body');
  const empty = document.getElementById('expense-empty');
  if (!items.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  tbody.innerHTML = items.map(i => `<tr>
    <td>${formatDate(i.date)}</td>
    <td>${esc(i.desc)}</td>
    <td><span class="badge badge-danger">${esc(i.category || 'Other')}</span></td>
    <td>${esc(i.vendor || '—')}</td>
    <td class="amount-cell negative">${currency} ${fmt(i.amount)}</td>
    <td><div class="actions-cell">
      <button class="action-btn edit" onclick="editExpense('${i.id}')">Edit</button>
      <button class="action-btn delete" onclick="deleteExpense('${i.id}')">Delete</button>
    </div></td>
  </tr>`).join('');
}

// ===== INVOICES =====
function resetInvoiceItems() {
  invoiceItemsCount = 0;
  document.getElementById('invoice-items-body').innerHTML = '';
  addInvoiceItem();
  document.getElementById('inv-tax').value = 0;
  document.getElementById('inv-subtotal').textContent = '0.00';
  document.getElementById('inv-total').textContent = '0.00';
}

function addInvoiceItem() {
  const id = invoiceItemsCount++;
  const row = document.createElement('tr');
  row.id = 'inv-row-' + id;
  row.innerHTML = `
    <td><input type="text" placeholder="Item description" onchange="recalcInvoice()"></td>
    <td><input type="number" value="1" min="1" style="width:60px" onchange="recalcInvoice()"></td>
    <td><input type="number" value="0" min="0" step="0.01" style="width:90px" onchange="recalcInvoice()"></td>
    <td><input type="text" readonly style="width:90px" id="inv-line-${id}">0.00</td>
    <td><button class="remove-item-btn" onclick="removeInvoiceRow(${id})">×</button></td>
  `;
  document.getElementById('invoice-items-body').appendChild(row);
}

function removeInvoiceRow(id) {
  const row = document.getElementById('inv-row-' + id);
  if (row) row.remove();
  recalcInvoice();
}

function recalcInvoice() {
  const rows = document.querySelectorAll('#invoice-items-body tr');
  let subtotal = 0;
  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const qty = parseFloat(inputs[1]?.value) || 0;
    const price = parseFloat(inputs[2]?.value) || 0;
    const line = qty * price;
    if (inputs[3]) inputs[3].value = fmt(line);
    subtotal += line;
  });
  const tax = parseFloat(document.getElementById('inv-tax')?.value) || 0;
  const total = subtotal + (subtotal * tax / 100);
  const biz = DB.get('business') || {};
  const currency = biz.currency || 'KES';
  document.getElementById('inv-subtotal').textContent = currency + ' ' + fmt(subtotal);
  document.getElementById('inv-total').textContent = currency + ' ' + fmt(total);
}

function fillCustomerDetails() {
  const custId = val('inv-customer');
  const c = getData('customers').find(c => c.id === custId);
  if (c) {
    setVal('inv-cust-email', c.email || '');
    setVal('inv-cust-address', c.address || '');
  }
}

function fillReceiptCustomer() {
  const custId = val('rec-customer');
  const c = getData('customers').find(c => c.id === custId);
  if (c) setVal('rec-cust-email', c.email || '');
}

function getInvoiceItemsFromForm(bodyId) {
  const rows = document.querySelectorAll('#' + bodyId + ' tr');
  const items = [];
  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const desc = inputs[0]?.value || '';
    const qty = parseFloat(inputs[1]?.value) || 0;
    const price = parseFloat(inputs[2]?.value) || 0;
    if (desc || price > 0) items.push({ desc, qty, price, total: qty * price });
  });
  return items;
}

function saveInvoice() {
  const number = val('inv-number');
  const date = val('inv-date');
  if (!number || !date) return showToast('Invoice number and date are required', 'error');
  const items = getInvoiceItemsFromForm('invoice-items-body');
  if (!items.length) return showToast('Add at least one line item', 'error');
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const taxRate = parseFloat(val('inv-tax')) || 0;
  const total = subtotal + (subtotal * taxRate / 100);
  const id = val('invoice-edit-id') || genId();
  const invoices = getData('invoices');
  const existing = invoices.findIndex(i => i.id === id);
  const invoice = {
    id, number, date, dueDate: val('inv-due'),
    customerId: val('inv-customer'),
    custEmail: val('inv-cust-email'),
    custAddress: val('inv-cust-address'),
    items, subtotal, taxRate, total,
    notes: val('inv-notes'),
    status: 'unpaid',
    createdAt: new Date().toISOString()
  };
  if (existing >= 0) { invoice.status = invoices[existing].status; invoices[existing] = invoice; }
  else invoices.push(invoice);
  setData('invoices', invoices);
  closeModal('invoice-modal');
  renderInvoices();
  renderDashboard();
  showToast('Invoice saved successfully', 'success');
}

function filterInvoices(filter, btn) {
  currentInvoiceFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderInvoices();
}

function renderInvoices() {
  let invoices = getData('invoices').sort((a, b) => b.date.localeCompare(a.date));
  if (currentInvoiceFilter === 'paid') invoices = invoices.filter(i => i.status === 'paid');
  if (currentInvoiceFilter === 'unpaid') invoices = invoices.filter(i => i.status !== 'paid');
  const biz = DB.get('business') || {};
  const currency = biz.currency || 'KES';
  const customers = getData('customers');
  const grid = document.getElementById('invoices-grid');
  const empty = document.getElementById('invoice-empty');
  if (!invoices.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  grid.innerHTML = invoices.map(inv => {
    const cust = customers.find(c => c.id === inv.customerId);
    const statusClass = inv.status === 'paid' ? 'badge-success' : 'badge-warning';
    return `<div class="invoice-card-ui">
      <div class="invoice-card-top">
        <span class="invoice-number">${esc(inv.number)}</span>
        <span class="badge ${statusClass}">${inv.status === 'paid' ? 'Paid' : 'Unpaid'}</span>
      </div>
      <div class="invoice-customer">${cust ? esc(cust.name) : esc(inv.custEmail || 'No customer')}</div>
      <div class="invoice-date">Date: ${formatDate(inv.date)}${inv.dueDate ? ' · Due: ' + formatDate(inv.dueDate) : ''}</div>
      <div class="invoice-amount">${currency} ${fmt(inv.total)}</div>
      <div class="invoice-card-actions">
        <button class="action-btn view" onclick="viewInvoice('${inv.id}')">View / Send</button>
        ${inv.status !== 'paid' ? `<button class="action-btn edit" onclick="markInvoicePaid('${inv.id}')">Mark Paid</button>` : ''}
        <button class="action-btn delete" onclick="deleteInvoice('${inv.id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function markInvoicePaid(id) {
  const invoices = getData('invoices');
  const inv = invoices.find(i => i.id === id);
  if (inv) { inv.status = 'paid'; setData('invoices', invoices); renderInvoices(); renderDashboard(); showToast('Invoice marked as paid', 'success'); }
}

function deleteInvoice(id) {
  confirmDelete('Delete this invoice?', () => {
    setData('invoices', getData('invoices').filter(i => i.id !== id));
    renderInvoices();
    renderDashboard();
    showToast('Invoice deleted', 'success');
  });
}

function viewInvoice(id) {
  viewingInvoiceId = id;
  const inv = getData('invoices').find(i => i.id === id);
  if (!inv) return;
  const biz = DB.get('business') || {};
  const currency = biz.currency || 'KES';
  const customers = getData('customers');
  const cust = customers.find(c => c.id === inv.customerId);
  document.getElementById('invoice-print-area').innerHTML = buildInvoiceHTML(inv, biz, currency, cust);
  openModal('invoice-view-modal');
}

function buildInvoiceHTML(inv, biz, currency, cust) {
  const rows = inv.items.map(it => `<tr>
    <td>${esc(it.desc)}</td>
    <td style="text-align:right">${it.qty}</td>
    <td style="text-align:right">${currency} ${fmt(it.price)}</td>
    <td style="text-align:right">${currency} ${fmt(it.total)}</td>
  </tr>`).join('');
  return `<div class="invoice-template">
    <div class="inv-t-header">
      <div>
        <div class="inv-t-logo">${esc(biz.name || 'LKC')}</div>
        ${biz.address ? `<p style="font-size:0.8rem;color:#666;margin-top:6px">${esc(biz.address)}</p>` : ''}
        ${biz.email ? `<p style="font-size:0.8rem;color:#666">${esc(biz.email)}</p>` : ''}
        ${biz.phone ? `<p style="font-size:0.8rem;color:#666">${esc(biz.phone)}</p>` : ''}
      </div>
      <div class="inv-t-info">
        <h2>INVOICE</h2>
        <p><strong>${esc(inv.number)}</strong></p>
        <p>Date: ${formatDate(inv.date)}</p>
        ${inv.dueDate ? `<p>Due: ${formatDate(inv.dueDate)}</p>` : ''}
        <p style="margin-top:8px"><span style="background:${inv.status==='paid'?'#d1fae5':'#fef3c7'};color:${inv.status==='paid'?'#065f46':'#92400e'};padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700">${inv.status === 'paid' ? 'PAID' : 'UNPAID'}</span></p>
      </div>
    </div>
    <div class="inv-t-parties">
      <div class="inv-t-party">
        <h4>From</h4>
        <strong>${esc(biz.name || '')}</strong>
        ${biz.owner ? `<p>${esc(biz.owner)}</p>` : ''}
        ${biz.email ? `<p>${esc(biz.email)}</p>` : ''}
        ${biz.phone ? `<p>${esc(biz.phone)}</p>` : ''}
      </div>
      <div class="inv-t-party">
        <h4>Bill To</h4>
        <strong>${cust ? esc(cust.name) : esc(inv.custEmail || 'Customer')}</strong>
        ${inv.custAddress ? `<p>${esc(inv.custAddress)}</p>` : ''}
        ${inv.custEmail ? `<p>${esc(inv.custEmail)}</p>` : ''}
        ${cust && cust.phone ? `<p>${esc(cust.phone)}</p>` : ''}
      </div>
    </div>
    <table class="inv-t-table">
      <thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="overflow:hidden">
      <div class="inv-t-totals">
        <div class="inv-t-total-row"><span>Subtotal</span><span>${currency} ${fmt(inv.subtotal)}</span></div>
        ${inv.taxRate ? `<div class="inv-t-total-row"><span>Tax (${inv.taxRate}%)</span><span>${currency} ${fmt(inv.subtotal * inv.taxRate / 100)}</span></div>` : ''}
        <div class="inv-t-total-row final"><span>TOTAL</span><span>${currency} ${fmt(inv.total)}</span></div>
      </div>
    </div>
    ${inv.notes ? `<div style="clear:both"></div><div class="inv-t-notes"><strong>Notes / Payment Terms:</strong><br>${esc(inv.notes)}</div>` : ''}
    <div class="inv-t-footer">Thank you for your business · ${esc(biz.name || 'LKC Accounting')}</div>
  </div>`;
}

// ===== RECEIPTS =====
function resetReceiptItems() {
  receiptItemsCount = 0;
  document.getElementById('receipt-items-body').innerHTML = '';
  addReceiptItem();
  document.getElementById('rec-total').textContent = '0.00';
}

function addReceiptItem() {
  const id = receiptItemsCount++;
  const row = document.createElement('tr');
  row.id = 'rec-row-' + id;
  row.innerHTML = `
    <td><input type="text" placeholder="Item description" onchange="recalcReceipt()"></td>
    <td><input type="number" value="1" min="1" style="width:60px" onchange="recalcReceipt()"></td>
    <td><input type="number" value="0" min="0" step="0.01" style="width:90px" onchange="recalcReceipt()"></td>
    <td><input type="text" readonly style="width:90px">0.00</td>
    <td><button class="remove-item-btn" onclick="removeReceiptRow(${id})">×</button></td>
  `;
  document.getElementById('receipt-items-body').appendChild(row);
}

function removeReceiptRow(id) {
  const row = document.getElementById('rec-row-' + id);
  if (row) row.remove();
  recalcReceipt();
}

function recalcReceipt() {
  const rows = document.querySelectorAll('#receipt-items-body tr');
  let total = 0;
  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const qty = parseFloat(inputs[1]?.value) || 0;
    const price = parseFloat(inputs[2]?.value) || 0;
    const line = qty * price;
    if (inputs[3]) inputs[3].value = fmt(line);
    total += line;
  });
  const biz = DB.get('business') || {};
  const currency = biz.currency || 'KES';
  document.getElementById('rec-total').textContent = currency + ' ' + fmt(total);
}

function saveReceipt() {
  const number = val('rec-number');
  const date = val('rec-date');
  if (!number || !date) return showToast('Receipt number and date are required', 'error');
  const items = getInvoiceItemsFromForm('receipt-items-body');
  const total = items.reduce((s, i) => s + i.total, 0);
  const id = genId();
  const receipts = getData('receipts');
  receipts.push({
    id, number, date,
    customerId: val('rec-customer'),
    custEmail: val('rec-cust-email'),
    items, total,
    paymentMethod: val('rec-payment'),
    notes: val('rec-notes'),
    createdAt: new Date().toISOString()
  });
  setData('receipts', receipts);
  closeModal('receipt-modal');
  renderReceipts();
  showToast('Receipt generated successfully', 'success');
}

function renderReceipts() {
  const receipts = getData('receipts').sort((a, b) => b.date.localeCompare(a.date));
  const biz = DB.get('business') || {};
  const currency = biz.currency || 'KES';
  const customers = getData('customers');
  const tbody = document.getElementById('receipts-table-body');
  const empty = document.getElementById('receipts-empty');
  if (!receipts.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  tbody.innerHTML = receipts.map(r => {
    const cust = customers.find(c => c.id === r.customerId);
    return `<tr>
      <td>${formatDate(r.date)}</td>
      <td class="amount-cell">${esc(r.number)}</td>
      <td>${cust ? esc(cust.name) : esc(r.custEmail || '—')}</td>
      <td>${r.items.map(i => esc(i.desc)).join(', ')}</td>
      <td class="amount-cell positive">${currency} ${fmt(r.total)}</td>
      <td><div class="actions-cell">
        <button class="action-btn view" onclick="viewReceipt('${r.id}')">View / Download</button>
        <button class="action-btn delete" onclick="deleteReceipt('${r.id}')">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

function viewReceipt(id) {
  viewingReceiptId = id;
  const r = getData('receipts').find(r => r.id === id);
  if (!r) return;
  const biz = DB.get('business') || {};
  const currency = biz.currency || 'KES';
  const customers = getData('customers');
  const cust = customers.find(c => c.id === r.customerId);
  document.getElementById('receipt-print-area').innerHTML = buildReceiptHTML(r, biz, currency, cust);
  openModal('receipt-view-modal');
}

function buildReceiptHTML(r, biz, currency, cust) {
  const rows = r.items.map(it => `<tr>
    <td>${esc(it.desc)}</td>
    <td style="text-align:right">${it.qty}</td>
    <td style="text-align:right">${currency} ${fmt(it.price)}</td>
    <td style="text-align:right">${currency} ${fmt(it.total)}</td>
  </tr>`).join('');
  return `<div class="invoice-template">
    <div class="inv-t-header">
      <div>
        <div class="inv-t-logo">${esc(biz.name || 'LKC')}</div>
        ${biz.address ? `<p style="font-size:0.8rem;color:#666;margin-top:6px">${esc(biz.address)}</p>` : ''}
        ${biz.email ? `<p style="font-size:0.8rem;color:#666">${esc(biz.email)}</p>` : ''}
        ${biz.phone ? `<p style="font-size:0.8rem;color:#666">${esc(biz.phone)}</p>` : ''}
      </div>
      <div class="inv-t-info">
        <h2>RECEIPT</h2>
        <p><strong>${esc(r.number)}</strong></p>
        <p>Date: ${formatDate(r.date)}</p>
        <p>Payment: ${esc(r.paymentMethod || 'Cash')}</p>
      </div>
    </div>
    <div class="inv-t-parties">
      <div class="inv-t-party">
        <h4>Received From</h4>
        <strong>${cust ? esc(cust.name) : esc(r.custEmail || 'Customer')}</strong>
        ${r.custEmail ? `<p>${esc(r.custEmail)}</p>` : ''}
        ${cust && cust.phone ? `<p>${esc(cust.phone)}</p>` : ''}
      </div>
    </div>
    <table class="inv-t-table">
      <thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="overflow:hidden">
      <div class="inv-t-totals">
        <div class="inv-t-total-row final"><span>TOTAL RECEIVED</span><span>${currency} ${fmt(r.total)}</span></div>
      </div>
    </div>
    ${r.notes ? `<div style="clear:both"></div><div class="inv-t-notes">${esc(r.notes)}</div>` : ''}
    <div class="inv-t-footer">Thank you · ${esc(biz.name || 'LKC Accounting')}</div>
  </div>`;
}

function deleteReceipt(id) {
  confirmDelete('Delete this receipt?', () => {
    setData('receipts', getData('receipts').filter(r => r.id !== id));
    renderReceipts();
    showToast('Receipt deleted', 'success');
  });
}

// ===== INVENTORY =====
function saveInventoryItem() {
  const name = val('item-name');
  const price = parseFloat(val('item-price'));
  const qty = parseInt(val('item-qty'));
  if (!name || isNaN(price) || isNaN(qty)) return showToast('Name, price and quantity are required', 'error');
  const id = val('inv-edit-id') || genId();
  const inventory = getData('inventory');
  const existing = inventory.findIndex(i => i.id === id);
  const item = {
    id, name, price, qty,
    sku: val('item-sku'),
    category: val('item-category'),
    lowAlert: parseInt(val('item-low')) || 5,
    unit: val('item-unit') || 'pcs',
    desc: val('item-desc')
  };
  if (existing >= 0) inventory[existing] = item;
  else inventory.push(item);
  setData('inventory', inventory);
  closeModal('inventory-modal');
  renderInventory();
  checkLowStock();
  showToast('Stock item saved', 'success');
}

function editInventoryItem(id) {
  const item = getData('inventory').find(i => i.id === id);
  if (!item) return;
  document.getElementById('inventory-modal-title').textContent = 'Edit Stock Item';
  setVal('inv-edit-id', id);
  setVal('item-name', item.name);
  setVal('item-sku', item.sku || '');
  setVal('item-category', item.category || '');
  setVal('item-price', item.price);
  setVal('item-qty', item.qty);
  setVal('item-low', item.lowAlert);
  setVal('item-unit', item.unit || '');
  setVal('item-desc', item.desc || '');
  openModal('inventory-modal');
}

function deleteInventoryItem(id) {
  confirmDelete('Delete this stock item?', () => {
    setData('inventory', getData('inventory').filter(i => i.id !== id));
    renderInventory();
    checkLowStock();
    showToast('Stock item deleted', 'success');
  });
}

function renderInventory(filter = '') {
  let items = getData('inventory');
  if (filter) items = items.filter(i => i.name.toLowerCase().includes(filter.toLowerCase()) || (i.sku || '').toLowerCase().includes(filter.toLowerCase()));
  const biz = DB.get('business') || {};
  const currency = biz.currency || 'KES';
  const tbody = document.getElementById('inventory-table-body');
  const empty = document.getElementById('inventory-empty');
  if (!items.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  tbody.innerHTML = items.map(i => {
    const isLow = i.qty <= i.lowAlert;
    return `<tr>
      <td><strong>${esc(i.name)}</strong>${i.desc ? `<br><span style="font-size:0.78rem;color:var(--text-muted)">${esc(i.desc)}</span>` : ''}</td>
      <td class="amount-cell">${esc(i.sku || '—')}</td>
      <td>${esc(i.category || '—')}</td>
      <td class="amount-cell">${currency} ${fmt(i.price)}</td>
      <td><span class="stock-badge ${isLow ? 'low' : 'ok'}">${i.qty} ${esc(i.unit || 'pcs')}</span></td>
      <td>${i.lowAlert} ${esc(i.unit || 'pcs')}</td>
      <td class="amount-cell">${currency} ${fmt(i.price * i.qty)}</td>
      <td><div class="actions-cell">
        <button class="action-btn edit" onclick="editInventoryItem('${i.id}')">Edit</button>
        <button class="action-btn delete" onclick="deleteInventoryItem('${i.id}')">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

function filterInventory(v) { renderInventory(v); }

function populateInventoryDropdown(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const items = getData('inventory');
  sel.innerHTML = '<option value="">-- Select Item --</option>' + items.map(i => `<option value="${i.id}">${esc(i.name)} (${i.qty} ${esc(i.unit || 'pcs')})</option>`).join('');
}

function fillSalePrice() {
  const itemId = val('sale-item');
  const item = getData('inventory').find(i => i.id === itemId);
  if (item) { setVal('sale-price', item.price); calcSaleTotal(); }
}

function calcSaleTotal() {
  const qty = parseFloat(val('sale-qty')) || 0;
  const price = parseFloat(val('sale-price')) || 0;
  const biz = DB.get('business') || {};
  const currency = biz.currency || 'KES';
  setVal('sale-total', currency + ' ' + fmt(qty * price));
}

function recordSale() {
  const itemId = val('sale-item');
  const qty = parseInt(val('sale-qty'));
  const price = parseFloat(val('sale-price'));
  const date = val('sale-date');
  if (!itemId || !qty || isNaN(qty) || qty < 1) return showToast('Select an item and valid quantity', 'error');
  const inventory = getData('inventory');
  const item = inventory.find(i => i.id === itemId);
  if (!item) return showToast('Item not found', 'error');
  if (item.qty < qty) return showToast(`Only ${item.qty} ${item.unit || 'pcs'} available in stock`, 'error');
  item.qty -= qty;
  setData('inventory', inventory);
  // Record as income
  const incomes = getData('income');
  incomes.push({
    id: genId(), date,
    desc: `Sale: ${item.name} x${qty}`,
    amount: qty * price,
    category: 'Sales Revenue',
    customerId: val('sale-customer'),
    notes: `Stock sale — ${qty} ${item.unit || 'pcs'} of ${item.name}`
  });
  setData('income', incomes);
  closeModal('sale-modal');
  renderInventory();
  renderDashboard();
  checkLowStock();
  showToast(`Sale recorded. ${item.name} stock: ${item.qty} remaining`, 'success');
}

function checkLowStock() {
  const items = getData('inventory').filter(i => i.qty <= i.lowAlert);
  const banner = document.getElementById('notification-banner');
  const dashList = document.getElementById('low-stock-list');
  if (dashList) {
    if (!items.length) { dashList.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px 0">No low stock alerts</div>'; }
    else dashList.innerHTML = items.map(i => `<div class="low-stock-item"><span class="low-stock-name">${esc(i.name)}</span><span class="low-stock-qty">${i.qty} ${esc(i.unit || 'pcs')} left</span></div>`).join('');
  }
  if (banner) {
    if (items.length) {
      banner.textContent = `Low stock alert: ${items.map(i => i.name + ' (' + i.qty + ' left)').join(' · ')}`;
      banner.classList.remove('hidden');
    } else banner.classList.add('hidden');
  }
}

// ===== REPORTS =====
function setDefaultReportDates() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  if (!document.getElementById('report-from').value) document.getElementById('report-from').value = firstDay;
  if (!document.getElementById('report-to').value) document.getElementById('report-to').value = lastDay;
}

function generateReport() {
  const from = val('report-from');
  const to = val('report-to');
  const biz = DB.get('business') || {};
  const currency = biz.currency || 'KES';
  let incomes = getData('income');
  let expenses = getData('expenses');
  if (from) incomes = incomes.filter(i => i.date >= from);
  if (to) incomes = incomes.filter(i => i.date <= to);
  if (from) expenses = expenses.filter(e => e.date >= from);
  if (to) expenses = expenses.filter(e => e.date <= to);

  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const net = totalIncome - totalExpense;

  document.getElementById('rpt-income').textContent = currency + ' ' + fmt(totalIncome);
  document.getElementById('rpt-expense').textContent = currency + ' ' + fmt(totalExpense);
  const netEl = document.getElementById('rpt-net');
  netEl.textContent = currency + ' ' + fmt(net);
  netEl.className = net >= 0 ? 'positive' : 'negative';

  // Income categories
  const incCats = {};
  incomes.forEach(i => { incCats[i.category || 'Other'] = (incCats[i.category || 'Other'] || 0) + i.amount; });
  document.getElementById('income-categories-breakdown').innerHTML = Object.entries(incCats).length
    ? Object.entries(incCats).map(([cat, amt]) => `<div class="report-row"><span>${esc(cat)}</span><span class="positive">${currency} ${fmt(amt)}</span></div>`).join('')
    : '<div class="report-row" style="color:var(--text-muted)">No income in this period</div>';

  // Expense categories
  const expCats = {};
  expenses.forEach(e => { expCats[e.category || 'Other'] = (expCats[e.category || 'Other'] || 0) + e.amount; });
  document.getElementById('expense-categories-breakdown').innerHTML = Object.entries(expCats).length
    ? Object.entries(expCats).map(([cat, amt]) => `<div class="report-row"><span>${esc(cat)}</span><span class="negative">${currency} ${fmt(amt)}</span></div>`).join('')
    : '<div class="report-row" style="color:var(--text-muted)">No expenses in this period</div>';

  // Invoice summary
  const invoices = getData('invoices');
  const inPeriod = invoices.filter(i => (!from || i.date >= from) && (!to || i.date <= to));
  const totalInvoiced = inPeriod.reduce((s, i) => s + i.total, 0);
  const paidAmt = inPeriod.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);
  document.getElementById('rpt-invoiced').textContent = currency + ' ' + fmt(totalInvoiced);
  document.getElementById('rpt-paid').textContent = currency + ' ' + fmt(paidAmt);
  document.getElementById('rpt-outstanding').textContent = currency + ' ' + fmt(totalInvoiced - paidAmt);

  // Transactions table
  const all = [
    ...incomes.map(i => ({ date: i.date, type: 'Income', desc: i.desc, cat: i.category, amount: i.amount, sign: 1 })),
    ...expenses.map(e => ({ date: e.date, type: 'Expense', desc: e.desc, cat: e.category, amount: e.amount, sign: -1 }))
  ].sort((a, b) => b.date.localeCompare(a.date));

  const tbody = document.getElementById('report-transactions-body');
  tbody.innerHTML = all.map(t => `<tr>
    <td>${formatDate(t.date)}</td>
    <td><span class="badge ${t.sign > 0 ? 'badge-success' : 'badge-danger'}">${t.type}</span></td>
    <td>${esc(t.desc)}</td>
    <td>${esc(t.cat || '—')}</td>
    <td class="amount-cell ${t.sign > 0 ? 'positive' : 'negative'}">${t.sign > 0 ? '+' : '-'}${currency} ${fmt(t.amount)}</td>
  </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">No transactions in this period</td></tr>';
}

// ===== PDF DOWNLOAD =====
function downloadPDFReport() {
  if (!navigator.onLine) {
    showToast('Connect to the internet to download PDF reports', 'error');
    return;
  }
  const biz = DB.get('business') || {};
  const currency = biz.currency || 'KES';
  const from = val('report-from');
  const to = val('report-to');
  let incomes = getData('income');
  let expenses = getData('expenses');
  if (from) incomes = incomes.filter(i => i.date >= from);
  if (to) incomes = incomes.filter(i => i.date <= to);
  if (from) expenses = expenses.filter(e => e.date >= from);
  if (to) expenses = expenses.filter(e => e.date <= to);
  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const net = totalIncome - totalExpense;

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    let y = 20;

    // Header
    doc.setFillColor(10, 22, 40);
    doc.rect(0, 0, pw, 40, 'F');
    doc.setTextColor(42, 141, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(biz.name || 'LKC Accounting', 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(140, 168, 196);
    doc.setFont('helvetica', 'normal');
    doc.text('Profit & Loss Report', 14, 26);
    doc.text(`Period: ${from ? formatDate(from) : 'All'} — ${to ? formatDate(to) : 'All'}`, 14, 33);
    doc.setTextColor(42, 141, 255);
    doc.text('Generated: ' + new Date().toLocaleDateString(), pw - 14, 26, { align: 'right' });
    y = 52;

    // Summary box
    doc.setFillColor(26, 45, 66);
    doc.roundedRect(14, y, pw - 28, 40, 3, 3, 'F');
    doc.setFontSize(9);
    doc.setTextColor(140, 168, 196);
    doc.text('TOTAL INCOME', 22, y + 12);
    doc.text('TOTAL EXPENSES', 80, y + 12);
    doc.text('NET PROFIT / LOSS', 148, y + 12);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(24, 201, 126);
    doc.text(currency + ' ' + fmt(totalIncome), 22, y + 26);
    doc.setTextColor(240, 82, 99);
    doc.text(currency + ' ' + fmt(totalExpense), 80, y + 26);
    doc.setTextColor(net >= 0 ? 24 : 240, net >= 0 ? 201 : 82, net >= 0 ? 126 : 99);
    doc.text(currency + ' ' + fmt(net), 148, y + 26);
    y += 52;

    // Transactions
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(232, 237, 242);
    doc.text('Transactions', 14, y);
    y += 8;

    const all = [
      ...incomes.map(i => ({ date: i.date, type: 'Income', desc: i.desc, amount: i.amount, sign: 1 })),
      ...expenses.map(e => ({ date: e.date, type: 'Expense', desc: e.desc, amount: e.amount, sign: -1 }))
    ].sort((a, b) => b.date.localeCompare(a.date));

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(20, 34, 54);
    doc.rect(14, y, pw - 28, 8, 'F');
    doc.setTextColor(140, 168, 196);
    doc.text('DATE', 18, y + 5.5);
    doc.text('TYPE', 50, y + 5.5);
    doc.text('DESCRIPTION', 80, y + 5.5);
    doc.text('AMOUNT', pw - 18, y + 5.5, { align: 'right' });
    y += 10;

    doc.setFont('helvetica', 'normal');
    all.forEach((t, idx) => {
      if (y > 270) { doc.addPage(); y = 20; }
      if (idx % 2 === 0) { doc.setFillColor(26, 45, 66); doc.rect(14, y - 2, pw - 28, 8, 'F'); }
      doc.setTextColor(232, 237, 242);
      doc.text(formatDate(t.date), 18, y + 4);
      doc.setTextColor(t.sign > 0 ? 24 : 240, t.sign > 0 ? 201 : 82, t.sign > 0 ? 126 : 99);
      doc.text(t.type, 50, y + 4);
      doc.setTextColor(232, 237, 242);
      const descText = doc.splitTextToSize(t.desc, 80);
      doc.text(descText[0], 80, y + 4);
      doc.setTextColor(t.sign > 0 ? 24 : 240, t.sign > 0 ? 201 : 82, t.sign > 0 ? 126 : 99);
      doc.text((t.sign > 0 ? '+' : '-') + currency + ' ' + fmt(t.amount), pw - 18, y + 4, { align: 'right' });
      y += 9;
    });

    // Footer
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(86, 116, 146);
      doc.text(`${biz.name || 'LKC Accounting'} · Page ${i} of ${pages}`, pw / 2, 290, { align: 'center' });
    }

    doc.save(`${(biz.name || 'LKC').replace(/\s/g, '_')}_PL_Report_${from || 'all'}_to_${to || 'all'}.pdf`);
    showToast('PDF report downloaded', 'success');
  } catch(e) {
    showToast('PDF generation failed. Please try again.', 'error');
    console.error(e);
  }
}

function downloadInvoicePDF() {
  if (!navigator.onLine) { showToast('Connect to the internet to download PDF', 'error'); return; }
  const inv = getData('invoices').find(i => i.id === viewingInvoiceId);
  if (!inv) return;
  const biz = DB.get('business') || {};
  const currency = biz.currency || 'KES';
  const customers = getData('customers');
  const cust = customers.find(c => c.id === inv.customerId);
  generateDocPDF('INVOICE', inv.number, inv, biz, currency, cust, false);
}

function downloadReceiptPDF() {
  if (!navigator.onLine) { showToast('Connect to the internet to download PDF', 'error'); return; }
  const r = getData('receipts').find(r => r.id === viewingReceiptId);
  if (!r) return;
  const biz = DB.get('business') || {};
  const currency = biz.currency || 'KES';
  const customers = getData('customers');
  const cust = customers.find(c => c.id === r.customerId);
  generateDocPDF('RECEIPT', r.number, r, biz, currency, cust, true);
}

function generateDocPDF(type, number, doc, biz, currency, cust, isReceipt) {
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    let y = 20;

    // Header
    pdf.setFillColor(10, 22, 40);
    pdf.rect(0, 0, pw, 45, 'F');
    pdf.setTextColor(42, 141, 255);
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text(biz.name || 'LKC Accounting', 14, 18);
    pdf.setFontSize(9);
    pdf.setTextColor(140, 168, 196);
    pdf.setFont('helvetica', 'normal');
    if (biz.address) pdf.text(biz.address, 14, 25);
    if (biz.email) pdf.text(biz.email, 14, 30);
    if (biz.phone) pdf.text(biz.phone, 14, 35);

    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(232, 237, 242);
    pdf.text(type, pw - 14, 18, { align: 'right' });
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(140, 168, 196);
    pdf.text(`#${number}`, pw - 14, 26, { align: 'right' });
    pdf.text(`Date: ${formatDate(doc.date)}`, pw - 14, 32, { align: 'right' });
    if (!isReceipt && doc.dueDate) pdf.text(`Due: ${formatDate(doc.dueDate)}`, pw - 14, 38, { align: 'right' });

    y = 55;

    // Bill To
    if (cust || doc.custEmail) {
      pdf.setFillColor(26, 45, 66);
      pdf.roundedRect(14, y, 80, 30, 2, 2, 'F');
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(140, 168, 196);
      pdf.text(isReceipt ? 'RECEIVED FROM' : 'BILL TO', 20, y + 8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(232, 237, 242);
      pdf.setFontSize(10);
      pdf.text(cust ? cust.name : (doc.custEmail || ''), 20, y + 16);
      if (doc.custAddress) pdf.text(doc.custAddress, 20, y + 22, { maxWidth: 70 });
      if (doc.custEmail && !cust) pdf.text(doc.custEmail, 20, y + 28, { maxWidth: 70 });
      y += 38;
    }

    // Items table header
    pdf.setFillColor(20, 34, 54);
    pdf.rect(14, y, pw - 28, 9, 'F');
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(140, 168, 196);
    pdf.text('DESCRIPTION', 18, y + 6);
    pdf.text('QTY', pw - 80, y + 6);
    pdf.text('UNIT PRICE', pw - 60, y + 6);
    pdf.text('TOTAL', pw - 18, y + 6, { align: 'right' });
    y += 12;

    pdf.setFont('helvetica', 'normal');
    doc.items.forEach((item, idx) => {
      if (y > 260) { pdf.addPage(); y = 20; }
      if (idx % 2 === 0) { pdf.setFillColor(26, 45, 66); pdf.rect(14, y - 3, pw - 28, 9, 'F'); }
      pdf.setTextColor(232, 237, 242);
      pdf.setFontSize(9);
      pdf.text(item.desc || '', 18, y + 3, { maxWidth: pw - 100 });
      pdf.text(String(item.qty), pw - 80, y + 3);
      pdf.text(currency + ' ' + fmt(item.price), pw - 60, y + 3);
      pdf.text(currency + ' ' + fmt(item.total), pw - 18, y + 3, { align: 'right' });
      y += 10;
    });

    y += 4;
    // Totals
    pdf.setFillColor(26, 45, 66);
    pdf.roundedRect(pw - 80, y, 66, isReceipt ? 14 : (doc.taxRate ? 36 : 24), 2, 2, 'F');
    pdf.setFontSize(9);
    if (!isReceipt) {
      pdf.setTextColor(140, 168, 196);
      pdf.text('Subtotal', pw - 76, y + 8);
      pdf.setTextColor(232, 237, 242);
      pdf.text(currency + ' ' + fmt(doc.subtotal), pw - 18, y + 8, { align: 'right' });
      y += 10;
      if (doc.taxRate) {
        pdf.setTextColor(140, 168, 196);
        pdf.text(`Tax (${doc.taxRate}%)`, pw - 76, y + 8);
        pdf.setTextColor(232, 237, 242);
        pdf.text(currency + ' ' + fmt(doc.subtotal * doc.taxRate / 100), pw - 18, y + 8, { align: 'right' });
        y += 10;
      }
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(42, 141, 255);
    pdf.text('TOTAL', pw - 76, y + 8);
    pdf.text(currency + ' ' + fmt(doc.total), pw - 18, y + 8, { align: 'right' });

    if (doc.notes) {
      y += 20;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(140, 168, 196);
      pdf.text('Notes / Payment Terms:', 14, y);
      pdf.setTextColor(232, 237, 242);
      const lines = pdf.splitTextToSize(doc.notes, pw - 28);
      pdf.text(lines, 14, y + 7);
    }

    // Footer
    const pages = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(86, 116, 146);
      pdf.text(`${biz.name || 'LKC Accounting'} · ${type} ${number}`, pw / 2, 290, { align: 'center' });
    }

    pdf.save(`${(biz.name || 'LKC').replace(/\s/g, '_')}_${type}_${number}.pdf`);
    showToast(`${type} PDF downloaded`, 'success');
  } catch(e) {
    showToast('PDF generation failed', 'error');
    console.error(e);
  }
}

// ===== DASHBOARD =====
function renderDashboard() {
  const biz = DB.get('business') || {};
  const currency = biz.currency || 'KES';
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const monthIncome = getData('income').filter(i => {
    const d = new Date(i.date); return d.getMonth() === month && d.getFullYear() === year;
  }).reduce((s, i) => s + i.amount, 0);

  const monthExpense = getData('expenses').filter(e => {
    const d = new Date(e.date); return d.getMonth() === month && d.getFullYear() === year;
  }).reduce((s, e) => s + e.amount, 0);

  const outstanding = getData('invoices').filter(i => i.status !== 'paid').length;

  document.getElementById('dash-total-income').textContent = currency + ' ' + fmt(monthIncome);
  document.getElementById('dash-total-expense').textContent = currency + ' ' + fmt(monthExpense);
  const netEl = document.getElementById('dash-net-profit');
  const net = monthIncome - monthExpense;
  netEl.textContent = currency + ' ' + fmt(net);
  netEl.style.color = net >= 0 ? 'var(--success)' : 'var(--danger)';
  document.getElementById('dash-outstanding').textContent = outstanding;

  // Recent transactions
  const recentIncome = getData('income').map(i => ({ ...i, type: 'income' }));
  const recentExpenses = getData('expenses').map(e => ({ ...e, type: 'expense' }));
  const all = [...recentIncome, ...recentExpenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const list = document.getElementById('recent-transactions');
  if (list) {
    list.innerHTML = all.length ? all.map(t => `
      <div class="transaction-item">
        <div class="transaction-info">
          <span class="transaction-desc">${esc(t.desc)}</span>
          <span class="transaction-date">${formatDate(t.date)} · ${esc(t.category || '')}</span>
        </div>
        <span class="transaction-amount ${t.type === 'income' ? 'positive' : 'negative'}">
          ${t.type === 'income' ? '+' : '-'}${currency} ${fmt(t.amount)}
        </span>
      </div>
    `).join('') : '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px 0">No transactions yet</div>';
  }

  checkLowStock();
}

// ===== SETTINGS =====
function loadSettings() {
  const biz = DB.get('business') || {};
  setVal('set-biz-name', biz.name || '');
  setVal('set-owner', biz.owner || '');
  setVal('set-email', biz.email || '');
  setVal('set-phone', biz.phone || '');
  setVal('set-address', biz.address || '');
  const curr = document.getElementById('set-currency');
  if (curr) curr.value = biz.currency || 'KES';
  document.getElementById('sidebar-biz').textContent = biz.name || 'Business';
}

function saveSettings() {
  const biz = {
    name: val('set-biz-name'),
    owner: val('set-owner'),
    email: val('set-email'),
    phone: val('set-phone'),
    address: val('set-address'),
    currency: val('set-currency')
  };
  DB.set('business', biz);
  document.getElementById('sidebar-biz').textContent = biz.name || 'Business';
  showToast('Business information saved', 'success');
}

async function changePIN() {
  const current = val('set-current-pin');
  const newPin = val('set-new-pin');
  const confirm = val('set-confirm-pin');
  const pinHash = DB.get('pin_hash');
  const currentHash = await hashPin(current);
  if (currentHash !== pinHash) { showPinChangeMsg('Current PIN is incorrect', 'error'); return; }
  if (newPin.length < 4) { showPinChangeMsg('New PIN must be at least 4 digits', 'error'); return; }
  if (!/^\d+$/.test(newPin)) { showPinChangeMsg('PIN must contain digits only', 'error'); return; }
  if (newPin !== confirm) { showPinChangeMsg('New PINs do not match', 'error'); return; }
  const newHash = await hashPin(newPin);
  DB.set('pin_hash', newHash);
  clearForm(['set-current-pin', 'set-new-pin', 'set-confirm-pin']);
  showPinChangeMsg('PIN changed successfully', 'success');
}
function showPinChangeMsg(msg, type) {
  const el = document.getElementById('pin-change-msg');
  el.textContent = msg;
  el.className = type === 'success' ? 'success-msg' : 'error-msg';
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

function exportData() {
  const data = {
    business: DB.get('business'),
    income: getData('income'),
    expenses: getData('expenses'),
    invoices: getData('invoices'),
    receipts: getData('receipts'),
    inventory: getData('inventory'),
    customers: getData('customers'),
    exportDate: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const biz = DB.get('business') || {};
  a.download = `${(biz.name || 'LKC').replace(/\s/g, '_')}_backup_${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported successfully', 'success');
}

function confirmClearData() {
  confirmDelete('This will permanently delete ALL your data including income, expenses, invoices, inventory and customers. This cannot be undone. Are you absolutely sure?', () => {
    ['income','expenses','invoices','receipts','inventory','customers'].forEach(key => DB.del(key));
    renderDashboard();
    showToast('All data cleared', 'success');
  });
}

// ===== UTILITIES =====
function nextDocNumber(type, prefix) {
  const items = getData(type);
  const nums = items.map(i => {
    const match = (i.number || '').match(/(\d+)$/);
    return match ? parseInt(match[1]) : 0;
  });
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

function confirmDelete(msg, callback) {
  deleteCallback = callback;
  document.getElementById('delete-confirm-msg').textContent = msg;
  document.getElementById('delete-confirm-btn').onclick = () => {
    if (deleteCallback) deleteCallback();
    closeModal('delete-modal');
    deleteCallback = null;
  };
  document.getElementById('delete-modal').classList.remove('hidden');
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3500);
}

function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function esc(str) { if (!str) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmt(n) { return Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function today() { return new Date().toISOString().slice(0, 10); }
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

// ===== SERVICE WORKER REGISTRATION =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
