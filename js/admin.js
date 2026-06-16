// ══════════════════════════════════════════════
//  ADMIN.JS — финальная версия v3
// ══════════════════════════════════════════════

let currentTab = 'devices';
let allDevices = [];
let allUsers = [];
let allLogs = [];
let allZones = [];
let currentUser = null;
let currentContentTab = 'basic';

// ── INIT ──────────────────────────────────────
async function initAdmin() {
  currentUser = requireAdmin();
  if (!currentUser) return;

  document.getElementById('userName').textContent = currentUser.full_name;
  const roleEl = document.getElementById('userRoleBadge');
  if (roleEl) roleEl.innerHTML = `<span class="role-badge ${roleBadgeClass(currentUser.role)}">${roleLabel(currentUser.role)}</span>`;

  // Только суперадмин видит высокие роли
  document.querySelectorAll('.superadmin-only').forEach(el => {
    el.style.display = isSuperAdmin(currentUser) ? '' : 'none';
  });

  // Скрыть добавление если нет прав
  if (!isAdmin(currentUser)) {
    ['addDeviceCard','addDeviceTitle','addUserCard','addUserTitle'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('show'); });
  });

  document.getElementById('newUserIin')?.addEventListener('input', function() {
    this.value = this.value.replace(/\D/g, '');
  });

  // Скрыть фильтр зон для пользователей привязанных к конкретной зоне
  if (!isAdmin(currentUser) && currentUser.zone_id) {
    ['filterDeviceZone','filterUserZone'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.parentElement.style.display = 'none';
    });
  }

  await loadZones();
  await loadDevices();
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');
  document.getElementById('content-' + tab)?.classList.add('active');
  if (tab === 'devices') loadDevices();
  if (tab === 'users') loadUsers();
  if (tab === 'logs') loadLogs();
  if (tab === 'maintenance') { loadMaintenance(); loadNotifyTime(); }
  if (tab === 'zones') loadZonesTab();
}

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.classList.remove('show'), 5000);
}

function statusLabel(s) {
  return { active: 'Активно', maintenance: 'Обслуживание', danger: 'Опасность' }[s] || s;
}

// ── ЗОНЫ ──────────────────────────────────────
async function loadZones() {
  const { data } = await db.from('zones').select('*').order('name');
  allZones = data || [];
  populateZoneSelects();
}

function populateZoneSelects() {
  const selects = ['newDeviceZone','editDeviceZone','newUserZone','editUserZone'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const isUser = id.includes('User');
    const currentVal = sel.value;
    sel.innerHTML = `<option value="">— Выберите место —</option>` +
      (isUser ? `<option value="all">🌐 Общий доступ (все зоны)</option>` : '') +
      allZones.map(z => `<option value="${z.id}">${z.name}</option>`).join('');
    if (currentVal) sel.value = currentVal;
  });

  // Фильтр зон в устройствах и пользователях
  ['filterDeviceZone','filterUserZone'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = `<option value="">Все зоны</option>` +
      allZones.map(z => `<option value="${z.id}">${z.name}</option>`).join('');
  });
}

async function loadZonesTab() {
  await loadZones();
  const container = document.getElementById('zonesList');
  if (!container) return;

  // Скрыть форму добавления для не-админов
  const addCard = document.getElementById('addZoneCard');
  if (addCard) addCard.style.display = isAdmin(currentUser) ? 'block' : 'none';

  container.innerHTML = allZones.map(z => `
    <div class="card" style="margin-bottom:10px;">
      <div class="flex-between">
        <div>
          <div style="font-weight:700;">📍 ${z.name}</div>
          ${z.description ? `<div class="text-muted" style="font-size:12px;">${z.description}</div>` : ''}
        </div>
        ${isSuperAdmin(currentUser) ? `
        <div class="flex" style="gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="openEditZone('${z.id}','${z.name.replace(/'/g,"\\'")}','${(z.description||'').replace(/'/g,"\\'")}')">✏</button>
          <button class="btn btn-danger btn-sm" onclick="deleteZone('${z.id}','${z.name.replace(/'/g,"\\'")}')">✕</button>
        </div>` : ''}
      </div>
    </div>`).join('') || '<p class="text-muted">Зон нет</p>';
}

