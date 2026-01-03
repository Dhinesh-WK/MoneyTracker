/* ===== App Data & Helpers ===== */
const CATEGORIES = {
    'for-myself': 'Spend',
    'gave-money': 'Gave Money',
    'borrowed': 'Borrowed',
    'donated': 'Donated',
    'invested': 'Invested'
};

const getStore = () => JSON.parse(localStorage.getItem('pm_txs') || '{}');
const setStore = (s) => localStorage.setItem('pm_txs', JSON.stringify(s));

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ===== Elements ===== */
const app = document.getElementById('app');
const navItems = Array.from(document.querySelectorAll('.nav-item'));
const currentCategoryEl = document.getElementById('currentCategory');
const subStats = document.getElementById('subStats');
const totalAmountEl = document.getElementById('totalAmount');
const cashList = document.getElementById('cashList');
const onlineList = document.getElementById('onlineList');

const txForm = document.getElementById('txForm');
const modeOnlineBtn = document.getElementById('modeOnline');
const modeCashBtn = document.getElementById('modeCash');
const txTypeEl = document.getElementById('txType');
const amountEl = document.getElementById('amount');
const toWhomEl = document.getElementById('toWhom');
const dateTimeEl = document.getElementById('dateTime');
const whyEl = document.getElementById('why');
const categorySelect = document.getElementById('categorySelect');
const modeSelect = document.getElementById('modeSelect');

const resetBtn = document.getElementById('resetBtn');
const clearAllBtn = document.getElementById('clearAll');
const showAllBtn = document.getElementById('showAll');

const toastsWrap = document.getElementById('toasts');

let currentCategory = 'for-myself';

// Total balance 
let totalBalance = Number(localStorage.getItem('pm_balance') || 0);

function updateBalanceUI() {
    document.getElementById('userBalance').innerText = `₹${totalBalance.toFixed(2)}`;
}

/* ===== UX / Toasts ===== */
function toast({ text = '', type = 'success', ttl = 3000 }) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'success');
    el.innerText = text;
    toastsWrap.appendChild(el);
    setTimeout(() => { el.style.opacity = 0; el.style.transform = 'translateY(6px)'; }, ttl - 400);
    setTimeout(() => el.remove(), ttl);
}

/* ===== Mode switch (online/cash) ===== */
modeOnlineBtn.addEventListener('click', () => { setMode('online'); });
modeCashBtn.addEventListener('click', () => { setMode('cash'); });

function setMode(m) {
    txTypeEl.value = m;
    modeOnlineBtn.classList.toggle('active', m === 'online');
    modeCashBtn.classList.toggle('active', m === 'cash');
    modeSelect.value = m;
}

// nav clicks
navItems.forEach(btn => {
    btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat');
        setCategory(cat);

        const navMenu = document.getElementById("navMenu");
        navMenu.classList.remove("active");
    });
});

function setCategory(cat) {
    currentCategory = cat;
    currentCategoryEl.innerText = CATEGORIES[cat] || cat;
    navItems.forEach(n => n.classList.toggle('active', n.getAttribute('data-cat') === cat));
    renderTransactions();
}

/* ===== Balance Modal ===== */
const balanceModal = document.getElementById('balanceModal');
const addBalanceBtn = document.getElementById('addBalanceBtn');
const saveBalance = document.getElementById('saveBalance');
const closeBalance = document.getElementById('closeBalance');
const balanceInput = document.getElementById('balanceInput');

addBalanceBtn.addEventListener('click', () => {
    balanceModal.style.display = "flex";
});

closeBalance.addEventListener('click', () => {
    balanceModal.style.display = "none";
    balanceInput.value = "";
});

saveBalance.addEventListener('click', () => {
    const amt = Number(balanceInput.value);
    if (amt > 0) {
        totalBalance += amt;
        localStorage.setItem('pm_balance', totalBalance);
        updateBalanceUI();
        toast({ text: "Balance Added", type: "success" });
    }
    balanceModal.style.display = "none";
    balanceInput.value = "";
});

// store current editing tx
let editingTxId = null;

/* ===== Initialize App ===== */
(function init() {
    setCategory(currentCategory);
    txForm.addEventListener('submit', handleSubmit);

    resetBtn.addEventListener('click', () => txForm.reset());

    //clearAllBtn.addEventListener('click', () => {
    //    if (confirm('Clear all transactions?')) {
    //         localStorage.removeItem('pm_txs');
    //         renderTransactions();
    //         toast({ text: 'All data cleared', type: 'error' });
    //     }
    // });

    //showAllBtn.addEventListener('click', () => {
    //    setCategory('for-myself');
    //    renderAll();
    //    toast({ text: 'Showing all categories in console', type: 'success', ttl: 2000 });
    //    console.log(getStore());
    //});

    dateTimeEl.value = new Date().toISOString().slice(0, 16);
    renderTransactions();
    updateBalanceUI();
})();

