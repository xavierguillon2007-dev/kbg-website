import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 1. Initialisation de Supabase
const SUPABASE_URL = 'https://qqelmmygalllmxinaxrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fqFvZNetzIdAfX860bmjBQ_GzJfeVK3';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables globales
let allGames = [];
let currentUser = null;

// Raccourcis utilitaires
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  
  // Vérification de la session Supabase
  const { data: { session } } = await supabase.auth.getSession();
  await handleAuthChange(session?.user || null);
  
  // Chargement initial du catalogue
  loadGames();
});

// Écouteur des changements d'état d'authentification
supabase.auth.onAuthStateChange((_e, session) => {
  handleAuthChange(session?.user || null);
});

// --- GESTION DE L'AUTHENTIFICATION ---

async function handleAuthChange(user) {
  currentUser = user;
  const userNav = $('userNav');

  if (currentUser) {
    userNav.innerHTML = `
      <span style="font-size:13px; font-weight:700;">👋 ${esc(currentUser.email)}</span>
      <button class="button primary" id="openAdminBtn">🔑 Admin</button>
      <button class="button" id="logoutBtn">Déconnexion</button>
    `;
    $('authWarning')?.classList.add('hidden');
    
    $('logoutBtn').onclick = () => supabase.auth.signOut();
    $('openAdminBtn').onclick = () => {
      $('adminModal').classList.remove('hidden');
      loadAdminPanel();
    };
  } else {
    userNav.innerHTML = `<button class="button" id="openAuthBtn">👤 Connexion</button>`;
    $('authWarning')?.classList.remove('hidden');
    $('openAuthBtn').onclick = () => $('authModal').classList.remove('hidden');
  }
}

// --- CATALOGUE PUBLIC & FILTRES ---

async function loadGames() {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .order('name');

  if (error) { 
    $('games').innerHTML = '<div class="empty">Erreur lors du chargement des jeux.</div>'; 
    return; 
  }
  
  allGames = data || [];
  
  // Remplissage dynamique des sélecteurs
  const cats = [...new Set(allGames.map(g => g.category).filter(Boolean))].sort();
  $('category').innerHTML = '<option value="">Toutes les catégories</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  
  $('gameSelect').innerHTML = '<option value="">Sélectionnez un jeu…</option>' + allGames.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');

  renderGames();
}

function renderGames() {
  const q = $('search').value.toLowerCase().trim();
  const cat = $('category').value;
  const minPlayers = Number($('players').value || 0);
  const sortBy = $('sort').value;

  // Filtrage
  let games = allGames.filter(g => 
    (!q || `${g.name} ${g.publisher}`.toLowerCase().includes(q)) &&
    (!cat || g.category === cat) &&
    (!minPlayers || (g.players_max || 0) >= minPlayers)
  );

  // Tri
  if (sortBy === 'duration') {
    games.sort((a, b) => (a.duration || 0) - (b.duration || 0));
  } else if (sortBy === 'players') {
    games.sort((a, b) => (b.players_max || 0) - (a.players_max || 0));
  } else if (sortBy === 'newest') {
    games.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  } else {
    games.sort((a, b) => a.name.localeCompare(b.name));
  }

  $('count').textContent = `${games.length} jeu(x)`;

  if (!games.length) {
    $('games').innerHTML = '<div class="empty panel">Aucun jeu ne correspond à vos critères.</div>';
    return;
  }

  $('games').innerHTML = games.map(g => `
    <article class="card">
      <div class="cover">
        ${g.cover_image ? `<img src="${esc(g.cover_image)}" alt="${esc(g.name)}">` : '<span>✦</span>'}
      </div>
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

// --- FORMULAIRE DE RÉSERVATION ---

async function handleBookingSubmit(e) {
  e.preventDefault();
  const msg = $('formMessage');
  
  if (!currentUser) {
    msg.textContent = 'Vous devez être connecté pour effectuer une réservation.';
    msg.style.color = 'var(--danger)';
    return;
  }

  msg.textContent = 'Envoi de la demande…';
  msg.style.color = 'var(--text)';

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
    msg.textContent = 'Erreur : ' + error.message;
    msg.style.color = 'var(--danger)';
  } else {
    msg.textContent = '✓ Demande enregistrée ! Elle est en cours de validation.';
    msg.style.color = 'var(--success)';
    e.currentTarget.reset();
  }
}

// --- PANNEAU D'ADMINISTRATION ---

async function loadAdminPanel() {
  loadAdminGamesList();
  loadAdminReservationsList();
}

// 1. Gestion du catalogue (Ajout & Suppression)
async function loadAdminGamesList() {
  const container = $('adminGamesList');
  const { data: games, error } = await supabase.from('games').select('*').order('name');
  
  if (error) {
    container.innerHTML = `<div class="empty">Erreur de chargement.</div>`;
    return;
  }

  container.innerHTML = (games || []).map(g => `
    <div class="panel" style="padding:10px; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
      <span><strong>${esc(g.name)}</strong> (${esc(g.publisher || 'N/A')})</span>
      <button class="button danger" data-delete-game="${g.id}" style="padding:2px 6px; font-size:10px;">Supprimer</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-delete-game]').forEach(btn => {
    btn.onclick = async () => {
      if (confirm('Voulez-vous vraiment supprimer ce jeu du catalogue ?')) {
        await supabase.from('games').delete().eq('id', btn.dataset.deleteGame);
        loadAdminGamesList();
        loadGames();
      }
    };
  });
}

