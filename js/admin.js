let currentTab = 'devices';
let allDevices = [];
let allUsers = [];
let allLogs = [];
let currentUser = null;
let currentContentTab = 'basic';

// ── INIT ──────────────────────────────────────
async function initAdmin() {
  currentUser = requireAdmin();
  if (!currentUser) return;

  document.getElementById('userName').textContent = currentUser.full_name;
  const roleEl = document.getElementById('userRoleBadge');
  if (roleEl) roleEl.innerHTML = `<span class="role-badge ${roleBadgeClass(currentUser.role)}">${roleLabel(currentUser.role)}</span>`;

  // Скрыть добавление если нет прав
  if (!isAdmin(currentUser)) {
    const addCard = document.getElementById('addDeviceCard');
    const addTitle = document.getElementById('addDeviceTitle');
    if (addCard) addCard.style.display = 'none';
    if (addTitle) addTitle.style.display = 'none';
  }
  if (!isAdmin(currentUser)) {
    const addUserCard = document.getElementById('addUserCard');
    const addUserTitle = document.getElementById('addUserTitle');
    if (addUserCard) addUserCard.style.display = 'none';
    if (addUserTitle) addUserTitle.style.display = 'none';
  }

  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('show'); });
  });

  document.getElementById('newUserIin')?.addEventListener('input', function() {
    this.value = this.value.replace(/\D/g, '');
  });

  await loadDevices();
}

function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('content-' + tab).classList.add('active');
  if (tab === 'devices') loadDevices();
  if (tab === 'users') loadUsers();
  if (tab === 'logs') loadLogs();
  if (tab === 'maintenance') { loadMaintenance(); loadNotifyTime(); }
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

// ── DUPLICATE CHECK ───────────────────────────
async function checkDuplicate() {
  const name = document.getElementById('newDeviceName').value.trim().toLowerCase();
  const invNum = document.getElementById('newDeviceInvNum').value.trim().toLowerCase();
  const warn = document.getElementById('duplicateWarning');
  if (!name && !invNum) { warn.classList.remove('show'); return; }

  const dupe = allDevices.find(d =>
    (name && d.name?.toLowerCase() === name) ||
    (invNum && d.inv_number?.toLowerCase() === invNum && invNum !== '')
  );
  warn.classList.toggle('show', !!dupe);
}

// ── DEVICES ───────────────────────────────────
async function loadDevices() {
  const container = document.getElementById('deviceList');
  container.innerHTML = '<div class="loading">Загрузка...</div>';
  const { data, error } = await db.from('devices').select('*').order('name');
  if (error) { container.innerHTML = `<p style="color:var(--red)">Ошибка: ${error.message}</p>`; return; }
  allDevices = data || [];
  renderDevices(allDevices);
}

