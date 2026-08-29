import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://qqelmmygalllmxinaxrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fqFvZNetzIdAfX860bmjBQ_GzJfeVK3';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let allGames = [];
let ratingsMap = {};
let currentUser = null;
let currentProfile = null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const stars = n => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  const { data: { session } } = await supabase.auth.getSession();
  await handleAuthChange(session?.user || null);
  loadGames();
});

// Gestion de la session utilisateur
supabase.auth.onAuthStateChange((_e, session) => handleAuthChange(session?.user || null));

async function handleAuthChange(user) {
  currentUser = user;
  const userNav = $('userNav');
  const authWarning = $('authWarning');
  const bookingForm = $('reservationForm');

  if (currentUser) {
    // Récupération du profil
    const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', currentUser.id).maybeSingle();
    currentProfile = profile;

    // Mise à jour de la barre de navigation : Le bouton Admin est proposé dès qu'on est connecté
    userNav.innerHTML = `
      <span style="font-weight:700; font-size:13px;">👋 ${currentProfile?.first_name || currentUser.email}</span>
      <button class="button primary" id="openAdminBtn">🔑 Espace Admin</button>
      <button class="button" id="logoutBtn">Déconnexion</button>
    `;

    authWarning.classList.add('hidden');
    bookingForm.classList.remove('reservation-locked');
    bookingForm.querySelectorAll('input, select, button').forEach(el => el.disabled = false);

    // Pré-remplissage du formulaire
    bookingForm.querySelector('[name=first_name]').value = currentProfile?.first_name || '';
    bookingForm.querySelector('[name=last_name]').value = currentProfile?.last_name || '';
    bookingForm.querySelector('[name=promotion]').value = currentProfile?.promotion || '';

    $('logoutBtn').addEventListener('click', () => supabase.auth.signOut());
    $('openAdminBtn').addEventListener('click', () => {
      $('adminModal').classList.remove('hidden');
      loadAdminData();
    });
  } else {
    currentProfile = null;
    userNav.innerHTML = `<button class="button" id="openAuthBtn">👤 Se connecter</button>`;
    
    authWarning.classList.remove('hidden');
    bookingForm.classList.add('reservation-locked');
    bookingForm.querySelectorAll('input, select, button').forEach(el => el.disabled = true);

    $('openAuthBtn').addEventListener('click', () => $('authModal').classList.remove('hidden'));
  }
}

// Chargement des jeux et des avis
async function loadGames() {
  const { data, error } = await supabase.from('games').select('*').eq('is_active', true).order('name');
  if (error) { $('games').innerHTML = `<div class="empty">Impossible de charger le catalogue.</div>`; return; }
  allGames = data || [];
  
  await loadRatings();
  
  const cats = [...new Set(allGames.map(g => g.category).filter(Boolean))].sort();
  $('category').innerHTML = '<option value="">Toutes les catégories</option>' + cats.map(c => `<option>${esc(c)}</option>`).join('');
  $('gameSelect').innerHTML = '<option value="">Sélectionnez un jeu…</option>' + allGames.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
  
  renderGames();
}

async function loadRatings() {
  const { data } = await supabase.from('comments').select('game_id, rating');
  const grouped = {};
  (data || []).forEach(c => { (grouped[c.game_id] ||= []).push(c.rating); });
  ratingsMap = {};
  Object.entries(grouped).forEach(([id, arr]) => {
    ratingsMap[id] = { avg: arr.reduce((a, b) => a + b, 0) / arr.length, count: arr.length };
  });
}

function renderGames() {
  const q = $('search').value.toLowerCase().trim();
  const cat = $('category').value;
  const minPlayers = Number($('players').value || 0);
  const sort = $('sort').value;

  let games = allGames.filter(g => 
    (!q || `${g.name} ${g.publisher} ${g.description}`.toLowerCase().includes(q)) &&
    (!cat || g.category === cat) &&
    (!minPlayers || (g.players_max || 0) >= minPlayers)
  );

  games.sort((a,b) => 
    sort === 'duration' ? (a.duration||999)-(b.duration||999) :
    sort === 'players' ? (a.players_min||0)-(b.players_min||0) :
    sort === 'newest' ? new Date(b.created_at||0) - new Date(a.created_at||0) :
    a.name.localeCompare(b.name, 'fr')
  );

  $('count').textContent = `${games.length} jeu${games.length > 1 ? 'x' : ''}`;
  $('games').innerHTML = games.length ? games.map(g => {
    const rt = ratingsMap[g.id];
    const ratingLine = rt
      ? `<div class="stars" title="${rt.avg.toFixed(1)}/5 · ${rt.count} avis">${stars(Math.round(rt.avg))} <span class="publisher">${rt.avg.toFixed(1)} (${rt.count})</span></div>`
      : `<div class="publisher">Pas encore d'avis</div>`;
    return `
      <article class="card">
        <div class="cover" data-view="${esc(g.id)}" style="cursor:pointer">${g.cover_image ? `<img src="${esc(g.cover_image)}" alt="">` : '<span>✦</span>'}</div>
        <div class="card-body">
          <p class="tag">${esc(g.category || 'Jeu')}</p>
          <h3 data-view="${esc(g.id)}" style="cursor:pointer">${esc(g.name)}</h3>
          <p class="publisher">${esc(g.publisher)}</p>
          ${ratingLine}
          <div class="meta"><span>♙ ${g.players_min || '?'}–${g.players_max || '?'} joueurs</span><span>◷ ${g.duration || '?'} min</span></div>
          <p class="desc">${esc(g.description || 'Aucune description.')}</p>
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:4px">
            <button class="text-button" data-view="${esc(g.id)}">Voir la fiche & avis →</button>
            <button class="text-button" data-reserve="${esc(g.id)}">Réserver ce jeu →</button>
          </div>
        </div>
      </article>`;
  }).join('') : '<div class="empty">Aucun jeu ne correspond à ces critères.</div>';

  document.querySelectorAll('[data-reserve]').forEach(b => b.onclick = () => {
    $('gameSelect').value = b.dataset.reserve;
    $('reservation').scrollIntoView({ behavior: 'smooth' });
  });
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => openGameModal(b.dataset.view));
}

