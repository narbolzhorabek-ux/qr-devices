// ══════════════════════════════════════════════
//  ТЕХНИЧЕСКОЕ ОБСЛУЖИВАНИЕ — maintenance.js
// ══════════════════════════════════════════════

let allMaintenance = [];

// ── Загрузить список ТО ───────────────────────
async function loadMaintenance() {
  const container = document.getElementById('maintenanceList');
  container.innerHTML = '<div class="loading">Загрузка...</div>';

  const { data, error } = await db.from('devices')
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
  const today = new Date(); today.setHours(0,0,0,0);

  if (!devices.length) {
    container.innerHTML = '<p class="text-muted" style="padding:20px;">Нет устройств</p>';
    return;
  }

  container.innerHTML = devices.map(d => {
    let daysLeft = null;
    let statusHtml = '';
    let progressHtml = '';

    if (d.next_maintenance) {
      const next = new Date(d.next_maintenance); next.setHours(0,0,0,0);
      daysLeft = Math.round((next.getTime() - today.getTime()) / 86400000);

      if (daysLeft < 0) {
        statusHtml = `<span style="background:var(--red-dim);color:var(--red);border:1px solid var(--red);padding:4px 12px;border-radius:100px;font-size:12px;font-weight:700;">⚠️ ПРОСРОЧЕНО на ${Math.abs(daysLeft)} дн.</span>`;
      } else if (daysLeft === 0) {
        statusHtml = `<span style="background:var(--red-dim);color:var(--red);border:1px solid var(--red);padding:4px 12px;border-radius:100px;font-size:12px;font-weight:700;">🔴 СЕГОДНЯ</span>`;
      } else if (daysLeft <= 7) {
        statusHtml = `<span style="background:var(--yellow-dim);color:var(--yellow);border:1px solid var(--yellow);padding:4px 12px;border-radius:100px;font-size:12px;font-weight:700;">🟡 ${daysLeft} дн.</span>`;
      } else {
        statusHtml = `<span style="background:var(--green-dim);color:var(--green);border:1px solid var(--green);padding:4px 12px;border-radius:100px;font-size:12px;">🟢 ${daysLeft} дн.</span>`;
      }

      const interval = d.maintenance_interval_days || 90;
      const elapsed = interval - daysLeft;
      const pct = Math.min(100, Math.max(0, Math.round((elapsed / interval) * 100)));
      const barColor = daysLeft < 0 ? 'var(--red)' : daysLeft <= 7 ? 'var(--yellow)' : 'var(--green)';

      progressHtml = `
        <div style="margin-top:10px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px;">
            <span>Прогресс цикла</span><span>${pct}%</span>
          </div>
          <div style="background:var(--surface2);border-radius:100px;height:6px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${barColor};border-radius:100px;"></div>
          </div>
        </div>`;
    } else {
      statusHtml = `<span style="background:var(--surface2);color:var(--text-muted);border:1px solid var(--border);padding:4px 12px;border-radius:100px;font-size:12px;">Не настроено</span>`;
    }

    const nextDate = d.next_maintenance ? new Date(d.next_maintenance).toLocaleDateString('ru-RU') : '—';
    const lastDate = d.last_maintenance ? new Date(d.last_maintenance).toLocaleDateString('ru-RU') : '—';

    return `
      <div class="card" style="margin-bottom:12px;">
        <div class="flex-between" style="flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-weight:700;font-size:15px;">${d.name}</div>
            <div class="text-muted" style="font-size:12px;">${d.type || ''} · ${d.location || ''}</div>
          </div>
          ${statusHtml}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-top:12px;">
          <div style="background:var(--surface2);border-radius:8px;padding:10px;">
            <div style="font-size:11px;color:var(--text-muted);">Последнее ТО</div>
            <div style="font-weight:600;font-size:13px;margin-top:2px;">${lastDate}</div>
          </div>
          <div style="background:var(--surface2);border-radius:8px;padding:10px;">
            <div style="font-size:11px;color:var(--text-muted);">Следующее ТО</div>
            <div style="font-weight:600;font-size:13px;margin-top:2px;">${nextDate}</div>
          </div>
          <div style="background:var(--surface2);border-radius:8px;padding:10px;">
            <div style="font-size:11px;color:var(--text-muted);">Интервал</div>
            <div style="font-weight:600;font-size:13px;margin-top:2px;">${d.maintenance_interval_days || 90} дн.</div>
          </div>
          <div style="background:var(--surface2);border-radius:8px;padding:10px;">
            <div style="font-size:11px;color:var(--text-muted);">Email</div>
            <div style="font-weight:600;font-size:12px;margin-top:2px;word-break:break-all;">${d.notification_email || '—'}</div>
          </div>
        </div>
        ${progressHtml}
        <div class="flex mt-8" style="flex-wrap:wrap;gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="openMaintenanceSettings('${d.id}')">⚙ Настройки</button>
          <button class="btn btn-primary btn-sm" onclick="markMaintenanceDone('${d.id}', '${d.name.replace(/'/g,"\\'")}')">✅ Выполнено</button>
          <button class="btn btn-secondary btn-sm" onclick="openMaintenanceLogs('${d.id}', '${d.name.replace(/'/g,"\\'")}')">📋 История</button>
          <button class="btn btn-secondary btn-sm" onclick="testNotification('${d.id}', '${d.name.replace(/'/g,"\\'")}')">📧 Тест</button>
        </div>
      </div>`;
  }).join('');
}