function filterDevices() {
  const q = document.getElementById('searchDevices').value.toLowerCase();
  const st = document.getElementById('filterStatus').value;
  renderDevices(allDevices.filter(d =>
    (!q || d.name?.toLowerCase().includes(q) || d.type?.toLowerCase().includes(q) || d.location?.toLowerCase().includes(q) || d.inv_number?.toLowerCase().includes(q)) &&
    (!st || d.status === st)
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
          <div class="text-muted" style="margin-top:2px;">
            ${d.brand ? `<span style="margin-right:8px;">🏷 ${d.brand}</span>` : ''}
            ${d.inv_number ? `<span style="margin-right:8px;font-family:var(--font-mono);">📋 ${d.inv_number}</span>` : ''}
          </div>
          <div class="text-muted">${d.type || ''} · ${d.location || ''}</div>
        </div>
        <span class="status status-${d.status}">${statusLabel(d.status)}</span>
      </div>
      ${d.description ? `<div style="margin-top:8px;font-size:13px;color:var(--text-muted);border-top:1px solid var(--border);padding-top:8px;">${d.description}</div>` : ''}
      <div class="flex mt-8" style="flex-wrap:wrap;gap:6px;">
        ${isAdmin(currentUser) ? `<button class="btn btn-secondary btn-sm" onclick="openEditDevice('${d.id}')">✏ Изменить</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="openContent('${d.id}', '${d.name.replace(/'/g,"\\'")}')">📄 Контент</button>
        <button class="btn btn-secondary btn-sm" onclick="showQR('${d.id}', '${d.name.replace(/'/g,"\\'")}')">📱 QR-код</button>
        <button class="btn btn-secondary btn-sm" onclick="openFiles('${d.id}', '${d.name.replace(/'/g,"\\'")}')">📎 Файлы</button>
        <button class="btn btn-secondary btn-sm" onclick="switchTab('maintenance');setTimeout(()=>openMaintenanceSettings('${d.id}'),300)">🔧 ТО</button>
        <a href="device.html?id=${d.id}" class="btn btn-secondary btn-sm" target="_blank">👁 Просмотр</a>
        ${isAdmin(currentUser) ? `<button class="btn btn-danger btn-sm" onclick="deleteDevice('${d.id}', '${d.name.replace(/'/g,"\\'")}')">✕ Удалить</button>` : ''}
      </div>
    </div>`).join('');
}

async function addDevice() {
  const name = document.getElementById('newDeviceName').value.trim();
  const brand = document.getElementById('newDeviceBrand').value.trim();
  const inv_number = document.getElementById('newDeviceInvNum').value.trim();
  const type = document.getElementById('newDeviceType').value.trim();
  const location = document.getElementById('newDeviceLocation').value.trim();
  const status = document.getElementById('newDeviceStatus').value;
  const description = document.getElementById('newDeviceInfo').value.trim();

  if (!name || !location) { showAlert('deviceAlert', 'Заполните обязательные поля: Наименование и Местонахождение', 'error'); return; }

  // Проверка дублей
  const dupe = allDevices.find(d =>
    d.name?.toLowerCase() === name.toLowerCase() ||
    (inv_number && d.inv_number?.toLowerCase() === inv_number.toLowerCase())
  );
  if (dupe) { showAlert('deviceAlert', `⚠️ ОТУ с таким наименованием или инвентарным номером уже существует: "${dupe.name}"`, 'error'); return; }

  const btn = document.querySelector('[onclick="addDevice()"]');
  btn.disabled = true; btn.textContent = 'Сохранение...';

  const { error } = await db.from('devices').insert({ name, brand, inv_number, type, location, status, description });
  btn.disabled = false; btn.textContent = '+ Зарегистрировать ОТУ';

  if (error) { showAlert('deviceAlert', 'Ошибка: ' + error.message, 'error'); return; }

  showAlert('deviceAlert', `✅ ОТУ "${name}" зарегистрировано!`, 'success');
  ['newDeviceName','newDeviceBrand','newDeviceInvNum','newDeviceType','newDeviceLocation','newDeviceInfo'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('duplicateWarning').classList.remove('show');
  await loadDevices();
}

async function deleteDevice(id, name) {
  if (!isAdmin(currentUser)) return;
  if (!confirm(`Удалить ОТУ "${name}"?`)) return;
  const { error } = await db.from('devices').delete().eq('id', id);
  if (error) { showAlert('deviceAlert', 'Ошибка: ' + error.message, 'error'); return; }
  showAlert('deviceAlert', 'ОТУ удалено', 'success');
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

  if (!name || !location) { showAlert('editDeviceAlert', 'Заполните обязательные поля', 'error'); return; }

  // Дубль проверка (исключая текущее устройство)
  const dupe = allDevices.find(d => d.id !== id && (
    d.name?.toLowerCase() === name.toLowerCase() ||
    (inv_number && d.inv_number?.toLowerCase() === inv_number.toLowerCase())
  ));
  if (dupe) { showAlert('editDeviceAlert', `⚠️ ОТУ с таким наименованием или номером уже есть: "${dupe.name}"`, 'error'); return; }

  const { error } = await db.from('devices').update({ name, brand, inv_number, type, location, status, description }).eq('id', id);
  if (error) { showAlert('editDeviceAlert', 'Ошибка: ' + error.message, 'error'); return; }
  closeModal('modalEditDevice');
  showAlert('deviceAlert', 'ОТУ обновлено!', 'success');
  await loadDevices();
}

// ── CONTENT ───────────────────────────────────
let contentData = { basic: '', full: '' };

function switchContentTab(tab) {
  contentData[currentContentTab] = document.getElementById('contentText').value;
  currentContentTab = tab;
  document.getElementById('contentText').value = contentData[tab];
  document.getElementById('contentTabBasic').className = 'btn btn-' + (tab === 'basic' ? 'primary' : 'secondary') + ' btn-sm';
  document.getElementById('contentTabFull').className = 'btn btn-' + (tab === 'full' ? 'primary' : 'secondary') + ' btn-sm';
  document.getElementById('contentTabBasic').style.flex = '1';
  document.getElementById('contentTabFull').style.flex = '1';
}

async function openContent(deviceId, deviceName) {
  document.getElementById('contentDeviceName').textContent = deviceName;
  document.getElementById('contentDeviceId').value = deviceId;
  currentContentTab = 'basic';
  contentData = { basic: '', full: '' };

  const { data } = await db.from('device_info').select('*').eq('device_id', deviceId);
  const basic = data?.find(d => d.level === 'basic');
  const full = data?.find(d => d.level === 'full');
  contentData.basic = basic?.content || '';
  contentData.full = full?.content || '';

  document.getElementById('contentText').value = contentData.basic;
  switchContentTab('basic');
  document.getElementById('modalContent').classList.add('show');
}

async function saveContent() {
  contentData[currentContentTab] = document.getElementById('contentText').value;
  const deviceId = document.getElementById('contentDeviceId').value;
  for (const level of ['basic', 'full']) {
    const content = contentData[level];
    if (!content) continue;
    const { data: existing } = await db.from('device_info').select('id').eq('device_id', deviceId).eq('level', level).maybeSingle();
    if (existing) {
      await db.from('device_info').update({ content, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await db.from('device_info').insert({ device_id: deviceId, level, title: level, content });
    }
  }
  closeModal('modalContent');
  showAlert('deviceAlert', 'Контент сохранён!', 'success');
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
  const canvas = document.querySelector('#qrcode canvas');
  if (!canvas) return;
  const win = window.open('');
  win.document.write(`<html><body style="text-align:center;padding:20px;font-family:Arial;">
    <img src="${document.querySelector('#qrcode img')?.src || canvas.toDataURL()}" style="width:200px;"><br>
    <b>${document.getElementById('qrDeviceName').textContent}</b><br>
    <small>Intergas Central Asia</small>
  </body></html>`);
  win.print();
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
  const { data, error } = await db.from('device_files').select('*').eq('device_id', id).order('uploaded_at', { ascending: false });
  if (error || !data?.length) { container.innerHTML = '<p class="text-muted">Файлов нет</p>'; return; }

  container.innerHTML = data.map(f => {
    const icon = f.file_type?.includes('pdf') ? '📄' : f.file_type?.includes('image') ? '🖼' : '📎';
    const badge = f.visible_to_workers
      ? '<span style="font-size:11px;background:var(--green-dim);color:var(--green);border:1px solid var(--green);padding:2px 8px;border-radius:100px;">👷 видно персоналу</span>'
      : '<span style="font-size:11px;background:var(--surface2);color:var(--text-muted);border:1px solid var(--border);padding:2px 8px;border-radius:100px;">🔒 только ИТР+</span>';
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
          <button class="btn btn-secondary btn-sm" onclick="toggleWorkerAccess('${f.id}', ${f.visible_to_workers})">${f.visible_to_workers ? '🔒 Скрыть' : '👷 Открыть'}</button>
          <a href="${url}" target="_blank" class="btn btn-secondary btn-sm">👁</a>
          <button class="btn btn-danger btn-sm" onclick="deleteFile('${f.id}', '${f.file_path}')">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function uploadFile(input) {
  const file = input.files[0];
  const deviceId = document.getElementById('filesDeviceId').value;
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { showAlert('filesAlert', 'Файл не должен превышать 20MB', 'error'); return; }

  showAlert('filesAlert', '⏳ Загружаем...', 'success');
  const ext = file.name.split('.').pop();
  const filePath = `${deviceId}/${Date.now()}.${ext}`;
  const { error: upErr } = await db.storage.from('device-files').upload(filePath, file);
  if (upErr) { showAlert('filesAlert', 'Ошибка: ' + upErr.message, 'error'); return; }

  const visible = document.getElementById('fileVisibleToWorker').checked;
  await db.from('device_files').insert({ device_id: deviceId, name: file.name, file_path: filePath, file_type: file.type, visible_to_workers: visible });
  input.value = '';
  showAlert('filesAlert', `✅ ${file.name} загружен!`, 'success');
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
  allUsers = data || [];
  renderUsers(allUsers);
}

function filterUsers() {
  const q = document.getElementById('searchUsers').value.toLowerCase();
  const r = document.getElementById('filterRole').value;
  renderUsers(allUsers.filter(u =>
    (!q || u.full_name?.toLowerCase().includes(q) || u.iin?.includes(q)) &&
    (!r || u.role === r)
  ));
}

function renderUsers(users) {
  const container = document.getElementById('userList');
  document.getElementById('userCount').textContent = `${users.length} из ${allUsers.length}`;
  if (!users.length) { container.innerHTML = '<p class="text-muted" style="padding:20px;">Ничего не найдено</p>'; return; }

  container.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>ФИО</th><th>ИИН</th><th>Роль</th><th>Действия</th></tr></thead>
    <tbody>
      ${users.map(u => {
        const isSelf = u.id === currentUser?.id;
        return `<tr>
          <td style="font-weight:500;">${u.full_name}${isSelf ? ' <span style="color:var(--accent);font-size:11px;">(вы)</span>' : ''}</td>
          <td style="font-family:var(--font-mono);font-size:12px;">${u.iin}</td>
          <td><span class="role-badge ${roleBadgeClass(u.role)}">${roleLabel(u.role)}</span></td>
          <td>
            ${isSelf ? '<span class="text-muted" style="font-size:12px;">нельзя изменить</span>' : `
            <div class="flex" style="flex-wrap:wrap;gap:4px;">
              <button class="btn btn-secondary btn-sm" onclick="openEditUser('${u.id}')">✏</button>
              <button class="btn btn-secondary btn-sm" onclick="resetUserPassword('${u.id}', '${u.full_name.replace(/'/g,"\\'")}')">🔑</button>
              <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}', '${u.full_name.replace(/'/g,"\\'")}')">✕</button>
            </div>`}
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
  if (iin.length !== 12) { showAlert('userAlert', 'ИИН должен быть ровно 12 цифр', 'error'); return; }
  if (!full_name) { showAlert('userAlert', 'Введите ФИО', 'error'); return; }
  if (!password_hash) { showAlert('userAlert', 'Введите пароль', 'error'); return; }
  const btn = document.querySelector('[onclick="addUser()"]');
  btn.disabled = true; btn.textContent = 'Сохранение...';
  const { error } = await db.from('users').insert({ iin, full_name, password_hash, role });
  btn.disabled = false; btn.textContent = '+ Добавить';
  if (error) {
    showAlert('userAlert', error.code === '23505' ? 'Пользователь с таким ИИН уже существует' : 'Ошибка: ' + error.message, 'error');
    return;
  }
  showAlert('userAlert', `✅ ${full_name} добавлен`, 'success');
  ['newUserIin','newUserName','newUserPassword'].forEach(id => document.getElementById(id).value = '');
  await loadUsers();
}

function openEditUser(id) {
  const u = allUsers.find(x => x.id === id);
  if (!u) return;
  document.getElementById('editUserId').value = id;
  document.getElementById('editUserName').value = u.full_name;
  document.getElementById('editUserRole').value = u.role;
  document.getElementById('editUserPassword').value = '';
  document.getElementById('modalEditUser').classList.add('show');
}

async function saveEditUser() {
  const id = document.getElementById('editUserId').value;
  const full_name = document.getElementById('editUserName').value.trim();
  const role = document.getElementById('editUserRole').value;
  const password = document.getElementById('editUserPassword').value.trim();
  if (!full_name) { showAlert('editUserAlert', 'Введите ФИО', 'error'); return; }
  const upd = { full_name, role };
  if (password) upd.password_hash = password;
  const { error } = await db.from('users').update(upd).eq('id', id);
  if (error) { showAlert('editUserAlert', 'Ошибка: ' + error.message, 'error'); return; }
  closeModal('modalEditUser');
  showAlert('userAlert', 'Пользователь обновлён', 'success');
  await loadUsers();
}

async function deleteUser(id, name) {
  if (id === currentUser?.id) { showAlert('userAlert', 'Нельзя удалить самого себя', 'error'); return; }
  if (!confirm(`Удалить "${name}"?`)) return;
  const { error } = await db.from('users').delete().eq('id', id);
  if (error) { showAlert('userAlert', 'Ошибка: ' + error.message, 'error'); return; }
  showAlert('userAlert', 'Пользователь удалён', 'success');
  await loadUsers();
}

async function resetUserPassword(userId, name) {
  const p = prompt(`Новый пароль для "${name}":`);
  if (!p || p.length < 4) { showAlert('userAlert', 'Пароль минимум 4 символа', 'error'); return; }
  const { error } = await db.from('users').update({ password_hash: p }).eq('id', userId);
  if (error) { showAlert('userAlert', 'Ошибка: ' + error.message, 'error'); return; }
  showAlert('userAlert', `Пароль для ${name} изменён`, 'success');
}

function exportUsers() {
  if (!allUsers.length) { showAlert('userAlert', 'Нет данных', 'error'); return; }
  const rows = allUsers.map(u => ({ 'ИИН': u.iin, 'ФИО': u.full_name, 'Роль': roleLabel(u.role) }));
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
        iin: String(r['ИИН'] || r['iin'] || '').replace(/\D/g,'').slice(0,12),
        full_name: String(r['ФИО'] || r['full_name'] || '').trim(),
        password_hash: String(r['Пароль'] || r['password'] || '1234'),
        role: String(r['Роль'] || r['role'] || 'worker')
      })).filter(u => u.iin.length === 12 && u.full_name);
      if (!users.length) { showAlert('userAlert', 'Не найдено корректных строк', 'error'); return; }
      let ok = 0;
      for (let i = 0; i < users.length; i += 100) {
        const { error } = await db.from('users').upsert(users.slice(i, i+100), { onConflict: 'iin' });
        if (!error) ok += Math.min(100, users.length - i);
      }
      showAlert('userAlert', `✅ Импортировано: ${ok} из ${users.length}`, 'success');
      await loadUsers();
    } catch(err) { showAlert('userAlert', 'Ошибка: ' + err.message, 'error'); }
  };
  reader.readAsBinaryString(file);
}

// ── LOGS ──────────────────────────────────────
async function loadLogs() {
  const tbody = document.getElementById('logsBody');
  tbody.innerHTML = '<tr><td colspan="4" class="loading">Загрузка...</td></tr>';
  const { data, error } = await db.from('scan_logs')
    .select('scanned_at, devices(name), users(full_name, role)')
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
      <td>${l.devices?.name || '—'}</td>
      <td>${l.users?.full_name || '—'}</td>
      <td><span class="role-badge ${roleBadgeClass(l.users?.role || '')}">${roleLabel(l.users?.role || '—')}</span></td>
    </tr>`).join('');
}

document.addEventListener('DOMContentLoaded', initAdmin);
