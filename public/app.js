/**
 * app.js — Income/Expense Tracker Frontend
 * Supports dual mode: API (Express backend) and LocalStorage (fallback)
 * Click the mode badge at bottom-right to switch modes.
 */

// ============================================================
// Configuration
// ============================================================
const CONFIG = {
  API_BASE: '/api',
  LS_KEY: 'transactions',
  MODE_KEY: 'app_mode',
  MODES: { API: 'api', LOCAL: 'local' },
};

// ============================================================
// State
// ============================================================
let state = {
  transactions: [],
  currentMode: CONFIG.MODES.API,
  filter: 'all',         // 'all' | 'income' | 'expense'
  searchQuery: '',
  editingId: null,
};

// ============================================================
// DOM References
// ============================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const DOM = {
  form:       $('#transactionForm'),
  editId:     $('#editId'),
  typeIn:     $('#typeIncome'),
  typeOut:    $('#typeExpense'),
  category:   $('#category'),
  amount:     $('#amount'),
  date:       $('#date'),
  note:       $('#note'),
  submitBtn:  $('#submitBtn'),
  submitText: $('#submitBtnText'),
  formTitle:  $('#formTitle'),
  cancelBtn:  $('#cancelEditBtn'),

  tableBody:  $('#transactionBody'),
  emptyState: $('#emptyState'),

  balance:        $('#balanceAmount'),
  totalIncome:    $('#totalIncome'),
  totalExpense:   $('#totalExpense'),
  totalTx:        $('#totalTransactions'),
  monthCount:     $('#monthCount'),

  filterBtns: $$('.filter-btn-group .btn'),
  searchInput: $('#searchInput'),

  modeBadge: $('#modeBadge'),
  modeText:  $('#modeText'),

  clearAllBtn: $('#clearAllBtn'),

  // Delete modal
  deleteModalEl: $('#deleteModal'),
  confirmDeleteBtn: $('#confirmDeleteBtn'),
};

// ============================================================
// Toast System
// ============================================================
function showToast(message, type = 'success') {
  const container = $('.toast-container');
  const id = 'toast-' + Date.now();
  const colors = {
    success: 'bg-success text-white',
    error:   'bg-danger text-white',
    warning: 'bg-warning text-dark',
    info:    'bg-info text-dark',
  };
  const bgClass = colors[type] || colors.info;
  // Use Bootstrap Toast via manual HTML
  const html = `
    <div id="${id}" class="toast align-items-center ${bgClass} border-0" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="3000">
      <div class="d-flex">
        <div class="toast-body">
          ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', html);
  const toastEl = document.getElementById(id);
  const toast = new bootstrap.Toast(toastEl);
  toast.show();
  // Clean up after hidden
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

// ============================================================
// Mode Management
// ============================================================
function getStoredMode() {
  return localStorage.getItem(CONFIG.MODE_KEY) || CONFIG.MODES.API;
}

function setStoredMode(mode) {
  localStorage.setItem(CONFIG.MODE_KEY, mode);
}

function updateModeUI() {
  const isApi = state.currentMode === CONFIG.MODES.API;
  DOM.modeBadge.className = `mode-badge ${isApi ? 'bg-dark' : 'bg-warning text-dark'}`;
  DOM.modeText.textContent = isApi ? 'API' : 'Local';
  DOM.modeBadge.querySelector('i').className = isApi ? 'bi bi-cloud me-1' : 'bi bi-database me-1';
}

async function toggleMode() {
  const newMode = state.currentMode === CONFIG.MODES.API ? CONFIG.MODES.LOCAL : CONFIG.MODES.API;
  state.currentMode = newMode;
  setStoredMode(newMode);
  updateModeUI();
  await loadTransactions();
  showToast(`เปลี่ยนเป็นโหมด ${newMode === 'api' ? 'API (Backend)' : 'LocalStorage'}`, 'info');
}

// ============================================================
// API Service Layer
// ============================================================
const API = {
  async fetchAll() {
    const res = await fetch(`${CONFIG.API_BASE}/transactions`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async create(data) {
    const res = await fetch(`${CONFIG.API_BASE}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.errors?.join(', ') || `HTTP ${res.status}`);
    return json;
  },

  async update(id, data) {
    const res = await fetch(`${CONFIG.API_BASE}/transactions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.errors?.join(', ') || `HTTP ${res.status}`);
    return json;
  },

  async remove(id) {
    const res = await fetch(`${CONFIG.API_BASE}/transactions/${id}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  },
};