// ── Настройки ТО ─────────────────────────────
async function openMaintenanceSettings(deviceId) {
  const device = allMaintenance.find(d => d.id === deviceId);
  if (!device) return;
  document.getElementById('msDeviceId').value = deviceId;
  document.getElementById('msDeviceName').textContent = device.name;
  document.getElementById('msInterval').value = device.maintenance_interval_days || 90;
  document.getElementById('msEmail').value = device.notification_email || '';
  document.getElementById('msLastDate').value = device.last_maintenance || '';
  updateNextPreview();
  document.getElementById('modalMaintenance').classList.add('show');
}

function updateNextPreview() {
  const lastVal = document.getElementById('msLastDate').value;
  const interval = parseInt(document.getElementById('msInterval').value) || 90;
  const preview = document.getElementById('msNextPreview');

  if (!lastVal) { preview.textContent = '—'; return; }

  const next = new Date(lastVal);
  next.setDate(next.getDate() + interval);
  const today = new Date(); today.setHours(0,0,0,0);
  next.setHours(0,0,0,0);
  const daysLeft = Math.round((next.getTime() - today.getTime()) / 86400000);
  const dateStr = next.toLocaleDateString('ru-RU');
  const daysStr = daysLeft < 0 ? `(просрочено на ${Math.abs(daysLeft)} дн.)` : daysLeft === 0 ? '(сегодня!)' : `(через ${daysLeft} дн.)`;
  preview.textContent = `${dateStr} ${daysStr}`;
  preview.style.color = daysLeft <= 0 ? 'var(--red)' : daysLeft <= 7 ? 'var(--yellow)' : 'var(--green)';
}

async function saveMaintenanceSettings() {
  const deviceId = document.getElementById('msDeviceId').value;
  const interval = parseInt(document.getElementById('msInterval').value) || 90;
  const email = document.getElementById('msEmail').value.trim();
  const lastDate = document.getElementById('msLastDate').value || null;

  let nextDate = null;
  if (lastDate) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + interval);
    nextDate = d.toISOString().split('T')[0];
  }

  const btn = document.getElementById('msSaveBtn');
  btn.disabled = true; btn.textContent = 'Сохранение...';

  const { error } = await db.from('devices').update({
    maintenance_interval_days: interval,
    last_maintenance: lastDate,
    next_maintenance: nextDate,
    notification_email: email || null
  }).eq('id', deviceId);

  btn.disabled = false; btn.textContent = 'Сохранить';

  if (error) { showAlert('msAlert', 'Ошибка: ' + error.message, 'error'); return; }

  showAlert('msAlert', '✅ Настройки сохранены!', 'success');
  setTimeout(() => { closeModal('modalMaintenance'); loadMaintenance(); }, 800);
}