async function addZone() {
  if (!isAdmin(currentUser)) { showAlert('zoneAlert','⛔ Только администратор может добавлять зоны','error'); return; }
  const name = document.getElementById('newZoneName').value.trim();
  const description = document.getElementById('newZoneDesc').value.trim();
  if (!name) { showAlert('zoneAlert','Введите название зоны','error'); return; }
  const { error } = await db.from('zones').insert({ name, description });
  if (error) { showAlert('zoneAlert', error.message.includes('unique') ? 'Зона с таким названием уже есть' : 'Ошибка: '+error.message, 'error'); return; }
  document.getElementById('newZoneName').value = '';
  document.getElementById('newZoneDesc').value = '';
  showAlert('zoneAlert','✅ Зона добавлена','success');
  await loadZonesTab();
}

function openEditZone(id, name, desc) {
  document.getElementById('editZoneId').value = id;
  document.getElementById('editZoneName').value = name;
  document.getElementById('editZoneDesc').value = desc;
  document.getElementById('modalEditZone').classList.add('show');
}

async function saveEditZone() {
  const id = document.getElementById('editZoneId').value;
  const name = document.getElementById('editZoneName').value.trim();
  const description = document.getElementById('editZoneDesc').value.trim();
  if (!name) { showAlert('editZoneAlert','Введите название','error'); return; }
  const { error } = await db.from('zones').update({ name, description }).eq('id', id);
  if (error) { showAlert('editZoneAlert','Ошибка: '+error.message,'error'); return; }
  closeModal('modalEditZone');
  await loadZonesTab();
}

async function deleteZone(id, name) {
  if (!isSuperAdmin(currentUser)) { showAlert('zoneAlert','⛔ Только супер-администратор может удалять зоны','error'); return; }
  if (!confirm(`Удалить зону "${name}"?\nУстройства и пользователи этой зоны потеряют привязку.`)) return;
  const { error } = await db.from('zones').delete().eq('id', id);
  if (error) { showAlert('zoneAlert','Ошибка: '+error.message,'error'); return; }
  showAlert('zoneAlert','Зона удалена','success');
  await loadZonesTab();
}

function zoneName(zoneId) {
  if (!zoneId) return '🌐 Общий';
  const z = allZones.find(z => z.id === zoneId);
  return z ? `📍 ${z.name}` : '—';
}

// ── ФИЛЬТР УСТРОЙСТВ ПО ЗОНЕ ─────────────────
function getAccessibleDevices(devices) {
  if (isSuperAdmin(currentUser)) return devices;
  if (isAdmin(currentUser) && !currentUser.zone_id) return devices; // admin с общим доступом
  if (!currentUser.zone_id) {
    // Пользователь с общим доступом (chief/itr без зоны) — видит всё
    return devices;
  }
  // Пользователь с конкретной зоной — видит ТОЛЬКО устройства своей зоны
  return devices.filter(d => d.zone_id === currentUser.zone_id);
}

function getAccessibleUsers(users) {
  if (isSuperAdmin(currentUser)) return users;
  if (!currentUser.zone_id) return users;
  // Пользователь с зоной видит только свою зону + тех у кого нет зоны
  return users.filter(u => !u.zone_id || u.zone_id === currentUser.zone_id);
}

// ── DEVICES ───────────────────────────────────
async function loadDevices() {
  const container = document.getElementById('deviceList');
  container.innerHTML = '<div class="loading">Загрузка...</div>';
  const { data, error } = await db.from('devices').select('*').order('name');
  if (error) { container.innerHTML = `<p style="color:var(--red)">Ошибка: ${error.message}</p>`; return; }
  allDevices = getAccessibleDevices(data || []);
  renderDevices(allDevices);
}

function filterDevices() {
  const q = document.getElementById('searchDevices').value.toLowerCase();
  const st = document.getElementById('filterStatus').value;
  const zn = document.getElementById('filterDeviceZone')?.value;
  renderDevices(allDevices.filter(d =>
    (!q || d.name?.toLowerCase().includes(q) || d.type?.toLowerCase().includes(q) || d.location?.toLowerCase().includes(q) || d.inv_number?.toLowerCase().includes(q)) &&
    (!st || d.status === st) &&
    (!zn || d.zone_id === zn)
  ));
}

