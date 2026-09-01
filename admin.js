import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://qqelmmygalllmxinaxrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fqFvZNetzIdAfX860bmjBQ_GzJfeVK3';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Le statut administrateur est vérifié côté Supabase.
let currentUserIsAdmin = false;
const isAdminEmail = _email => currentUserIsAdmin;

async function loadAdminStatus(userId) {
  if (!userId) return false;
  const { data, error } = await supabase.rpc('is_admin_user', { p_user_id: userId });
  if (error) {
    console.error('Erreur vérification administrateur :', error);
    return false;
  }
  return data === true;
}

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

let currentReservations = [];
let currentGames = [];
let currentAccountRequests = [];

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    currentUserIsAdmin = await loadAdminStatus(session.user.id);
  }

  if (!session) {
    $('adminReservationsList').innerHTML = `<div class="empty panel">Accès restreint. Connectez-vous d'abord sur la page d'accueil.</div>`;
    $('adminGamesList').innerHTML = '';
    return;
  }

  if (!isAdminEmail(session.user.email)) {
    $('adminReservationsList').innerHTML = `<div class="empty panel">Accès réservé aux administrateurs.</div>`;
    $('adminGamesList').innerHTML = '';
    $('addGameForm')?.remove();
    $('userNav').innerHTML = `
      <span style="font-weight:700; font-size:13px;">👋 ${esc(session.user.email)}</span>
      <button class="button" id="logoutBtn">Déconnexion</button>
    `;
    $('logoutBtn').addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.href = 'index.html';
    });
    return;
  }

  $('userNav').innerHTML = `
    <span style="font-weight:700; font-size:13px;">👋 ${esc(session.user.email)}</span>
    <button class="button" id="logoutBtn">Déconnexion</button>
  `;
  $('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  });

  $('filterStatus').addEventListener('change', renderReservations);
  $('addGameForm').addEventListener('submit', handleAddGame);
  $('editGameForm')?.addEventListener('submit', handleEditGame);

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.onclick = () => $(btn.dataset.close)?.classList.add('hidden');
  });

await loadAdminGames();
await loadAdminReservations();
await loadAccountRequests();
});

// --- GESTION DU CATALOGUE (AJOUT / ÉDITION / SUPPRESSION) ---
async function loadAdminGames() {
  const container = $('adminGamesList');
  const { data: games, error } = await supabase.from('games').select('*').order('name');

  if (error) {
    container.innerHTML = `<div class="empty panel">Erreur : ${esc(error.message)}</div>`;
    return;
  }

  currentGames = games || [];

  container.innerHTML = currentGames.map(g => `
    <article class="panel admin-card">
      <div>
        <p class="tag">${esc(g.category || 'Jeu')}</p>
        <h3>${esc(g.name)}</h3>
        <p class="publisher">${esc(g.publisher || '')}</p>
      </div>
      <div class="admin-card-actions">
        <button class="button" data-edit-game="${g.id}">✏️ Modifier</button>
        <button class="button danger" data-delete-game="${g.id}">🗑 Supprimer</button>
      </div>
    </article>
  `).join('');

  container.querySelectorAll('[data-edit-game]').forEach(btn => {
    btn.onclick = () => {
      const game = currentGames.find(g => String(g.id) === btn.dataset.editGame);
      if (game) openEditGameModal(game);
    };
  });

  container.querySelectorAll('[data-delete-game]').forEach(btn => {
    btn.onclick = async () => {
      if (confirm('Voulez-vous vraiment supprimer ce jeu du catalogue ?')) {
        await supabase.from('games').delete().eq('id', btn.dataset.deleteGame);
        loadAdminGames();
      }
    };
  });
}

async function handleAddGame(e) {
  e.preventDefault();
  const msg = $('addGameMsg');
  msg.textContent = 'Enregistrement…';

  const f = new FormData(e.currentTarget);
  const newGame = {
    id: crypto.randomUUID(),
    name: f.get('name').trim(),
    publisher: f.get('publisher').trim(),
    category: f.get('category').trim() || null,
    cover_image: f.get('cover_image').trim() || null,
    players_min: Number(f.get('players_min')) || null,
    players_max: Number(f.get('players_max')) || null,
    duration: Number(f.get('duration')) || null,
    description: f.get('description').trim() || null,
    is_active: true
  };

  const { error } = await supabase.from('games').insert(newGame);

  if (error) {
    msg.textContent = 'Erreur : ' + error.message;
  } else {
    msg.textContent = '✓ Jeu ajouté au catalogue !';
    e.currentTarget.reset();
    loadAdminGames();
  }
}

