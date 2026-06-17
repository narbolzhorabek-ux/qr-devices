// ══════════════════════════════════════════════
//  КАРТОЧКА ОТУ — device.js
//  Роли: superadmin, admin, chief, itr, worker
// ══════════════════════════════════════════════

let currentDevice = null;
let currentUser = null;
let deviceFiles = [];
let activeTab = 'passport';

async function loadDevice() {
  // Получаем пользователя (может быть null для worker по QR)
  currentUser = getUser();

  const params = new URLSearchParams(window.location.search);
  const deviceId = params.get('id');

  // Шапка
  const headerRight = document.getElementById('headerRight');
  if (currentUser) {
    headerRight.innerHTML = `
      <span style="color:rgba(255,255,255,0.85);font-size:12px;">${currentUser.full_name}</span>
      <span class="role-badge ${roleBadgeClass(currentUser.role)}" style="font-size:10px;">${roleLabel(currentUser.role)}</span>
      ${isAdmin(currentUser) ? '<a href="admin.html" style="color:#fff;font-size:12px;text-decoration:none;border:1px solid rgba(255,255,255,0.4);padding:4px 10px;border-radius:6px;">⚙ Панель</a>' : ''}
      <button onclick="logout()" style="background:transparent;border:1px solid rgba(255,255,255,0.4);color:#fff;padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;">Выйти</button>`;
  } else {
    // Не авторизован — показываем кнопку входа
    headerRight.innerHTML = `<a href="login.html" style="color:#fff;font-size:12px;border:1px solid rgba(255,255,255,0.4);padding:4px 10px;border-radius:6px;text-decoration:none;">Войти</a>`;
  }

  if (!deviceId) {
    // Нет ID — показать список (только для авторизованных)
    if (!currentUser) { window.location.href = 'login.html'; return; }
    await loadDeviceList();
    return;
  }

  await loadDeviceDetail(deviceId);
}

// ── Список устройств ──────────────────────────
async function loadDeviceList() {
  const { data: devices } = await db.from('devices').select('id, name, type, location, status, brand, inv_number').order('name');
  const el = document.getElementById('deviceInfo');
  if (!devices?.length) {
    el.innerHTML = '<div class="card" style="text-align:center;padding:40px;"><p class="text-muted">Нет зарегистрированных ОТУ</p></div>';
    return;
  }
  el.innerHTML = `
    <div class="section-title">Список ОТУ</div>
    ${devices.map(d => `
      <a href="device.html?id=${d.id}" style="text-decoration:none;">
        <div class="card" style="cursor:pointer;margin-bottom:8px;">
          <div class="flex-between">
            <div>
              <div style="font-weight:700;color:var(--text);">${d.name}</div>
              <div class="text-muted" style="font-size:12px;">
                ${d.brand ? d.brand + ' · ' : ''}${d.type || ''} · ${d.location || ''}
                ${d.inv_number ? `<br>📋 ${d.inv_number}` : ''}
              </div>
            </div>
            <span class="status status-${d.status}">${statusLbl(d.status)}</span>
          </div>
        </div>
      </a>`).join('')}`;
}

function statusLbl(s) {
  return { active: 'Активно', maintenance: 'Обслуживание', danger: 'Опасность' }[s] || s;
}

// ── Детальная карточка ОТУ ────────────────────
async function loadDeviceDetail(deviceId) {
  const { data: device, error } = await db.from('devices').select('*').eq('id', deviceId).single();
  if (error || !device) {
    document.getElementById('deviceInfo').innerHTML = `
      <div class="card" style="text-align:center;padding:40px;">
        <div style="font-size:48px;">❌</div>
        <p style="color:var(--red);margin-top:12px;">Устройство не найдено</p>
      </div>`;
    return;
  }

  currentDevice = device;

  // Лог сканирования (только для авторизованных)
  if (currentUser) {
    db.from('scan_logs').insert({ device_id: deviceId, user_id: currentUser.id }).then(() => {});
  }

  // Паспорт устройства
  document.getElementById('deviceInfo').innerHTML = `
    <div class="card" style="margin:16px 16px 0;">
      <div class="flex-between" style="flex-wrap:wrap;gap:8px;margin-bottom:12px;">
        <span class="status status-${device.status}">${statusLbl(device.status)}</span>
        <span style="font-size:12px;color:var(--text-muted);font-family:var(--font-mono);">${device.inv_number ? '📋 ' + device.inv_number : ''}</span>
      </div>
      <div style="font-size:22px;font-weight:800;color:var(--accent);line-height:1.2;">${device.name}</div>
      ${device.brand ? `<div style="font-size:14px;color:var(--text-muted);margin-top:4px;">🏭 ${device.brand}</div>` : ''}
      <div style="margin-top:14px;display:grid;gap:0;">
        ${device.type ? infoRow('Тип устройства', device.type) : ''}
        ${infoRow('Местонахождение', device.location)}
        ${device.description ? infoRow('Общая информация', device.description) : ''}
      </div>
    </div>`;

  // Определяем доступные табы по роли
  buildTabs(deviceId);
}

