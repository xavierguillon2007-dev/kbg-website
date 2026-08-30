import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://qqelmmygalllmxinaxrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fqFvZNetzIdAfX860bmjBQ_GzJfeVK3';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Adresses e-mail autorisées à accéder au panneau admin (jeux, réservations)
const ADMIN_EMAILS = ['xavierguillon2007@gmail.com', 'kbg.asso@gmail.com'];
const isAdminEmail = email => !!email && ADMIN_EMAILS.includes(email);

let allGames = [];
let currentUser = null;
let currentCalendarDate = new Date(); // Suivi du mois affiché dans le calendrier

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

// --- GESTION AUTHENTIFICATION & NOTIFICATIONS ---

async function handleAuthChange(user) {
  currentUser = user;
  const userNav = $('userNav');

  if (currentUser) {
    if (userNav) {
      const admin = isAdminEmail(currentUser.email);
      userNav.innerHTML = `
        <span style="font-size:13px; font-weight:700;">👋 ${esc(currentUser.email)}</span>
        ${admin ? `<button class="button primary" id="openAdminBtn">🔑 Admin</button>` : ''}
        <button class="button" id="logoutBtn">Déconnexion</button>
      `;
      $('logoutBtn').onclick = () => supabase.auth.signOut();
      if (admin) {
        $('openAdminBtn').onclick = () => {
          $('adminModal')?.classList.remove('hidden');
          loadAdminPanel();
        };
      }
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

// --- CALENDRIER AVEC DÉFILEMENT DES MOIS ---

async function renderCalendar() {
  const container = $('calendar');
  const label = $('currentMonthLabel');
  if (!container) return;

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  // Affichage du nom du mois et de l'année (ex: Août 2026)
  if (label) {
    const monthName = currentCalendarDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    label.textContent = monthName;
  }

  try {
    const { data: res, error } = await supabase
      .from('reservations')
      .select('*, games(name)')
      .eq('status', 'approved');

    if (error) console.warn("Attention Supabase :", error.message);

    let html = '';
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Décalage pour commencer le calendrier un Lundi
    let startOffset = firstDay.getDay() - 1;
    if (startOffset === -1) startOffset = 6;

    // Cases transparentes pour compléter le début de la première semaine
    for (let i = 0; i < startOffset; i++) {
      html += `<div class="cal-day" style="opacity:0.15; background:transparent; border:1px dashed var(--line);"></div>`;
    }

    const dayEventsMap = {};

    // Génération des jours du mois
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const currentDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const events = (res || []).filter(r => currentDateStr >= r.date_start && currentDateStr <= r.date_end);
      dayEventsMap[currentDateStr] = events;

      html += `
        <div class="cal-day${events.length ? ' has-events' : ''}" data-date="${currentDateStr}">
          <span class="cal-day-num">${day}</span>
          ${events.map(e => `<span class="cal-event" title="${esc(e.games?.name)} (${esc(e.first_name)})">📌 ${esc(e.games?.name)}</span>`).join('')}
        </div>
      `;
    }

    container.innerHTML = html;

    // Ouverture de la modale au clic sur un jour ayant des réservations
    container.querySelectorAll('.cal-day.has-events').forEach(dayEl => {
      dayEl.addEventListener('click', () => {
        openDayModal(dayEl.dataset.date, dayEventsMap[dayEl.dataset.date] || []);
      });
    });
  } catch (err) {
    console.error("Erreur calendrier:", err);
    container.innerHTML = `<div class="empty">Impossible de charger le calendrier.</div>`;
  }
}

// --- MODALE JEUX RÉSERVÉS PAR JOUR ---

function openDayModal(dateStr, events) {
  const modal = $('dayModal');
  const title = $('dayModalTitle');
  const list = $('dayModalList');
  if (!modal || !list) return;

  if (title) {
    const d = new Date(dateStr + 'T00:00:00');
    const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    title.textContent = label.charAt(0).toUpperCase() + label.slice(1);
  }

  list.innerHTML = !events.length
    ? '<div class="empty">Aucun jeu réservé ce jour-là.</div>'
    : events.map(e => `
      <div class="panel" style="padding:12px; font-size:13px;">
        <strong>${esc(e.games?.name || 'Jeu')}</strong>
        <p style="color:var(--muted); font-size:12px; margin-top:4px;">Du ${esc(e.date_start)} au ${esc(e.date_end)}</p>
        <p style="margin-top:4px; font-size:12px;">${esc(e.first_name)} ${esc(e.last_name)}${e.promotion ? ' — ' + esc(e.promotion) : ''}</p>
      </div>
    `).join('');

  modal.classList.remove('hidden');
}

// --- CATALOGUE DE JEUX ---

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

// --- SOUMISSION DE RÉSERVATION ---

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

// --- ESPACE ADMIN ---

async function loadAdminPanel() {
  if (!isAdminEmail(currentUser?.email)) {
    $('adminModal')?.classList.add('hidden');
    return;
  }
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

// --- ÉVÉNEMENTS & LISTENERS ---

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

  // Navigation dans le calendrier (Mois Précédent / Mois Suivant)
  $('prevMonthBtn')?.addEventListener('click', () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar();
  });

  $('nextMonthBtn')?.addEventListener('click', () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar();
  });

  // Ouverture Centre de Notifications
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
    if (!isAdminEmail(currentUser?.email)) {
      if (msg) msg.textContent = 'Accès réservé aux administrateurs.';
      return;
    }
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
    const msg = $('loginMsg');
    const submitBtn = e.currentTarget.querySelector('button[type="submit"]');

    if (msg) {
      msg.textContent = 'Connexion en cours…';
      msg.style.color = 'var(--muted)';
    }
    if (submitBtn) submitBtn.disabled = true;

    const { error } = await supabase.auth.signInWithPassword({
      email: $('loginEmail').value.trim(),
      password: $('loginPassword').value
    });

    if (submitBtn) submitBtn.disabled = false;

    if (error) {
      if (msg) {
        msg.textContent = error.message === 'Invalid login credentials'
          ? 'E-mail ou mot de passe incorrect.'
          : 'Erreur de connexion : ' + error.message;
        msg.style.color = 'var(--danger)';
      }
      return;
    }

    if (msg) {
      msg.textContent = '';
      msg.style.color = '';
    }
    e.currentTarget.reset();
    $('authModal')?.classList.add('hidden');
  });

  $('signupForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('signupMsg');
    const submitBtn = e.currentTarget.querySelector('button[type="submit"]');

    if (msg) {
      msg.textContent = 'Création du compte…';
      msg.style.color = 'var(--muted)';
    }
    if (submitBtn) submitBtn.disabled = true;

    const { error } = await supabase.auth.signUp({
      email: $('signupEmail').value.trim(),
      password: $('signupPassword').value,
      options: { data: { first_name: $('signupFirst').value.trim(), last_name: $('signupLast').value.trim() } }
    });

    if (submitBtn) submitBtn.disabled = false;

    if (error) {
      if (msg) {
        msg.textContent = 'Erreur : ' + error.message;
        msg.style.color = 'var(--danger)';
      }
      return;
    }

    if (msg) {
      msg.textContent = '✓ Compte créé ! Vérifiez votre boîte mail si une confirmation est requise.';
      msg.style.color = 'var(--success)';
    }
    e.currentTarget.reset();
  });
}