function openEditGameModal(game) {
  const form = $('editGameForm');
  const msg = $('editGameMsg');
  if (!form) return;

  msg.textContent = '';
  form.querySelector('[name="id"]').value = game.id;
  form.querySelector('[name="name"]').value = game.name || '';
  form.querySelector('[name="publisher"]').value = game.publisher || '';
  form.querySelector('[name="category"]').value = game.category || '';
  form.querySelector('[name="cover_image"]').value = game.cover_image || '';
  form.querySelector('[name="players_min"]').value = game.players_min ?? '';
  form.querySelector('[name="players_max"]').value = game.players_max ?? '';
  form.querySelector('[name="duration"]').value = game.duration ?? '';
  form.querySelector('[name="description"]').value = game.description || '';

  $('editGameModal')?.classList.remove('hidden');
}

async function handleEditGame(e) {
  e.preventDefault();
  const msg = $('editGameMsg');
  const submitBtn = e.currentTarget.querySelector('button[type="submit"]');

  msg.textContent = 'Enregistrement…';
  msg.style.color = 'var(--muted)';
  if (submitBtn) submitBtn.disabled = true;

  const f = new FormData(e.currentTarget);
  const gameId = f.get('id');
  const updatedGame = {
    name: f.get('name').trim(),
    publisher: f.get('publisher').trim(),
    category: f.get('category').trim() || null,
    cover_image: f.get('cover_image').trim() || null,
    players_min: Number(f.get('players_min')) || null,
    players_max: Number(f.get('players_max')) || null,
    duration: Number(f.get('duration')) || null,
    description: f.get('description').trim() || null
  };

  const { error } = await supabase.from('games').update(updatedGame).eq('id', gameId);

  if (submitBtn) submitBtn.disabled = false;

  if (error) {
    msg.textContent = 'Erreur : ' + error.message;
    msg.style.color = 'var(--danger)';
    return;
  }

  msg.textContent = '✓ Fiche mise à jour !';
  msg.style.color = 'var(--success)';
  loadAdminGames();
  setTimeout(() => $('editGameModal')?.classList.add('hidden'), 600);
}