function infoRow(label, value) {
  return `<div class="info-row"><span class="info-label">${label}</span><span class="info-value">${value}</span></div>`;
}

// ── Построить табы по роли ────────────────────
function buildTabs(deviceId) {
  const wrap = document.getElementById('tabsWrap');
  const pillsEl = document.getElementById('tabPills');
  wrap.style.display = 'block';

  const role = currentUser?.role || 'worker';

  // Табы по ролям:
  // worker (без авторизации или роль worker) — только Паспорт + Документы (public)
  // itr — + ТО (с кнопкой Выполнено) + Акты
  // chief — + ТО (только просмотр) + Акты
  // admin/superadmin — всё + Логи

  const tabs = [
    { id: 'passport', label: '📋 Паспорт', roles: ['superadmin','admin','chief','itr','worker',null] },
    { id: 'docs', label: '📎 Документы', roles: ['superadmin','admin','chief','itr','worker',null] },
    { id: 'to', label: '🔧 ТО', roles: ['superadmin','admin','chief','itr'] },
    { id: 'acts', label: '📝 Акты', roles: ['superadmin','admin','chief','itr'] },
    { id: 'logs', label: '📊 Логи', roles: ['superadmin','admin'] },
  ];

  const visibleTabs = tabs.filter(t => t.roles.includes(role) || t.roles.includes(null));

  pillsEl.innerHTML = visibleTabs.map(t =>
    `<button class="tab-pill ${t.id === 'passport' ? 'active' : ''}" id="pill-${t.id}" onclick="switchDeviceTab('${t.id}')">${t.label}</button>`
  ).join('');

  // Показать/скрыть pane-ы
  ['passport','docs','to','acts','logs'].forEach(id => {
    const pane = document.getElementById('pane-' + id);
    if (pane) pane.style.display = visibleTabs.find(t => t.id === id) ? '' : 'none';
  });

  // Загрузить первый таб
  loadTabContent('passport', deviceId);

  // Загрузка документов для ИТР
  if (['superadmin','admin','itr'].includes(role)) {
    document.getElementById('uploadSection').style.display = 'block';
  }

  // Кнопка Выполнено только для ИТР+
  if (['superadmin','admin','itr'].includes(role)) {
    document.getElementById('doneSection').style.display = 'block';
  }
}

function switchDeviceTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-pill').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  const pill = document.getElementById('pill-' + tab);
  const pane = document.getElementById('pane-' + tab);
  if (pill) pill.classList.add('active');
  if (pane) pane.classList.add('active');
  loadTabContent(tab, currentDevice?.id);
}

async function loadTabContent(tab, deviceId) {
  if (!deviceId) return;

  if (tab === 'passport') await loadPassport(deviceId);
  if (tab === 'docs') await loadDocs(deviceId);
  if (tab === 'to') await loadTO(deviceId);
  if (tab === 'acts') await loadActs(deviceId);
  if (tab === 'logs') await loadLogs(deviceId);
}

