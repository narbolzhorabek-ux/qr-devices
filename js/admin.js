let currentTab = 'devices';
let allDevices = [];
let allUsers = [];
let allLogs = [];
let currentUserId = null;

async function initAdmin() {
  const user = requireAdmin();
  if (!user) return;
  currentUserId = user.id;
  document.getElementById('userName').textContent = user.full_name;

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('show');
    });
  });

  document.getElementById('newUserIin').addEventListener('input', function() {
    this.value = this.value.replace(/\D/g, '');
  });

  // Поиск — живой фильтр
  document.getElementById('searchDevices').addEventListener('input', function() {
    const q = this.value.toLowerCase();
    renderDevices(allDevices.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.type.toLowerCase().includes(q) ||
      d.location.toLowerCase().includes(q)
    ));
  });

  document.getElementById('searchUsers').addEventListener('input', function() {
    const q = this.value.toLowerCase();
    renderUsers(allUsers.filter(u =>
      u.full_name.toLowerCase().includes(q) ||
      u.iin.includes(q) ||
      u.role.toLowerCase().includes(q)
    ));
  });

  document.getElementById('searchLogs').addEventListener('input', function() {
    filterLogs();
  });
  document.getElementById('filterLogDevice').addEventListener('change', filterLogs);
  document.getElementById('filterLogRole').addEventListener('change', filterLogs);

  await loadDevices();
}

function filterLogs() {
  const q = document.getElementById('searchLogs').value.toLowerCase();
  const deviceFilter = document.getElementById('filterLogDevice').value;
  const roleFilter = document.getElementById('filterLogRole').value;

  renderLogs(allLogs.filter(l => {
    const matchText = !q ||
      (l.users?.full_name || '').toLowerCase().includes(q) ||
      (l.devices?.name || '').toLowerCase().includes(q);
    const matchDevice = !deviceFilter || l.devices?.name === deviceFilter;
    const matchRole = !roleFilter || l.users?.role === roleFilter;
    return matchText && matchDevice && matchRole;
  }));
}

// ── TABS ──
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('content-' + tab).classList.add('active');
  if (tab === 'devices') loadDevices();
  if (tab === 'users') loadUsers();
  if (tab === 'logs') loadLogs();
}

// ── DEVICES ──
async function loadDevices() {
  const container = document.getElementById('deviceList');
  container.innerHTML = '<div class="loading">Загрузка...</div>';
  const { data, error } = await db.from('devices').select('*').order('name');
  if (error) { container.innerHTML = `<p style="color:var(--red)">Ошибка: ${error.message}</p>`; return; }
  allDevices = data || [];
  document.getElementById('searchDevices').value = '';
  renderDevices(allDevices);
}

function renderDevices(devices) {
  const container = document.getElementById('deviceList');
  document.getElementById('deviceCount').textContent = `${devices.length} из ${allDevices.length}`;
  if (!devices.length) { container.innerHTML = '<p class="text-muted">Ничего не найдено</p>'; return; }
  container.innerHTML = devices.map(d => `
    <div class="card">
      <div class="flex-between">
        <div>
          <div style="font-weight:600;">${d.name}</div>
          <div class="text-muted">${d.type} · ${d.location}</div>
        </div>
        <span class="status status-${d.status}">${statusLabel(d.status)}</span>
      </div>
      <div class="flex mt-8" style="flex-wrap:wrap;gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="openEditDevice('${d.id}')">✏ Изменить</button>
        <button class="btn btn-secondary btn-sm" onclick="openContent('${d.id}', '${d.name}')">📄 Контент</button>
        <button class="btn btn-secondary btn-sm" onclick="showQR('${d.id}')">📱 QR-код</button>
        <a href="device.html?id=${d.id}" class="btn btn-secondary btn-sm" target="_blank">👁 Просмотр</a>
        <button class="btn btn-danger btn-sm" onclick="deleteDevice('${d.id}', '${d.name}')">✕ Удалить</button>
      </div>
    </div>`).join('');
}

function statusLabel(s) {
  return { active: 'Активно', maintenance: 'Обслуживание', danger: 'Опасность' }[s] || s;
}

async function addDevice() {
  const name = document.getElementById('newDeviceName').value.trim();
  const type = document.getElementById('newDeviceType').value.trim();
  const location = document.getElementById('newDeviceLocation').value.trim();
  const status = document.getElementById('newDeviceStatus').value;
  if (!name || !type || !location) { showAlert('deviceAlert', 'Заполните все поля', 'error'); return; }
  const btn = document.querySelector('[onclick="addDevice()"]');
  btn.disabled = true; btn.textContent = 'Сохранение...';
  const { error } = await db.from('devices').insert({ name, type, location, status });
  btn.disabled = false; btn.textContent = '+ Добавить устройство';
  if (error) { showAlert('deviceAlert', 'Ошибка: ' + error.message, 'error'); return; }
  showAlert('deviceAlert', 'Устройство добавлено!', 'success');
  document.getElementById('newDeviceName').value = '';
  document.getElementById('newDeviceType').value = '';
  document.getElementById('newDeviceLocation').value = '';
  await loadDevices();
}

