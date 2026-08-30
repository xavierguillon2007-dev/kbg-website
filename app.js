import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://qqelmmygalllmxinaxrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fqFvZNetzIdAfX860bmjBQ_GzJfeVK3';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Adresses e-mail autorisées à accéder au panneau admin (jeux, réservations)
const ADMIN_EMAILS = ['xavierguillon2007@gmail.com', 'kbg.asso@gmail.com'];
const isAdminEmail = email => !!email && ADMIN_EMAILS.includes(String(email).toLowerCase().trim());

let allGames = [];
let currentUser = null;
let currentCalendarDate = new Date();

let allReviews = [];
let selectedReviewGame = null;
let selectedRating = 0;
let catalogExpanded = false;

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

// --- VALIDATION DES COMPTES ---

async function getAccountStatus(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('account_requests')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Erreur vérification du compte :', error);
    // Sécurité : en cas d'impossibilité de vérifier le statut,
    // on ne considère PAS le compte comme validé.
    return '__verification_error__';
  }

  return data?.status || null;
}

async function requireApprovedAccount(messageElement = null, actionLabel = 'cette action') {
  if (!currentUser) {
    if (messageElement) {
      messageElement.textContent = 'Vous devez être connecté pour effectuer ' + actionLabel + '.';
      messageElement.style.color = 'var(--danger)';
    }
    $('authModal')?.classList.remove('hidden');
    return false;
  }

  // Les administrateurs sont toujours autorisés.
  if (isAdminEmail(currentUser.email)) return true;

  const status = await getAccountStatus(currentUser.id);

  if (status === 'approved') return true;

  if (status === 'pending') {
    if (messageElement) {
      messageElement.textContent = 'Votre compte doit être validé par un administrateur avant de pouvoir ' + actionLabel + '.';
      messageElement.style.color = 'var(--warning)';
    }
  } else if (status === 'rejected') {
    if (messageElement) {
      messageElement.textContent = 'Votre demande de compte a été refusée.';
      messageElement.style.color = 'var(--danger)';
    }
  } else {
    if (messageElement) {
      messageElement.textContent = 'Impossible de vérifier la validation de votre compte. Réessayez plus tard.';
      messageElement.style.color = 'var(--danger)';
    }
  }

  // On détruit la session côté client dès qu'un compte non validé est détecté.
  await supabase.auth.signOut();
  currentUser = null;
  $('authWarning')?.classList.remove('hidden');
  $('notifBadge')?.classList.add('hidden');
  $('authModal')?.classList.remove('hidden');
  return false;
}

async function ensureAdminAccountSection() {
  const adminModal = $('adminModal');
  if (!adminModal || !isAdminEmail(currentUser?.email)) return null;

  let section = $('adminAccountRequestsSection');
  if (section) return section;

  const card = adminModal.querySelector('.modal-card') || adminModal;

  section = document.createElement('div');
  section.id = 'adminAccountRequestsSection';
  section.style.cssText = 'margin-bottom:30px; padding-bottom:20px; border-bottom:1px solid var(--line);';
  section.innerHTML = `
    <p class="eyebrow" style="color:var(--warning);">👤 VALIDATION DES COMPTES</p>
    <p style="color:var(--muted); font-size:12px; margin:6px 0 10px;">
      Les nouveaux comptes restent en attente jusqu'à leur validation par un administrateur.
    </p>
    <div id="adminPendingAccounts" class="grid" style="grid-template-columns:1fr; gap:10px;"></div>
  `;

  const firstContent = card.firstElementChild;
  if (firstContent) card.insertBefore(section, firstContent);
  else card.appendChild(section);

  return section;
}