// ── ПАСПОРТ ──────────────────────────────────
async function loadPassport(deviceId) {
  const role = currentUser?.role || 'worker';
  const levels = ['superadmin','admin','chief','itr'].includes(role) ? ['basic','full'] : ['basic'];

  const { data: infos } = await db.from('device_info').select('*')
    .eq('device_id', deviceId).in('level', levels);

  const el = document.getElementById('passportContent');

  if (!infos?.length) {
    el.innerHTML = '<p class="text-muted" style="padding:8px;">Информация не добавлена</p>';
    return;
  }

  el.innerHTML = infos.map(info => `
    <div class="card" style="margin-bottom:12px;">
      <div class="flex-between" style="margin-bottom:10px;">
        <div style="font-weight:600;">${info.title || (info.level === 'basic' ? 'Основная информация' : 'Полная информация')}</div>
        ${info.level === 'full' ? '<span class="role-badge role-itr" style="font-size:10px;">ИТР+</span>' : ''}
      </div>
      <p style="font-size:14px;line-height:1.7;white-space:pre-wrap;color:var(--text);">${info.content}</p>
      <div class="text-muted" style="font-size:11px;margin-top:8px;">Обновлено: ${new Date(info.updated_at || info.created_at).toLocaleDateString('ru')}</div>
    </div>`).join('');

  // Смена пароля (только авторизованным)
  if (currentUser) {
    el.innerHTML += `
      <div class="card" style="margin-top:16px;border:1px dashed var(--border);">
        <div style="font-weight:600;margin-bottom:12px;">🔐 Сменить пароль</div>
        <div class="form-group"><label>Новый пароль</label><input type="password" id="newPwd" placeholder="минимум 4 символа"></div>
        <div class="form-group"><label>Повторите пароль</label><input type="password" id="confirmPwd"></div>
        <div class="alert" id="pwdAlert"></div>
        <button class="btn btn-primary" onclick="changePassword()">Сохранить пароль</button>
      </div>`;
  }
}

