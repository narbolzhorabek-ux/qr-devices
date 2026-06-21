// ══════════════════════════════════════════════
//  ADMIN.JS — v4: Филиалы/Подразделения/Службы, МОЛ, Фото, Экспорт актов
// ══════════════════════════════════════════════

let currentTab = 'devices';
let allDevices = [];
let allUsers = [];
let allLogs = [];
let allBranches = [];
let allDepartments = [];
let allServices = [];
let currentUser = null;
let currentContentTab = 'basic';
let newDevicePhotoFile = null;
let editDevicePhotoFile = null;

// ── INIT ──────────────────────────────────────
async function initAdmin() {
  currentUser = requireAdmin();
  if (!currentUser) return;

  document.getElementById('userName').textContent = currentUser.full_name;
  const roleEl = document.getElementById('userRoleBadge');
  if (roleEl) roleEl.innerHTML = `<span class="role-badge ${roleBadgeClass(currentUser.role)}">${roleLabel(currentUser.role)}</span>`;

  document.querySelectorAll('.superadmin-only').forEach(el => {
    el.style.display = isSuperAdmin(currentUser) ? '' : 'none';
  });

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

  await loadOrgStructure();
  await loadUsers();
  await loadDevices();
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

function esc(s) { return (s||'').replace(/'/g,"\\'"); }

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
  if (tab === 'acts') loadActsTab();
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

// ══════════════════════════════════════════════
//  ОРГСТРУКТУРА: Филиал → Подразделение → Служба
// ══════════════════════════════════════════════
async function loadOrgStructure() {
  const [b, d, s] = await Promise.all([
    db.from('branches').select('*').order('name'),
    db.from('departments').select('*').order('name'),
    db.from('services').select('*').order('name')
  ]);
  allBranches = b.data || [];
  allDepartments = d.data || [];
  allServices = s.data || [];
  populateBranchSelects();
}

function populateBranchSelects() {
  // Заполняем филиалы во всех select'ах филиалов
  document.querySelectorAll('.branch-select').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = `<option value="">— Выберите филиал —</option>` +
      allBranches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    if (cur) sel.value = cur;
  });
}

// Каскадное обновление: при выборе филиала — подгружаем подразделения или сразу службы
function onBranchChange(branchSelectId, deptSelectId, serviceSelectId) {
  const branchId = document.getElementById(branchSelectId).value;
  const deptSel = document.getElementById(deptSelectId);
  const serviceSel = document.getElementById(serviceSelectId);
  const deptWrap = document.getElementById(deptSelectId + 'Wrap');

  serviceSel.innerHTML = `<option value="">— Выберите службу —</option>`;
  deptSel.innerHTML = `<option value="">— Выберите подразделение —</option>`;

  if (!branchId) {
    if (deptWrap) deptWrap.style.display = 'none';
    return;
  }

  const branch = allBranches.find(b => b.id === branchId);

  if (branch?.has_departments) {
    // Показать подразделения
    if (deptWrap) deptWrap.style.display = 'block';
    const depts = allDepartments.filter(d => d.branch_id === branchId);
    deptSel.innerHTML += depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  } else {
    // ИТЦ и подобные — сразу к службам, скрыть подразделение
    if (deptWrap) deptWrap.style.display = 'none';
    const services = allServices.filter(s => s.branch_id === branchId && !s.department_id);
    serviceSel.innerHTML += services.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  }
}

// При выборе подразделения — подгружаем службы
function onDepartmentChange(deptSelectId, serviceSelectId) {
  const deptId = document.getElementById(deptSelectId).value;
  const serviceSel = document.getElementById(serviceSelectId);
  serviceSel.innerHTML = `<option value="">— Выберите службу —</option>`;
  if (!deptId) return;
  const services = allServices.filter(s => s.department_id === deptId);
  serviceSel.innerHTML += services.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

function serviceLabel(serviceId) {
  if (!serviceId) return '🌐 Общий';
  const s = allServices.find(x => x.id === serviceId);
  if (!s) return '—';
  const branch = allBranches.find(b => b.id === s.branch_id);
  const dept = allDepartments.find(d => d.id === s.department_id);
  const parts = [branch?.name, dept?.name, s.name].filter(Boolean);
  return '📍 ' + parts.join(' / ');
}

function serviceShortLabel(serviceId) {
  if (!serviceId) return '🌐 Общий';
  const s = allServices.find(x => x.id === serviceId);
  return s ? `📍 ${s.name}` : '—';
}

// ── Доступ по службе ──────────────────────────
function getAccessibleDevices(devices) {
  if (isSuperAdmin(currentUser)) return devices;
  if (!currentUser.service_id) return devices;
  return devices.filter(d => d.service_id === currentUser.service_id);
}

function getAccessibleUsers(users) {
  if (isSuperAdmin(currentUser)) return users;
  if (!currentUser.service_id) return users;
  return users.filter(u => !u.service_id || u.service_id === currentUser.service_id);
}

// ══════════════════════════════════════════════
//  УПРАВЛЕНИЕ ЗОНАМИ (Филиалы/Подразделения/Службы)
// ══════════════════════════════════════════════
async function loadZonesTab() {
  await loadOrgStructure();
  const addCard = document.getElementById('addZoneCard');
  if (addCard) addCard.style.display = isAdmin(currentUser) ? 'block' : 'none';

  renderBranchSelect();
  renderZonesList();
}

function renderBranchSelect() {
  const sel = document.getElementById('zoneBranchSelect');
  if (!sel) return;
  sel.innerHTML = `<option value="">— Выберите филиал —</option>` +
    allBranches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
}

function onZoneBranchSelect() {
  const branchId = document.getElementById('zoneBranchSelect').value;
  const deptWrap = document.getElementById('zoneDeptWrap');
  const deptSel = document.getElementById('zoneDeptSelect');

  if (!branchId) { deptWrap.style.display = 'none'; return; }

  const branch = allBranches.find(b => b.id === branchId);
  if (branch?.has_departments) {
    deptWrap.style.display = 'block';
    const depts = allDepartments.filter(d => d.branch_id === branchId);
    deptSel.innerHTML = `<option value="">— Выберите подразделение —</option>` +
      depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  } else {
    deptWrap.style.display = 'none';
  }
}

async function addDepartment() {
  if (!isAdmin(currentUser)) { showAlert('zoneAlert','⛔ Только администратор может добавлять','error'); return; }
  const branchId = document.getElementById('zoneBranchSelect').value;
  const name = document.getElementById('newDeptName').value.trim();
  if (!branchId) { showAlert('zoneAlert','Выберите филиал','error'); return; }
  if (!name) { showAlert('zoneAlert','Введите название подразделения','error'); return; }

  const { error } = await db.from('departments').insert({ branch_id: branchId, name });
  if (error) { showAlert('zoneAlert', error.message.includes('unique')?'Такое подразделение уже есть':'Ошибка: '+error.message, 'error'); return; }
  document.getElementById('newDeptName').value = '';
  showAlert('zoneAlert','✅ Подразделение добавлено','success');
  await loadZonesTab();
}

async function addService() {
  if (!isAdmin(currentUser)) { showAlert('zoneAlert','⛔ Только администратор может добавлять','error'); return; }
  const branchId = document.getElementById('zoneBranchSelect').value;
  const deptId = document.getElementById('zoneDeptSelect').value || null;
  const name = document.getElementById('newServiceName').value.trim();
  if (!branchId) { showAlert('zoneAlert','Выберите филиал','error'); return; }
  if (!name) { showAlert('zoneAlert','Введите название службы','error'); return; }

  const branch = allBranches.find(b => b.id === branchId);
  if (branch?.has_departments && !deptId) { showAlert('zoneAlert','Выберите подразделение','error'); return; }

  const { error } = await db.from('services').insert({ branch_id: branchId, department_id: deptId, name });
  if (error) { showAlert('zoneAlert','Ошибка: '+error.message,'error'); return; }
  document.getElementById('newServiceName').value = '';
  showAlert('zoneAlert','✅ Служба добавлена','success');
  await loadZonesTab();
}

function renderZonesList() {
  const container = document.getElementById('zonesList');
  if (!container) return;

  container.innerHTML = allBranches.map(branch => {
    const depts = allDepartments.filter(d => d.branch_id === branch.id);
    const directServices = allServices.filter(s => s.branch_id === branch.id && !s.department_id);

    return `
      <div class="card" style="margin-bottom:14px;">
        <div class="flex-between">
          <div style="font-weight:700;font-size:16px;color:var(--accent);">🏢 ${branch.name}</div>
          ${isSuperAdmin(currentUser) ? `<button class="btn btn-danger btn-sm" onclick="deleteBranch('${branch.id}','${esc(branch.name)}')">✕</button>` : ''}
        </div>
        ${branch.has_departments ? depts.map(dept => {
          const deptServices = allServices.filter(s => s.department_id === dept.id);
          return `
            <div style="margin-left:16px;margin-top:10px;padding-left:12px;border-left:2px solid var(--border);">
              <div class="flex-between">
                <div style="font-weight:600;font-size:14px;">📁 ${dept.name}</div>
                ${isSuperAdmin(currentUser) ? `<button class="btn btn-danger btn-sm" onclick="deleteDepartment('${dept.id}','${esc(dept.name)}')">✕</button>` : ''}
              </div>
              <div style="margin-left:14px;margin-top:6px;">
                ${deptServices.map(s => `
                  <div class="flex-between" style="padding:4px 0;font-size:13px;color:var(--text-muted);">
                    <span>📍 ${s.name}</span>
                    ${isSuperAdmin(currentUser) ? `<button class="btn btn-danger btn-sm" onclick="deleteService('${s.id}','${esc(s.name)}')">✕</button>` : ''}
                  </div>`).join('') || '<span class="text-muted" style="font-size:12px;">Нет служб</span>'}
              </div>
            </div>`;
        }).join('') : `
          <div style="margin-left:16px;margin-top:10px;">
            ${directServices.map(s => `
              <div class="flex-between" style="padding:4px 0;font-size:13px;color:var(--text-muted);">
                <span>📍 ${s.name}</span>
                ${isSuperAdmin(currentUser) ? `<button class="btn btn-danger btn-sm" onclick="deleteService('${s.id}','${esc(s.name)}')">✕</button>` : ''}
              </div>`).join('') || '<span class="text-muted" style="font-size:12px;">Нет служб</span>'}
          </div>`}
      </div>`;
  }).join('');
}

async function deleteBranch(id, name) {
  if (!isSuperAdmin(currentUser)) return;
  if (!confirm(`Удалить филиал "${name}" и все его подразделения/службы?`)) return;
  const { error } = await db.from('branches').delete().eq('id', id);
  if (error) { showAlert('zoneAlert','Ошибка: '+error.message,'error'); return; }
  await loadZonesTab();
}

async function deleteDepartment(id, name) {
  if (!isSuperAdmin(currentUser)) return;
  if (!confirm(`Удалить подразделение "${name}"?`)) return;
  const { error } = await db.from('departments').delete().eq('id', id);
  if (error) { showAlert('zoneAlert','Ошибка: '+error.message,'error'); return; }
  await loadZonesTab();
}

async function deleteService(id, name) {
  if (!isSuperAdmin(currentUser)) return;
  if (!confirm(`Удалить службу "${name}"?`)) return;
  const { error } = await db.from('services').delete().eq('id', id);
  if (error) { showAlert('zoneAlert','Ошибка: '+error.message,'error'); return; }
  await loadZonesTab();
}

// ══════════════════════════════════════════════
//  УСТРОЙСТВА (ОТУ)
// ══════════════════════════════════════════════
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
  renderDevices(allDevices.filter(d =>
    (!q || d.name?.toLowerCase().includes(q) || d.type?.toLowerCase().includes(q) || d.location?.toLowerCase().includes(q) || d.inv_number?.toLowerCase().includes(q)) &&
    (!st || d.status === st)
  ));
}

function renderDevices(devices) {
  const container = document.getElementById('deviceList');
  document.getElementById('deviceCount').textContent = `${devices.length} из ${allDevices.length}`;
  if (!devices.length) { container.innerHTML = '<p class="text-muted" style="padding:20px;">Ничего не найдено</p>'; return; }

  const baseUrl = 'https://strmnfwpdtdnevhpqtar.supabase.co/storage/v1/object/public/device-files/';

  container.innerHTML = devices.map(d => {
    const responsible = allUsers.find(u => u.id === d.responsible_user_id);
    return `
    <div class="card">
      <div class="flex-between" style="flex-wrap:wrap;gap:8px;">
        <div style="display:flex;gap:12px;flex:1;min-width:200px;">
          ${d.photo_path ? `<img src="${baseUrl}${d.photo_path}" style="width:64px;height:64px;border-radius:8px;object-fit:cover;border:1px solid var(--border);flex-shrink:0;">` : `<div style="width:64px;height:64px;border-radius:8px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">📦</div>`}
          <div>
            <div style="font-weight:700;font-size:16px;">${d.name}</div>
            <div class="text-muted" style="margin-top:2px;font-size:12px;">
              ${d.brand ? `🏷 ${d.brand} · ` : ''}${d.type || ''} · ${d.location || ''}
              ${d.inv_number ? ` · 📋 ${d.inv_number}` : ''}
            </div>
            <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;">
              <span class="ica-badge" style="font-size:11px;">${serviceLabel(d.service_id)}</span>
              ${responsible ? `<span class="ica-badge" style="font-size:11px;background:var(--green-dim);color:var(--green);border-color:var(--green);">👤 МОЛ: ${responsible.full_name}</span>` : ''}
            </div>
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
    </div>`;
  }).join('');
}

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

// Фото при добавлении устройства
function handleNewDevicePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  newDevicePhotoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('newDevicePhotoPreview').innerHTML = `<img src="${e.target.result}" style="width:100%;max-width:200px;border-radius:8px;margin-top:8px;">`;
  };
  reader.readAsDataURL(file);
}

