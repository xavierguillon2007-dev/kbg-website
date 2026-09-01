import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://qqelmmygalllmxinaxrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fqFvZNetzIdAfX860bmjBQ_GzJfeVK3';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let accounts = [];
let admins = [];
let selected = null;
let currentUserId = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return deny('Connectez-vous d’abord.');

  currentUserId = session.user.id;
  const { data: adminStatus, error: adminError } = await supabase.rpc('is_admin_user', {
    p_user_id: currentUserId
  });

  if (adminError || adminStatus !== true) {
    return deny('Accès réservé aux administrateurs.');
  }

  $('userNav').innerHTML = `<span style="font-weight:700;font-size:13px;">👋 ${esc(session.user.email)}</span> <button class="button" id="logoutBtn">Déconnexion</button>`;
  $('logoutBtn').onclick = async () => {
    await supabase.auth.signOut();
    location.href = 'index.html';
  };

  document.querySelectorAll('[data-close]').forEach(b => {
    b.onclick = () => $(b.dataset.close)?.classList.add('hidden');
  });

  $('accountSearch').addEventListener('input', render);
  $('accountEditForm').addEventListener('submit', saveAccount);
  $('deleteAccountBtn').addEventListener('click', deleteAccount);
  $('addAdminForm')?.addEventListener('submit', addAdmin);
  $('adminEmailSearch')?.addEventListener('input', renderAdmins);

  await loadAccounts();
  await loadAdmins();
}

function deny(message) {
  $('accountsList').innerHTML = `<div class="empty panel">${esc(message)}</div>`;
}

async function loadAccounts() {
  $('accountsList').innerHTML = '<div class="loading">Chargement des comptes…</div>';
  const { data, error } = await supabase.rpc('get_all_accounts_admin');
  if (error) {
    $('accountsList').innerHTML = `<div class="empty panel">Erreur : ${esc(error.message)}</div>`;
    return;
  }
  accounts = Array.isArray(data) ? data : [];
  render();
}