/* ===== Form Handling & Validation ===== */
function validateForm(data) {
    const errors = [];
    if (!data.amount || isNaN(Number(data.amount)) || Number(data.amount) <= 0) errors.push('Enter a valid amount (> 0)');
    if (!data.toWhom || data.toWhom.trim().length < 1) errors.push('Enter recipient');
    if (!data.dateTime) errors.push('Enter date & time');
    if (!data.why || data.why.trim().length < 3) errors.push('Add a short reason (min 3 chars)');
    if (!Object.keys(CATEGORIES).includes(data.category)) errors.push('Select a category');
    return errors;
}

function handleSubmit(ev) {
    ev.preventDefault();

    const payload = {
        id: editingTxId || uid(),
        amount: Number(amountEl.value),
        toWhom: toWhomEl.value.trim(),
        dateTime: dateTimeEl.value,
        why: whyEl.value.trim(),
        category: categorySelect.value,
        type: txTypeEl.value,
        mode: modeSelect.value
    };

    const errs = validateForm(payload);
    if (errs.length) {
        toast({ text: errs[0], type: 'error', ttl: 3500 });
        return;
    }

    const store = getStore();
    if (!store[payload.category]) store[payload.category] = { cash: [], online: [] };
    const bucket = payload.type === 'cash' ? 'cash' : 'online';

    /* ========== EDIT TRANSACTION ========== */
    if (editingTxId) {
        for (const b of ['cash', 'online']) {
            const idx = store[payload.category][b].findIndex(t => t.id === editingTxId);
            if (idx !== -1) {

                const oldTx = store[payload.category][b][idx];

                // 1) Revert OLD amount effect
                if (oldTx.category === "borrowed") {
                    totalBalance -= Number(oldTx.amount);   // borrowed → added earlier, so remove it
                } else {
                    totalBalance += Number(oldTx.amount);   // all others subtract → add it back
                }

                // 2) Apply NEW amount effect
                if (payload.category === "borrowed") {
                    totalBalance += payload.amount;   // borrowed → add balance
                } else {
                    totalBalance -= payload.amount;   // others → subtract
                }

                // 3) Update stored transaction
                store[payload.category][b][idx] = payload;
                break;
            }
        }

        toast({ text: 'Transaction updated', type: 'success' });

    } else {

        /* ========== NEW TRANSACTION ========== */
        store[payload.category][bucket].unshift(payload);

        if (payload.category === "borrowed") {
            totalBalance += payload.amount;   // borrowed → add
        } else {
            totalBalance -= payload.amount;   // others → subtract
        }

        toast({ text: 'Transaction saved', type: 'success' });
    }

    setStore(store);
    localStorage.setItem('pm_balance', totalBalance);
    updateBalanceUI();

    txForm.reset();
    dateTimeEl.value = new Date().toISOString().slice(0, 16);
    editingTxId = null;

    renderTransactions();
}


/* ===== Render Transactions ===== */
function renderTransactions() {
    const store = getStore();
    const categoryData = store[currentCategory] || { cash: [], online: [] };

    const cashCount = categoryData.cash.length;
    const onlineCount = categoryData.online.length;
    subStats.innerText = `Hand Cash: ${cashCount} | Online: ${onlineCount}`;

    const total = [...categoryData.cash, ...categoryData.online].reduce((s, i) => s + Number(i.amount), 0);
    totalAmountEl.innerText = `₹${total.toFixed(2)}`;

    cashList.innerHTML = '';
    onlineList.innerHTML = '';

    if (categoryData.cash.length === 0) cashList.innerHTML = '<div class="empty">No hand cash transactions</div>';
    else categoryData.cash.forEach(tx => { cashList.appendChild(renderTx(tx)); });

    if (categoryData.online.length === 0) onlineList.innerHTML = '<div class="empty">No online transactions</div>';
    else categoryData.online.forEach(tx => { onlineList.appendChild(renderTx(tx)); });
}

