// ============================================================
//  Database setup (Dexie wraps the browser's IndexedDB)
// ============================================================

const db = new Dexie('pantryApp');

// Only the fields listed here are indexed (searchable with .where()).
// You can still store any other fields on the objects.
db.version(1).stores({
  items: '++id, name, category, location, expiry',
  shopping: '++id, name, checked'
});

const SOON_DAYS = 3; // what counts as "expiring soon"


// ============================================================
//  Small helpers
// ============================================================

function $(id) {
  return document.getElementById(id);
}

function todayString() {
  // "YYYY-MM-DD" in local time (toISOString would use UTC)
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function daysUntil(dateString) {
  const today = new Date(todayString());
  const target = new Date(dateString);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function formatDate(dateString) {
  const [y, m, d] = dateString.split('-');
  return `${d}.${m}.${y}`;
}

function expiryText(dateString) {
  const days = daysUntil(dateString);
  if (days < 0) return `expired ${-days} day${days === -1 ? '' : 's'} ago`;
  if (days === 0) return 'expires today';
  if (days === 1) return 'expires tomorrow';
  return `expires ${formatDate(dateString)}`;
}

function expiryClass(dateString) {
  if (!dateString) return '';
  const days = daysUntil(dateString);
  if (days < 0) return 'expired';
  if (days <= SOON_DAYS) return 'soon';
  return '';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message) {
  let toast = $('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (toast.hidden = true), 2200);
}


// ============================================================
//  Tabs
// ============================================================

const tabTitles = {
  pantry: 'Pantry',
  expiring: 'Expiring soon',
  shopping: 'Shopping list',
  settings: 'Settings'
};

let currentTab = 'pantry';

document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  currentTab = tab;

  document.querySelectorAll('nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.tab').forEach(section => {
    section.classList.toggle('active', section.id === 'tab-' + tab);
  });

  $('page-title').textContent = tabTitles[tab];
  // the + button only makes sense on the pantry and expiring tabs
  $('add-btn').hidden = !(tab === 'pantry' || tab === 'expiring');
}


// ============================================================
//  Pantry
// ============================================================

function itemRow(item) {
  let meta = `${item.qty} ${item.unit} · ${item.location}`;
  if (item.expiry) {
    meta += ` · <span class="exp">${expiryText(item.expiry)}</span>`;
  }

  // Buttons: calendar reminder (only if there is an expiry date),
  // "used up" (moves it to the shopping list), edit
  return `
    <div class="item ${expiryClass(item.expiry)}">
      <div class="item-main">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-meta">${meta}</div>
      </div>
      <div class="item-actions">
        ${item.expiry ? `<button class="icon-btn" data-action="remind" data-id="${item.id}" aria-label="Add reminder">🔔</button>` : ''}
        <button class="icon-btn" data-action="used" data-id="${item.id}" aria-label="Used up">✓</button>
        <button class="icon-btn" data-action="edit" data-id="${item.id}" aria-label="Edit">✎</button>
      </div>
    </div>`;
}

async function renderPantry() {
  const search = $('search').value.trim().toLowerCase();
  let items = await db.items.orderBy('name').toArray();

  if (search) {
    items = items.filter(i => i.name.toLowerCase().includes(search));
  }

  if (items.length === 0) {
    $('pantry-list').innerHTML = `<p class="empty">${search ? 'Nothing found.' : 'Your pantry is empty. Tap + to add something.'}</p>`;
    return;
  }

  // Group by location: Fridge, Freezer, Pantry
  const groups = {};
  for (const item of items) {
    if (!groups[item.location]) groups[item.location] = [];
    groups[item.location].push(item);
  }

  let html = '';
  for (const location of ['Fridge', 'Freezer', 'Pantry']) {
    if (!groups[location]) continue;
    html += `<div class="group-title">${location}</div>`;
    html += groups[location].map(itemRow).join('');
  }
  $('pantry-list').innerHTML = html;
}

async function renderExpiring() {
  // Everything with an expiry date up to SOON_DAYS from now (expired ones included)
  const limit = new Date(todayString());
  limit.setDate(limit.getDate() + SOON_DAYS);
  const limitString = limit.toISOString().slice(0, 10);

  const items = await db.items
    .where('expiry').belowOrEqual(limitString)
    .and(i => i.expiry !== '')
    .sortBy('expiry');

  $('expiring-list').innerHTML = items.length
    ? items.map(itemRow).join('')
    : '<p class="empty">Nothing is about to expire. 👍</p>';

  // Red badge on the tab button
  const badge = $('expiring-count');
  badge.textContent = items.length;
  badge.hidden = items.length === 0;
}

$('search').addEventListener('input', renderPantry);

// One click handler for both lists (event delegation)
for (const listId of ['pantry-list', 'expiring-list']) {
  $(listId).addEventListener('click', async e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const id = Number(btn.dataset.id);
    const item = await db.items.get(id);
    if (!item) return;

    if (btn.dataset.action === 'edit') openDialog(item);
    if (btn.dataset.action === 'remind') addCalendarReminder(item);
    if (btn.dataset.action === 'used') markUsedUp(item);
  });
}

async function markUsedUp(item) {
  const addToList = confirm(`"${item.name}" is used up.\n\nAdd it to the shopping list?`);
  await db.items.delete(item.id);
  if (addToList) {
    await db.shopping.add({ name: item.name, checked: 0 });
  }
  showToast(addToList ? 'Moved to shopping list' : 'Removed');
  refreshAll();
}


// ============================================================
//  Add / edit dialog
// ============================================================

const dialog = $('item-dialog');

$('add-btn').addEventListener('click', () => openDialog(null));
$('cancel-btn').addEventListener('click', () => dialog.close());

function openDialog(item) {
  $('dialog-title').textContent = item ? 'Edit item' : 'Add item';
  $('item-id').value = item ? item.id : '';
  $('item-name').value = item ? item.name : '';
  $('item-qty').value = item ? item.qty : 1;
  $('item-unit').value = item ? item.unit : 'pcs';
  $('item-category').value = item ? item.category : 'Other';
  $('item-location').value = item ? item.location : 'Fridge';
  $('item-expiry').value = item ? item.expiry : '';

  // Show a delete button only when editing
  let deleteBtn = $('delete-btn');
  if (item && !deleteBtn) {
    deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.id = 'delete-btn';
    deleteBtn.className = 'secondary';
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.marginRight = 'auto';
    deleteBtn.addEventListener('click', deleteFromDialog);
    $('cancel-btn').before(deleteBtn);
  }
  if (deleteBtn) deleteBtn.hidden = !item;

  dialog.showModal();
}

$('item-form').addEventListener('submit', async e => {
  e.preventDefault();

  const item = {
    name: $('item-name').value.trim(),
    qty: Number($('item-qty').value) || 1,
    unit: $('item-unit').value,
    category: $('item-category').value,
    location: $('item-location').value,
    expiry: $('item-expiry').value // "" if no date
  };

  const id = $('item-id').value;
  if (id) {
    await db.items.update(Number(id), item);
  } else {
    await db.items.add(item);
  }

  dialog.close();
  refreshAll();

  // Offer a calendar reminder right away for new items with an expiry date
  if (!id && item.expiry && daysUntil(item.expiry) >= 0) {
    if (confirm(`Add a calendar reminder for "${item.name}"?`)) {
      addCalendarReminder(item);
    }
  }
});

async function deleteFromDialog() {
  const id = Number($('item-id').value);
  if (!confirm('Delete this item?')) return;
  await db.items.delete(id);
  dialog.close();
  refreshAll();
}


// ============================================================
//  Calendar reminder (.ics file)
//  iOS opens the file and offers "Add to Calendar".
//  The Calendar app then shows a real notification.
// ============================================================

function addCalendarReminder(item) {
  const daysBefore = Number(localStorage.getItem('remindDays') || 1);

  // Reminder date = expiry date minus X days
  const reminderDate = new Date(item.expiry);
  reminderDate.setDate(reminderDate.getDate() - daysBefore);
  const ymd = reminderDate.toISOString().slice(0, 10).replaceAll('-', '');

  const title = daysBefore === 0
    ? `${item.name} expires today`
    : `${item.name} expires on ${formatDate(item.expiry)}`;

  // Event at 09:00-09:15 on the reminder day, with an alert at the start
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pantry App//EN',
    'BEGIN:VEVENT',
    `UID:pantry-${Date.now()}@pantry-app`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART:${ymd}T090000`,
    `DTEND:${ymd}T091500`,
    `SUMMARY:🛒 ${title}`,
    `DESCRIPTION:${item.qty} ${item.unit} in the ${item.location.toLowerCase()}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${title}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  // A data: URL works more reliably in iOS home screen apps than a blob download
  window.location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
}


// ============================================================
//  Shopping list
// ============================================================

async function renderShopping() {
  // unchecked first, then checked
  const items = await db.shopping.orderBy('checked').toArray();

  if (items.length === 0) {
    $('shopping-list').innerHTML = '<p class="empty">Shopping list is empty.</p>';
    $('clear-checked').hidden = true;
    return;
  }

  $('shopping-list').innerHTML = items.map(item => `
    <label class="item ${item.checked ? 'checked' : ''}">
      <input type="checkbox" data-id="${item.id}" ${item.checked ? 'checked' : ''}>
      <div class="item-main"><div class="item-name">${escapeHtml(item.name)}</div></div>
    </label>
  `).join('');

  $('clear-checked').hidden = !items.some(i => i.checked);
}

$('shop-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('shop-name').value.trim();
  if (!name) return;
  $('shop-name').value = ''; // clear first, so fast typing isn't lost
  // IndexedDB can't index booleans, so checked is stored as 0 / 1
  await db.shopping.add({ name, checked: 0 });
  renderShopping();
});

