// ══════════════════════════════════════════════
//  ТЕХНИЧЕСКОЕ ОБСЛУЖИВАНИЕ (ТО)
// ══════════════════════════════════════════════

let allMaintenance = []; // все устройства с ТО данными

// ── Открыть таб ТО ──────────────────────────
async function loadMaintenance() {
  const container = document.getElementById('maintenanceList');
  container.innerHTML = '<div class="loading">Загрузка...</div>';

  const { data, error } = await db
    .from('devices')
    .select('id, name, type, location, status, maintenance_interval_days, last_maintenance, next_maintenance, notification_email')
    .order('next_maintenance', { ascending: true, nullsFirst: false });

  if (error) {
    container.innerHTML = `<p style="color:var(--red)">Ошибка: ${error.message}</p>`;
    return;
  }

  allMaintenance = data || [];
  renderMaintenance(allMaintenance);
}

function renderMaintenance(devices) {
  const container = document.getElementById('maintenanceList');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!devices.length) {
    container.innerHTML = '<p class="text-muted">Нет устройств</p>';
    return;
  }

  container.innerHTML = devices.map(d => {
    let daysLeft = null;
    let statusHtml = '';
    let progressHtml = '';

    if (d.next_maintenance) {
      const next = new Date(d.next_maintenance);
      next.setHours(0, 0, 0, 0);
      daysLeft = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (daysLeft < 0) {
        statusHtml = `<span style="background:#3d0000;color:#ff4444;border:1px solid #ff4444;padding:4px 12px;border-radius:100px;font-size:12px;font-weight:700;">⚠️ ПРОСРОЧЕНО на ${Math.abs(daysLeft)} дн.</span>`;
      } else if (daysLeft === 0) {
        statusHtml = `<span style="background:#3d2000;color:#E74C3C;border:1px solid #E74C3C;padding:4px 12px;border-radius:100px;font-size:12px;font-weight:700;">🔴 СЕГОДНЯ</span>`;
      } else if (daysLeft <= 4) {
        statusHtml = `<span style="background:#3d2e00;color:#F39C12;border:1px solid #F39C12;padding:4px 12px;border-radius:100px;font-size:12px;font-weight:700;">🟡 ${daysLeft} дн.</span>`;
      } else {
        statusHtml = `<span style="background:#0d2200;color:#2ecc71;border:1px solid #2ecc71;padding:4px 12px;border-radius:100px;font-size:12px;">🟢 ${daysLeft} дн.</span>`;
      }

      // Прогресс бар
      const interval = d.maintenance_interval_days || 90;
      const elapsed = interval - daysLeft;
      const pct = Math.min(100, Math.max(0, Math.round((elapsed / interval) * 100)));
      const barColor = daysLeft < 0 ? '#ff4444' : daysLeft <= 4 ? '#F39C12' : '#2ecc71';
      progressHtml = `
        <div style="margin-top:10px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px;">
            <span>Прогресс цикла</span>
            <span>${pct}%</span>
          </div>
          <div style="background:var(--surface2);border-radius:100px;height:6px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${barColor};border-radius:100px;transition:width .3s;"></div>
          </div>
        </div>`;
    } else {
      statusHtml = `<span style="background:var(--surface2);color:var(--text-muted);border:1px solid var(--border);padding:4px 12px;border-radius:100px;font-size:12px;">Не настроено</span>`;
    }

    const nextDate = d.next_maintenance
      ? new Date(d.next_maintenance).toLocaleDateString('ru-RU')
      : '—';
    const lastDate = d.last_maintenance
      ? new Date(d.last_maintenance).toLocaleDateString('ru-RU')
      : '—';

    return `
      <div class="card" style="margin-bottom:12px;">
        <div class="flex-between" style="flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-weight:600;font-size:16px;">${d.name}</div>
            <div class="text-muted" style="font-size:13px;">${d.type} · ${d.location}</div>
          </div>
          ${statusHtml}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-top:12px;">
          <div style="background:var(--surface2);border-radius:8px;padding:10px;">
            <div style="font-size:11px;color:var(--text-muted);">Последнее ТО</div>
            <div style="font-weight:600;font-size:14px;margin-top:2px;">${lastDate}</div>
          </div>
          <div style="background:var(--surface2);border-radius:8px;padding:10px;">
            <div style="font-size:11px;color:var(--text-muted);">Следующее ТО</div>
            <div style="font-weight:600;font-size:14px;margin-top:2px;">${nextDate}</div>
          </div>
          <div style="background:var(--surface2);border-radius:8px;padding:10px;">
            <div style="font-size:11px;color:var(--text-muted);">Интервал</div>
            <div style="font-weight:600;font-size:14px;margin-top:2px;">${d.maintenance_interval_days || 90} дн.</div>
          </div>
          <div style="background:var(--surface2);border-radius:8px;padding:10px;">
            <div style="font-size:11px;color:var(--text-muted);">Email</div>
            <div style="font-weight:600;font-size:13px;margin-top:2px;word-break:break-all;">${d.notification_email || 'narbolzhorabek@gmail.com'}</div>
          </div>
        </div>
        ${progressHtml}
        <div class="flex mt-8" style="flex-wrap:wrap;gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="openMaintenanceSettings('${d.id}')">⚙ Настройки ТО</button>
          <button class="btn btn-primary btn-sm" onclick="markMaintenanceDone('${d.id}', '${d.name}')">✅ Выполнено</button>
          <button class="btn btn-secondary btn-sm" onclick="openMaintenanceLogs('${d.id}', '${d.name}')">📋 История</button>
          <button class="btn btn-secondary btn-sm" onclick="testNotification('${d.id}', '${d.name}')">📧 Тест письма</button>
        </div>
      </div>`;
  }).join('');
}

