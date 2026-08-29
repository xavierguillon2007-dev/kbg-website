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
    $('adminReservationsList').innerHTML = `
      <div class="empty panel">
        <h3>Accès restreint</h3>
        <p>Vous devez être connecté avec un compte administrateur pour accéder à cette page.</p>
        <a href="index.html#account" class="button primary" style="margin-top:12px; display:inline-block;">Se connecter</a>
      </div>`;
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
  loadAdminReservations();
});

async function loadAdminReservations() {
  const container = $('adminReservationsList');

  const { data, error } = await supabase
    .from('reservations')
    .select('*, games(name, publisher, cover_image)')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `
      <div class="empty panel">
        <h3>Erreur de chargement</h3>
        <p>${esc(error.message)}</p>
        <small style="color:var(--muted); margin-top:8px; display:block;">Si cette erreur persiste, vérifiez vos règles de sécurité RLS dans Supabase.</small>
      </div>`;
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
    container.innerHTML = `<div class="empty panel">Aucune demande trouvée pour ce critère.</div>`;
    return;
  }

  container.innerHTML = list.map(r => {
    const statusBadge = r.status === 'approved' 
      ? '<span class="badge badge-success">Validée</span>'
      : r.status === 'rejected'
      ? '<span class="badge badge-danger">Refusée</span>'
      : '<span class="badge badge-warning">En attente</span>';

    return `
      <article class="panel admin-card">
        <div class="admin-card-header">
          <div>
            ${statusBadge}
            <h3 style="margin-top:8px;">${esc(r.games?.name || 'Jeu inconnu')}</h3>
            <p class="publisher">${esc(r.games?.publisher || '')}</p>
          </div>
        </div>
        
        <div class="admin-card-body">
          <p><strong>Demandeur :</strong> ${esc(r.first_name)} ${esc(r.last_name)}</p>
          <p><strong>Promotion :</strong> ${esc(r.promotion)}</p>
          <p><strong>Période :</strong> du ${esc(r.date_start)} au ${esc(r.date_end)}</p>
        </div>

        <div class="admin-card-actions">
          ${r.status !== 'approved' ? `<button class="button primary" data-action="approve" data-id="${r.id}">✓ Valider</button>` : ''}
          ${r.status !== 'rejected' ? `<button class="button danger" data-action="reject" data-id="${r.id}">✕ Refuser</button>` : ''}
        </div>
      </article>
    `;
  }).join('');

  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const newStatus = btn.dataset.action === 'approve' ? 'approved' : 'rejected';
      
      btn.disabled = true;
      const { error } = await supabase.from('reservations').update({ status: newStatus }).eq('id', id);
      
      if (!error) {
        loadAdminReservations();
      } else {
        alert('Erreur lors de la mise à jour : ' + error.message);
        btn.disabled = false;
      }
    };
  });
}