// ── ДОКУМЕНТЫ ────────────────────────────────
async function loadDocs(deviceId) {
  const role = currentUser?.role || 'worker';
  // Исключаем файлы актов ТО (они в вкладке Акты)
  let query = db.from('device_files').select('*')
    .eq('device_id', deviceId)
    .is('maintenance_log_id', null)  // только обычные документы
    .order('uploaded_at', { ascending: false });

  // Персонал и неавторизованные видят только публичные файлы
  if (!currentUser || role === 'worker') {
    query = query.eq('visible_to_workers', true);
  }

  const { data: files } = await query;
  deviceFiles = files || [];

  const el = document.getElementById('docsContent');

  if (!files?.length) {
    el.innerHTML = '<p class="text-muted" style="padding:8px;">Документов нет</p>';
    checkDoneButton();
    return;
  }

  el.innerHTML = files.map(f => {
    const icon = f.file_type?.includes('pdf') ? '📄'
      : f.file_type?.includes('image') ? '🖼'
      : f.file_type?.includes('word') ? '📝'
      : f.file_type?.includes('sheet') ? '📊' : '📎';
    const url = `https://strmnfwpdtdnevhpqtar.supabase.co/storage/v1/object/public/device-files/${f.file_path}`;
    const isPhoto = f.file_type?.includes('image');
    const canDelete = ['superadmin','admin','itr'].includes(role);

    return `
      <div class="file-item">
        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
          <span style="font-size:24px;">${icon}</span>
          <div style="min-width:0;">
            <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${f.name}</div>
            <div style="display:flex;gap:4px;margin-top:3px;flex-wrap:wrap;">
              ${isPhoto ? '<span class="ok-tag">📷 Фото</span>' : '<span class="ok-tag">📄 Документ</span>'}
              ${f.visible_to_workers ? '<span class="ok-tag">👷 Публично</span>' : '<span class="required-tag">🔒 ИТР+</span>'}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <a href="${url}" target="_blank" class="btn btn-secondary btn-sm">👁</a>
          ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteDeviceFile('${f.id}','${f.file_path}')">✕</button>` : ''}
        </div>
      </div>`;
  }).join('');

  checkDoneButton();
}

async function uploadFileFromDevice(input) {
  const file = input.files[0];
  if (!file || !currentDevice) return;
  if (file.size > 20 * 1024 * 1024) {
    showDeviceAlert('uploadAlert', 'Файл не должен превышать 20MB', 'error');
    return;
  }

  showDeviceAlert('uploadAlert', '⏳ Загружаем...', 'success');

  const ext = file.name.split('.').pop();
  const filePath = `${currentDevice.id}/${Date.now()}.${ext}`;
  const { error: upErr } = await db.storage.from('device-files').upload(filePath, file);

  if (upErr) { showDeviceAlert('uploadAlert', 'Ошибка: ' + upErr.message, 'error'); return; }

  const visible = document.getElementById('uploadVisible').checked;
  await db.from('device_files').insert({
    device_id: currentDevice.id,
    name: file.name,
    file_path: filePath,
    file_type: file.type,
    visible_to_workers: visible
  });

  input.value = '';
  showDeviceAlert('uploadAlert', `✅ ${file.name} загружен!`, 'success');
  await loadDocs(currentDevice.id);
}

async function deleteDeviceFile(id, path) {
  if (!confirm('Удалить файл?')) return;
  await db.storage.from('device-files').remove([path]);
  await db.from('device_files').delete().eq('id', id);
  await loadDocs(currentDevice.id);
}

// ── ТО ───────────────────────────────────────
async function loadTO(deviceId) {
  // КРИТИЧНО: сначала загружаем файлы чтобы кнопка "Выполнено" работала правильно
  const role = currentUser?.role || 'worker';
  let query = db.from('device_files').select('*').eq('device_id', deviceId);
  if (!currentUser || role === 'worker') {
    query = query.eq('visible_to_workers', true);
  }
  const { data: files } = await query;
  deviceFiles = files || [];

  const { data: device } = await db.from('devices')
    .select('maintenance_interval_days, last_maintenance, next_maintenance, notification_email')
    .eq('id', deviceId).single();

  const el = document.getElementById('toContent');
  const today = new Date(); today.setHours(0,0,0,0);

  if (!device?.next_maintenance) {
    el.innerHTML = '<p class="text-muted" style="padding:8px;">График ТО не настроен. Обратитесь к администратору.</p>';
    checkDoneButton();
    return;
  }

  const next = new Date(device.next_maintenance); next.setHours(0,0,0,0);
  const daysLeft = Math.round((next.getTime() - today.getTime()) / 86400000);
  const interval = device.maintenance_interval_days || 90;
  const elapsed = interval - daysLeft;
  const pct = Math.min(100, Math.max(0, Math.round((elapsed / interval) * 100)));
  const barColor = daysLeft < 0 ? 'var(--red)' : daysLeft <= 7 ? 'var(--yellow)' : 'var(--green)';

  let statusBadge = '';
  if (daysLeft < 0) statusBadge = `<span style="background:var(--red-dim);color:var(--red);border:1px solid var(--red);padding:4px 14px;border-radius:100px;font-size:13px;font-weight:700;">⚠️ ПРОСРОЧЕНО на ${Math.abs(daysLeft)} дн.</span>`;
  else if (daysLeft === 0) statusBadge = `<span style="background:var(--red-dim);color:var(--red);border:1px solid var(--red);padding:4px 14px;border-radius:100px;font-size:13px;font-weight:700;">🔴 СЕГОДНЯ</span>`;
  else if (daysLeft <= 7) statusBadge = `<span style="background:var(--yellow-dim);color:var(--yellow);border:1px solid var(--yellow);padding:4px 14px;border-radius:100px;font-size:13px;font-weight:700;">🟡 ${daysLeft} дн.</span>`;
  else statusBadge = `<span style="background:var(--green-dim);color:var(--green);border:1px solid var(--green);padding:4px 14px;border-radius:100px;font-size:13px;">🟢 ${daysLeft} дн.</span>`;

  el.innerHTML = `
    <div class="card" style="margin-bottom:12px;">
      <div class="flex-between" style="margin-bottom:12px;">
        <div style="font-weight:700;">График ТО</div>
        ${statusBadge}
      </div>
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:4px;">
          <span>Прогресс цикла</span><span>${pct}%</span>
        </div>
        <div style="background:var(--surface2);border-radius:100px;height:8px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${barColor};border-radius:100px;transition:width .3s;"></div>
        </div>
      </div>
      ${infoRow('Последнее ТО', device.last_maintenance ? new Date(device.last_maintenance).toLocaleDateString('ru') : '—')}
      ${infoRow('Следующее ТО', new Date(device.next_maintenance).toLocaleDateString('ru'))}
      ${infoRow('Интервал', `каждые ${interval} дней`)}
      ${device.notification_email ? infoRow('Email уведомлений', device.notification_email) : ''}
    </div>`;

  // История ТО
  const { data: logs } = await db.from('maintenance_logs')
    .select('*').eq('device_id', deviceId).order('maintenance_date', { ascending: false }).limit(10);

  if (logs?.length) {
    el.innerHTML += `
      <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;">История ТО</div>
      ${logs.map(l => `
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <span>${new Date(l.maintenance_date).toLocaleDateString('ru')}</span>
          <span class="text-muted">${l.notes || 'Выполнено'}</span>
        </div>`).join('')}`;
  }

  checkDoneButton();
}

// ── КНОПКА ВЫПОЛНЕНО ─────────────────────────
function checkDoneButton() {
  const doneSection = document.getElementById('doneSection');
  if (!doneSection || doneSection.style.display === 'none') return;

  const hasDoc = deviceFiles.some(f => !f.file_type?.includes('image'));
  const hasPhoto = deviceFiles.some(f => f.file_type?.includes('image'));
  const canDone = hasDoc && hasPhoto;

  const btn = document.getElementById('doneBtn');
  const hint = document.getElementById('doneBtnHint');
  const req = document.getElementById('doneRequirements');

  btn.disabled = !canDone;
  btn.style.opacity = canDone ? '1' : '0.5';
  hint.style.display = canDone ? 'none' : 'block';

  req.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <span class="${hasDoc ? 'ok-tag' : 'required-tag'}">
        ${hasDoc ? '✅' : '❌'} Акт/документ
      </span>
      <span class="${hasPhoto ? 'ok-tag' : 'required-tag'}">
        ${hasPhoto ? '✅' : '❌'} Фотография
      </span>
    </div>
    <div style="font-size:12px;color:var(--text-muted);margin-top:6px;">
      ${canDone ? 'Все требования выполнены — можно нажать кнопку' : 'Загрузите оба типа файлов во вкладке Документы'}
    </div>`;
}

async function markDone() {
  if (!currentDevice || !currentUser) return;
  if (!confirm('Подтвердить выполнение ТО?')) return;

  const notes = document.getElementById('doneNotes').value.trim();
  const today = new Date().toISOString().split('T')[0];
  const interval = currentDevice.maintenance_interval_days || 90;
  const next = new Date();
  next.setDate(next.getDate() + interval);
  const nextDate = next.toISOString().split('T')[0];

  const btn = document.getElementById('doneBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Сохранение...';

  // Обновить устройство
  const { error } = await db.from('devices').update({
    last_maintenance: today,
    next_maintenance: nextDate,
    status: 'active'
  }).eq('id', currentDevice.id);

  if (error) {
    showDeviceAlert('doneAlert', 'Ошибка: ' + error.message, 'error');
    btn.disabled = false;
    btn.textContent = '✅ Отметить выполненным';
    return;
  }

  // Записать лог ТО
  await db.from('maintenance_logs').insert({
    device_id: currentDevice.id,
    maintenance_date: today,
    notes: notes || null,
    performed_by: currentUser.id
  });

  // Обновить локальный объект
  currentDevice.last_maintenance = today;
  currentDevice.next_maintenance = nextDate;

  showDeviceAlert('doneAlert', `✅ ТО зафиксировано! Следующее: ${next.toLocaleDateString('ru')}`, 'success');
  document.getElementById('doneNotes').value = '';
  btn.textContent = '✅ Отметить выполненным';

  // Перезагрузить таб ТО
  await loadTO(currentDevice.id);
}

// ── АКТЫ ─────────────────────────────────────
async function loadActs(deviceId) {
  const { data: logs } = await db.from('maintenance_logs')
    .select('*, users:performed_by(full_name)')
    .eq('device_id', deviceId)
    .order('maintenance_date', { ascending: false });

  const el = document.getElementById('actsContent');
  if (!logs?.length) {
    el.innerHTML = '<p class="text-muted" style="padding:8px;">Актов выполненных работ нет</p>';
    return;
  }

  const baseUrl = 'https://strmnfwpdtdnevhpqtar.supabase.co/storage/v1/object/public/device-files/';

  // Загружаем файлы для каждого акта
  const logsWithFiles = await Promise.all(logs.map(async l => {
    const { data: files } = await db.from('device_files')
      .select('*').eq('maintenance_log_id', l.id);
    return { ...l, files: files || [] };
  }));

  const statusBadge = s => s === 'approved'
    ? '<span style="background:var(--green-dim);color:var(--green);border:1px solid var(--green);padding:2px 8px;border-radius:100px;font-size:11px;">✅ Одобрено</span>'
    : s === 'rejected'
    ? '<span style="background:var(--red-dim);color:var(--red);border:1px solid var(--red);padding:2px 8px;border-radius:100px;font-size:11px;">❌ Отклонено</span>'
    : '<span style="background:var(--yellow-dim);color:var(--yellow);border:1px solid var(--yellow);padding:2px 8px;border-radius:100px;font-size:11px;">🕐 На проверке</span>';

  el.innerHTML = logsWithFiles.map(l => {
    const docs = l.files.filter(f => f.file_category === 'act_doc' || (!f.file_type?.includes('image') && f.maintenance_log_id));
    const photos = l.files.filter(f => f.file_category === 'act_photo' || (f.file_type?.includes('image') && f.maintenance_log_id));

    return `
      <div class="card" style="margin-bottom:12px;">
        <div class="flex-between" style="flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-weight:700;">${new Date(l.maintenance_date).toLocaleDateString('ru', {day:'numeric',month:'long',year:'numeric'})}</div>
            <div class="text-muted" style="font-size:12px;margin-top:2px;">${l.users?.full_name ? 'Выполнил: '+l.users.full_name : ''}</div>
          </div>
          ${statusBadge(l.status)}
        </div>
        ${l.notes ? `<div style="margin-top:8px;font-size:13px;background:var(--surface2);padding:10px;border-radius:6px;">${l.notes}</div>` : ''}
        ${docs.length || photos.length ? `
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;font-weight:600;">📎 Файлы акта:</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start;">
              ${docs.map(f => `<a href="${baseUrl}${f.file_path}" target="_blank" class="btn btn-secondary btn-sm" style="font-size:11px;">📄 ${f.name}</a>`).join('')}
              ${photos.map(f => `<a href="${baseUrl}${f.file_path}" target="_blank"><img src="${baseUrl}${f.file_path}" style="height:60px;width:60px;object-fit:cover;border-radius:6px;border:2px solid var(--border);" title="${f.name}"></a>`).join('')}
            </div>
          </div>` : ''}
      </div>`;
  }).join('');
}

// ── ЛОГИ ─────────────────────────────────────
async function loadLogs(deviceId) {
  const { data: logs } = await db.from('scan_logs')
    .select('scanned_at, users(full_name, role)')
    .eq('device_id', deviceId)
    .order('scanned_at', { ascending: false })
    .limit(50);

  const el = document.getElementById('logsContent');

  if (!logs?.length) {
    el.innerHTML = '<p class="text-muted" style="padding:8px;">Сканирований нет</p>';
    return;
  }

  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Время</th><th>Пользователь</th><th>Роль</th></tr></thead>
        <tbody>
          ${logs.map(l => `
            <tr>
              <td style="font-size:12px;">${new Date(l.scanned_at).toLocaleString('ru')}</td>
              <td>${l.users?.full_name || '—'}</td>
              <td><span class="role-badge ${roleBadgeClass(l.users?.role || '')}" style="font-size:10px;">${roleLabel(l.users?.role || '—')}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── СМЕНА ПАРОЛЯ ─────────────────────────────
async function changePassword() {
  const newPwd = document.getElementById('newPwd').value;
  const confirmPwd = document.getElementById('confirmPwd').value;

  if (newPwd.length < 4) { showDeviceAlert('pwdAlert', 'Минимум 4 символа', 'error'); return; }
  if (newPwd !== confirmPwd) { showDeviceAlert('pwdAlert', 'Пароли не совпадают', 'error'); return; }

  const { error } = await db.from('users').update({ password_hash: newPwd }).eq('id', currentUser.id);
  if (error) { showDeviceAlert('pwdAlert', 'Ошибка: ' + error.message, 'error'); return; }

  showDeviceAlert('pwdAlert', '✅ Пароль изменён!', 'success');
  document.getElementById('newPwd').value = '';
  document.getElementById('confirmPwd').value = '';
}

// ── УТИЛИТЫ ──────────────────────────────────
function showDeviceAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.classList.remove('show'), 5000);
}
