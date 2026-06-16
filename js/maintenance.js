// ══════════════════════════════════════════════
//  ТЕХНИЧЕСКОЕ ОБСЛУЖИВАНИЕ — maintenance.js
// ══════════════════════════════════════════════

let allMaintenance = [];

// ── Загрузить список ТО ───────────────────────
async function loadMaintenance() {
  const container = document.getElementById('maintenanceList');
  container.innerHTML = '<div class="loading">Загрузка...</div>';

  // Загружаем ожидающие одобрения (только для admin/superadmin)
  if (isAdmin(currentUser)) {
    await loadPendingApprovals();
  }

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

// ── Блок "На проверке" с файлами ─────────────
function esc(s) { return (s||'').replace(/'/g,"\'"); }

async function loadPendingApprovals() {
  const { data: pending } = await db
    .from('maintenance_logs')
    .select('*, devices(id, name, type, location, maintenance_interval_days)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const wrap = document.getElementById('pendingApprovalsWrap');
  if (!wrap) return;
  if (!pending?.length) { wrap.style.display = 'none'; return; }

  const baseUrl = 'https://strmnfwpdtdnevhpqtar.supabase.co/storage/v1/object/public/device-files/';

  // Загружаем файлы актов для каждого устройства
  const logsWithFiles = await Promise.all(pending.map(async l => {
    const { data: files } = await db.from('device_files')
      .select('*').eq('device_id', l.devices?.id)
      .like('file_path', '%/acts/%')
      .order('uploaded_at', { ascending: false }).limit(10);
    return { ...l, actFiles: files || [] };
  }));

  wrap.style.display = 'block';
  wrap.innerHTML = `
    <div style="font-weight:700;font-size:14px;color:var(--yellow);margin-bottom:12px;">
      🕐 Ожидают вашего одобрения (${pending.length})
    </div>
    ${logsWithFiles.map(l => {
      const docs = l.actFiles.filter(f => !f.file_type?.includes('image'));
      const photos = l.actFiles.filter(f => f.file_type?.includes('image'));
      return `
        <div class="card" style="margin-bottom:12px;border:2px solid var(--yellow);">
          <div class="flex-between" style="flex-wrap:wrap;gap:8px;">
            <div>
              <div style="font-weight:700;">${l.devices?.name || '—'}</div>
              <div class="text-muted" style="font-size:12px;">${l.devices?.type||''} · ${l.devices?.location||''}</div>
              <div style="font-size:12px;margin-top:4px;">📅 Дата ТО: <b>${new Date(l.maintenance_date).toLocaleDateString('ru')}</b></div>
              ${l.notes ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">💬 ${l.notes}</div>` : ''}
            </div>
            <span style="background:var(--yellow-dim);color:var(--yellow);border:1px solid var(--yellow);padding:4px 12px;border-radius:100px;font-size:12px;font-weight:700;">🕐 На проверке</span>
          </div>
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
            <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px;">📎 Загруженные файлы для проверки:</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;">
              ${docs.map(f => `<a href="${baseUrl}${f.file_path}" target="_blank" class="btn btn-secondary btn-sm" style="font-size:11px;">📄 ${f.name}</a>`).join('')}
              ${photos.map(f => `<a href="${baseUrl}${f.file_path}" target="_blank"><img src="${baseUrl}${f.file_path}" style="height:70px;width:70px;object-fit:cover;border-radius:8px;border:2px solid var(--border);" title="${f.name}"></a>`).join('')}
              ${!docs.length && !photos.length ? '<span style="color:var(--red);font-size:12px;">⚠️ Файлы не загружены</span>' : ''}
            </div>
          </div>
          <div class="flex mt-8" style="gap:8px;">
            <button class="btn btn-success btn-sm" style="flex:1;" onclick="approveMaintenance('${l.id}','${l.devices?.id}',${l.devices?.maintenance_interval_days||90},'${l.maintenance_date}','${esc(l.devices?.name||'')}')">✅ Одобрить</button>
            <button class="btn btn-danger btn-sm" style="flex:1;" onclick="rejectMaintenance('${l.id}','${esc(l.devices?.name||'')}')">❌ Отклонить</button>
          </div>
        </div>`;
    }).join('')}`;
}

async function approveMaintenance(logId, deviceId, interval, maintenanceDate, deviceName) {
  if (!confirm(`Одобрить выполнение ТО для "${deviceName}"?`)) return;

  const next = new Date(maintenanceDate);
  next.setDate(next.getDate() + interval);
  const nextDate = next.toISOString().split('T')[0];

  // Обновить лог — одобрено
  const { error: logErr } = await db.from('maintenance_logs').update({
    status: 'approved',
    approved_by: currentUser.id,
    approved_at: new Date().toISOString()
  }).eq('id', logId);

  if (logErr) { showMaintenanceAlert('Ошибка: ' + logErr.message, 'error'); return; }

  // Теперь обновить устройство — дата пересчитывается
  const { error: devErr } = await db.from('devices').update({
    last_maintenance: maintenanceDate,
    next_maintenance: nextDate,
    status: 'active'
  }).eq('id', deviceId);

  if (devErr) { showMaintenanceAlert('Ошибка: ' + devErr.message, 'error'); return; }

  showMaintenanceAlert(`✅ ТО одобрено! Следующее ТО для "${deviceName}": ${next.toLocaleDateString('ru')}`, 'success');
  await loadMaintenance();
}

async function rejectMaintenance(logId, deviceName) {
  const reason = prompt(`Причина отклонения ТО для "${deviceName}":`);
  if (reason === null) return;

  const { error } = await db.from('maintenance_logs').update({
    status: 'rejected',
    approved_by: currentUser.id,
    approved_at: new Date().toISOString(),
    notes: (document.querySelector(`[data-log-id="${logId}"]`)?.dataset?.notes || '') + (reason ? ` [Отклонено: ${reason}]` : ' [Отклонено]')
  }).eq('id', logId);

  // Вернуть статус устройства в active
  const { data: log } = await db.from('maintenance_logs').select('device_id').eq('id', logId).single();
  if (log) await db.from('devices').update({ status: 'active' }).eq('id', log.device_id);

  if (error) { showMaintenanceAlert('Ошибка: ' + error.message, 'error'); return; }

  showMaintenanceAlert(`❌ ТО для "${deviceName}" отклонено. ИТР должен повторить.`, 'error');
  await loadMaintenance();
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

// ── Модальное окно выполнения ТО ─────────────
let doneDocFile = null;
let donePhotoFile = null;
let doneDeviceId = null;
let doneDeviceName = null;

async function markMaintenanceDone(deviceId, deviceName) {
  doneDocFile = null;
  donePhotoFile = null;
  doneDeviceId = deviceId;
  doneDeviceName = deviceName;

  document.getElementById('doneModalDeviceName').textContent = deviceName;
  document.getElementById('doneModalDeviceId').value = deviceId;
  document.getElementById('doneModalNotes').value = '';
  document.getElementById('doneDocInput').value = '';
  document.getElementById('donePhotoInput').value = '';

  // Сбросить статусы
  resetDoneZone('doneDocZone', 'doneDocStatus', '📄', 'Нажмите для загрузки акта');
  resetDoneZone('donePhotoZone', 'donePhotoStatus', '📷', 'Нажмите для загрузки фото');

  document.getElementById('doneModalConfirmBtn').disabled = true;
  document.getElementById('doneModalConfirmBtn').style.opacity = '0.5';
  document.getElementById('doneModalHint').style.display = 'block';
  document.getElementById('doneModalAlert').className = 'alert';

  document.getElementById('modalDone').classList.add('show');
}

function resetDoneZone(zoneId, statusId, icon, text) {
  document.getElementById(zoneId).style.borderColor = 'var(--border)';
  document.getElementById(zoneId).style.background = '';
  document.getElementById(zoneId).innerHTML = `
    <div style="font-size:24px;">${icon}</div>
    <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">${text}</div>
    <input type="file" id="${zoneId === 'doneDocZone' ? 'doneDocInput' : 'donePhotoInput'}" 
      style="display:none" 
      accept="${zoneId === 'doneDocZone' ? '.pdf,.doc,.docx,.xls,.xlsx' : 'image/*'}" 
      onchange="handleDoneFile(this,'${zoneId === 'doneDocZone' ? 'doc' : 'photo'}')">`;
  document.getElementById(statusId).style.display = 'none';
}

function handleDoneFile(input, type) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    alert('Файл не должен превышать 20MB');
    return;
  }

  if (type === 'doc') {
    doneDocFile = file;
    const zone = document.getElementById('doneDocZone');
    zone.style.borderColor = 'var(--green)';
    zone.style.background = 'var(--green-dim)';
    zone.innerHTML = `
      <div style="font-size:24px;">✅</div>
      <div style="font-weight:600;font-size:13px;color:var(--green);margin-top:4px;">${file.name}</div>
      <div style="font-size:11px;color:var(--text-muted);">${(file.size/1024).toFixed(0)} KB · нажмите чтобы заменить</div>
      <input type="file" id="doneDocInput" style="display:none" accept=".pdf,.doc,.docx,.xls,.xlsx" onchange="handleDoneFile(this,'doc')">`;
  } else {
    donePhotoFile = file;
    const zone = document.getElementById('donePhotoZone');
    zone.style.borderColor = 'var(--green)';
    zone.style.background = 'var(--green-dim)';

    // Показать превью фото
    const reader = new FileReader();
    reader.onload = e => {
      zone.innerHTML = `
        <img src="${e.target.result}" style="max-height:120px;border-radius:6px;margin-bottom:6px;">
        <div style="font-weight:600;font-size:13px;color:var(--green);">${file.name}</div>
        <div style="font-size:11px;color:var(--text-muted);">нажмите чтобы заменить</div>
        <input type="file" id="donePhotoInput" style="display:none" accept="image/*" onchange="handleDoneFile(this,'photo')">`;
    };
    reader.readAsDataURL(file);
  }

  checkDoneModalButton();
}

function checkDoneModalButton() {
  const canDone = doneDocFile !== null && donePhotoFile !== null;
  const btn = document.getElementById('doneModalConfirmBtn');
  const hint = document.getElementById('doneModalHint');
  btn.disabled = !canDone;
  btn.style.opacity = canDone ? '1' : '0.5';
  hint.style.display = canDone ? 'none' : 'block';
}

function closeDoneModal() {
  document.getElementById('modalDone').classList.remove('show');
  doneDocFile = null;
  donePhotoFile = null;
}

async function confirmDone() {
  if (!doneDocFile || !donePhotoFile || !doneDeviceId) return;

  const btn = document.getElementById('doneModalConfirmBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Сохранение...';

  const notes = document.getElementById('doneModalNotes').value.trim();
  const today = new Date().toISOString().split('T')[0];

  try {
    // Загрузить документ
    const docExt = doneDocFile.name.split('.').pop();
    const docPath = `${doneDeviceId}/acts/${Date.now()}_act.${docExt}`;
    const { error: docErr } = await db.storage.from('device-files').upload(docPath, doneDocFile);
    if (docErr) throw new Error('Ошибка загрузки акта: ' + docErr.message);

    await db.from('device_files').insert({
      device_id: doneDeviceId,
      name: doneDocFile.name,
      file_path: docPath,
      file_type: doneDocFile.type,
      visible_to_workers: false
    });

    // Загрузить фото
    const photoExt = donePhotoFile.name.split('.').pop();
    const photoPath = `${doneDeviceId}/acts/${Date.now()}_photo.${photoExt}`;
    const { error: photoErr } = await db.storage.from('device-files').upload(photoPath, donePhotoFile);
    if (photoErr) throw new Error('Ошибка загрузки фото: ' + photoErr.message);

    await db.from('device_files').insert({
      device_id: doneDeviceId,
      name: donePhotoFile.name,
      file_path: photoPath,
      file_type: donePhotoFile.type,
      visible_to_workers: false
    });

    // Записать лог ТО со статусом "pending" — ждёт одобрения
    await db.from('maintenance_logs').insert({
      device_id: doneDeviceId,
      maintenance_date: today,
      notes: notes || null,
      status: 'pending'
    });

    // Поставить статус устройства "на проверке"
    await db.from('devices').update({ status: 'maintenance' }).eq('id', doneDeviceId);

    closeDoneModal();
    showMaintenanceAlert(`📋 ТО для "${doneDeviceName}" отправлено на проверку администратору`, 'success');
    await loadMaintenance();

  } catch(e) {
    const alertEl = document.getElementById('doneModalAlert');
    alertEl.textContent = e.message;
    alertEl.className = 'alert alert-error show';
    btn.disabled = false;
    btn.textContent = '✅ Подтвердить выполнение';
  }
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

  container.innerHTML = data.map(l => {
    const statusBadge = l.status === 'approved'
      ? '<span style="background:var(--green-dim);color:var(--green);border:1px solid var(--green);padding:2px 8px;border-radius:100px;font-size:11px;">✅ Одобрено</span>'
      : l.status === 'rejected'
      ? '<span style="background:var(--red-dim);color:var(--red);border:1px solid var(--red);padding:2px 8px;border-radius:100px;font-size:11px;">❌ Отклонено</span>'
      : '<span style="background:var(--yellow-dim);color:var(--yellow);border:1px solid var(--yellow);padding:2px 8px;border-radius:100px;font-size:11px;">🕐 На проверке</span>';
    return `<tr>
      <td>${new Date(l.maintenance_date).toLocaleDateString('ru-RU')}</td>
      <td>${l.notes || '—'}</td>
      <td>${statusBadge}</td>
    </tr>`;
  }).join('');
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