// ── Открыть настройки ТО ────────────────────
async function openMaintenanceSettings(deviceId) {
  const device = allMaintenance.find(d => d.id === deviceId);
  if (!device) return;

  document.getElementById('msDeviceId').value = deviceId;
  document.getElementById('msDeviceName').textContent = device.name;
  document.getElementById('msInterval').value = device.maintenance_interval_days || 90;
  document.getElementById('msEmail').value = device.notification_email || 'narbolzhorabek@gmail.com';

  // last_maintenance
  if (device.last_maintenance) {
    document.getElementById('msLastDate').value = device.last_maintenance;
  } else {
    document.getElementById('msLastDate').value = '';
  }

  // Пересчитать next_maintenance по last + interval
  updateNextPreview();

  document.getElementById('modalMaintenance').classList.add('show');
}

function updateNextPreview() {
  const lastVal = document.getElementById('msLastDate').value;
  const interval = parseInt(document.getElementById('msInterval').value) || 90;
  const preview = document.getElementById('msNextPreview');

  if (!lastVal) {
    preview.textContent = '—';
    return;
  }

  const next = new Date(lastVal);
  next.setDate(next.getDate() + interval);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  next.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const dateStr = next.toLocaleDateString('ru-RU');
  const daysStr = daysLeft < 0
    ? `(просрочено на ${Math.abs(daysLeft)} дн.)`
    : daysLeft === 0
    ? '(сегодня!)'
    : `(через ${daysLeft} дн.)`;

  preview.textContent = `${dateStr} ${daysStr}`;
  preview.style.color = daysLeft <= 0 ? '#ff4444' : daysLeft <= 4 ? '#F39C12' : '#2ecc71';
}

function closeMaintenanceSettings() {
  document.getElementById('modalMaintenance').classList.remove('show');
}

async function saveMaintenanceSettings() {
  const deviceId = document.getElementById('msDeviceId').value;
  const interval = parseInt(document.getElementById('msInterval').value) || 90;
  const email = document.getElementById('msEmail').value.trim();
  const lastDate = document.getElementById('msLastDate').value || null;

  // Вычислить next_maintenance
  let nextDate = null;
  if (lastDate) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + interval);
    nextDate = d.toISOString().split('T')[0];
  }

  const btn = document.getElementById('msSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Сохранение...';

  const { error } = await db.from('devices').update({
    maintenance_interval_days: interval,
    last_maintenance: lastDate,
    next_maintenance: nextDate,
    notification_email: email || null
  }).eq('id', deviceId);

  btn.disabled = false;
  btn.textContent = 'Сохранить';

  if (error) {
    showAlert('msAlert', 'Ошибка: ' + error.message, 'error');
    return;
  }

  showAlert('msAlert', '✅ Настройки сохранены!', 'success');
  setTimeout(() => {
    closeMaintenanceSettings();
    loadMaintenance();
  }, 800);
}