async function deleteDevice(id, name) {
  if (!confirm(`Удалить устройство "${name}"?`)) return;
  const { error } = await db.from('devices').delete().eq('id', id);
  if (error) { showAlert('deviceAlert', 'Ошибка: ' + error.message, 'error'); return; }
  showAlert('deviceAlert', 'Устройство удалено', 'success');
  await loadDevices();
}

async function openEditDevice(id) {
  const device = allDevices.find(d => d.id === id);
  if (!device) return;
  document.getElementById('editDeviceId').value = id;
  document.getElementById('editDeviceName').value = device.name;
  document.getElementById('editDeviceType').value = device.type;
  document.getElementById('editDeviceLocation').value = device.location;
  document.getElementById('editDeviceStatus').value = device.status;
  document.getElementById('modalEditDevice').classList.add('show');
}

function closeEditDevice() { document.getElementById('modalEditDevice').classList.remove('show'); }

async function saveDevice() {
  const id = document.getElementById('editDeviceId').value;
  const name = document.getElementById('editDeviceName').value.trim();
  const type = document.getElementById('editDeviceType').value.trim();
  const location = document.getElementById('editDeviceLocation').value.trim();
  const status = document.getElementById('editDeviceStatus').value;
  if (!name || !type || !location) { alert('Заполните все поля'); return; }
  const { error } = await db.from('devices').update({ name, type, location, status }).eq('id', id);
  if (error) { alert('Ошибка: ' + error.message); return; }
  closeEditDevice();
  showAlert('deviceAlert', 'Устройство обновлено!', 'success');
  await loadDevices();
}

async function openContent(deviceId, deviceName) {
  document.getElementById('contentDeviceName').textContent = deviceName;
  document.getElementById('contentDeviceId').value = deviceId;
  document.getElementById('basicTitle').value = '';
  document.getElementById('basicContent').value = '';
  document.getElementById('fullTitle').value = '';
  document.getElementById('fullContent').value = '';
  const { data } = await db.from('device_info').select('*').eq('device_id', deviceId);
  const basic = data?.find(d => d.level === 'basic');
  const full = data?.find(d => d.level === 'full');
  if (basic) { document.getElementById('basicTitle').value = basic.title; document.getElementById('basicContent').value = basic.content; }
  if (full) { document.getElementById('fullTitle').value = full.title; document.getElementById('fullContent').value = full.content; }
  document.getElementById('modalContent').classList.add('show');
}

function closeContent() { document.getElementById('modalContent').classList.remove('show'); }