function renderDevices(devices) {
  const container = document.getElementById('deviceList');
  document.getElementById('deviceCount').textContent = `${devices.length} из ${allDevices.length}`;
  if (!devices.length) { container.innerHTML = '<p class="text-muted" style="padding:20px;">Ничего не найдено</p>'; return; }

  container.innerHTML = devices.map(d => `
    <div class="card">
      <div class="flex-between" style="flex-wrap:wrap;gap:8px;">
        <div style="flex:1;min-width:200px;">
          <div style="font-weight:700;font-size:16px;">${d.name}</div>
          <div class="text-muted" style="margin-top:2px;font-size:12px;">
            ${d.brand ? `🏷 ${d.brand} · ` : ''}${d.type || ''} · ${d.location || ''}
            ${d.inv_number ? ` · 📋 ${d.inv_number}` : ''}
          </div>
          <div style="margin-top:4px;">
            <span class="ica-badge" style="font-size:11px;">${zoneName(d.zone_id)}</span>
          </div>
        </div>
        <span class="status status-${d.status}">${statusLabel(d.status)}</span>
      </div>
      ${d.description ? `<div style="margin-top:8px;font-size:13px;color:var(--text-muted);border-top:1px solid var(--border);padding-top:8px;">${d.description}</div>` : ''}
      <div class="flex mt-8" style="flex-wrap:wrap;gap:6px;">
        ${isAdmin(currentUser) ? `<button class="btn btn-secondary btn-sm" onclick="openEditDevice('${d.id}')">✏ Изменить</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="openContent('${d.id}','${esc(d.name)}')">📄 Контент</button>
        <button class="btn btn-secondary btn-sm" onclick="showQR('${d.id}','${esc(d.name)}')">📱 QR-код</button>
        <button class="btn btn-secondary btn-sm" onclick="openFiles('${d.id}','${esc(d.name)}')">📎 Файлы</button>
        <button class="btn btn-secondary btn-sm" onclick="switchTab('maintenance');setTimeout(()=>openMaintenanceSettings('${d.id}'),300)">🔧 ТО</button>
        <a href="device.html?id=${d.id}" class="btn btn-secondary btn-sm" target="_blank">👁 Просмотр</a>
        ${isAdmin(currentUser) ? `<button class="btn btn-danger btn-sm" onclick="deleteDevice('${d.id}','${esc(d.name)}')">✕ Удалить</button>` : ''}
      </div>
    </div>`).join('');
}

function esc(s) { return (s||'').replace(/'/g,"\\'"); }

async function checkDuplicate() {
  const name = document.getElementById('newDeviceName').value.trim().toLowerCase();
  const invNum = document.getElementById('newDeviceInvNum').value.trim().toLowerCase();
  const warn = document.getElementById('duplicateWarning');
  if (!name && !invNum) { warn.classList.remove('show'); return; }
  const dupe = allDevices.find(d =>
    (name && d.name?.toLowerCase() === name) ||
    (invNum && invNum !== '' && d.inv_number?.toLowerCase() === invNum)
  );
  warn.classList.toggle('show', !!dupe);
}

async function addDevice() {
  const name = document.getElementById('newDeviceName').value.trim();
  const brand = document.getElementById('newDeviceBrand').value.trim();
  const inv_number = document.getElementById('newDeviceInvNum').value.trim();
  const type = document.getElementById('newDeviceType').value.trim();
  const location = document.getElementById('newDeviceLocation').value.trim();
  const status = document.getElementById('newDeviceStatus').value;
  const description = document.getElementById('newDeviceInfo').value.trim();
  const zone_id = document.getElementById('newDeviceZone').value || null;

  if (!name || !location) { showAlert('deviceAlert','Заполните Наименование и Местонахождение','error'); return; }

  const dupe = allDevices.find(d =>
    d.name?.toLowerCase() === name.toLowerCase() ||
    (inv_number && d.inv_number?.toLowerCase() === inv_number.toLowerCase())
  );
  if (dupe) { showAlert('deviceAlert',`⚠️ Дубль: "${dupe.name}"`, 'error'); return; }

  const btn = document.querySelector('[onclick="addDevice()"]');
  btn.disabled = true; btn.textContent = 'Сохранение...';
  const { error } = await db.from('devices').insert({ name, brand, inv_number, type, location, status, description, zone_id });
  btn.disabled = false; btn.textContent = '+ Зарегистрировать ОТУ';
  if (error) { showAlert('deviceAlert','Ошибка: '+error.message,'error'); return; }
  showAlert('deviceAlert',`✅ ОТУ "${name}" зарегистрировано!`,'success');
  ['newDeviceName','newDeviceBrand','newDeviceInvNum','newDeviceType','newDeviceLocation','newDeviceInfo'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('newDeviceZone').value = '';
  document.getElementById('duplicateWarning').classList.remove('show');
  await loadDevices();
}

async function deleteDevice(id, name) {
  if (!isAdmin(currentUser)) return;
  if (!confirm(`Удалить ОТУ "${name}"?`)) return;
  const { error } = await db.from('devices').delete().eq('id', id);
  if (error) { showAlert('deviceAlert','Ошибка: '+error.message,'error'); return; }
  showAlert('deviceAlert','ОТУ удалено','success');
  await loadDevices();
}

async function openEditDevice(id) {
  const d = allDevices.find(x => x.id === id);
  if (!d) return;
  document.getElementById('editDeviceId').value = id;
  document.getElementById('editDeviceName').value = d.name || '';
  document.getElementById('editDeviceBrand').value = d.brand || '';
  document.getElementById('editDeviceInvNum').value = d.inv_number || '';
  document.getElementById('editDeviceType').value = d.type || '';
  document.getElementById('editDeviceLocation').value = d.location || '';
  document.getElementById('editDeviceStatus').value = d.status || 'active';
  document.getElementById('editDeviceInfo').value = d.description || '';
  document.getElementById('editDeviceZone').value = d.zone_id || '';
  document.getElementById('modalEditDevice').classList.add('show');
}

async function saveEditDevice() {
  const id = document.getElementById('editDeviceId').value;
  const name = document.getElementById('editDeviceName').value.trim();
  const brand = document.getElementById('editDeviceBrand').value.trim();
  const inv_number = document.getElementById('editDeviceInvNum').value.trim();
  const type = document.getElementById('editDeviceType').value.trim();
  const location = document.getElementById('editDeviceLocation').value.trim();
  const status = document.getElementById('editDeviceStatus').value;
  const description = document.getElementById('editDeviceInfo').value.trim();
  const zone_id = document.getElementById('editDeviceZone').value || null;

  if (!name || !location) { showAlert('editDeviceAlert','Заполните обязательные поля','error'); return; }
  const dupe = allDevices.find(d => d.id !== id && (
    d.name?.toLowerCase() === name.toLowerCase() ||
    (inv_number && d.inv_number?.toLowerCase() === inv_number.toLowerCase())
  ));
  if (dupe) { showAlert('editDeviceAlert',`⚠️ Дубль: "${dupe.name}"`,'error'); return; }

  const { error } = await db.from('devices').update({ name, brand, inv_number, type, location, status, description, zone_id }).eq('id', id);
  if (error) { showAlert('editDeviceAlert','Ошибка: '+error.message,'error'); return; }
  closeModal('modalEditDevice');
  showAlert('deviceAlert','ОТУ обновлено!','success');
  await loadDevices();
}

// ── CONTENT ───────────────────────────────────
let contentData = { basic: '', full: '' };

function switchContentTab(tab) {
  contentData[currentContentTab] = document.getElementById('contentText').value;
  currentContentTab = tab;
  document.getElementById('contentText').value = contentData[tab];
  document.getElementById('contentTabBasic').className = 'btn btn-'+(tab==='basic'?'primary':'secondary')+' btn-sm';
  document.getElementById('contentTabFull').className = 'btn btn-'+(tab==='full'?'primary':'secondary')+' btn-sm';
  document.getElementById('contentTabBasic').style.flex = '1';
  document.getElementById('contentTabFull').style.flex = '1';
}

async function openContent(deviceId, deviceName) {
  document.getElementById('contentDeviceName').textContent = deviceName;
  document.getElementById('contentDeviceId').value = deviceId;
  currentContentTab = 'basic';
  contentData = { basic: '', full: '' };
  const { data } = await db.from('device_info').select('*').eq('device_id', deviceId);
  contentData.basic = data?.find(d => d.level==='basic')?.content || '';
  contentData.full = data?.find(d => d.level==='full')?.content || '';
  document.getElementById('contentText').value = contentData.basic;
  switchContentTab('basic');
  document.getElementById('modalContent').classList.add('show');
}

async function saveContent() {
  contentData[currentContentTab] = document.getElementById('contentText').value;
  const deviceId = document.getElementById('contentDeviceId').value;
  for (const level of ['basic','full']) {
    const content = contentData[level];
    if (!content) continue;
    const { data: ex } = await db.from('device_info').select('id').eq('device_id',deviceId).eq('level',level).maybeSingle();
    if (ex) await db.from('device_info').update({ content, updated_at: new Date().toISOString() }).eq('id', ex.id);
    else await db.from('device_info').insert({ device_id: deviceId, level, title: level, content });
  }
  closeModal('modalContent');
  showAlert('deviceAlert','Контент сохранён!','success');
}

// ── QR ────────────────────────────────────────
function showQR(deviceId, deviceName) {
  const base = window.location.href.replace(/admin\.html.*/, '');
  const url = `${base}device.html?id=${deviceId}`;
  document.getElementById('qrDeviceName').textContent = deviceName;
  document.getElementById('qrDeviceId').textContent = deviceId;
  document.getElementById('qrcode').innerHTML = '';
  new QRCode(document.getElementById('qrcode'), {
    text: url, width: 220, height: 220,
    colorDark: '#003399', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
  document.getElementById('modalQR').classList.add('show');
}

function printQR() {
  const qrImg = document.querySelector('#qrcode img');
  const qrCanvas = document.querySelector('#qrcode canvas');
  const imgSrc = qrImg?.src || qrCanvas?.toDataURL();
  if (!imgSrc) return;
  const win = window.open('');
  win.document.write(`<html><head><title>QR-код</title></head>
  <body style="text-align:center;padding:40px;font-family:Arial;">
    <img src="${imgSrc}" style="width:200px;height:200px;"><br><br>
    <b style="font-size:18px;">${document.getElementById('qrDeviceName').textContent}</b><br>
    <span style="font-size:12px;color:#666;">Intergas Central Asia · Система QR-учёта ОТУ</span>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 300);
}