// 2. Gestion des réservations (En cours vs Traitées)
async function loadAdminReservationsList() {
  const pendingContainer = $('adminPendingReservations');
  const processedContainer = $('adminProcessedReservations');

  const { data: res, error } = await supabase
    .from('reservations')
    .select('*, games(name)')
    .order('created_at', { ascending: false });

  if (error) { 
    pendingContainer.innerHTML = `<div class="empty">Accès refusé par la BDD (RLS).</div>`; 
    processedContainer.innerHTML = '';
    return; 
  }

  const pendingList = (res || []).filter(r => !r.status || r.status === 'pending');
  const processedList = (res || []).filter(r => r.status === 'approved' || r.status === 'rejected');

  // Demandes EN COURS (À traiter)
  if (!pendingList.length) {
    pendingContainer.innerHTML = `<div class="empty" style="padding:10px; font-size:12px;">Aucune demande en attente.</div>`;
  } else {
    pendingContainer.innerHTML = pendingList.map(r => `
      <div class="panel" style="padding:12px; font-size:13px; border-left:3px solid var(--warning);">
        <p><strong>${esc(r.games?.name || 'Jeu inconnu')}</strong> — <span class="badge badge-warning">En attente</span></p>
        <p style="color:var(--muted);">${esc(r.first_name)} ${esc(r.last_name)} (${esc(r.promotion)}) — du ${r.date_start} au ${r.date_end}</p>
        <div style="display:flex; gap:6px; margin-top:8px;">
          <button class="button primary" data-act="approved" data-id="${r.id}" style="padding:4px 10px; font-size:11px;">✓ Accepter</button>
          <button class="button danger" data-act="rejected" data-id="${r.id}" style="padding:4px 10px; font-size:11px;">✕ Rejeter</button>
        </div>
      </div>
    `).join('');
  }

  // Demandes DÉJÀ TRAITÉES (Modifiables)
  if (!processedList.length) {
    processedContainer.innerHTML = `<div class="empty" style="padding:10px; font-size:12px;">Aucun historique.</div>`;
  } else {
    processedContainer.innerHTML = processedList.map(r => `
      <div class="panel" style="padding:12px; font-size:13px; opacity:0.85;">
        <p><strong>${esc(r.games?.name || 'Jeu inconnu')}</strong> — <span class="badge badge-${r.status === 'approved' ? 'success' : 'danger'}">${r.status === 'approved' ? 'Acceptée' : 'Rejetée'}</span></p>
        <p style="color:var(--muted);">${esc(r.first_name)} ${esc(r.last_name)} — du ${r.date_start} au ${r.date_end}</p>
        <div style="display:flex; gap:6px; margin-top:8px; align-items:center;">
          <span style="font-size:11px; color:var(--muted);">Changer :</span>
          ${r.status !== 'approved' ? `<button class="button" data-act="approved" data-id="${r.id}" style="padding:2px 6px; font-size:10px;">Valider</button>` : ''}
          ${r.status !== 'rejected' ? `<button class="button" data-act="rejected" data-id="${r.id}" style="padding:2px 6px; font-size:10px;">Refuser</button>` : ''}
          <button class="button" data-act="pending" data-id="${r.id}" style="padding:2px 6px; font-size:10px; border-color:var(--warning);">Remettre en attente</button>
        </div>
      </div>
    `).join('');
  }

  // Attachement des événements aux boutons de statut
  document.querySelectorAll('#adminModal [data-act]').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      await supabase.from('reservations').update({ status: btn.dataset.act }).eq('id', btn.dataset.id);
      loadAdminReservationsList();
    };
  });
}

// --- ÉCOUTEURS D'ÉVÉNEMENTS ---

function setupEventListeners() {
  // Filtres catalogue
  ['search', 'category', 'players', 'sort'].forEach(id => {
    $(id)?.addEventListener('input', renderGames);
    $(id)?.addEventListener('change', renderGames);
  });

  // Fermeture des modales
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.onclick = () => $(btn.dataset.close).classList.add('hidden');
  });

  // Formulaire de réservation
  $('reservationForm')?.addEventListener('submit', handleBookingSubmit);

  // Redirection d'authentification sur le bandeau d'avertissement
  $('noticeAuthBtn')?.addEventListener('click', () => {
    $('authModal').classList.remove('hidden');
  });

  // Formulaire d'ajout de jeu par l'Admin
  $('addGameForm')?.addEventListener('submit', async e => {
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
      msg.style.color = 'var(--danger)';
    } else {
      msg.textContent = '✓ Jeu ajouté au catalogue !';
      msg.style.color = 'var(--success)';
      e.currentTarget.reset();
      loadAdminGamesList();
      loadGames();
    }
  });

  // Soumission Connexion
  $('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('loginMsg');
    msg.textContent = 'Connexion…';

    const { error } = await supabase.auth.signInWithPassword({
      email: $('loginEmail').value.trim(),
      password: $('loginPassword').value
    });

    if (error) {
      msg.textContent = 'Erreur : ' + error.message;
      msg.style.color = 'var(--danger)';
    } else {
      msg.textContent = '';
      $('authModal').classList.add('hidden');
    }
  });

  // Soumission Inscription
  $('signupForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('signupMsg');
    msg.textContent = 'Création du compte…';

    const { error } = await supabase.auth.signUp({
      email: $('signupEmail').value.trim(),
      password: $('signupPassword').value,
      options: {
        data: {
          first_name: $('signupFirst').value.trim(),
          last_name: $('signupLast').value.trim()
        }
      }
    });

    if (error) {
      msg.textContent = 'Erreur : ' + error.message;
      msg.style.color = 'var(--danger)';
    } else {
      msg.textContent = '✓ Compte créé ! Vous pouvez vous connecter.';
      msg.style.color = 'var(--success)';
      e.currentTarget.reset();
    }
  });
}