// --- GESTION DES RÉSERVATIONS ---
async function loadAdminReservations() {
  const container = $('adminReservationsList');
  const { data, error } = await supabase
    .from('reservations')
    .select('*, games(name, publisher)')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<div class="empty panel">Erreur : ${esc(error.message)}</div>`;
    return;
  }

  currentReservations = data || [];
  renderReservations();
}

function updateAdminReservationBadge() {
  const badge = $('adminReservationsBadge');
  if (!badge) return;
  const count = currentReservations.filter(r => r.status === 'pending').length;
  badge.textContent = `${count} en attente`;
  badge.hidden = count === 0;
}

function renderReservations() {
  const container = $('adminReservationsList');
  updateAdminReservationBadge();
  const filter = $('filterStatus').value;
  const list = currentReservations.filter(r => !filter || r.status === filter);

  if (!list.length) {
    container.innerHTML = `<div class="empty panel">Aucune demande trouvée.</div>`;
    return;
  }

  container.innerHTML = list.map(r => `
    <article class="panel admin-card">
      <div>
        <span class="badge badge-${r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}">
          ${r.status}
        </span>
        <h3 style="margin-top:8px;">${esc(r.games?.name || 'Jeu inconnu')}</h3>
      </div>
      <div class="admin-card-body">
        <p><strong>Demandeur :</strong> ${esc(r.first_name)} ${esc(r.last_name)} (${esc(r.promotion)})</p>
        <p><strong>Période :</strong> du ${esc(r.date_start)} au ${esc(r.date_end)}</p>
      </div>
      <div class="admin-card-actions">
        ${r.status !== 'approved' ? `<button class="button primary" data-action="approved" data-id="${r.id}">✓ Valider</button>` : ''}
        ${r.status !== 'rejected' ? `<button class="button danger" data-action="rejected" data-id="${r.id}">✕ Refuser</button>` : ''}
      </div>
    </article>
  `).join('');

  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = '…';

      const { data, error } = await supabase
        .from('reservations')
        .update({ status: btn.dataset.action })
        .eq('id', btn.dataset.id)
        .select();

      if (error) {
        alert('Erreur : ' + error.message);
        btn.disabled = false;
        btn.textContent = originalText;
        return;
      }

      if (!data || !data.length) {
        alert(
          "La mise à jour n'a pas été appliquée. C'est très probablement un problème de permissions Supabase : " +
          "la policy RLS d'UPDATE sur la table 'reservations' n'autorise pas votre compte à modifier cette ligne. " +
          "Vérifiez/ajoutez la policy admin dans Supabase (voir message précédent)."
        );
        btn.disabled = false;
        btn.textContent = originalText;
        return;
      }

      loadAdminReservations();
    };
  });
}
// =========================================================
// VALIDATION DES COMPTES — UNE SEULE SECTION
// Les nouvelles demandes et les anciens comptes pending sont
// fusionnés ici pour éviter toute duplication dans l'interface.
// =========================================================

async function loadAccountRequests() {
  const container = $('accountRequestsList');
  if (!container) return;

  container.innerHTML = '<div class="loading">Chargement des comptes à valider…</div>';

  try {
    const [requestsResult, legacyResult] = await Promise.all([
      supabase
        .from('account_requests')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.rpc('get_pending_accounts_admin')
    ]);

    if (requestsResult.error) throw requestsResult.error;
    if (legacyResult.error) throw legacyResult.error;

    const requests = (requestsResult.data || []).filter(request => request.status === 'pending').map(request => ({
      ...request,
      source: 'request'
    }));

    const legacy = (legacyResult.data || []).map(account => ({
      ...account,
      id: `legacy:${account.user_id}`,
      source: 'profile',
      status: 'pending'
    }));

    // Si un même e-mail apparaît dans les deux systèmes, la demande
    // explicite account_requests est prioritaire afin d'éviter un doublon.
    const seenEmails = new Set();
    currentAccountRequests = [...requests, ...legacy].filter(item => {
      const email = String(item.email || '').trim().toLowerCase();
      if (!email) return true;
      if (seenEmails.has(email)) return false;
      seenEmails.add(email);
      return true;
    });

    renderAccountRequests();
    updatePendingAccountsBadge();
  } catch (error) {
    console.error('Erreur chargement des comptes à valider :', error);
    container.innerHTML = `
      <div class="empty panel">
        <strong>Impossible de charger les comptes à valider.</strong><br><br>
        <small>${esc(error?.message || String(error))}</small>
      </div>
    `;
  }
}

// =========================================================
// AFFICHAGE DES DEMANDES
// =========================================================

function renderAccountRequests() {
  const container = $('accountRequestsList');
  if (!container) return;

  const pendingRequests = currentAccountRequests.filter(
    request => request.status === 'pending'
  );

  updatePendingAccountsBadge(pendingRequests.length);

  if (!pendingRequests.length) {
    container.innerHTML = '<div class="empty panel">Aucune demande de compte en attente.</div>';
    return;
  }

  container.innerHTML = pendingRequests.map(request => `
    <article class="panel admin-card">
      <div>
        <span class="badge badge-warning">En attente</span>
        <h3 style="margin-top:8px;">${esc(request.first_name)} ${esc(request.last_name)}</h3>
        <p class="publisher">${esc(request.email)}</p>
      </div>
      <div class="admin-card-body">
        <p><strong>Promotion :</strong> ${esc(request.promotion || 'Non renseignée')}</p>
        <p><strong>Origine :</strong> ${request.source === 'profile' ? 'Compte existant' : 'Nouvelle demande'}</p>
        <p><strong>Date :</strong> ${formatAccountRequestDate(request.created_at)}</p>
      </div>
      <div class="admin-card-actions">
        <button class="button primary" data-account-action="approved" data-account-id="${esc(request.id)}">✓ Valider</button>
        <button class="button danger" data-account-action="rejected" data-account-id="${esc(request.id)}">✕ Refuser</button>
      </div>
    </article>
  `).join('');

  container.querySelectorAll('[data-account-action]').forEach(button => {
    button.addEventListener('click', () =>
      handleAccountDecision(
        button.dataset.accountId,
        button.dataset.accountAction,
        button
      )
    );
  });
}

function updatePendingAccountsBadge(count = currentAccountRequests.filter(
  request => request.status === 'pending'
).length) {
  const badge = $('pendingAccountsBadge');
  if (!badge) return;

  badge.textContent = `${count} en attente`;
  badge.hidden = count === 0;
}

function formatAccountRequestDate(value) {
  if (!value) return 'Date inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

async function handleAccountDecision(requestId, decision, button) {
  const request = currentAccountRequests.find(item => String(item.id) === String(requestId));
  if (!request || !['approved', 'rejected'].includes(decision)) {
    alert('Demande de compte invalide.');
    return;
  }

  const action = decision === 'approved' ? 'valider' : 'refuser';
  if (!confirm(`Voulez-vous vraiment ${action} le compte de ${request.first_name} ${request.last_name} ?`)) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '…';

  try {
    let data;
    let error;

    if (request.source === 'profile') {
      ({ data, error } = await supabase.rpc('set_account_status_admin', {
        p_user_id: request.user_id,
        p_status: decision
      }));
    } else {
      ({ data, error } = await supabase
        .from('account_requests')
        .update({ status: decision })
        .eq('id', request.id)
        .select('id, status'));
    }

    if (error) throw error;
    if (request.source === 'profile' ? !data : (!data || !data.length)) {
      throw new Error("La mise à jour du compte n'a pas été appliquée.");
    }

    alert(decision === 'approved' ? '✓ Compte validé avec succès.' : '✓ Compte refusé.');
    await loadAccountRequests();
  } catch (error) {
    console.error('Erreur validation compte :', error);
    alert('Erreur : ' + (error?.message || error));
    button.disabled = false;
    button.textContent = originalText;
  }
}

// =========================================================
// DATE
// =========================================================

function formatAccountRequestDate(value) {

  if (!value) {
    return 'Date inconnue';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Date inconnue';
  }

  return date.toLocaleString(
    'fr-FR',
    {
      dateStyle: 'medium',
      timeStyle: 'short'
    }
  );
}


// =========================================================
// VALIDATION / REFUS
// =========================================================

async function handleAccountDecision(
  requestId,
  decision,
  button
) {

  const request =
    currentAccountRequests.find(
      item =>
        String(item.id) ===
        String(requestId)
    );

  if (!request) {
    alert('Demande introuvable.');
    return;
  }

  const action =
    decision === 'approved'
      ? 'valider'
      : 'refuser';

  if (
    !confirm(
      `Voulez-vous vraiment ${action} le compte de ` +
      `${request.first_name} ${request.last_name} ?`
    )
  ) {
    return;
  }

  const originalText =
    button.textContent;

  button.disabled = true;
  button.textContent = '…';

  try {

    // La RLS autorise directement les administrateurs à modifier
    // account_requests. Le trigger SQL
    // account_requests_sync_profile_status synchronise ensuite
    // automatiquement profiles.account_status.
    const { data, error } = await supabase
      .from('account_requests')
      .update({
        status: decision
      })
      .eq('id', request.id)
      .select('id, status');

    if (error) {
      console.error(
        'Erreur mise à jour account_requests :',
        error
      );
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error(
        "La mise à jour n'a rien modifié. Vérifiez les policies RLS de la table account_requests."
      );
    }

    alert(
      decision === 'approved'
        ? '✓ Compte validé avec succès.'
        : '✓ Compte refusé.'
    );

    await loadAccountRequests();

  } catch (error) {

    console.error(
      'Erreur validation compte :',
      error
    );

    alert(
      'Erreur : ' +
      (error?.message || error)
    );

    button.disabled = false;
    button.textContent = originalText;
  }
}