// ============================================================
// LocalStorage Service
// ============================================================
const LocalDB = {
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.LS_KEY)) || [];
    } catch {
      return [];
    }
  },

  saveAll(items) {
    localStorage.setItem(CONFIG.LS_KEY, JSON.stringify(items));
  },

  _nextId(items) {
    return items.length > 0 ? String(Math.max(...items.map((i) => Number(i.id))) + 1) : '1';
  },

  _now() {
    return new Date().toISOString();
  },

  create(data) {
    const items = this.getAll();
    const now = this._now();
    const item = {
      id: this._nextId(items),
      type: data.type,
      category: data.category.trim(),
      amount: data.amount,
      date: data.date,
      note: data.note || '',
      createdAt: now,
      updatedAt: now,
    };
    items.push(item);
    this.saveAll(items);
    return item;
  },

  update(id, data) {
    const items = this.getAll();
    const idx = items.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error('Transaction not found');
    const existing = items[idx];
    const updated = {
      ...existing,
      type: data.type !== undefined ? data.type : existing.type,
      category: data.category !== undefined ? data.category.trim() : existing.category,
      amount: data.amount !== undefined ? data.amount : existing.amount,
      date: data.date !== undefined ? data.date : existing.date,
      note: data.note !== undefined ? data.note : existing.note,
      updatedAt: this._now(),
    };
    items[idx] = updated;
    this.saveAll(items);
    return updated;
  },

  remove(id) {
    const items = this.getAll();
    const idx = items.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error('Transaction not found');
    const removed = items.splice(idx, 1)[0];
    this.saveAll(items);
    return removed;
  },

  clearAll() {
    localStorage.removeItem(CONFIG.LS_KEY);
  },
};

// ============================================================
// Data Access (switches between API and LocalStorage)
// ============================================================
async function loadTransactions() {
  if (state.currentMode === CONFIG.MODES.API) {
    try {
      state.transactions = await API.fetchAll();
    } catch (err) {
      console.warn('API unavailable, switching to LocalStorage:', err.message);
      state.currentMode = CONFIG.MODES.LOCAL;
      setStoredMode(CONFIG.MODES.LOCAL);
      updateModeUI();
      state.transactions = LocalDB.getAll();
      showToast('Backend ไม่ตอบสนอง สลับไปใช้ LocalStorage อัตโนมัติ', 'warning');
    }
  } else {
    state.transactions = LocalDB.getAll();
  }
  render();
}

async function createTransaction(data) {
  let result;
  if (state.currentMode === CONFIG.MODES.API) {
    try {
      result = await API.create(data);
    } catch (err) {
      showToast('API Error: ' + err.message, 'error');
      return false;
    }
  } else {
    try {
      result = LocalDB.create(data);
    } catch (err) {
      showToast('Local Error: ' + err.message, 'error');
      return false;
    }
  }
  await loadTransactions();
  showToast('เพิ่มรายการสำเร็จ', 'success');
  return true;
}

async function updateTransaction(id, data) {
  let result;
  if (state.currentMode === CONFIG.MODES.API) {
    try {
      result = await API.update(id, data);
    } catch (err) {
      showToast('API Error: ' + err.message, 'error');
      return false;
    }
  } else {
    try {
      result = LocalDB.update(id, data);
    } catch (err) {
      showToast('Local Error: ' + err.message, 'error');
      return false;
    }
  }
  await loadTransactions();
  showToast('แก้ไขรายการสำเร็จ', 'success');
  return true;
}

async function deleteTransaction(id) {
  if (state.currentMode === CONFIG.MODES.API) {
    try {
      await API.remove(id);
    } catch (err) {
      showToast('API Error: ' + err.message, 'error');
      return false;
    }
  } else {
    try {
      LocalDB.remove(id);
    } catch (err) {
      showToast('Local Error: ' + err.message, 'error');
      return false;
    }
  }
  await loadTransactions();
  showToast('ลบรายการสำเร็จ', 'success');
  return true;
}

