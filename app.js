import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://qqelmmygalllmxinaxrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fqFvZNetzIdAfX860bmjBQ_GzJfeVK3';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let allGames = [];
let currentUser = null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  const { data: { session } } = await supabase.auth.getSession();
  await handleAuthChange(session?.user || null);
  loadGames();
});

supabase.auth.onAuthStateChange((_e, session) => handleAuthChange(session?.user || null));

async function handleAuthChange(user) {
  currentUser = user;
  const userNav = $('userNav');

  if (currentUser) {
    userNav.innerHTML = `
      <span style="font-size:13px; font-weight:700;">👋 ${currentUser.email}</span>
      <button class="button primary" id="openAdminBtn">🔑 Admin</button>
      <button class="button" id="logoutBtn">Déconnexion</button>
    `;
    $('authWarning').classList.add('hidden');
    $('logoutBtn').onclick = () => supabase.auth.signOut();
    $('openAdminBtn').onclick = () => {
      $('adminModal').classList.remove('hidden');
      loadAdminPanel();
    };
  } else {
    userNav.innerHTML = `<button class="button" id="openAuthBtn">👤 Connexion</button>`;
    $('authWarning').classList.remove('hidden');
    $('openAuthBtn').onclick = () => $('authModal').classList.remove('hidden');
  }
}

// CATALOGUE PUBLIC
async function loadGames() {
  const { data, error } = await supabase.from('games').select('*').order('name');
  if (error) { $('games').innerHTML = '<div class="empty">Erreur de chargement.</div>'; return; }
  allGames = data || [];
  
  const cats = [...new Set(allGames.map(g => g.category).filter(Boolean))].sort();
  $('category').innerHTML = '<option value="">Toutes les catégories</option>' + cats.map(c => `<option>${esc(c)}</option>`).join('');
  $('gameSelect').innerHTML = '<option value="">Sélectionnez un jeu…</option>' + allGames.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');

  renderGames();
}

function renderGames() {
  const q = $('search').value.toLowerCase().trim();
  const cat = $('category').value;
  const minPlayers = Number($('players').value || 0);

  let games = allGames.filter(g => 
    (!q || `${g.name} ${g.publisher}`.toLowerCase().includes(q)) &&
    (!cat || g.category === cat) &&
    (!minPlayers || (g.players_max || 0) >= minPlayers)
  );

  $('count').textContent = `${games.length} jeu(x)`;
  $('games').innerHTML = games.map(g => `
    <article class="card">
      <div class="cover">${g.cover_image ? `<img src="${esc(g.cover_image)}" alt="">` : '<span>✦</span>'}</div>
      <div class="card-body">
        <p class="tag">${esc(g.category || 'Jeu')}</p>
        <h3>${esc(g.name)}</h3>
        <p class="publisher">${esc(g.publisher)}</p>
        <div class="meta"><span>♙ ${g.players_min||'?'}-${g.players_max||'?'} joueurs</span><span>◷ ${g.duration||'?'} min</span></div>
        <p class="desc">${esc(g.description || '')}</p>
      </div>
    </article>
  `).join('');
}

// LOGIQUE ESPACE ADMIN (DANS LA MODALE)
async function loadAdminPanel() {
  loadAdminGamesList();
  loadAdminReservationsList();
}

async function loadAdminGamesList() {
  const container = $('adminGamesList');
  const { data: games } = await supabase.from('games').select('*').order('name');
  
  container.innerHTML = (games || []).map(g => `
    <div class="panel" style="padding:10px; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
      <span><strong>${esc(g.name)}</strong> (${esc(g.publisher)})</span>
      <button class="button danger" data-delete="${g.id}" style="padding:2px 6px; font-size:10px;">Supprimer</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-delete]').forEach(btn => {
    btn.onclick = async () => {
      if (confirm('Supprimer ce jeu ?')) {
        await supabase.from('games').delete().eq('id', btn.dataset.delete);
        loadAdminGamesList();
        loadGames();
      }
    };
  });
}

async function loadAdminReservationsList() {
  const container = $('adminReservations');
  const { data: res, error } = await supabase.from('reservations').select('*, games(name)').order('created_at', { ascending: false });

  if (error) { container.innerHTML = `<div class="empty">Accès refusé par la BDD (RLS).</div>`; return; }

  container.innerHTML = (res || []).map(r => `
    <div class="panel" style="padding:12px; font-size:13px;">
      <p><strong>${esc(r.games?.name)}</strong> — Status: <span class="badge badge-${r.status === 'approved'?'success':r.status==='rejected'?'danger':'warning'}">${r.status}</span></p>
      <p style="color:var(--muted);">${esc(r.first_name)} ${esc(r.last_name)} (du ${r.date_start} au ${r.date_end})</p>
      <div style="display:flex; gap:6px; margin-top:6px;">
        <button class="button primary" data-act="approved" data-id="${r.id}" style="padding:2px 8px; font-size:11px;">Valider</button>
        <button class="button danger" data-act="rejected" data-id="${r.id}" style="padding:2px 8px; font-size:11px;">Refuser</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-act]').forEach(btn => {
    btn.onclick = async () => {
      await supabase.from('reservations').update({ status: btn.dataset.act }).eq('id', btn.dataset.id);
      loadAdminReservationsList();
    };
  });
}

function setupEventListeners() {
  ['search', 'category', 'players', 'sort'].forEach(id => $(id)?.addEventListener('input', renderGames));
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).classList.add('hidden'));

  // Formulaire d'ajout de jeu par l'Admin
  $('addGameForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('addGameMsg');
    msg.textContent = 'Ajout…';
    const f = new FormData(e.currentTarget);

    const { error } = await supabase.from('games').insert({
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
    });

    if (error) msg.textContent = 'Erreur : ' + error.message;
    else {
      msg.textContent = '✓ Jeu ajouté !';
      e.currentTarget.reset();
      loadAdminGamesList();
      loadGames();
    }
  });

  // Auth Submit
  $('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email: $('loginEmail').value, password: $('loginPassword').value });
    if (!error) $('authModal').classList.add('hidden');
  });
}
