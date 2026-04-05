// Получить текущего пользователя из localStorage
function getUser() {
  const user = localStorage.getItem('qr_user');
  return user ? JSON.parse(user) : null;
}

// Сохранить пользователя
function setUser(user) {
  localStorage.setItem('qr_user', JSON.stringify(user));
}

// Выйти
function logout() {
  localStorage.removeItem('qr_user');
  window.location.href = 'login.html';
}

// Проверить авторизацию — если нет, редирект на логин
function requireAuth() {
  const user = getUser();
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  return user;
}

// Проверить что пользователь admin — иначе редирект
function requireAdmin() {
  const user = requireAuth();
  if (user && user.role !== 'admin') {
    window.location.href = 'access-denied.html';
    return null;
  }
  return user;
}