// Panneau d'administration : Récupération des demandes depuis Supabase
async function loadAdminData() {
  const container = $('adminReservations');
  container.innerHTML = '<p class="loading">Chargement des données Supabase…</p>';

  const { data: res, error } = await supabase
    .from('reservations')
    .select('*, games(name)')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<div class="empty">Accès refusé ou erreur : ${esc(error.message)}</div>`;
    return;
  }

  if (!res || res.length === 0) {
    container.innerHTML = `<div class="empty">Aucune réservation trouvée.</div>`;
    return;
  }

  container.innerHTML = res.map(r => `
    <article class="panel" style="padding:16px;">
      <p class="eyebrow">${esc(r.status.toUpperCase())}</p>
      <h3>${esc(r.games?.name || 'Jeu inconnu')}</h3>
      <p><strong>Demandeur :</strong> ${esc(r.first_name)} ${esc(r.last_name)} (${esc(r.promotion)})</p>
      <p><strong>Dates :</strong> Du ${esc(r.date_start)} au ${esc(r.date_end)}</p>
      <div style="display:flex;gap:10px;margin-top:12px;">
        <button class="button primary" data-status="approved" data-id="${r.id}">Valider</button>
        <button class="button" data-status="rejected" data-id="${r.id}">Refuser</button>
      </div>
    </article>
  `).join('');

  container.querySelectorAll('[data-status]').forEach(btn => {
    btn.onclick = async () => {
      await supabase.from('reservations').update({ status: btn.dataset.status }).eq('id', btn.dataset.id);
      loadAdminData();
    };
  });
}

// Événements globaux & Modales
function setupEventListeners() {
  ['search', 'category', 'players', 'sort'].forEach(id => $(id).addEventListener('input', renderGames));

  $('noticeAuthBtn')?.addEventListener('click', () => $('authModal').classList.remove('hidden'));

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.onclick = () => $(btn.dataset.close).classList.add('hidden');
  });

  // Authentification
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('loginMsg').textContent = 'Connexion…';
    const { error } = await supabase.auth.signInWithPassword({
      email: $('loginEmail').value,
      password: $('loginPassword').value
    });
    if (error) $('loginMsg').textContent = 'E-mail ou mot de passe incorrect.';
    else {
      $('loginMsg').textContent = '';
      $('authModal').classList.add('hidden');
    }
  });

  $('signupForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('signupMsg').textContent = 'Création…';
    const { data, error } = await supabase.auth.signUp({
      email: $('signupEmail').value,
      password: $('signupPassword').value,
      options: {
        data: {
          first_name: $('signupFirst').value.trim(),
          last_name: $('signupLast').value.trim(),
          promotion: $('signupPromo').value.trim()
        }
      }
    });
    if (error) $('signupMsg').textContent = error.message;
    else {
      $('signupMsg').textContent = '✓ Compte créé.';
      if (data.session) $('authModal').classList.add('hidden');
    }
  });

  // Formulaire de réservation
  $('reservationForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser) return;

    const f = new FormData(e.currentTarget);
    const msg = $('formMessage');
    msg.textContent = 'Envoi…';

    const { error } = await supabase.from('reservations').insert({
      id: crypto.randomUUID(),
      game_id: f.get('game_id'),
      first_name: f.get('first_name').trim(),
      last_name: f.get('last_name').trim(),
      promotion: f.get('promotion').trim(),
      date_start: f.get('date_start'),
      date_end: f.get('date_end'),
      status: 'pending',
      user_id: currentUser.id
    });

    if (error) msg.textContent = 'Erreur : ' + error.message;
    else {
      e.currentTarget.reset();
      msg.textContent = '✓ Demande envoyée avec succès.';
    }
  });
}

// Modale de détail d'un jeu
async function openGameModal(id) {
  const g = allGames.find(x => x.id === id);
  if (!g) return;

  const { data: comments } = await supabase.from('comments').select('*').eq('game_id', id).order('created_at', { ascending: false });

  $('modalContent').innerHTML = `
    <div class="game-detail">
      <div>${g.cover_image ? `<img src="${esc(g.cover_image)}" alt="">` : '<div class="cover" style="height:300px"><span>✦</span></div>'}</div>
      <div>
        <p class="eyebrow">${esc(g.category)}</p>
        <h2>${esc(g.name)}</h2>
        <p class="publisher">${esc(g.publisher)}</p>
        <div class="meta"><span>♙ ${g.players_min||'?'}–${g.players_max||'?'} joueurs</span><span>◷ ${g.duration||'?'} min</span></div>
        <p class="desc">${esc(g.description || 'Aucune description.')}</p>
      </div>
    </div>
    <div class="comments">
      <p class="eyebrow">AVIS DE LA COMMUNAUTÉ</p>
      ${comments?.length ? comments.map(c => `
        <article class="comment">
          <div class="stars">${stars(c.rating)}</div>
          <p>${esc(c.body)}</p>
          <small>${new Date(c.created_at).toLocaleDateString('fr-FR')}</small>
        </article>
      `).join('') : '<p class="notice">Aucun avis pour le moment.</p>'}
    </div>
  `;

  $('gameModal').classList.remove('hidden');
}
