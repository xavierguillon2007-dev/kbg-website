import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://qqelmmygalllmxinaxrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fqFvZNetzIdAfX860bmjBQ_GzJfeVK3';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let allGames = [];
let currentUser = null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();

  try {
    const { data } = await supabase.auth.getSession();
    await handleAuthChange(data?.session?.user || null);
  } catch (err) {
    console.error("Erreur Auth:", err);
  }

  loadGames();
  renderCalendar();
});

supabase.auth.onAuthStateChange((_e, session) => {
  handleAuthChange(session?.user || null);
});

// --- GESTION AUTH & NOTIFICATIONS ---

async function handleAuthChange(user) {
  currentUser = user;
  const userNav = $('userNav');

  if (currentUser) {
    if (userNav) {
      userNav.innerHTML = `
        <span style="font-size:13px; font-weight:700;">👋 ${esc(currentUser.email)}</span>
        <button class="button primary" id="openAdminBtn">🔑 Admin</button>
        <button class="button" id="logoutBtn">Déconnexion</button>
      `;
      $('logoutBtn').onclick = () => supabase.auth.signOut();
      $('openAdminBtn').onclick = () => {
        $('adminModal')?.classList.remove('hidden');
        loadAdminPanel();
      };
    }
    $('authWarning')?.classList.add('hidden');
    loadUserNotifications();
  } else {
    if (userNav) {
      userNav.innerHTML = `<button class="button" id="openAuthBtn">👤 Connexion</button>`;
      $('openAuthBtn').onclick = () => $('authModal')?.classList.remove('hidden');
    }
    $('authWarning')?.classList.remove('hidden');
    $('notifBadge')?.classList.add('hidden');
  }
}