function render() {
  const q = ($('accountSearch').value || '').trim().toLowerCase();
  const list = accounts.filter(a =>
    !q || `${a.first_name} ${a.last_name} ${a.email}`.toLowerCase().includes(q)
  );

  if (!list.length) {
    $('accountsList').innerHTML = '<div class="empty panel">Aucun compte trouvé.</div>';
    return;
  }

  $('accountsList').innerHTML = list.map(a => `
    <article class="panel admin-card">
      <div>
        <span class="badge badge-${a.account_status === 'approved' ? 'success' : a.account_status === 'rejected' ? 'danger' : 'warning'}">${statusLabel(a.account_status)}</span>
        <h3 style="margin-top:8px;">${esc(a.first_name)} ${esc(a.last_name)}</h3>
        <p class="publisher">${esc(a.email)}</p>
      </div>
      <div class="admin-card-body">
        <p><strong>Promotion :</strong> ${esc(a.promotion || 'Non renseignée')}</p>
        <p><strong>Créé le :</strong> ${formatDate(a.created_at)}</p>
      </div>
      <div class="admin-card-actions">
        <button class="button primary" data-open-account="${esc(a.user_id)}">👁 Voir / modifier</button>
        <button class="button danger" data-delete-account="${esc(a.user_id)}">🗑 Supprimer</button>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('[data-open-account]').forEach(b =>
    b.onclick = () => openAccount(b.dataset.openAccount)
  );
  document.querySelectorAll('[data-delete-account]').forEach(b =>
    b.onclick = () => removeAccount(b.dataset.deleteAccount)
  );
}

function statusLabel(s) {
  return s === 'approved' ? 'Validé' : s === 'rejected' ? 'Refusé' : 'En attente';
}

function formatDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

function openAccount(id) {
  selected = accounts.find(a => String(a.user_id) === String(id));
  if (!selected) return;

  $('accountModalTitle').textContent =
    `${selected.first_name || ''} ${selected.last_name || ''}`.trim() || 'Compte';
  $('accountModalEmail').textContent = selected.email || '';

  const f = $('accountEditForm');
  f.user_id.value = selected.user_id;
  f.first_name.value = selected.first_name || '';
  f.last_name.value = selected.last_name || '';
  f.promotion.value = selected.promotion || '';
  f.account_status.value = selected.account_status || 'pending';
  $('accountEditMsg').textContent = '';
  $('accountModal').classList.remove('hidden');
}

async function saveAccount(e) {
  e.preventDefault();
  if (!selected) return;

  const f = e.currentTarget;
  const msg = $('accountEditMsg');
  msg.textContent = 'Enregistrement…';

  const { error } = await supabase.rpc('update_account_admin', {
    p_user_id: selected.user_id,
    p_first_name: f.first_name.value.trim(),
    p_last_name: f.last_name.value.trim(),
    p_promotion: f.promotion.value.trim(),
    p_account_status: f.account_status.value
  });

  if (error) {
    msg.textContent = 'Erreur : ' + error.message;
    msg.style.color = 'var(--danger)';
    return;
  }

  msg.textContent = '✓ Modifications enregistrées.';
  msg.style.color = 'var(--success)';
  await loadAccounts();
  setTimeout(() => $('accountModal').classList.add('hidden'), 500);
}

async function deleteAccount() {
  if (!selected) return;
  await removeAccount(selected.user_id, true);
}

async function removeAccount(id, fromModal = false) {
  const account = accounts.find(a => String(a.user_id) === String(id));
  if (!account) return;

  if (!confirm(`Supprimer définitivement le compte de ${account.first_name} ${account.last_name} (${account.email}) ?\n\nCette action est irréversible.`)) {
    return;
  }

  const { error } = await supabase.rpc('delete_account_admin', {
    p_user_id: account.user_id
  });

  if (error) {
    alert('Erreur : ' + error.message);
    return;
  }

  if (fromModal) $('accountModal').classList.add('hidden');
  await loadAccounts();
  await loadAdmins();
}

async function loadAdmins() {
  const list = $('adminsList');
  if (!list) return;

  list.innerHTML = '<div class="loading">Chargement des administrateurs…</div>';

  const { data, error } = await supabase.rpc('get_admin_users_admin');
  if (error) {
    list.innerHTML = `<div class="empty panel">Erreur : ${esc(error.message)}</div>`;
    return;
  }

  admins = Array.isArray(data) ? data : [];
  renderAdmins();
}

function renderAdmins() {
  const list = $('adminsList');
  if (!list) return;

  const q = ($('adminEmailSearch')?.value || '').trim().toLowerCase();
  const filtered = admins.filter(a =>
    !q || `${a.email} ${a.first_name || ''} ${a.last_name || ''}`.toLowerCase().includes(q)
  );

  if (!filtered.length) {
    list.innerHTML = '<div class="empty panel">Aucun administrateur trouvé.</div>';
    return;
  }

  list.innerHTML = filtered.map(a => `
    <article class="panel admin-card">
      <div>
        <span class="badge badge-success">Administrateur</span>
        <h3 style="margin-top:8px;">${esc(`${a.first_name || ''} ${a.last_name || ''}`.trim() || a.email)}</h3>
        <p class="publisher">${esc(a.email)}</p>
      </div>
      <div class="admin-card-actions">
        ${String(a.user_id) === String(currentUserId)
          ? '<span class="publisher">Votre compte</span>'
          : `<button class="button danger" data-remove-admin="${esc(a.user_id)}">Retirer les droits</button>`}
      </div>
    </article>
  `).join('');

  document.querySelectorAll('[data-remove-admin]').forEach(button => {
    button.onclick = () => removeAdmin(button.dataset.removeAdmin);
  });
}

async function addAdmin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const msg = $('addAdminMsg');
  const email = form.email.value.trim().toLowerCase();

  msg.textContent = 'Recherche du compte…';
  msg.style.color = 'var(--muted)';

  const account = accounts.find(a => (a.email || '').toLowerCase() === email);
  if (!account) {
    msg.textContent = 'Aucun compte avec cet e-mail. Le compte doit d’abord être créé.';
    msg.style.color = 'var(--danger)';
    return;
  }

  const { error } = await supabase.rpc('add_admin_user', {
    p_user_id: account.user_id
  });

  if (error) {
    msg.textContent = 'Erreur : ' + error.message;
    msg.style.color = 'var(--danger)';
    return;
  }

  msg.textContent = '✓ Administrateur ajouté.';
  msg.style.color = 'var(--success)';
  form.reset();
  await loadAdmins();
}

async function removeAdmin(userId) {
  const admin = admins.find(a => String(a.user_id) === String(userId));
  if (!admin) return;

  if (!confirm(`Retirer les droits administrateur de ${admin.email} ?`)) return;

  const { error } = await supabase.rpc('remove_admin_user', {
    p_user_id: userId
  });

  if (error) {
    alert('Erreur : ' + error.message);
    return;
  }

  await loadAdmins();
}