async function handleAuthChange(user) {
  currentUser = user;
  const userNav = $('userNav');

  if (currentUser && !isAdminEmail(currentUser.email)) {
    const status = await getAccountStatus(currentUser.id);

    if (status !== 'approved') {
      await supabase.auth.signOut();
      currentUser = null;

      if (userNav) {
        userNav.innerHTML = `<button class="button" id="openAuthBtn">👤 Connexion</button>`;
        $('openAuthBtn').onclick = () => $('authModal')?.classList.remove('hidden');
      }

      $('authWarning')?.classList.remove('hidden');
      $('notifBadge')?.classList.add('hidden');

      const msg = $('loginMsg');
      if (msg) {
        if (status === 'pending') {
          msg.textContent = 'Votre compte est en attente de validation par un administrateur.';
          msg.style.color = 'var(--warning)';
        } else if (status === 'rejected') {
          msg.textContent = 'Votre demande de compte a été refusée.';
          msg.style.color = 'var(--danger)';
        } else {
          msg.textContent = 'Impossible de vérifier la validation de votre compte. Réessayez plus tard.';
          msg.style.color = 'var(--danger)';
        }
      }

      $('authModal')?.classList.remove('hidden');
      renderGames();
      return;
    }
  }

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
        $('openAdminBtn').onclick = async () => {
          $('adminModal')?.classList.remove('hidden');
          await loadAdminPanel();
        };
      }
    }
    $('authWarning')?.classList.add('hidden');
    updateReviewAuthorDisplay?.();
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

  if (!isAdminEmail(currentUser.email)) {
    const status = await getAccountStatus(currentUser.id);
    if (status !== 'approved') return;
  }

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

    const { data, error } = await supabase
      .from('games')
      .select('*')
      .order('name');

    if (error) throw error;

    allGames = data || [];

    const cats = [
      ...new Set(
        allGames
          .map(g => g.category)
          .filter(Boolean)
      )
    ].sort();

    if ($('category')) {
      $('category').innerHTML =
        '<option value="">Toutes les catégories</option>' +
        cats.map(c =>
          `<option value="${esc(c)}">${esc(c)}</option>`
        ).join('');
    }

    if ($('gameSelect')) {
      $('gameSelect').innerHTML =
        '<option value="">Sélectionnez un jeu…</option>' +
        allGames.map(g =>
          `<option value="${esc(g.id)}">${esc(g.name)}</option>`
        ).join('');
    }

    // Charger les avis
    await loadAllReviews();

    renderGames();

  } catch (e) {

    console.error("Erreur jeux:", e);

    if ($('games')) {
      $('games').innerHTML =
        '<div class="empty">Erreur de chargement des jeux.</div>';
    }
  }
}
async function loadAllReviews() {

  const { data, error } = await supabase
    .from('game_reviews')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Erreur chargement avis :", error);
    allReviews = [];
    return;
  }

  allReviews = data || [];
}

