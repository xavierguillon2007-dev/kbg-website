import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://qqelmmygalllmxinaxrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fqFvZNetzIdAfX860bmjBQ_GzJfeVK3';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

let currentReservations = [];

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    $('adminReservationsList').innerHTML = `<div class="empty panel">Accès restreint. Connectez-vous d'abord sur la page d'accueil.</div>`;
    $('adminGamesList').innerHTML = '';
    return;
  }

  $('userNav').innerHTML = `
    <span style="font-weight:700; font-size:13px;">👋 ${session.user.email}</span>
    <button class="button" id="logoutBtn">Déconnexion</button>
  `;
  $('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  });

  $('filterStatus').addEventListener('change', renderReservations);
  $('addGameForm').addEventListener('submit', handleAddGame);

  loadAdminGames();
  loadAdminReservations();
});

// --- GESTION DU CATALOGUE (AJOUT / SUPPRESSION) ---
async function loadAdminGames() {
  const container = $('adminGamesList');
  const { data: games, error } = await supabase.from('games').select('*').order('name');

  if (error) {
    container.innerHTML = `<div class="empty panel">Erreur : ${esc(error.message)}</div>`;
    return;
  }

  container.innerHTML = (games || []).map(g => `
    <article class="panel admin-card">
      <div>
        <p class="tag">${esc(g.category || 'Jeu')}</p>
        <h3>${esc(g.name)}</h3>
        <p class="publisher">${esc(g.publisher || '')}</p>
      </div>
      <div class="admin-card-actions">
        <button class="button danger" data-delete-game="${g.id}">🗑 Supprimer</button>
      </div>
    </article>
  `).join('');

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

function renderReservations() {
  const container = $('adminReservationsList');
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
      await supabase.from('reservations').update({ status: btn.dataset.action }).eq('id', btn.dataset.id);
      loadAdminReservations();
    };
  });
}