async function saveContent() {
  const deviceId = document.getElementById('contentDeviceId').value;
  const rows = [
    { level: 'basic', title: document.getElementById('basicTitle').value.trim(), content: document.getElementById('basicContent').value.trim() },
    { level: 'full', title: document.getElementById('fullTitle').value.trim(), content: document.getElementById('fullContent').value.trim() }
  ];
  for (const row of rows) {
    if (!row.title) continue;
    const { data: existing } = await db.from('device_info').select('id').eq('device_id', deviceId).eq('level', row.level).maybeSingle();
    if (existing) {
      await db.from('device_info').update({ title: row.title, content: row.content, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await db.from('device_info').insert({ device_id: deviceId, level: row.level, title: row.title, content: row.content });
    }
  }
  closeContent();
  showAlert('deviceAlert', 'Контент сохранён!', 'success');
}

function showQR(deviceId) {
  const base = window.location.href.replace('admin.html', '');
  const url = `${base}device.html?id=${deviceId}`;
  document.getElementById('qrDeviceUrl').textContent = url;
  document.getElementById('qrContainer').innerHTML = '';
  new QRCode(document.getElementById('qrContainer'), {
    text: url, width: 220, height: 220,
    colorDark: '#000000', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
  document.getElementById('modalQR').classList.add('show');
}

function closeQR() { document.getElementById('modalQR').classList.remove('show'); }

function downloadQR() {
  const canvas = document.querySelector('#qrContainer canvas');
  if (!canvas) { alert('QR ещё не готов, подождите секунду'); return; }
  const link = document.createElement('a');
  link.download = 'qrcode.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ── USERS ──
async function loadUsers() {
  const container = document.getElementById('userList');
  container.innerHTML = '<div class="loading">Загрузка...</div>';
  const { data, error } = await db.from('users').select('*').order('full_name');
  if (error) { container.innerHTML = `<p style="color:var(--red)">Ошибка: ${error.message}</p>`; return; }
  allUsers = data || [];
  document.getElementById('searchUsers').value = '';
  renderUsers(allUsers);
}

function renderUsers(users) {
  const container = document.getElementById('userList');
  document.getElementById('userCount').textContent = `${users.length} из ${allUsers.length}`;
  if (!users.length) { container.innerHTML = '<p class="text-muted">Ничего не найдено</p>'; return; }
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>ФИО</th><th>ИИН</th><th>Роль</th><th>Действия</th></tr></thead>
        <tbody>
          ${users.map(u => {
            const isSelf = u.id === currentUserId;
            const roleOptions = ['admin','supervisor','worker']
              .filter(r => r !== u.role)
              .map(r => `<option value="${r}">${roleLabel(r)}</option>`)
              .join('');
            return `<tr>
              <td>${u.full_name}${isSelf ? ' <span style="color:var(--accent);font-size:11px;">(вы)</span>' : ''}</td>
              <td class="text-mono">${u.iin}</td>
              <td><span class="role-badge role-${u.role}">${roleLabel(u.role)}</span></td>
              <td>
                ${isSelf ? '<span class="text-muted" style="font-size:12px;">нельзя изменить</span>' : `
                <div class="flex" style="flex-wrap:wrap;">
                  <select style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:6px;font-size:12px;cursor:pointer;" onchange="changeRole('${u.id}', this.value)">
                    <option value="">→ Роль</option>${roleOptions}
                  </select>
                  <button class="btn btn-secondary btn-sm" onclick="resetUserPassword('${u.id}', '${u.full_name.replace(/'/g,"\\'")}')">🔑 Пароль</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}', '${u.full_name.replace(/'/g,"\\'")}')">✕</button>
                </div>`}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function roleLabel(r) {
  return { admin: 'admin', supervisor: 'начальник', worker: 'рабочий' }[r] || r;
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
  btn.disabled = false; btn.textContent = '+ Добавить пользователя';
  if (error) {
    if (error.code === '23505') { showAlert('userAlert', 'Пользователь с таким ИИН уже существует', 'error'); }
    else { showAlert('userAlert', 'Ошибка: ' + error.message, 'error'); }
    return;
  }
  showAlert('userAlert', `${full_name} добавлен!`, 'success');
  document.getElementById('newUserIin').value = '';
  document.getElementById('newUserName').value = '';
  document.getElementById('newUserPassword').value = '';
  await loadUsers();
}

async function changeRole(id, newRole) {
  if (!newRole) return;
  if (id === currentUserId) { showAlert('userAlert', 'Нельзя изменить свою роль', 'error'); await loadUsers(); return; }
  const { error } = await db.from('users').update({ role: newRole }).eq('id', id);
  if (error) { showAlert('userAlert', 'Ошибка: ' + error.message, 'error'); return; }
  showAlert('userAlert', 'Роль изменена', 'success');
  await loadUsers();
}

async function deleteUser(id, name) {
  if (id === currentUserId) { showAlert('userAlert', 'Нельзя удалить самого себя', 'error'); return; }
  if (!confirm(`Удалить пользователя "${name}"?`)) return;
  const { error } = await db.from('users').delete().eq('id', id);
  if (error) { showAlert('userAlert', 'Ошибка: ' + error.message, 'error'); return; }
  showAlert('userAlert', 'Пользователь удалён', 'success');
  await loadUsers();
}

// ── EXCEL IMPORT ──
function openImport() { document.getElementById('modalImport').classList.add('show'); }
function closeImport() { document.getElementById('modalImport').classList.remove('show'); }

// ── EXCEL EXPORT ──
function exportExcel() {
  if (!allUsers.length) { showAlert("userAlert", "Нет данных для экспорта", "error"); return; }
  const XLSX = window.XLSX;
  const rows = allUsers.map(u => ({ "ИИН": u.iin, "ФИО": u.full_name, "Пароль": u.password_hash, "Роль": u.role, "Телефон": u.phone || "" }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Пользователи");
  XLSX.writeFile(wb, "пользователи.xlsx");
}

async function resetUserPassword(userId, name) {
  const newPass = prompt(`Новый пароль для "${name}":`);
  if (!newPass || newPass.length < 4) { showAlert("userAlert", "Пароль минимум 4 символа", "error"); return; }
  const { error } = await db.from("users").update({ password_hash: newPass }).eq("id", userId);
  if (error) { showAlert("userAlert", "Ошибка: " + error.message, "error"); return; }
  showAlert("userAlert", `Пароль для ${name} изменён`, "success");
  await loadUsers();
}

async function resetAllPasswords() {
  const newPass = prompt("Установить всем одинаковый пароль:");
  if (!newPass || newPass.length < 4) { showAlert("userAlert", "Пароль минимум 4 символа", "error"); return; }
  if (!confirm(`Установить пароль всем ${allUsers.length} пользователям?`)) return;
  const { error } = await db.from("users").update({ password_hash: newPass }).neq("id", currentUserId);
  if (error) { showAlert("userAlert", "Ошибка: " + error.message, "error"); return; }
  showAlert("userAlert", "Пароль изменён для всех!", "success");
  await loadUsers();
}

async function importExcel() {
  const file = document.getElementById('excelFile').files[0];
  if (!file) { showAlert('importAlert', 'Выберите файл', 'error'); return; }

  const XLSX = window.XLSX;
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const workbook = XLSX.read(e.target.result, { type: 'binary' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);

      if (!rows.length) { showAlert('importAlert', 'Файл пустой', 'error'); return; }

      // Показать превью
      const preview = rows.slice(0, 3).map(r => JSON.stringify(r)).join('\n');
      document.getElementById('importPreview').textContent =
        `Найдено строк: ${rows.length}\nПример первых 3:\n${preview}`;

      // Маппинг колонок
      const roleMap = document.getElementById('importRole').value;
      const passwordDefault = document.getElementById('importPassword').value || '1234';

      const users = rows.map(r => ({
        iin: String(r['ИИН'] || r['иин'] || r['iin'] || r['IIN'] || '').replace(/\D/g, '').slice(0, 12),
        full_name: String(r['ФИО'] || r['фио'] || r['Имя'] || r['full_name'] || r['name'] || '').trim(),
        password_hash: String(r['Пароль'] || r['пароль'] || r['password'] || passwordDefault),
        role: String(r['Роль'] || r['роль'] || r['role'] || roleMap)
      })).filter(u => u.iin.length === 12 && u.full_name);

      if (!users.length) {
        showAlert('importAlert', 'Не найдено корректных строк. Проверьте заголовки колонок: ИИН, ФИО, Пароль, Роль', 'error');
        return;
      }

      document.getElementById('importPreview').textContent +=
        `\n\nГотово к загрузке: ${users.length} пользователей`;

      // Загружаем батчами по 100
      const btn = document.getElementById('importBtn');
      btn.disabled = true;
      btn.textContent = 'Загружаем...';

      let success = 0, errors = 0;
      for (let i = 0; i < users.length; i += 100) {
        const batch = users.slice(i, i + 100);
        const { error } = await db.from('users').upsert(batch, { onConflict: 'iin', ignoreDuplicates: false });
        if (error) { errors += batch.length; }
        else { success += batch.length; }
        btn.textContent = `Загружено ${Math.min(i + 100, users.length)} из ${users.length}...`;
      }

      btn.disabled = false;
      btn.textContent = 'Загрузить из Excel';
      showAlert('importAlert', `✅ Загружено: ${success}, ошибок: ${errors}`, success > 0 ? 'success' : 'error');
      if (success > 0) { await loadUsers(); }

    } catch(err) {
      showAlert('importAlert', 'Ошибка чтения файла: ' + err.message, 'error');
    }
  };
  reader.readAsBinaryString(file);
}

// ── LOGS ──
async function loadLogs() {
  const container = document.getElementById('logsList');
  container.innerHTML = '<div class="loading">Загрузка...</div>';
  const { data, error } = await db
    .from('scan_logs')
    .select('scanned_at, devices(name), users(full_name, role)')
    .order('scanned_at', { ascending: false })
    .limit(500);
  if (error) { container.innerHTML = `<p style="color:var(--red)">Ошибка: ${error.message}</p>`; return; }
  allLogs = data || [];

  // Заполнить фильтр по устройствам
  const deviceNames = [...new Set(allLogs.map(l => l.devices?.name).filter(Boolean))];
  const deviceSelect = document.getElementById('filterLogDevice');
  deviceSelect.innerHTML = '<option value="">Все устройства</option>' +
    deviceNames.map(n => `<option value="${n}">${n}</option>`).join('');

  document.getElementById('searchLogs').value = '';
  document.getElementById('filterLogDevice').value = '';
  document.getElementById('filterLogRole').value = '';
  renderLogs(allLogs);
}

function renderLogs(logs) {
  const container = document.getElementById('logsList');
  document.getElementById('logCount').textContent = `${logs.length} из ${allLogs.length}`;
  if (!logs.length) { container.innerHTML = '<p class="text-muted">Ничего не найдено</p>'; return; }
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Время</th><th>Устройство</th><th>Пользователь</th><th>Роль</th></tr></thead>
        <tbody>
          ${logs.map(l => `
            <tr>
              <td>${new Date(l.scanned_at).toLocaleString('ru')}</td>
              <td>${l.devices?.name || '—'}</td>
              <td>${l.users?.full_name || '—'}</td>
              <td><span class="role-badge role-${l.users?.role}">${roleLabel(l.users?.role || '')}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.classList.remove('show'), 5000);
}