function renderGames() {
  const container = $('games');
  if (!container) return;

  const q = $('search')?.value.toLowerCase().trim() || '';
  const cat = $('category')?.value || '';
  const minPlayers = Number($('players')?.value || 0);
  const sortBy = $('sort')?.value || 'name';

  let games = allGames.filter(g =>
    (!q || `${g.name} ${g.publisher || ''} ${g.category || ''}`.toLowerCase().includes(q)) &&
    (!cat || g.category === cat) &&
    (!minPlayers || (g.players_max || 0) >= minPlayers)
  );

  if (sortBy === 'duration') {
    games.sort((a, b) => (a.duration || 0) - (b.duration || 0));
  } else if (sortBy === 'players') {
    games.sort((a, b) => (b.players_max || 0) - (a.players_max || 0));
  } else if (sortBy === 'newest') {
    games.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  } else {
    games.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr'));
  }

  const hasFilter = Boolean(q || cat || minPlayers || sortBy !== 'name');
  const totalGames = games.length;
  const visibleGames = (!catalogExpanded && !hasFilter) ? games.slice(0, 8) : games;

  if ($('count')) {
    $('count').textContent = hasFilter
      ? `${totalGames} jeu(x)`
      : catalogExpanded
        ? `${totalGames} jeu(x)`
        : `${Math.min(totalGames, 8)} sur ${totalGames} jeu(x)`;
  }

  if (!totalGames) {
    container.innerHTML = '<div class="empty panel">Aucun jeu trouvé.</div>';
    return;
  }

  container.innerHTML = visibleGames.map(g => {
    const reviews = allReviews.filter(r => String(r.game_id) === String(g.id));
    const average = reviews.length
      ? reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviews.length
      : 0;

    const averageDisplay = average
      ? `
        <div style="display:flex; align-items:center; gap:7px; margin-top:8px;">
          <span class="review-stars">${'★'.repeat(Math.round(average))}</span>
          <span style="color:var(--muted); font-size:12px;">
            ${average.toFixed(1)}/5 · ${reviews.length} avis
          </span>
        </div>`
      : `
        <div style="color:var(--muted); font-size:12px; margin-top:8px;">
          Aucun avis
        </div>`;

    return `
      <article
        class="card"
        data-review-game="${esc(g.id)}"
        style="cursor:pointer;"
        title="Voir les avis"
      >
        <div class="cover">
          ${g.cover_image
            ? `<img src="${esc(g.cover_image)}" alt="${esc(g.name)}">`
            : '<span>✦</span>'}
        </div>

        <div class="card-body">
          <p class="tag">${esc(g.category || 'Jeu')}</p>
          <h3>${esc(g.name)}</h3>
          <p class="publisher">${esc(g.publisher || '')}</p>

          <div class="meta">
            <span>♙ ${g.players_min || '?'}-${g.players_max || '?'} joueurs</span>
            <span>◷ ${g.duration || '?'} min</span>
          </div>

          ${averageDisplay}

          <p class="desc">${esc(g.description || '')}</p>

          <p style="color:#2583ff; font-size:12px; margin-top:10px; font-weight:700;">
            Voir les avis →
          </p>
        </div>
      </article>`;
  }).join('');

  container.querySelectorAll('[data-review-game]').forEach(card => {
    card.addEventListener('click', () => {
      const game = allGames.find(g => String(g.id) === String(card.dataset.reviewGame));
      if (game) openReviewModal(game);
    });
  });

  let toggle = $('catalogToggle');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.id = 'catalogToggle';
    toggle.className = 'button';
    toggle.type = 'button';
    container.insertAdjacentElement('afterend', toggle);
  }

  const shouldShowToggle = !hasFilter && totalGames > 8;
  toggle.style.display = shouldShowToggle ? 'block' : 'none';

  if (shouldShowToggle) {
    toggle.textContent = catalogExpanded ? 'Afficher moins ↑' : 'Afficher tous les jeux ↓';
    toggle.style.margin = '18px auto 0';
    toggle.onclick = () => {
      catalogExpanded = !catalogExpanded;
      renderGames();
    };
  }
}

// --- SOUMISSION DE RÉSERVATION ---

