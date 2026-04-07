async function loadDevice() {
  const user = requireAuth();
  if (!user) return;

  const el = document.getElementById('userName');
  if (el) el.textContent = user.full_name;

  const params = new URLSearchParams(window.location.search);
  const deviceId = params.get('id');

  if (!deviceId) {
    await loadDeviceList(user);
    return;
  }

  await loadDeviceDetail(deviceId, user);
}

async function loadDeviceList(user) {
  const { data: devices } = await db.from('devices').select('*').order('name');
  if (!devices || !devices.length) {
    document.getElementById('content').innerHTML = `
      <div class="card" style="text-align:center;padding:40px;">
        <p class="text-muted">Отсканируйте QR-код устройства.</p>
      </div>`;
    return;
  }
  document.getElementById('content').innerHTML = `
    <div class="section-title">Выберите устройство</div>
    ${devices.map(d => `
      <a href="device.html?id=${d.id}" style="text-decoration:none;">
        <div class="card" style="cursor:pointer;">
          <div class="flex-between">
            <div>
              <div style="font-weight:600;color:var(--text);">${d.name}</div>
              <div class="text-muted">${d.type} · ${d.location}</div>
            </div>
            <span class="status status-${d.status}">${statusLabelDevice(d.status)}</span>
          </div>
        </div>
      </a>`).join('')}`;
}

function statusLabelDevice(s) {
  return { active: 'Активно', maintenance: 'Обслуживание', danger: 'Опасность' }[s] || s;
}

async function loadDeviceDetail(deviceId, user) {
  const { data: device, error } = await db.from('devices').select('*').eq('id', deviceId).single();
  if (error || !device) {
    document.getElementById('content').innerHTML = `<div class="card" style="text-align:center;padding:40px;"><p style="color:var(--red)">Устройство не найдено</p></div>`;
    return;
  }

  const levels = (user.role === 'admin' || user.role === 'supervisor') ? ['basic', 'full'] : ['basic'];
  const { data: infos } = await db.from('device_info').select('*').eq('device_id', deviceId).in('level', levels);

  const statusMap = { active: ['active','Активно'], maintenance: ['maintenance','Обслуживание'], danger: ['danger','Опасность'] };
  const [statusClass, statusText] = statusMap[device.status] || ['active', device.status];

  const infoHtml = (infos || []).map(info => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div class="card-title">${info.title}</div>
        ${info.level === 'full' ? '<span class="role-badge role-admin">ПОЛНЫЙ</span>' : ''}
      </div>
      <p style="font-size:15px;line-height:1.6;white-space:pre-wrap;">${info.content}</p>
      <p class="text-muted mt-8">Обновлено: ${new Date(info.updated_at).toLocaleDateString('ru')}</p>
    </div>`).join('');

  const adminBtn = user.role === 'admin' ? `<a href="admin.html" class="btn btn-secondary btn-sm">⚙ Админ-панель</a>` : '';

  document.getElementById('content').innerHTML = `
    <div class="card">
      <div class="flex-between" style="margin-bottom:12px;">
        <span class="status status-${statusClass}">${statusText}</span>
        ${adminBtn}
      </div>
      <div class="card-title" style="font-size:28px;">${device.name}</div>
      <p class="text-muted">${device.type}</p>
      <div style="margin-top:16px;">
        <div class="info-row">
          <span class="info-label">Местонахождение</span>
          <span class="info-value">${device.location}</span>
        </div>
      </div>
    </div>
    ${infoHtml || '<div class="card"><p class="text-muted">Информация не добавлена</p></div>'}
    
    <!-- Кнопка смены пароля для всех -->
    <div class="card" style="margin-top:16px;">
      <div class="card-title" style="font-size:18px;margin-bottom:12px;">🔐 Изменить пароль</div>
      <div class="form-group"><label>Новый пароль</label><input type="password" id="newPwd" placeholder="минимум 4 символа"></div>
      <div class="form-group"><label>Повторите пароль</label><input type="password" id="confirmPwd" placeholder="повторите пароль"></div>
      <div class="alert alert-error" id="pwdError"></div>
      <div class="alert alert-success" id="pwdSuccess"></div>
      <button class="btn btn-primary" onclick="changePassword('${user.id}')">Сохранить пароль</button>
    </div>
    
    <div id="logsSection"></div>
  `;

  // Лог в фоне
  db.from('scan_logs').insert({ device_id: deviceId, user_id: user.id });

  if (user.role === 'admin') {
    const { data: logs } = await db.from('scan_logs').select('scanned_at, users(full_name, role)').eq('device_id', deviceId).order('scanned_at', { ascending: false }).limit(10);
    if (logs && logs.length > 0) {
      document.getElementById('logsSection').innerHTML = `
        <div class="section-title">Последние сканирования</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Пользователь</th><th>Роль</th><th>Время</th></tr></thead>
          <tbody>${logs.map(l => `<tr><td>${l.users?.full_name||'—'}</td><td><span class="role-badge role-${l.users?.role}">${l.users?.role||'—'}</span></td><td>${new Date(l.scanned_at).toLocaleString('ru')}</td></tr>`).join('')}</tbody>
        </table></div>`;
    }
  }
}

async function changePassword(userId) {
  const newPwd = document.getElementById('newPwd').value;
  const confirmPwd = document.getElementById('confirmPwd').value;
  const errEl = document.getElementById('pwdError');
  const okEl = document.getElementById('pwdSuccess');

  errEl.classList.remove('show');
  okEl.classList.remove('show');

  if (newPwd.length < 4) { errEl.textContent = 'Минимум 4 символа'; errEl.classList.add('show'); return; }
  if (newPwd !== confirmPwd) { errEl.textContent = 'Пароли не совпадают'; errEl.classList.add('show'); return; }

  const { error } = await db.from('users').update({ password_hash: newPwd }).eq('id', userId);
  if (error) { errEl.textContent = 'Ошибка: ' + error.message; errEl.classList.add('show'); return; }

  // Обновить в localStorage
  const user = getUser();
  setUser(user);

  okEl.textContent = '✅ Пароль изменён!';
  okEl.classList.add('show');
  document.getElementById('newPwd').value = '';
  document.getElementById('confirmPwd').value = '';
}