async function loadUserNotifications() {
  if (!currentUser) return;

  try {
    const { data: res, error } = await supabase
      .from('reservations')
      .select('*, games(name)')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    const listContainer = $('notifList');
    const badge = $('notifBadge');

    if (error) throw error;

    if (!res || !res.length) {
      if (listContainer) listContainer.innerHTML = `<div class="empty">Vous n'avez effectué aucune demande.</div>`;
      if (badge) badge.classList.add('hidden');
      return;
    }

    const processedCount = res.filter(r => r.status === 'approved' || r.status === 'rejected').length;
    if (badge) {
      if (processedCount > 0) {
        badge.textContent = processedCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    if (listContainer) {
      listContainer.innerHTML = res.map(r => {
        let statusBadge = '<span class="badge badge-warning">En attente</span>';
        let msgText = 'Votre demande est en cours de traitement par l\'administrateur.';

        if (r.status === 'approved') {
          statusBadge = '<span class="badge badge-success">Acceptée</span>';
          msgText = 'Bonne nouvelle ! Votre réservation a été validée.';
        } else if (r.status === 'rejected') {
          statusBadge = '<span class="badge badge-danger">Rejetée</span>';
          msgText = 'Désolé, votre demande a été refusée pour cette période.';
        }

        return `
          <div class="panel" style="padding:12px; font-size:13px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong>${esc(r.games?.name || 'Jeu')}</strong>
              ${statusBadge}
            </div>
            <p style="color:var(--muted); font-size:12px; margin-top:4px;">Du ${esc(r.date_start)} au ${esc(r.date_end)}</p>
            <p style="margin-top:6px; font-size:12px;">${msgText}</p>
          </div>
        `;
      }).join('');
    }
  } catch (e) {
    console.error("Erreur notifications:", e);
  }
}

// --- CALENDRIER (RÉSERVATIONS VALIDÉES) ---

async function renderCalendar() {
  const container = $('calendar');
  if (!container) return;

  try {
    const { data: res, error } = await supabase
      .from('reservations')
      .select('*, games(name)')
      .eq('status', 'approved');

    if (error) console.warn("Attention Supabase :", error.message);

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    let html = '';
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startOffset = firstDay.getDay() - 1;
    if (startOffset === -1) startOffset = 6;

    for (let i = 0; i < startOffset; i++) {
      html += `<div class="cal-day" style="opacity:0.2;"></div>`;
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const currentDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const events = (res || []).filter(r => currentDateStr >= r.date_start && currentDateStr <= r.date_end);

      html += `
        <div class="cal-day">
          <span class="cal-day-num">${day}</span>
          ${events.map(e => `<span class="cal-event" title="${esc(e.games?.name)} (${esc(e.first_name)})">📌 ${esc(e.games?.name)}</span>`).join('')}
        </div>
      `;
    }

    container.innerHTML = html;
  } catch (err) {
    console.error("Erreur calendrier:", err);
    container.innerHTML = `<div class="empty">Impossible de charger le calendrier.</div>`;
  }
}

// --- CATALOGUE ---

async function loadGames() {
  try {
    const { data, error } = await supabase.from('games').select('*').order('name');
    if (error) throw error;

    allGames = data || [];
    const cats = [...new Set(allGames.map(g => g.category).filter(Boolean))].sort();
    
    if ($('category')) {
      $('category').innerHTML = '<option value="">Toutes les catégories</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    }
    if ($('gameSelect')) {
      $('gameSelect').innerHTML = '<option value="">Sélectionnez un jeu…</option>' + allGames.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
    }

    renderGames();
  } catch (e) {
    console.error("Erreur jeux:", e);
    if ($('games')) $('games').innerHTML = '<div class="empty">Erreur de chargement des jeux.</div>';
  }
}

function renderGames() {
  const container = $('games');
  if (!container) return;

  const q = $('search')?.value.toLowerCase().trim() || '';
  const cat = $('category')?.value || '';
  const minPlayers = Number($('players')?.value || 0);
  const sortBy = $('sort')?.value || 'name';

  let games = allGames.filter(g => 
    (!q || `${g.name} ${g.publisher}`.toLowerCase().includes(q)) &&
    (!cat || g.category === cat) &&
    (!minPlayers || (g.players_max || 0) >= minPlayers)
  );

  if (sortBy === 'duration') games.sort((a, b) => (a.duration || 0) - (b.duration || 0));
  else if (sortBy === 'players') games.sort((a, b) => (b.players_max || 0) - (a.players_max || 0));
  else if (sortBy === 'newest') games.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  else games.sort((a, b) => a.name.localeCompare(b.name));

  if ($('count')) $('count').textContent = `${games.length} jeu(x)`;

  if (!games.length) {
    container.innerHTML = '<div class="empty panel">Aucun jeu trouvé.</div>';
    return;
  }

  container.innerHTML = games.map(g => `
    <article class="card">
      <div class="cover">${g.cover_image ? `<img src="${esc(g.cover_image)}" alt="${esc(g.name)}">` : '<span>✦</span>'}</div>
      <div class="card-body">
        <p class="tag">${esc(g.category || 'Jeu')}</p>
        <h3>${esc(g.name)}</h3>
        <p class="publisher">${esc(g.publisher || '')}</p>
        <div class="meta">
          <span>♙ ${g.players_min || '?'}-${g.players_max || '?'} joueurs</span>
          <span>◷ ${g.duration || '?'} min</span>
        </div>
        <p class="desc">${esc(g.description || '')}</p>
      </div>
    </article>
  `).join('');
}

// --- RÉSERVATION ---

async function handleBookingSubmit(e) {
  e.preventDefault();
  const msg = $('formMessage');
  
  if (!currentUser) {
    if (msg) {
      msg.textContent = 'Vous devez être connecté pour effectuer une réservation.';
      msg.style.color = 'var(--danger)';
    }
    $('authModal')?.classList.remove('hidden');
    return;
  }

  if (msg) {
    msg.textContent = 'Envoi de la demande…';
    msg.style.color = 'var(--text)';
  }

  const f = new FormData(e.currentTarget);
  const newReservation = {
    id: crypto.randomUUID(),
    user_id: currentUser.id,
    game_id: f.get('game_id'),
    date_start: f.get('date_start'),
    date_end: f.get('date_end'),
    first_name: f.get('first_name').trim(),
    last_name: f.get('last_name').trim(),
    promotion: f.get('promotion').trim(),
    status: 'pending'
  };

  const { error } = await supabase.from('reservations').insert(newReservation);

  if (error) {
    if (msg) {
      msg.textContent = 'Erreur : ' + error.message;
      msg.style.color = 'var(--danger)';
    }
  } else {
    if (msg) {
      msg.textContent = '✓ Demande enregistrée !';
      msg.style.color = 'var(--success)';
    }
    e.currentTarget.reset();
    loadUserNotifications();
  }
}

// --- ADMIN PANEL ---

async function loadAdminPanel() {
  loadAdminGamesList();
  loadAdminReservationsList();
}

async function loadAdminGamesList() {
  const container = $('adminGamesList');
  if (!container) return;

  const { data: games, error } = await supabase.from('games').select('*').order('name');
  if (error) { container.innerHTML = `<div class="empty">Erreur.</div>`; return; }

  container.innerHTML = (games || []).map(g => `
    <div class="panel" style="padding:10px; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
      <span><strong>${esc(g.name)}</strong></span>
      <button class="button danger" data-delete-game="${g.id}" style="padding:2px 6px; font-size:10px;">Supprimer</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-delete-game]').forEach(btn => {
    btn.onclick = async () => {
      if (confirm('Supprimer ce jeu ?')) {
        await supabase.from('games').delete().eq('id', btn.dataset.deleteGame);
        loadAdminGamesList();
        loadGames();
      }
    };
  });
}

async function loadAdminReservationsList() {
  const pendingContainer = $('adminPendingReservations');
  const processedContainer = $('adminProcessedReservations');
  if (!pendingContainer || !processedContainer) return;

  const { data: res, error } = await supabase
    .from('reservations')
    .select('*, games(name)')
    .order('created_at', { ascending: false });

  if (error) { 
    pendingContainer.innerHTML = `<div class="empty">Accès refusé ou erreur.</div>`; 
    return; 
  }

  const pendingList = (res || []).filter(r => !r.status || r.status === 'pending');
  const processedList = (res || []).filter(r => r.status === 'approved' || r.status === 'rejected');

  pendingContainer.innerHTML = !pendingList.length ? `<div class="empty">Aucune demande en attente.</div>` : pendingList.map(r => `
    <div class="panel" style="padding:12px; font-size:13px; border-left:3px solid var(--warning);">
      <p><strong>${esc(r.games?.name || 'Jeu')}</strong> — <span class="badge badge-warning">En attente</span></p>
      <p style="color:var(--muted);">${esc(r.first_name)} ${esc(r.last_name)} (${esc(r.promotion)}) — du ${esc(r.date_start)} au ${esc(r.date_end)}</p>
      <div style="display:flex; gap:6px; margin-top:8px;">
        <button class="button primary" data-act="approved" data-id="${r.id}">✓ Accepter</button>
        <button class="button danger" data-act="rejected" data-id="${r.id}">✕ Rejeter</button>
      </div>
    </div>
  `).join('');

  processedContainer.innerHTML = !processedList.length ? `<div class="empty">Aucun historique.</div>` : processedList.map(r => `
    <div class="panel" style="padding:12px; font-size:13px; opacity:0.85;">
      <p><strong>${esc(r.games?.name || 'Jeu')}</strong> — <span class="badge badge-${r.status === 'approved' ? 'success' : 'danger'}">${r.status === 'approved' ? 'Acceptée' : 'Rejetée'}</span></p>
      <p style="color:var(--muted);">${esc(r.first_name)} ${esc(r.last_name)} — du ${esc(r.date_start)} au ${esc(r.date_end)}</p>
      <div style="display:flex; gap:6px; margin-top:8px;">
        ${r.status !== 'approved' ? `<button class="button" data-act="approved" data-id="${r.id}">Valider</button>` : ''}
        ${r.status !== 'rejected' ? `<button class="button" data-act="rejected" data-id="${r.id}">Refuser</button>` : ''}
        <button class="button" data-act="pending" data-id="${r.id}">Remettre en attente</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('#adminModal [data-act]').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      await supabase.from('reservations').update({ status: btn.dataset.act }).eq('id', btn.dataset.id);
      loadAdminReservationsList();
      renderCalendar();
    };
  });
}

// --- ÉVÉNEMENTS ---

function setupEventListeners() {
  ['search', 'category', 'players', 'sort'].forEach(id => {
    $(id)?.addEventListener('input', renderGames);
    $(id)?.addEventListener('change', renderGames);
  });

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.dataset.close;
      $(targetId)?.classList.add('hidden');
    };
  });

  // CLIQUE BOUTON NOTIFICATION
  const notifBtn = $('notifBtn');
  if (notifBtn) {
    notifBtn.onclick = () => {
      if (!currentUser) {
        $('authModal')?.classList.remove('hidden');
      } else {
        $('notifModal')?.classList.remove('hidden');
        loadUserNotifications();
      }
    };
  }

  $('reservationForm')?.addEventListener('submit', handleBookingSubmit);
  $('noticeAuthBtn')?.addEventListener('click', () => $('authModal')?.classList.remove('hidden'));

  $('addGameForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('addGameMsg');
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
    if (!error) {
      if (msg) msg.textContent = '✓ Jeu ajouté !';
      e.currentTarget.reset();
      loadAdminGamesList();
      loadGames();
    }
  });

  $('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({
      email: $('loginEmail').value.trim(),
      password: $('loginPassword').value
    });
    if (!error) $('authModal')?.classList.add('hidden');
  });

  $('signupForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    await supabase.auth.signUp({
      email: $('signupEmail').value.trim(),
      password: $('signupPassword').value,
      options: { data: { first_name: $('signupFirst').value.trim(), last_name: $('signupLast').value.trim() } }
    });
  });
}