function downloadQR() {
  const qrCanvas = document.querySelector('#qrcode canvas');
  const qrImg = document.querySelector('#qrcode img');
  const deviceName = document.getElementById('qrDeviceName').textContent;

  if (qrCanvas) {
    const link = document.createElement('a');
    link.download = `QR_${deviceName}.png`;
    link.href = qrCanvas.toDataURL('image/png');
    link.click();
  } else if (qrImg) {
    const link = document.createElement('a');
    link.download = `QR_${deviceName}.png`;
    link.href = qrImg.src;
    link.click();
  }
}

// ── FILES ─────────────────────────────────────
async function openFiles(deviceId, deviceName) {
  document.getElementById('filesDeviceName').textContent = deviceName;
  document.getElementById('filesDeviceId').value = deviceId;
  document.getElementById('fileInput').value = '';
  document.getElementById('fileVisibleToWorker').checked = false;
  document.getElementById('modalFiles').classList.add('show');
  await loadFiles(deviceId);
}

async function loadFiles(deviceId) {
  const id = deviceId || document.getElementById('filesDeviceId').value;
  const container = document.getElementById('filesList');
  const { data } = await db.from('device_files').select('*').eq('device_id', id).order('uploaded_at', { ascending: false });
  if (!data?.length) { container.innerHTML = '<p class="text-muted">Файлов нет</p>'; return; }
  container.innerHTML = data.map(f => {
    const icon = f.file_type?.includes('pdf') ? '📄' : f.file_type?.includes('image') ? '🖼' : '📎';
    const badge = f.visible_to_workers
      ? '<span style="font-size:11px;background:var(--green-dim);color:var(--green);border:1px solid var(--green);padding:2px 8px;border-radius:100px;">👷 видно персоналу</span>'
      : '<span style="font-size:11px;background:var(--surface2);color:var(--text-muted);border:1px solid var(--border);padding:2px 8px;border-radius:100px;">🔒 ИТР+</span>';
    const url = `https://strmnfwpdtdnevhpqtar.supabase.co/storage/v1/object/public/device-files/${f.file_path}`;
    return `<div class="card" style="margin-bottom:8px;padding:12px;">
      <div class="flex-between">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:22px;">${icon}</span>
          <div>
            <div style="font-weight:600;font-size:13px;">${f.name}</div>
            <div style="margin-top:3px;">${badge}</div>
          </div>
        </div>
        <div class="flex" style="gap:4px;">
          <button class="btn btn-secondary btn-sm" onclick="toggleWorkerAccess('${f.id}',${f.visible_to_workers})">${f.visible_to_workers?'🔒':'👷'}</button>
          <a href="${url}" target="_blank" class="btn btn-secondary btn-sm">👁</a>
          <button class="btn btn-danger btn-sm" onclick="deleteFile('${f.id}','${f.file_path}')">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function uploadFile(input) {
  const file = input.files[0];
  const deviceId = document.getElementById('filesDeviceId').value;
  if (!file) return;
  if (file.size > 20*1024*1024) { showAlert('filesAlert','Файл не должен превышать 20MB','error'); return; }
  showAlert('filesAlert','⏳ Загружаем...','success');
  const ext = file.name.split('.').pop();
  const filePath = `${deviceId}/${Date.now()}.${ext}`;
  const { error } = await db.storage.from('device-files').upload(filePath, file);
  if (error) { showAlert('filesAlert','Ошибка: '+error.message,'error'); return; }
  const visible = document.getElementById('fileVisibleToWorker').checked;
  await db.from('device_files').insert({ device_id: deviceId, name: file.name, file_path: filePath, file_type: file.type, visible_to_workers: visible });
  input.value = '';
  showAlert('filesAlert',`✅ ${file.name} загружен!`,'success');
  await loadFiles(deviceId);
}

async function toggleWorkerAccess(fileId, current) {
  await db.from('device_files').update({ visible_to_workers: !current }).eq('id', fileId);
  await loadFiles();
}

async function deleteFile(id, path) {
  if (!confirm('Удалить файл?')) return;
  await db.storage.from('device-files').remove([path]);
  await db.from('device_files').delete().eq('id', id);
  await loadFiles();
}

// ── USERS ─────────────────────────────────────
async function loadUsers() {
  const container = document.getElementById('userList');
  container.innerHTML = '<div class="loading">Загрузка...</div>';
  const { data, error } = await db.from('users').select('*').order('full_name');
  if (error) { container.innerHTML = `<p style="color:var(--red)">Ошибка: ${error.message}</p>`; return; }
  allUsers = getAccessibleUsers(data || []);
  renderUsers(allUsers);
}

function filterUsers() {
  const q = document.getElementById('searchUsers').value.toLowerCase();
  const r = document.getElementById('filterRole').value;
  const zn = document.getElementById('filterUserZone')?.value;
  renderUsers(allUsers.filter(u =>
    (!q || u.full_name?.toLowerCase().includes(q) || u.iin?.includes(q)) &&
    (!r || u.role === r) &&
    (!zn || u.zone_id === zn)
  ));
}

function renderUsers(users) {
  const container = document.getElementById('userList');
  document.getElementById('userCount').textContent = `${users.length} из ${allUsers.length}`;
  if (!users.length) { container.innerHTML = '<p class="text-muted" style="padding:20px;">Ничего не найдено</p>'; return; }

  const canEdit = isAdmin(currentUser);

  container.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>ФИО</th><th>ИИН</th><th>Роль</th><th>Зона</th><th>Действия</th></tr></thead>
    <tbody>
      ${users.map(u => {
        const isSelf = u.id === currentUser?.id;
        const zLabel = u.zone_id ? (allZones.find(z=>z.id===u.zone_id)?.name || '—') : '🌐 Общий';
        return `<tr>
          <td style="font-weight:500;">${u.full_name}${isSelf?' <span style="color:var(--accent);font-size:11px;">(вы)</span>':''}</td>
          <td style="font-family:var(--font-mono);font-size:12px;">${u.iin}</td>
          <td><span class="role-badge ${roleBadgeClass(u.role)}">${roleLabel(u.role)}</span></td>
          <td style="font-size:12px;">${zLabel}</td>
          <td>
            ${isSelf ? '<span class="text-muted" style="font-size:12px;">вы</span>' : canEdit ? `
            <div class="flex" style="gap:4px;">
              <button class="btn btn-secondary btn-sm" onclick="openEditUser('${u.id}')">✏</button>
              <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}','${esc(u.full_name)}')">✕</button>
            </div>` : '—'}
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

async function addUser() {
  const iin = document.getElementById('newUserIin').value.trim();
  const full_name = document.getElementById('newUserName').value.trim();
  const password_hash = document.getElementById('newUserPassword').value.trim();
  const role = document.getElementById('newUserRole').value;
  const zoneVal = document.getElementById('newUserZone').value;
  const zone_id = (zoneVal === 'all' || !zoneVal) ? null : zoneVal;

  if (iin.length !== 12) { showAlert('userAlert','ИИН должен быть ровно 12 цифр','error'); return; }
  if (!full_name) { showAlert('userAlert','Введите ФИО','error'); return; }
  if (!password_hash) { showAlert('userAlert','Введите пароль','error'); return; }

  // Только суперадмин назначает admin/superadmin
  if (['admin','superadmin'].includes(role) && !isSuperAdmin(currentUser)) {
    showAlert('userAlert','⛔ Только супер-администратор может назначать эту роль','error'); return;
  }
  // Админ не может назначить superadmin
  if (role === 'superadmin' && !isSuperAdmin(currentUser)) {
    showAlert('userAlert','⛔ Нельзя назначить роль супер-администратора','error'); return;
  }

  const btn = document.querySelector('[onclick="addUser()"]');
  btn.disabled = true; btn.textContent = 'Сохранение...';
  const { error } = await db.from('users').insert({ iin, full_name, password_hash, role, zone_id });
  btn.disabled = false; btn.textContent = '+ Добавить';
  if (error) {
    showAlert('userAlert', error.code==='23505' ? 'Пользователь с таким ИИН уже существует' : 'Ошибка: '+error.message, 'error');
    return;
  }
  showAlert('userAlert',`✅ ${full_name} добавлен`,'success');
  ['newUserIin','newUserName','newUserPassword'].forEach(id => document.getElementById(id).value = '');
  await loadUsers();
}

function openEditUser(id) {
  const u = allUsers.find(x => x.id === id);
  if (!u) return;

  // Только суперадмин редактирует других суперадминов
  if (u.role === 'superadmin' && !isSuperAdmin(currentUser)) {
    showAlert('userAlert','⛔ Нет прав','error'); return;
  }
  // Админ не может редактировать другого админа если тот суперадмин
  if (u.role === 'admin' && !isSuperAdmin(currentUser) && u.id !== currentUser.id) {
    showAlert('userAlert','⛔ Нет прав для редактирования администратора','error'); return;
  }

  document.getElementById('editUserId').value = id;
  document.getElementById('editUserName').value = u.full_name;
  document.getElementById('editUserPassword').value = '';
  document.getElementById('editUserZone').value = u.zone_id || '';

  // Роль — только суперадмин меняет
  const roleSelect = document.getElementById('editUserRole');
  roleSelect.value = u.role;
  roleSelect.disabled = !isSuperAdmin(currentUser);
  // Скрыть superadmin из опций для не-суперадминов
  document.querySelectorAll('#editUserRole .superadmin-only').forEach(el => {
    el.style.display = isSuperAdmin(currentUser) ? '' : 'none';
  });

  // ФИО и пароль — только admin+
  document.getElementById('editUserName').disabled = !isAdmin(currentUser);
  document.getElementById('editUserPassword').disabled = !isAdmin(currentUser);

  document.getElementById('modalEditUser').classList.add('show');
}

async function saveEditUser() {
  const id = document.getElementById('editUserId').value;
  const full_name = document.getElementById('editUserName').value.trim();
  const role = document.getElementById('editUserRole').value;
  const password = document.getElementById('editUserPassword').value.trim();
  const zoneVal = document.getElementById('editUserZone').value;
  const zone_id = (zoneVal === 'all' || !zoneVal) ? null : zoneVal;

  if (!full_name) { showAlert('editUserAlert','Введите ФИО','error'); return; }

  // Защита: никто не может назначить superadmin кроме суперадмина
  if (role === 'superadmin' && !isSuperAdmin(currentUser)) {
    showAlert('editUserAlert','⛔ Нельзя назначить роль супер-администратора','error'); return;
  }

  const upd = { zone_id };
  if (isAdmin(currentUser)) { upd.full_name = full_name; }
  if (isSuperAdmin(currentUser)) { upd.role = role; }
  if (password && isAdmin(currentUser)) { upd.password_hash = password; }

  const { error } = await db.from('users').update(upd).eq('id', id);
  if (error) { showAlert('editUserAlert','Ошибка: '+error.message,'error'); return; }

  // Разблокировать поля
  document.getElementById('editUserRole').disabled = false;
  document.getElementById('editUserName').disabled = false;
  document.getElementById('editUserPassword').disabled = false;

  closeModal('modalEditUser');
  showAlert('userAlert','Пользователь обновлён','success');
  await loadUsers();
}

async function deleteUser(id, name) {
  if (id === currentUser?.id) { showAlert('userAlert','Нельзя удалить самого себя','error'); return; }
  const u = allUsers.find(x => x.id === id);
  if (u?.role === 'superadmin' && !isSuperAdmin(currentUser)) {
    showAlert('userAlert','⛔ Нельзя удалить супер-администратора','error'); return;
  }
  if (!confirm(`Удалить "${name}"?`)) return;
  const { error } = await db.from('users').delete().eq('id', id);
  if (error) { showAlert('userAlert','Ошибка: '+error.message,'error'); return; }
  showAlert('userAlert','Пользователь удалён','success');
  await loadUsers();
}

function exportUsers() {
  if (!allUsers.length) { showAlert('userAlert','Нет данных','error'); return; }
  const rows = allUsers.map(u => ({
    'ИИН': u.iin,
    'ФИО': u.full_name,
    'Роль': roleLabel(u.role),
    'Зона': u.zone_id ? (allZones.find(z=>z.id===u.zone_id)?.name||'—') : 'Общий'
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Пользователи');
  XLSX.writeFile(wb, 'пользователи_otu.xlsx');
}

async function importUsers(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'binary' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const users = rows.map(r => ({
        iin: String(r['ИИН']||r['iin']||'').replace(/\D/g,'').slice(0,12),
        full_name: String(r['ФИО']||r['full_name']||'').trim(),
        password_hash: String(r['Пароль']||r['password']||'1234'),
        role: String(r['Роль']||r['role']||'worker')
      })).filter(u => u.iin.length===12 && u.full_name);
      if (!users.length) { showAlert('userAlert','Не найдено корректных строк','error'); return; }
      let ok = 0;
      for (let i = 0; i < users.length; i += 100) {
        const { error } = await db.from('users').upsert(users.slice(i,i+100), { onConflict: 'iin' });
        if (!error) ok += Math.min(100, users.length-i);
      }
      showAlert('userAlert',`✅ Импортировано: ${ok} из ${users.length}`,'success');
      await loadUsers();
    } catch(err) { showAlert('userAlert','Ошибка: '+err.message,'error'); }
  };
  reader.readAsBinaryString(file);
}

// ── LOGS ──────────────────────────────────────
async function loadLogs() {
  const tbody = document.getElementById('logsBody');
  tbody.innerHTML = '<tr><td colspan="4" class="loading">Загрузка...</td></tr>';
  const { data, error } = await db.from('scan_logs')
    .select('scanned_at, devices(name, zone_id), users(full_name, role)')
    .order('scanned_at', { ascending: false }).limit(500);
  if (error) { tbody.innerHTML = `<tr><td colspan="4" style="color:var(--red)">Ошибка: ${error.message}</td></tr>`; return; }
  allLogs = data || [];
  renderLogs(allLogs);
}

function filterLogs() {
  const q = document.getElementById('searchLogs').value.toLowerCase();
  const r = document.getElementById('filterLogsRole').value;
  renderLogs(allLogs.filter(l =>
    (!q || l.users?.full_name?.toLowerCase().includes(q) || l.devices?.name?.toLowerCase().includes(q)) &&
    (!r || l.users?.role === r)
  ));
}

function renderLogs(logs) {
  const tbody = document.getElementById('logsBody');
  if (!logs.length) { tbody.innerHTML = '<tr><td colspan="4" class="text-muted" style="padding:16px;">Нет данных</td></tr>'; return; }
  tbody.innerHTML = logs.map(l => `
    <tr>
      <td>${new Date(l.scanned_at).toLocaleString('ru')}</td>
      <td>${l.devices?.name||'—'}</td>
      <td>${l.users?.full_name||'—'}</td>
      <td><span class="role-badge ${roleBadgeClass(l.users?.role||'')}">${roleLabel(l.users?.role||'—')}</span></td>
    </tr>`).join('');
}

document.addEventListener('DOMContentLoaded', initAdmin);