function renderTx(tx) {
    const el = document.createElement('div');
    el.className = 'tx tx-enter';
    const date = tx.dateTime ? new Date(tx.dateTime) : new Date();

    el.innerHTML = `
    <div class="tx-item-main">
      <div class="tx-item-info">
        <div class="tx-item-title-row">
          <h5 class="tx-item-title">${escapeHtml(tx.toWhom)}</h5>
          <span class="tx-item-amount ${Number(tx.amount) >= 0 ? 'tx-item-amount--negative' : 'tx-item-amount--positive'
        }">
            ₹${Math.abs(Number(tx.amount)).toFixed(0)}
          </span>
        </div>
        <div class="tx-item-meta-row">
          <span class="tx-item-datetime">${date.toLocaleString()}</span>
        </div>
        <p class="tx-item-notes">${escapeHtml(tx.why)}</p>
      </div>
    </div>
    <div class="tx-item-actions">
      <button class="btn tx-btn-secondary edit-btn" data-id="${tx.id}" data-type="${tx.type}">Edit</button>
      <button class="btn tx-btn-danger del-btn" data-id="${tx.id}" data-type="${tx.type}">Delete</button>
    </div>
    <div class="tx-divider"></div>
  `;

    el.querySelectorAll('button').forEach(b =>
        b.addEventListener('click', () => {
            const id = b.getAttribute('data-id');
            const action = b.innerText.toLowerCase();
            if (action === 'delete') deleteTx(id, b.getAttribute('data-type'));
            else editTx(id);
        })
    );

    return el;
}

function escapeHtml(s) { return String(s).replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }

function deleteTx(id) {
    if (!confirm('Delete transaction?')) return;

    const store = getStore();
    const catData = store[currentCategory] || { cash: [], online: [] };

    let deletedTx = null;

    // find & remove tx from both buckets
    ['cash', 'online'].forEach(bucket => {
        const idx = catData[bucket].findIndex(t => t.id === id);
        if (idx !== -1) {
            deletedTx = catData[bucket][idx];
            catData[bucket].splice(idx, 1);
        }
    });

    if (!deletedTx) {
        toast({ text: 'Transaction not found', type: 'error' });
        return;
    }

    // 🔁 REVERSE balance effect
    if (deletedTx.category === "borrowed") {
        totalBalance -= Number(deletedTx.amount);
    } else {
        totalBalance += Number(deletedTx.amount);
    }

    // persist
    store[currentCategory] = catData;
    setStore(store);
    localStorage.setItem('pm_balance', totalBalance);

    updateBalanceUI();
    renderTransactions();

    toast({ text: 'Transaction deleted', type: 'error' });
}


function editTx(id) {
    const store = getStore();
    const catData = store[currentCategory] || { cash: [], online: [] };
    let foundTx = null;

    // find & remove transaction
    ['cash', 'online'].forEach(bucket => {
        const idx = catData[bucket].findIndex(t => t.id === id);
        if (idx !== -1) {
            foundTx = catData[bucket][idx];
            catData[bucket].splice(idx, 1);
        }
    });

    if (!foundTx) {
        toast({ text: 'Transaction not found', type: 'error' });
        return;
    }

    /* 🔁 REVERT BALANCE EFFECT */
    if (foundTx.category === "borrowed") {
        totalBalance -= Number(foundTx.amount);
    } else {
        totalBalance += Number(foundTx.amount);
    }

    // persist changes
    store[currentCategory] = catData;
    setStore(store);
    localStorage.setItem('pm_balance', totalBalance);
    updateBalanceUI();
    renderTransactions();

    /* 📝 LOAD FORM VALUES */
    amountEl.value = foundTx.amount;
    toWhomEl.value = foundTx.toWhom;
    dateTimeEl.value = foundTx.dateTime;
    whyEl.value = foundTx.why;
    categorySelect.value = foundTx.category;
    setMode(foundTx.type);

    // IMPORTANT: treat as NEW transaction
    editingTxId = null;

    toast({ text: 'Edit mode: update & save', type: 'success' });
}


/* ===== Utility: renderAll (debug) ===== */
function renderAll() { console.log('ALL DATA:', getStore()); }

// small accessibility: pressing Enter in mode toggles form
document.addEventListener('keydown', (e) => {
    if (e.key === '/' && (e.target === document.body)) {
        e.preventDefault(); document.getElementById('amount').focus();
    }
});


// Nav Bar menu

document.addEventListener("DOMContentLoaded", () => {
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const navMenu = document.getElementById("navMenu");



    if (hamburgerBtn && navMenu) {
        hamburgerBtn.addEventListener("click", () => {
            navMenu.classList.toggle("active");
        });

        

        document.addEventListener("click", (e) => {
            if (!hamburgerBtn.contains(e.target) && !navMenu.contains(e.target)) {
                navMenu.classList.remove("active");
            }
        });
    }
});