async function handleBookingSubmit(e) {
  e.preventDefault();
  const msg = $('formMessage');
  
  if (!(await requireApprovedAccount(msg, 'effectuer une réservation'))) {
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

  await ensureAdminAccountSection();
  await loadAdminAccountRequests();
  await loadAdminGamesList();
  await loadAdminReservationsList();
}

async function loadAdminAccountRequests() {
  const container = $('adminPendingAccounts');
  if (!container || !isAdminEmail(currentUser?.email)) return;

  container.innerHTML = `<div class="loading">Chargement des demandes…</div>`;

  try {
    const { data: requests, error } = await supabase
      .from('account_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (!requests?.length) {
      container.innerHTML = `<div class="empty" style="padding:14px;">✓ Aucun compte en attente de validation.</div>`;
      return;
    }

    container.innerHTML = requests.map(request => `
      <div class="panel" style="padding:14px; border-left:3px solid var(--warning);">
        <strong style="font-size:15px;">${esc(request.first_name)} ${esc(request.last_name)}</strong>
        <p style="margin-top:5px; color:var(--muted); font-size:12px;">
          ${esc(request.promotion)} — ${esc(request.email)}
        </p>
        <p style="margin-top:4px; color:var(--muted); font-size:11px;">
          Demande reçue le ${esc(new Date(request.created_at).toLocaleDateString('fr-FR'))}
        </p>
        <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
          <button class="button primary" data-account-action="approved" data-account-id="${esc(request.id)}">✓ Valider le compte</button>
          <button class="button danger" data-account-action="rejected" data-account-id="${esc(request.id)}">✕ Refuser</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('[data-account-action]').forEach(button => {
      button.onclick = async () => {
        if (!isAdminEmail(currentUser?.email)) return;

        const action = button.dataset.accountAction;
        const id = button.dataset.accountId;
        const question = action === 'approved' ? 'Valider ce compte ?' : 'Refuser ce compte ?';
        if (!confirm(question)) return;

        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = '…';

        try {
          const { data, error } = await supabase.functions.invoke('approve-account', {
            body: { request_id: id, action }
          });

          if (error) throw error;
          if (data?.error) throw new Error(data.error);

          if (action === 'approved') {
            if (data?.emailSent === false) {
              alert('Compte validé, mais l’e-mail n’a pas pu être envoyé. Vérifie la configuration Resend de Supabase.');
            } else {
              alert('Compte validé et e-mail envoyé.');
            }
          }

          await loadAdminAccountRequests();
        } catch (error) {
          console.error('Erreur validation compte :', error);
          alert('Impossible de modifier le compte : ' + error.message);
          button.disabled = false;
          button.textContent = originalText;
        }
      };
    });
  } catch (error) {
    console.error('Erreur demandes de comptes :', error);
    container.innerHTML = `<div class="empty" style="color:var(--danger);">Impossible de charger les demandes.<br><small>${esc(error.message)}</small></div>`;
  }
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
// =========================================================
// AVIS ET NOTATION
// =========================================================

function openReviewModal(game) {

  selectedReviewGame = game;
  selectedRating = 0;

  const modal = $('reviewModal');
  const header = $('reviewGameHeader');
  const ratingInput = $('reviewRating');
  const ratingHelp = $('ratingHelp');

  if (!modal || !header) return;


  if (ratingInput) {
    ratingInput.value = '0';
  }

  if (ratingHelp) {
    ratingHelp.textContent =
      'Sélectionnez une note de 1 à 5 étoiles.';
  }


  document
    .querySelectorAll('.star-button')
    .forEach(star =>
      star.classList.remove('active')
    );


  header.innerHTML = `

    <div style="
      display:flex;
      gap:16px;
      align-items:center;
    ">

      ${
        game.cover_image
          ? `
            <img
              src="${esc(game.cover_image)}"
              alt="${esc(game.name)}"
              style="
                width:90px;
                height:90px;
                object-fit:cover;
                border-radius:8px;
              "
            >
          `
          : `
            <div style="
              width:90px;
              height:90px;
              border-radius:8px;
              background:var(--bg);
              border:1px solid var(--line);
              display:flex;
              align-items:center;
              justify-content:center;
              font-size:30px;
            ">
              ✦
            </div>
          `
      }

      <div>

        <p class="eyebrow">
          AVIS DU JEU
        </p>

        <h2 style="margin-top:4px;">
          ${esc(game.name)}
        </h2>

        <div id="reviewAverage" style="margin-top:6px;"></div>

      </div>

    </div>

  `;


  updateReviewAuthorDisplay();

  const profile = getCurrentUserProfile();
  if ($('reviewPromotion') && !$('reviewPromotion').value && profile.promotion) {
    $('reviewPromotion').value = profile.promotion;
  }

  renderReviews(game);

  $('reviewModal')
    ?.classList.remove('hidden');
}


function renderReviews(game) {

  const list = $('reviewsList');

  if (!list) return;


  const reviews =
    allReviews.filter(
      r =>
        String(r.game_id) ===
        String(game.id)
    );


  const average =
    reviews.length
      ? reviews.reduce(
          (sum, r) =>
            sum + Number(r.rating),
          0
        ) / reviews.length
      : 0;


  const averageContainer =
    $('reviewAverage');

  if (averageContainer) {

    averageContainer.innerHTML =
      reviews.length
        ? `
          <span class="review-stars">
            ${'★'.repeat(Math.round(average))}
          </span>

          <span style="
            color:var(--muted);
            font-size:13px;
            margin-left:6px;
          ">
            ${average.toFixed(1)}/5
            · ${reviews.length} avis
          </span>
        `
        : `
          <span style="
            color:var(--muted);
            font-size:13px;
          ">
            Aucun avis pour le moment
          </span>
        `;
  }


  if (!reviews.length) {

    list.innerHTML = `
      <div class="empty panel">
        Aucun avis pour le moment.
        Soyez le premier à donner votre avis !
      </div>
    `;

    return;
  }


  list.innerHTML = reviews.map(review => {

    const isOwner =
      currentUser &&
      String(review.user_id) ===
      String(currentUser.id);

    const admin =
      isAdminEmail(currentUser?.email);


    return `

      <div class="review-card">

        <div style="
          display:flex;
          justify-content:space-between;
          gap:10px;
        ">

          <div>

            <strong>
              ${esc(review.first_name)}
              ${esc(review.last_name)}
            </strong>

            <span style="
              color:var(--muted);
              font-size:12px;
              margin-left:5px;
            ">
              ${esc(review.promotion)}
            </span>

          </div>

          <span class="review-stars">
            ${'★'.repeat(Number(review.rating))}
            <span style="color:var(--line);">
              ${'★'.repeat(5 - Number(review.rating))}
            </span>
          </span>

        </div>


        ${
          review.review
            ? `
              <p style="
                margin-top:10px;
                font-size:14px;
                white-space:pre-wrap;
              ">
                ${esc(review.review)}
              </p>
            `
            : ''
        }


        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          margin-top:10px;
        ">

          <span style="
            color:var(--muted);
            font-size:11px;
          ">
            ${formatReviewDate(review.created_at)}
          </span>


          ${
            admin
              ? `
                <button
                  class="button danger"
                  data-delete-review="${esc(review.id)}"
                  style="
                    padding:4px 8px;
                    font-size:11px;
                  "
                >
                  Supprimer
                </button>
              `
              : ''
          }

        </div>

      </div>

    `;

  }).join('');


  list
    .querySelectorAll('[data-delete-review]')
    .forEach(btn => {

      btn.onclick = async e => {

        e.stopPropagation();

        if (
          !confirm(
            'Supprimer définitivement cet avis ?'
          )
        ) {
          return;
        }


        const { error } =
          await supabase
            .from('game_reviews')
            .delete()
            .eq('id', btn.dataset.deleteReview);


        if (error) {

          console.error(
            "Erreur suppression avis :",
            error
          );

          alert(
            "Impossible de supprimer l'avis : " +
            error.message
          );

          return;
        }


        allReviews =
          allReviews.filter(
            r =>
              String(r.id) !==
              String(btn.dataset.deleteReview)
          );


        renderReviews(game);
        renderGames();

      };

    });
}


function formatReviewDate(date) {

  if (!date) return '';

  return new Date(date)
    .toLocaleDateString(
      'fr-FR',
      {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }
    );
}


function setReviewRating(rating) {

  selectedRating = Number(rating);

  const input =
    $('reviewRating');

  const help =
    $('ratingHelp');


  if (input) {
    input.value =
      String(selectedRating);
  }


  document
    .querySelectorAll('.star-button')
    .forEach(star => {

      const starRating =
        Number(star.dataset.rating);

      star.classList.toggle(
        'active',
        starRating <= selectedRating
      );

    });


  if (help) {

    help.textContent =
      `${selectedRating}/5 étoiles`;

  }
}


function getCurrentUserProfile() {
  const metadata = currentUser?.user_metadata || {};
  return {
    firstName: String(metadata.first_name || '').trim(),
    lastName: String(metadata.last_name || '').trim(),
    promotion: String(metadata.promotion || '').trim()
  };
}

function openProfileModal() {
  const profile = getCurrentUserProfile();
  if ($('profileFirstName')) $('profileFirstName').value = profile.firstName;
  if ($('profileLastName')) $('profileLastName').value = profile.lastName;
  $('profileModal')?.classList.remove('hidden');
}

function updateReviewAuthorDisplay() {
  const nameEl = $('reviewAuthorName');
  if (!nameEl) return;
  const profile = getCurrentUserProfile();
  nameEl.textContent = profile.firstName && profile.lastName
    ? `${profile.firstName} ${profile.lastName}`
    : 'Profil incomplet';
}

async function submitReview(e) {
  e.preventDefault();

  const msg = $('reviewMsg');
  const submitBtn = e.currentTarget.querySelector('button[type="submit"]');

  if (!(await requireApprovedAccount(msg, 'laisser un avis'))) {
    return;
  }

  if (!selectedReviewGame) return;

  const profile = getCurrentUserProfile();
  const firstName = profile.firstName;
  const lastName = profile.lastName;
  const promotion = $('reviewPromotion')?.value.trim() || '';
  const reviewText = $('reviewText')?.value.trim() || '';

  if (!firstName || !lastName) {
    if (msg) {
      msg.textContent = 'Votre profil doit contenir votre prénom et votre nom avant de publier un avis.';
      msg.style.color = 'var(--danger)';
    }
    openProfileModal();
    return;
  }

  if (!promotion) {
    if (msg) {
      msg.textContent = 'La promotion est obligatoire.';
      msg.style.color = 'var(--danger)';
    }
    $('reviewPromotion')?.focus();
    return;
  }

  if (selectedRating < 1 || selectedRating > 5) {
    if (msg) {
      msg.textContent = 'Veuillez sélectionner une note de 1 à 5 étoiles.';
      msg.style.color = 'var(--danger)';
    }
    return;
  }

  if (msg) {
    msg.textContent = 'Publication de votre avis…';
    msg.style.color = 'var(--muted)';
  }
  if (submitBtn) submitBtn.disabled = true;

  const { data, error } = await supabase
    .from('game_reviews')
    .insert({
      game_id: selectedReviewGame.id,
      user_id: currentUser.id,
      first_name: firstName,
      last_name: lastName,
      promotion,
      rating: selectedRating,
      review: reviewText || null
    })
    .select()
    .single();

  if (submitBtn) submitBtn.disabled = false;

  if (error) {
    console.error('Erreur ajout avis :', error);
    if (msg) {
      msg.textContent = error.code === '23505'
        ? 'Vous avez déjà laissé un avis pour ce jeu.'
        : 'Erreur : ' + error.message;
      msg.style.color = 'var(--danger)';
    }
    return;
  }

  allReviews.unshift(data);

  if (msg) {
    msg.textContent = '✓ Votre avis a été publié !';
    msg.style.color = 'var(--success)';
  }

  e.currentTarget.reset();
  selectedRating = 0;
  $('reviewRating').value = '0';
  $('reviewAuthorName').textContent = `${firstName} ${lastName}`;

  document.querySelectorAll('.star-button').forEach(star => star.classList.remove('active'));

  renderReviews(selectedReviewGame);
  renderGames();
}

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
  // --- NOTATION PAR ÉTOILES ---

document
  .querySelectorAll('.star-button')
  .forEach(star => {

    star.addEventListener('click', () => {
      setReviewRating(star.dataset.rating);
    });

  });


// --- FORMULAIRE AVIS ---

$('reviewForm')?.addEventListener(
  'submit',
  submitReview
);

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

  $('profileForm')?.addEventListener('submit', async e => {
    e.preventDefault();

    const msg = $('profileMsg');
    if (!(await requireApprovedAccount(msg, 'modifier votre profil'))) return;

    const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
    const firstName = $('profileFirstName')?.value.trim() || '';
    const lastName = $('profileLastName')?.value.trim() || '';

    if (!firstName || !lastName) {
      if (msg) {
        msg.textContent = 'Le prénom et le nom sont obligatoires.';
        msg.style.color = 'var(--danger)';
      }
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    if (msg) {
      msg.textContent = 'Enregistrement…';
      msg.style.color = 'var(--muted)';
    }

    const { data, error } = await supabase.auth.updateUser({
      data: {
        ...(currentUser.user_metadata || {}),
        first_name: firstName,
        last_name: lastName
      }
    });

    if (submitBtn) submitBtn.disabled = false;

    if (error) {
      console.error('Erreur mise à jour profil :', error);
      if (msg) {
        msg.textContent = 'Erreur : ' + error.message;
        msg.style.color = 'var(--danger)';
      }
      return;
    }

    currentUser = data.user || currentUser;

    if (msg) {
      msg.textContent = '✓ Informations enregistrées.';
      msg.style.color = 'var(--success)';
    }

    updateReviewAuthorDisplay();

    setTimeout(() => {
      $('profileModal')?.classList.add('hidden');
      if (msg) msg.textContent = '';
    }, 500);
  });

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

    const { data, error } = await supabase.auth.signInWithPassword({
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

    const user = data?.user;
    const status = user && !isAdminEmail(user.email)
      ? await getAccountStatus(user.id)
      : 'approved';

    if (status !== 'approved') {
      await supabase.auth.signOut();
      currentUser = null;
      if (msg) {
        if (status === 'pending') {
          msg.textContent = 'Votre compte est en attente de validation par un administrateur. Vous pourrez vous connecter après validation.';
          msg.style.color = 'var(--warning)';
        } else if (status === 'rejected') {
          msg.textContent = 'Votre demande de compte a été refusée.';
          msg.style.color = 'var(--danger)';
        } else {
          msg.textContent = 'Impossible de vérifier la validation de votre compte. Réessayez plus tard.';
          msg.style.color = 'var(--danger)';
        }
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

    const firstName = $('signupFirst')?.value.trim() || '';
    const lastName = $('signupLast')?.value.trim() || '';
    const promotion = $('signupPromotion')?.value.trim() || '';
    const email = $('signupEmail')?.value.trim() || '';
    const password = $('signupPassword')?.value || '';

    if (!firstName || !lastName || !promotion || !email || !password) {
      if (msg) {
        msg.textContent = 'Le prénom, le nom, la promotion, l’e-mail et le mot de passe sont obligatoires.';
        msg.style.color = 'var(--danger)';
      }
      return;
    }

    if (password.length < 6) {
      if (msg) {
        msg.textContent = 'Le mot de passe doit contenir au moins 6 caractères.';
        msg.style.color = 'var(--danger)';
      }
      return;
    }

    if (msg) {
      msg.textContent = 'Création du compte…';
      msg.style.color = 'var(--muted)';
    }
    if (submitBtn) submitBtn.disabled = true;

    try {
      const { data, error } = await supabase.functions.invoke('request-account', {
        body: { first_name: firstName, last_name: lastName, promotion, email, password }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (msg) {
        msg.textContent = data?.message || '✓ Demande envoyée ! Votre compte est en attente de validation par un administrateur. Vous ne pourrez pas utiliser les fonctions réservées aux membres avant validation.';
        msg.style.color = 'var(--success)';
      }
      e.currentTarget.reset();
    } catch (error) {
      console.error('Erreur inscription :', error);
      let errorMessage = error?.message || 'Une erreur est survenue.';

      // Messages plus compréhensibles pour les erreurs fréquentes de la fonction Edge.
      if (/already registered|already exists|duplicate/i.test(errorMessage)) {
        errorMessage = 'Cette adresse e-mail possède déjà un compte ou une demande.';
      } else if (/rate limit|too many requests/i.test(errorMessage)) {
        errorMessage = 'Trop de demandes ont été effectuées récemment. Attendez quelques minutes puis réessayez.';
      }

      if (msg) {
        msg.textContent = 'Erreur : ' + errorMessage;
        msg.style.color = 'var(--danger)';
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
