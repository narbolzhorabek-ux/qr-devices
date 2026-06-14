function getUser() {
  const u = localStorage.getItem('qr_user');
  return u ? JSON.parse(u) : null;
}

function setUser(user) {
  localStorage.setItem('qr_user', JSON.stringify(user));
}

function logout() {
  localStorage.removeItem('qr_user');
  window.location.href = 'login.html';
}

function requireAuth() {
  const user = getUser();
  if (!user) { window.location.href = 'login.html'; return null; }
  return user;
}

// Роли с доступом к админке
const ADMIN_ROLES = ['superadmin', 'admin', 'chief', 'itr'];

function requireAdmin() {
  const user = requireAuth();
  if (user && !ADMIN_ROLES.includes(user.role)) {
    window.location.href = 'access-denied.html';
    return null;
  }
  return user;
}

// Проверка прав
function isSuperAdmin(user) { return user?.role === 'superadmin'; }
function isAdmin(user)      { return ['superadmin','admin'].includes(user?.role); }
function isChief(user)      { return ['superadmin','admin','chief'].includes(user?.role); }
function isITR(user)        { return ['superadmin','admin','chief','itr'].includes(user?.role); }

// Текст роли
function roleLabel(role) {
  const map = {
    superadmin: 'Супер-администратор',
    admin: 'Администратор',
    chief: 'Начальник службы',
    itr: 'ИТР',
    worker: 'Персонал'
  };
  return map[role] || role;
}

function roleBadgeClass(role) {
  const map = {
    superadmin: 'role-superadmin',
    admin: 'role-admin',
    chief: 'role-chief',
    itr: 'role-itr',
    worker: 'role-worker'
  };
  return map[role] || 'role-worker';
}