$('shopping-list').addEventListener('change', async e => {
  if (e.target.type !== 'checkbox') return;
  await db.shopping.update(Number(e.target.dataset.id), { checked: e.target.checked ? 1 : 0 });
  renderShopping();
});

$('clear-checked').addEventListener('click', async () => {
  await db.shopping.where('checked').equals(1).delete();
  renderShopping();
});


// ============================================================
//  Settings: reminder days + backup
// ============================================================

$('remind-days').value = localStorage.getItem('remindDays') || '1';
$('remind-days').addEventListener('change', e => {
  localStorage.setItem('remindDays', e.target.value);
});

$('export-btn').addEventListener('click', async () => {
  const data = {
    exportedAt: new Date().toISOString(),
    items: await db.items.toArray(),
    shopping: await db.shopping.toArray()
  };
  const json = JSON.stringify(data, null, 2);
  const fileName = `pantry-backup-${todayString()}.json`;
  const file = new File([json], fileName, { type: 'application/json' });

  // On iPhone this opens the share sheet → "Save to Files", AirDrop, mail, ...
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Pantry backup' });
    } catch (err) {
      // user cancelled the share sheet, nothing to do
    }
    return;
  }

  // Fallback for desktop browsers
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
});

$('import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.items) || !Array.isArray(data.shopping)) {
      throw new Error('wrong format');
    }
    if (!confirm('This replaces everything currently in the app. Continue?')) return;

    await db.transaction('rw', db.items, db.shopping, async () => {
      await db.items.clear();
      await db.shopping.clear();
      await db.items.bulkAdd(data.items);
      await db.shopping.bulkAdd(data.shopping);
    });
    showToast('Backup restored');
    refreshAll();
  } catch (err) {
    alert('Could not read this file. Is it a pantry backup?');
  } finally {
    e.target.value = ''; // so the same file can be picked again
  }
});


// ============================================================
//  Start
// ============================================================

function refreshAll() {
  renderPantry();
  renderExpiring();
  renderShopping();
}

// Ask the browser to keep our data even when storage gets low
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist();
}

// Register the service worker (makes the app work offline)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

// Dates change overnight, so refresh when the app comes back to the front
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshAll();
});

refreshAll();