// ── Отметить выполнено ────────────────────────
async function markMaintenanceDone(deviceId, deviceName) {
  if (!confirm(`Отметить ТО для "${deviceName}" как выполненное?`)) return;

  const notes = prompt('Заметки о проведённом ТО (необязательно):') ?? '';
  const today = new Date().toISOString().split('T')[0];
  const device = allMaintenance.find(d => d.id === deviceId);
  const interval = device?.maintenance_interval_days || 90;
  const next = new Date();
  next.setDate(next.getDate() + interval);
  const nextDate = next.toISOString().split('T')[0];

  const { error } = await db.from('devices').update({
    last_maintenance: today,
    next_maintenance: nextDate,
    status: 'active'
  }).eq('id', deviceId);

  if (error) { showMaintenanceAlert('Ошибка: ' + error.message, 'error'); return; }

  await db.from('maintenance_logs').insert({
    device_id: deviceId,
    maintenance_date: today,
    notes: notes || null
  });

  showMaintenanceAlert(`✅ ТО для "${deviceName}" зафиксировано. Следующее: ${next.toLocaleDateString('ru')}`, 'success');
  await loadMaintenance();
}

// ── История ТО ───────────────────────────────
async function openMaintenanceLogs(deviceId, deviceName) {
  document.getElementById('logsDeviceName').textContent = deviceName;
  document.getElementById('modalMaintenanceLogs').classList.add('show');
  const container = document.getElementById('maintenanceLogsBody');
  container.innerHTML = '<tr><td colspan="3" class="text-muted" style="padding:16px;">Загрузка...</td></tr>';

  const { data, error } = await db.from('maintenance_logs').select('*')
    .eq('device_id', deviceId).order('maintenance_date', { ascending: false });

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

// ── Тест письма ──────────────────────────────
async function testNotification(deviceId, deviceName) {
  const btn = event.target;
  btn.disabled = true; btn.textContent = '⏳...';
  try {
    const resp = await fetch(
      'https://strmnfwpdtdnevhpqtar.supabase.co/functions/v1/send-maintenance-notifications',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true, device_id: deviceId })
      }
    );
    const result = await resp.json();
    showMaintenanceAlert(result.sent > 0 ? `📧 Письмо отправлено!` : `ℹ️ sent: ${result.sent}, skipped: ${result.skipped}`, result.sent > 0 ? 'success' : 'error');
  } catch (e) {
    showMaintenanceAlert('Ошибка: ' + e.message, 'error');
  }
  btn.disabled = false; btn.textContent = '📧 Тест';
}

// ── Время уведомлений ────────────────────────
async function loadNotifyTime() {
  try {
    const { data } = await db.from('settings').select('value').eq('key', 'notify_time').single();
    if (data?.value) document.getElementById('notifyTime').value = data.value;
  } catch(e) {}
}

async function saveNotifyTime() {
  const time = document.getElementById('notifyTime').value || '12:00';
  const btn = document.getElementById('saveNotifyTimeBtn');
  btn.disabled = true; btn.textContent = 'Сохранение...';
  const { error } = await db.from('settings').upsert({ key: 'notify_time', value: time });
  btn.disabled = false; btn.textContent = '💾 Сохранить';
  const alertEl = document.getElementById('notifyTimeAlert');
  if (error) {
    alertEl.textContent = 'Ошибка: ' + error.message;
    alertEl.className = 'alert alert-error show';
  } else {
    alertEl.textContent = `✅ Время сохранено: ${time} (Казахстан UTC+5)`;
    alertEl.className = 'alert alert-success show';
  }
  setTimeout(() => alertEl.classList.remove('show'), 4000);
}

// ── Фильтр ───────────────────────────────────
function filterMaintenance() {
  const q = document.getElementById('searchMaintenance').value.toLowerCase();
  const filter = document.getElementById('filterMaintenanceStatus').value;
  const today = new Date(); today.setHours(0,0,0,0);

  renderMaintenance(allMaintenance.filter(d => {
    const matchText = !q || d.name?.toLowerCase().includes(q) || d.type?.toLowerCase().includes(q) || d.location?.toLowerCase().includes(q);
    if (!matchText) return false;
    if (!filter) return true;
    if (!d.next_maintenance) return filter === 'none';
    const next = new Date(d.next_maintenance); next.setHours(0,0,0,0);
    const days = Math.round((next.getTime() - today.getTime()) / 86400000);
    if (filter === 'overdue') return days < 0;
    if (filter === 'soon') return days >= 0 && days <= 7;
    if (filter === 'ok') return days > 7;
    if (filter === 'none') return false;
    return true;
  }));
}

// ── Утилиты ──────────────────────────────────
function showMaintenanceAlert(msg, type) {
  const el = document.getElementById('maintenanceAlert');
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.classList.remove('show'), 5000);
}