async function populateResponsibleSelect(selectId, serviceId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = `<option value="">— Не назначен —</option>`;
  if (!serviceId) {
    sel.innerHTML += allUsers.filter(u => isAdmin(u)).map(u => `<option value="${u.id}">${u.full_name} (${roleLabel(u.role)})</option>`).join('');
    return;
  }
  // Пользователи той же службы (обычно ИТР/admin)
  const candidates = allUsers.filter(u => u.service_id === serviceId || isAdmin(u));
  sel.innerHTML += candidates.map(u => `<option value="${u.id}">${u.full_name} (${roleLabel(u.role)})</option>`).join('');
}

function onNewDeviceServiceChange() {
  const serviceId = document.getElementById('newDeviceServiceSelect').value;
  populateResponsibleSelect('newDeviceResponsible', serviceId);
}

async function addDevice() {
  const name = document.getElementById('newDeviceName').value.trim();
  const brand = document.getElementById('newDeviceBrand').value.trim();
  const inv_number = document.getElementById('newDeviceInvNum').value.trim();
  const type = document.getElementById('newDeviceType').value.trim();
  const location = document.getElementById('newDeviceLocation').value.trim();
  const status = document.getElementById('newDeviceStatus').value;
  const description = document.getElementById('newDeviceInfo').value.trim();
  const service_id = document.getElementById('newDeviceServiceSelect').value || null;
  const responsible_user_id = document.getElementById('newDeviceResponsible').value || null;

  if (!name) { showAlert('deviceAlert','Заполните наименование','error'); return; }
  if (!service_id) { showAlert('deviceAlert','Выберите службу (филиал → подразделение → служба)','error'); return; }

  const dupe = allDevices.find(d =>
    d.name?.toLowerCase() === name.toLowerCase() ||
    (inv_number && d.inv_number?.toLowerCase() === inv_number.toLowerCase())
  );
  if (dupe) { showAlert('deviceAlert',`⚠️ Дубль: "${dupe.name}"`, 'error'); return; }

  const btn = document.querySelector('[onclick="addDevice()"]');
  btn.disabled = true; btn.textContent = 'Сохранение...';

  let photo_path = null;
  if (newDevicePhotoFile) {
    const ext = newDevicePhotoFile.name.split('.').pop();
    photo_path = `device-photos/${Date.now()}.${ext}`;
    await db.storage.from('device-files').upload(photo_path, newDevicePhotoFile);
  }

  const { error } = await db.from('devices').insert({
    name, brand, inv_number, type, location, status, description,
    service_id, responsible_user_id, photo_path
  });
  btn.disabled = false; btn.textContent = '+ Зарегистрировать ОТУ';
  if (error) { showAlert('deviceAlert','Ошибка: '+error.message,'error'); return; }

  showAlert('deviceAlert',`✅ ОТУ "${name}" зарегистрировано!`,'success');
  ['newDeviceName','newDeviceBrand','newDeviceInvNum','newDeviceType','newDeviceLocation','newDeviceInfo'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('duplicateWarning').classList.remove('show');
  document.getElementById('newDevicePhotoPreview').innerHTML = '';
  newDevicePhotoFile = null;
  await loadUsers();
  await loadDevices();
}

async function deleteDevice(id, name) {
  if (!isAdmin(currentUser)) return;
  if (!confirm(`Удалить ОТУ "${name}"?\nВместе с ним удалятся все связанные файлы, документы и история ТО.`)) return;

  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

  const { error } = await db.from('devices').delete().eq('id', id);

  if (error) {
    showAlert('deviceAlert', 'Ошибка удаления: ' + error.message + ' (возможно, не выполнен SQL_FINAL.sql с исправлением CASCADE)', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✕ Удалить'; }
    return;
  }
  showAlert('deviceAlert','✅ ОТУ удалено','success');
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
  editDevicePhotoFile = null;

  const baseUrl = 'https://strmnfwpdtdnevhpqtar.supabase.co/storage/v1/object/public/device-files/';
  document.getElementById('editDevicePhotoPreview').innerHTML = d.photo_path
    ? `<img src="${baseUrl}${d.photo_path}" style="width:100%;max-width:200px;border-radius:8px;margin-top:8px;">`
    : '';

  await populateResponsibleSelect('editDeviceResponsible', d.service_id);
  document.getElementById('editDeviceResponsible').value = d.responsible_user_id || '';

  document.getElementById('modalEditDevice').classList.add('show');
}

function handleEditDevicePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  editDevicePhotoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('editDevicePhotoPreview').innerHTML = `<img src="${e.target.result}" style="width:100%;max-width:200px;border-radius:8px;margin-top:8px;">`;
  };
  reader.readAsDataURL(file);
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
  const responsible_user_id = document.getElementById('editDeviceResponsible').value || null;

  if (!name) { showAlert('editDeviceAlert','Заполните наименование','error'); return; }
  const dupe = allDevices.find(d => d.id !== id && (
    d.name?.toLowerCase() === name.toLowerCase() ||
    (inv_number && d.inv_number?.toLowerCase() === inv_number.toLowerCase())
  ));
  if (dupe) { showAlert('editDeviceAlert',`⚠️ Дубль: "${dupe.name}"`,'error'); return; }

  const upd = { name, brand, inv_number, type, location, status, description, responsible_user_id };

  if (editDevicePhotoFile) {
    const ext = editDevicePhotoFile.name.split('.').pop();
    const photo_path = `device-photos/${Date.now()}.${ext}`;
    await db.storage.from('device-files').upload(photo_path, editDevicePhotoFile);
    upd.photo_path = photo_path;
  }

  const { error } = await db.from('devices').update(upd).eq('id', id);
  if (error) { showAlert('editDeviceAlert','Ошибка: '+error.message,'error'); return; }
  closeModal('modalEditDevice');
  showAlert('deviceAlert','ОТУ обновлено!','success');
  editDevicePhotoFile = null;
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
  const { data } = await db.from('device_files').select('*')
    .eq('device_id', id).is('maintenance_log_id', null)
    .order('uploaded_at', { ascending: false });
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

// ══════════════════════════════════════════════
//  ПОЛЬЗОВАТЕЛИ
// ══════════════════════════════════════════════
async function loadUsers() {
  const container = document.getElementById('userList');
  if (container) container.innerHTML = '<div class="loading">Загрузка...</div>';
  const { data, error } = await db.from('users').select('*').order('full_name');
  if (error) { if(container) container.innerHTML = `<p style="color:var(--red)">Ошибка: ${error.message}</p>`; return; }
  allUsers = getAccessibleUsers(data || []);
  if (container) renderUsers(allUsers);
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

  const canEdit = isAdmin(currentUser);

  container.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>ФИО</th><th>ИИН</th><th>Роль</th><th>Служба</th><th>Действия</th></tr></thead>
    <tbody>
      ${users.map(u => {
        const isSelf = u.id === currentUser?.id;
        return `<tr>
          <td style="font-weight:500;">${u.full_name}${isSelf?' <span style="color:var(--accent);font-size:11px;">(вы)</span>':''}</td>
          <td style="font-family:var(--font-mono);font-size:12px;">${u.iin}</td>
          <td><span class="role-badge ${roleBadgeClass(u.role)}">${roleLabel(u.role)}</span></td>
          <td style="font-size:12px;">${serviceShortLabel(u.service_id)}</td>
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
  const service_id = document.getElementById('newUserServiceSelect')?.value || null;

  if (iin.length !== 12) { showAlert('userAlert','ИИН должен быть ровно 12 цифр','error'); return; }
  if (!full_name) { showAlert('userAlert','Введите ФИО','error'); return; }
  if (!password_hash) { showAlert('userAlert','Введите пароль','error'); return; }

  if (['admin','superadmin'].includes(role) && !isSuperAdmin(currentUser)) {
    showAlert('userAlert','⛔ Только супер-администратор может назначать эту роль','error'); return;
  }

  const btn = document.querySelector('[onclick="addUser()"]');
  btn.disabled = true; btn.textContent = 'Сохранение...';
  const { error } = await db.from('users').insert({ iin, full_name, password_hash, role, service_id });
  btn.disabled = false; btn.textContent = '+ Добавить';
  if (error) {
    showAlert('userAlert', error.code==='23505' ? 'Пользователь с таким ИИН уже существует' : 'Ошибка: '+error.message, 'error');
    return;
  }
  showAlert('userAlert',`✅ ${full_name} добавлен`,'success');
  ['newUserIin','newUserName','newUserPassword'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('newUserBranchSelect').value = '';
  document.getElementById('newUserDeptSelectWrap').style.display = 'none';
  document.getElementById('newUserServiceSelect').innerHTML = '<option value="">🌐 Общий доступ (все службы)</option>';
  await loadUsers();
}

function openEditUser(id) {
  const u = allUsers.find(x => x.id === id);
  if (!u) return;

  if (u.role === 'superadmin' && !isSuperAdmin(currentUser)) {
    showAlert('userAlert','⛔ Нет прав','error'); return;
  }
  if (u.role === 'admin' && !isSuperAdmin(currentUser) && u.id !== currentUser.id) {
    showAlert('userAlert','⛔ Нет прав для редактирования администратора','error'); return;
  }

  document.getElementById('editUserId').value = id;
  document.getElementById('editUserName').value = u.full_name;
  document.getElementById('editUserPassword').value = '';

  const roleSelect = document.getElementById('editUserRole');
  roleSelect.value = u.role;
  roleSelect.disabled = !isSuperAdmin(currentUser);
  document.querySelectorAll('#editUserRole .superadmin-only').forEach(el => {
    el.style.display = isSuperAdmin(currentUser) ? '' : 'none';
  });

  document.getElementById('editUserName').disabled = !isAdmin(currentUser);
  document.getElementById('editUserPassword').disabled = !isAdmin(currentUser);

  // Восстановить иерархию Филиал → Подразделение → Служба по текущей службе пользователя
  populateBranchSelects();
  if (u.service_id) {
    const service = allServices.find(s => s.id === u.service_id);
    if (service) {
      document.getElementById('editUserBranchSelect').value = service.branch_id;
      onBranchChange('editUserBranchSelect','editUserDeptSelect','editUserServiceSelect');
      if (service.department_id) {
        document.getElementById('editUserDeptSelect').value = service.department_id;
        onDepartmentChange('editUserDeptSelect','editUserServiceSelect');
      }
      document.getElementById('editUserServiceSelect').value = service.id;
    }
  } else {
    document.getElementById('editUserBranchSelect').value = '';
    document.getElementById('editUserDeptSelectWrap').style.display = 'none';
    document.getElementById('editUserServiceSelect').innerHTML = `<option value="">🌐 Общий доступ (все службы)</option>`;
  }

  document.getElementById('modalEditUser').classList.add('show');
}

async function saveEditUser() {
  const id = document.getElementById('editUserId').value;
  const full_name = document.getElementById('editUserName').value.trim();
  const role = document.getElementById('editUserRole').value;
  const password = document.getElementById('editUserPassword').value.trim();
  const service_id = document.getElementById('editUserServiceSelect').value || null;

  if (!full_name) { showAlert('editUserAlert','Введите ФИО','error'); return; }
  if (role === 'superadmin' && !isSuperAdmin(currentUser)) {
    showAlert('editUserAlert','⛔ Нельзя назначить роль супер-администратора','error'); return;
  }

  const upd = { service_id };
  if (isAdmin(currentUser)) { upd.full_name = full_name; }
  if (isSuperAdmin(currentUser)) { upd.role = role; }
  if (password && isAdmin(currentUser)) { upd.password_hash = password; }

  const { error } = await db.from('users').update(upd).eq('id', id);
  if (error) { showAlert('editUserAlert','Ошибка: '+error.message,'error'); return; }

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
    'ИИН': u.iin, 'ФИО': u.full_name, 'Роль': roleLabel(u.role), 'Служба': serviceShortLabel(u.service_id)
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

// ══════════════════════════════════════════════
//  ЛОГИ
// ══════════════════════════════════════════════
async function loadLogs() {
  const tbody = document.getElementById('logsBody');
  tbody.innerHTML = '<tr><td colspan="4" class="loading">Загрузка...</td></tr>';
  const { data, error } = await db.from('scan_logs')
    .select('scanned_at, devices(name, service_id), users(full_name, role)')
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

// ══════════════════════════════════════════════
//  АКТЫ — выгрузка в Excel
// ══════════════════════════════════════════════
async function loadActsTab() {
  const container = document.getElementById('actsTabList');
  if (!container) return;
  container.innerHTML = '<div class="loading">Загрузка...</div>';

  const { data: logs, error } = await db.from('maintenance_logs')
    .select('*, devices(name, type, location, inv_number), users:performed_by(full_name)')
    .order('maintenance_date', { ascending: false })
    .limit(200);

  if (error) { container.innerHTML = `<p style="color:var(--red)">Ошибка: ${error.message}</p>`; return; }

  window._actsData = logs || [];
  renderActsTab(logs || []);
}

function renderActsTab(logs) {
  const container = document.getElementById('actsTabList');
  if (!logs.length) { container.innerHTML = '<p class="text-muted">Актов нет</p>'; return; }

  const statusBadge = s => s === 'approved'
    ? '<span style="background:var(--green-dim);color:var(--green);border:1px solid var(--green);padding:2px 8px;border-radius:100px;font-size:11px;">✅ Одобрено</span>'
    : s === 'rejected'
    ? '<span style="background:var(--red-dim);color:var(--red);border:1px solid var(--red);padding:2px 8px;border-radius:100px;font-size:11px;">❌ Отклонено</span>'
    : '<span style="background:var(--yellow-dim);color:var(--yellow);border:1px solid var(--yellow);padding:2px 8px;border-radius:100px;font-size:11px;">🕐 На проверке</span>';

  container.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Дата</th><th>Устройство</th><th>Инв.номер</th><th>Выполнил</th><th>Статус</th></tr></thead>
    <tbody>
      ${logs.map(l => `
        <tr>
          <td>${new Date(l.maintenance_date).toLocaleDateString('ru')}</td>
          <td>${l.devices?.name||'—'}</td>
          <td style="font-family:var(--font-mono);font-size:11px;">${l.devices?.inv_number||'—'}</td>
          <td>${l.users?.full_name||'—'}</td>
          <td>${statusBadge(l.status)}</td>
        </tr>`).join('')}
    </tbody>
  </table></div>`;
}

async function exportActsToExcel() {
  const countInput = document.getElementById('actsExportCount');
  const count = parseInt(countInput?.value) || 50;

  showAlert('actsAlert', '⏳ Формируем отчёт...', 'success');

  const { data: logs, error } = await db.from('maintenance_logs')
    .select('*, devices(name, type, location, inv_number), users:performed_by(full_name), approver:approved_by(full_name)')
    .order('maintenance_date', { ascending: false })
    .limit(count);

  if (error) { showAlert('actsAlert','Ошибка: '+error.message,'error'); return; }
  if (!logs?.length) { showAlert('actsAlert','Нет данных для экспорта','error'); return; }

  // Получаем файлы для каждого акта
  const rows = await Promise.all(logs.map(async l => {
    const { data: files } = await db.from('device_files')
      .select('name, file_category').eq('maintenance_log_id', l.id);
    const docs = (files||[]).filter(f => f.file_category === 'act_doc').map(f=>f.name).join('; ');
    const photos = (files||[]).filter(f => f.file_category === 'act_photo').map(f=>f.name).join('; ');

    return {
      'Дата ТО': new Date(l.maintenance_date).toLocaleDateString('ru-RU'),
      'Устройство': l.devices?.name || '—',
      'Тип': l.devices?.type || '—',
      'Инв. номер': l.devices?.inv_number || '—',
      'Местонахождение': l.devices?.location || '—',
      'Кто выполнил ТО': l.users?.full_name || '—',
      'Статус': l.status === 'approved' ? 'Одобрено' : l.status === 'rejected' ? 'Отклонено' : 'На проверке',
      'Кто одобрил': l.approver?.full_name || '—',
      'Загруженные документы': docs || 'нет',
      'Загруженные фото': photos || 'нет',
      'Заметки': l.notes || ''
    };
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    {wch:12},{wch:22},{wch:15},{wch:15},{wch:25},{wch:20},{wch:14},{wch:20},{wch:30},{wch:30},{wch:30}
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Акты ТО');
  XLSX.writeFile(wb, `Отчет_акты_ТО_${new Date().toISOString().split('T')[0]}.xlsx`);

  showAlert('actsAlert', `✅ Экспортировано ${rows.length} записей`, 'success');
}

document.addEventListener('DOMContentLoaded', initAdmin);