function clearAllTransactions() {
  if (state.currentMode === CONFIG.MODES.API) {
    // For API mode, delete one by one
    (async () => {
      for (const tx of state.transactions) {
        try { await API.remove(tx.id); } catch {}
      }
      await loadTransactions();
      showToast('ลบข้อมูลทั้งหมดแล้ว', 'info');
    })();
  } else {
    LocalDB.clearAll();
    loadTransactions();
    showToast('ลบข้อมูลทั้งหมดแล้ว', 'info');
  }
}

// ============================================================
// Helpers
// ============================================================
function formatNumber(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function isCurrentMonth(iso) {
  if (!iso) return false;
  const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function getFilteredTransactions() {
  let list = [...state.transactions];

  // Filter by type
  if (state.filter !== 'all') {
    list = list.filter((t) => t.type === state.filter);
  }

  // Search
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((t) =>
      (t.category && t.category.toLowerCase().includes(q)) ||
      (t.note && t.note.toLowerCase().includes(q)) ||
      (t.amount && String(t.amount).includes(q))
    );
  }

  // Sort by date descending, then by createdAt descending
  list.sort((a, b) => {
    const dateCmp = (b.date || '').localeCompare(a.date || '');
    if (dateCmp !== 0) return dateCmp;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });

  return list;
}

function calculateSummary(list) {
  let income = 0, expense = 0;
  let monthTx = 0;
  for (const t of list) {
    if (t.type === 'income') income += Number(t.amount) || 0;
    else expense += Number(t.amount) || 0;
    if (isCurrentMonth(t.date)) monthTx++;
  }
  return {
    balance: income - expense,
    totalIncome: income,
    totalExpense: expense,
    totalTx: list.length,
    monthCount: monthTx,
  };
}

// ============================================================
// Rendering
// ============================================================
function render() {
  const filtered = getFilteredTransactions();
  const summary = calculateSummary(state.transactions);

  // Update summary card
  DOM.balance.textContent = formatNumber(summary.balance);
  DOM.balance.className = 'balance-amount ' + (summary.balance >= 0 ? '' : 'text-warning');
  DOM.totalIncome.textContent = formatNumber(summary.totalIncome);
  DOM.totalExpense.textContent = formatNumber(summary.totalExpense);
  DOM.totalTx.textContent = summary.totalTx;
  DOM.monthCount.textContent = summary.monthCount;

  // Render table
  const tbody = DOM.tableBody;
  if (filtered.length === 0) {
    tbody.innerHTML = '';
    DOM.emptyState.style.display = 'block';
    return;
  }
  DOM.emptyState.style.display = 'none';

  tbody.innerHTML = filtered
    .map((tx) => {
      const isIncome = tx.type === 'income';
      const badgeClass = isIncome ? 'badge-income' : 'badge-expense';
      const iconClass = isIncome ? 'bi-arrow-up-circle' : 'bi-arrow-down-circle';
      const typeLabel = isIncome ? 'รายรับ' : 'รายจ่าย';
      const amountClass = isIncome ? 'income-color' : 'expense-color';
      const sign = isIncome ? '+' : '-';

      return `
        <tr>
          <td class="ps-3">${formatDate(tx.date)}</td>
          <td><span class="badge ${badgeClass}"><i class="bi ${iconClass}"></i> ${typeLabel}</span></td>
          <td>${escapeHtml(tx.category)}</td>
          <td class="text-muted small">${escapeHtml(tx.note || '-')}</td>
          <td class="text-end pe-3 fw-semibold ${amountClass}">${sign}฿${formatNumber(tx.amount)}</td>
          <td class="text-center">
            <button class="btn btn-sm btn-outline-primary btn-action me-1 btn-edit" data-id="${tx.id}" title="แก้ไข">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger btn-action btn-delete" data-id="${tx.id}" title="ลบ">
              <i class="bi bi-trash3"></i>
            </button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================
// Form Logic
// ============================================================
function resetForm() {
  DOM.form.reset();
  DOM.editId.value = '';
  state.editingId = null;
  DOM.formTitle.textContent = 'เพิ่มรายการ';
  DOM.submitText.textContent = 'บันทึก';
  DOM.submitBtn.className = 'btn btn-primary';
  DOM.cancelBtn.classList.add('d-none');
  DOM.form.classList.remove('was-validated');
  // Set default date to today
  DOM.date.value = new Date().toISOString().split('T')[0];
}

function populateForm(tx) {
  DOM.editId.value = tx.id;
  state.editingId = tx.id;
  if (tx.type === 'income') {
    DOM.typeIn.checked = true;
  } else {
    DOM.typeOut.checked = true;
  }
  DOM.category.value = tx.category;
  DOM.amount.value = tx.amount;
  DOM.date.value = tx.date ? tx.date.split('T')[0] : '';
  DOM.note.value = tx.note || '';
  DOM.formTitle.textContent = 'แก้ไขรายการ';
  DOM.submitText.textContent = 'บันทึกการแก้ไข';
  DOM.submitBtn.className = 'btn btn-warning';
  DOM.cancelBtn.classList.remove('d-none');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleCancelEdit() {
  resetForm();
}

async function handleFormSubmit(e) {
  e.preventDefault();
  DOM.form.classList.add('was-validated');

  // HTML5 validation
  if (!DOM.form.checkValidity()) {
    return;
  }

  const type = DOM.typeIn.checked ? 'income' : 'expense';
  const category = DOM.category.value;
  const amount = parseFloat(DOM.amount.value);
  const date = DOM.date.value;
  const note = DOM.note.value.trim();

  const data = { type, category, amount, date, note };

  const editingId = DOM.editId.value;
  if (editingId) {
    const ok = await updateTransaction(editingId, data);
    if (ok) resetForm();
  } else {
    const ok = await createTransaction(data);
    if (ok) resetForm();
  }
}

// ============================================================
// Delete Modal
// ============================================================
let deleteTargetId = null;
let deleteModalInstance = null;

function openDeleteModal(id) {
  deleteTargetId = id;
  if (!deleteModalInstance) {
    deleteModalInstance = new bootstrap.Modal(DOM.deleteModalEl);
  }
  deleteModalInstance.show();
}

function handleConfirmDelete() {
  if (deleteTargetId) {
    deleteTransaction(deleteTargetId);
    deleteTargetId = null;
  }
  if (deleteModalInstance) {
    deleteModalInstance.hide();
  }
}

// ============================================================
// Event Listeners
// ============================================================
function initEventListeners() {
  // Form submit
  DOM.form.addEventListener('submit', handleFormSubmit);

  // Cancel edit
  DOM.cancelBtn.addEventListener('click', handleCancelEdit);

  // Table actions (delegated)
  DOM.tableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.classList.contains('btn-edit')) {
      const id = btn.dataset.id;
      const tx = state.transactions.find((t) => t.id === id);
      if (tx) {
        populateForm(tx);
      }
    } else if (btn.classList.contains('btn-delete')) {
      const id = btn.dataset.id;
      openDeleteModal(id);
    }
  });

  // Delete confirm
  DOM.confirmDeleteBtn.addEventListener('click', handleConfirmDelete);

  // Filter buttons
  DOM.filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      DOM.filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      render();
    });
  });

  // Search input
  DOM.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    render();
  });

  // Mode toggle
  DOM.modeBadge.addEventListener('click', toggleMode);

  // Clear all
  DOM.clearAllBtn.addEventListener('click', () => {
    if (state.transactions.length === 0) {
      showToast('ไม่มีรายการให้ลบ', 'warning');
      return;
    }
    if (confirm('แน่ใจหรือไม่ว่าต้องการลบข้อมูลทั้งหมด?\nการดำเนินการนี้ไม่สามารถย้อนกลับได้')) {
      clearAllTransactions();
    }
  });

  // Keyboard shortcut: Escape to cancel edit
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.editingId) {
      handleCancelEdit();
    }
  });
}

// ============================================================
// Init
// ============================================================
async function init() {
  // Restore mode
  state.currentMode = getStoredMode();
  updateModeUI();

  // Set default date
  DOM.date.value = new Date().toISOString().split('T')[0];

  // Init event listeners
  initEventListeners();

  // Load data
  await loadTransactions();
}

// Start
init();