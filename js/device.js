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
  const { data: devices, error } = await db.from('devices').select('*').order('name');
  if (error || !devices || !devices.length) {
    document.getElementById('content').innerHTML = `
      <div class="card" style="text-align:center;padding:40px;">
        <p class="text-muted">Устройств не найдено.<br>Отсканируйте QR-код устройства.</p>
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
  // Сначала загружаем данные
  const { data: device, error } = await db
    .from('devices').select('*').eq('id', deviceId).single();

  if (error || !device) {
    document.getElementById('content').innerHTML = `
      <div class="card" style="text-align:center;padding:40px;">
        <p style="color:var(--red)">Устройство не найдено</p>
        <a href="device.html" class="btn btn-secondary mt-16" style="display:inline-flex;">← Назад</a>
      </div>`;
    return;
  }

  // worker и supervisor видят basic, admin видит всё
  const levels = user.role === 'admin' ? ['basic', 'full'] : ['basic'];
  const { data: infos } = await db
    .from('device_info').select('*').eq('device_id', deviceId).in('level', levels);

  // Рендерим страницу СРАЗУ — до записи лога
  const statusMap = {
    active: ['active', 'Активно'],
    maintenance: ['maintenance', 'Обслуживание'],
    danger: ['danger', 'Опасность']
  };
  const [statusClass, statusText] = statusMap[device.status] || ['active', device.status];

  const infoHtml = (infos || []).map(info => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div class="card-title">${info.title}</div>
        ${info.level === 'full' ? '<span class="role-badge role-admin">ADMIN</span>' : ''}
      </div>
      <p style="font-size:15px;line-height:1.6;white-space:pre-wrap;">${info.content}</p>
      <p class="text-muted mt-8">Обновлено: ${new Date(info.updated_at).toLocaleDateString('ru')}</p>
    </div>`).join('');

  // Кнопки по роли
  let actionBtn = '';
  if (user.role === 'admin') actionBtn = `<a href="admin.html" class="btn btn-secondary btn-sm">⚙ Админ-панель</a>`;

  document.getElementById('content').innerHTML = `
    <a href="device.html" style="display:inline-flex;align-items:center;gap:6px;color:var(--text-muted);font-family:var(--font-mono);font-size:13px;text-decoration:none;margin-bottom:16px;">← Все устройства</a>
    <div class="card">
      <div class="flex-between" style="margin-bottom:12px;">
        <span class="status status-${statusClass}">${statusText}</span>
        ${actionBtn}
      </div>
      <div class="card-title" style="font-size:28px;">${device.name}</div>
      <p class="text-muted">${device.type}</p>
      <div style="margin-top:16px;">
        <div class="info-row">
          <span class="info-label">Местонахождение</span>
          <span class="info-value">${device.location}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Статус</span>
          <span class="info-value"><span class="status status-${statusClass}">${statusText}</span></span>
        </div>
      </div>
    </div>
    ${infoHtml || '<div class="card"><p class="text-muted">Информация об устройстве не добавлена</p></div>'}
    <div id="logsSection"></div>
  `;

  // ПОСЛЕ рендера — записываем лог в фоне
  db.from('scan_logs').insert({ device_id: deviceId, user_id: user.id });

  // Логи только для admin — грузим отдельно и добавляем
  if (user.role === 'admin') {
    const { data: logs } = await db
      .from('scan_logs')
      .select('scanned_at, users(full_name, role)')
      .eq('device_id', deviceId)
      .order('scanned_at', { ascending: false })
      .limit(10);

    if (logs && logs.length > 0) {
      document.getElementById('logsSection').innerHTML = `
        <div class="section-title">Последние сканирования</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Пользователь</th><th>Роль</th><th>Время</th></tr></thead>
            <tbody>
              ${logs.map(l => `
                <tr>
                  <td>${l.users?.full_name || '—'}</td>
                  <td><span class="role-badge role-${l.users?.role}">${l.users?.role || '—'}</span></td>
                  <td>${new Date(l.scanned_at).toLocaleString('ru')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }
  }
}