// ── Отметить ТО выполнено ───────────────────
async function markMaintenanceDone(deviceId, deviceName) {
  const today = new Date().toISOString().split('T')[0];
  const notes = prompt(`ТО "${deviceName}" — добавьте заметку (необязательно):`);
  if (notes === null) return; // отмена

  const device = allMaintenance.find(d => d.id === deviceId);
  const interval = device?.maintenance_interval_days || 90;

  const next = new Date();
  next.setDate(next.getDate() + interval);
  const nextDate = next.toISOString().split('T')[0];

  // Обновить устройство
  const { error: updError } = await db.from('devices').update({
    last_maintenance: today,
    next_maintenance: nextDate,
    status: 'active'
  }).eq('id', deviceId);

  if (updError) { alert('Ошибка: ' + updError.message); return; }

  // Записать в лог
  await db.from('maintenance_logs').insert({
    device_id: deviceId,
    maintenance_date: today,
    notes: notes || null
  });

  showMaintenanceAlert(`✅ ТО для "${deviceName}" отмечено. Следующее: ${next.toLocaleDateString('ru-RU')}`, 'success');
  await loadMaintenance();
}

// ── История ТО ──────────────────────────────
async function openMaintenanceLogs(deviceId, deviceName) {
  document.getElementById('logsDeviceName').textContent = deviceName;
  document.getElementById('modalMaintenanceLogs').classList.add('show');

  const container = document.getElementById('maintenanceLogsBody');
  container.innerHTML = '<tr><td colspan="3" class="text-muted" style="padding:16px;">Загрузка...</td></tr>';

  const { data, error } = await db
    .from('maintenance_logs')
    .select('*')
    .eq('device_id', deviceId)
    .order('maintenance_date', { ascending: false });

  if (error || !data?.length) {
    container.innerHTML = '<tr><td colspan="3" class="text-muted" style="padding:16px;">История пуста</td></tr>';
    return;
  }

  container.innerHTML = data.map(l => `
    <tr>
      <td>${new Date(l.maintenance_date).toLocaleDateString('ru-RU')}</td>
      <td>${l.notes || '—'}</td>
      <td class="text-muted" style="font-size:12px;">${new Date(l.created_at).toLocaleDateString('ru-RU')}</td>
    </tr>`).join('');
}

function closeMaintenanceLogs() {
  document.getElementById('modalMaintenanceLogs').classList.remove('show');
}

// ── Тестовое письмо ─────────────────────────
async function testNotification(deviceId, deviceName) {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = '⏳ Отправка...';

  try {
    const resp = await fetch(
      'https://strmnfwpdtdnevhpqtar.supabase.co/functions/v1/send-maintenance-notifications',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ test: true, device_id: deviceId })
      }
    );
    const result = await resp.json();
    showMaintenanceAlert(
      result.sent > 0 ? `📧 Письмо отправлено для "${deviceName}"` : `ℹ️ Нет подходящих условий (дней ТО не 0 и не 4)`,
      result.sent > 0 ? 'success' : 'error'
    );
  } catch (e) {
    showMaintenanceAlert('Ошибка: ' + e.message, 'error');
  }

  btn.disabled = false;
  btn.textContent = '📧 Тест письма';
}

// ── Утилиты ─────────────────────────────────
function showMaintenanceAlert(msg, type) {
  const el = document.getElementById('maintenanceAlert');
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.classList.remove('show'), 5000);
}

function filterMaintenance() {
  const q = document.getElementById('searchMaintenance').value.toLowerCase();
  const filter = document.getElementById('filterMaintenanceStatus').value;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  renderMaintenance(allMaintenance.filter(d => {
    const matchText = !q || d.name.toLowerCase().includes(q) || d.type.toLowerCase().includes(q) || d.location.toLowerCase().includes(q);
    if (!matchText) return false;
    if (!filter) return true;

    if (!d.next_maintenance) return filter === 'none';
    const next = new Date(d.next_maintenance);
    next.setHours(0, 0, 0, 0);
    const days = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (filter === 'overdue') return days < 0;
    if (filter === 'soon') return days >= 0 && days <= 7;
    if (filter === 'ok') return days > 7;
    if (filter === 'none') return !d.next_maintenance;
    return true;
  }));
}
