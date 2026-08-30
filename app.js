import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://qqelmmygalllmxinaxrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fqFvZNetzIdAfX860bmjBQ_GzJfeVK3';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// =========================================================
// CONFIGURATION ADMIN
// =========================================================

const ADMIN_EMAILS = [
  'xavierguillon2007@gmail.com',
  'kbg.asso@gmail.com'
];

function isAdminEmail(email) {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

// =========================================================
// VARIABLES GLOBALES
// =========================================================

let allGames = [];
let allReviews = [];
let currentUser = null;

let currentCalendarDate = new Date();

let selectedReviewGame = null;
let selectedRating = 0;

// =========================================================
// OUTILS
// =========================================================

const $ = id => document.getElementById(id);

const esc = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char])
  );

// =========================================================
// INITIALISATION
// =========================================================

document.addEventListener('DOMContentLoaded', async () => {

  setupEventListeners();

  try {

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error('Erreur récupération session :', error);
    }

    await handleAuthChange(data?.session?.user || null);

  } catch (err) {

    console.error('Erreur Auth :', err);

  }

  await loadGames();

  await renderCalendar();

});

// =========================================================
// AUTH SUPABASE
// =========================================================

supabase.auth.onAuthStateChange((_event, session) => {

  handleAuthChange(session?.user || null);

});

// =========================================================
// GESTION AUTHENTIFICATION
// =========================================================

async function handleAuthChange(user) {

  currentUser = user;

  const userNav = $('userNav');
  const authWarning = $('authWarning');
  const notifBadge = $('notifBadge');

  if (currentUser) {

    const admin = isAdminEmail(currentUser.email);

    if (userNav) {

      userNav.innerHTML = `
        <span style="font-size:13px; font-weight:700;">
          👋 ${esc(currentUser.email)}
        </span>

        ${
          admin
            ? `
              <button
                class="button primary"
                id="openAdminBtn"
              >
                🔑 Admin
              </button>
            `
            : ''
        }

        <button
          class="button"
          id="logoutBtn"
        >
          Déconnexion
        </button>
      `;

      $('logoutBtn')?.addEventListener('click', async () => {

        const { error } = await supabase.auth.signOut();

        if (error) {
          console.error('Erreur déconnexion :', error);
        }

      });

      if (admin) {

        $('openAdminBtn')?.addEventListener('click', () => {

          $('adminModal')?.classList.remove('hidden');

          loadAdminPanel();

        });

      }

    }

    authWarning?.classList.add('hidden');

    await loadUserNotifications();

  } else {

    if (userNav) {

      userNav.innerHTML = `
        <button
          class="button"
          id="openAuthBtn"
        >
          👤 Connexion
        </button>
      `;

      $('openAuthBtn')?.addEventListener('click', () => {

        $('authModal')?.classList.remove('hidden');

      });

    }

    authWarning?.classList.remove('hidden');

    notifBadge?.classList.add('hidden');

  }

  renderGames();

}

// =========================================================
// NOTIFICATIONS / RÉSERVATIONS UTILISATEUR
// =========================================================

async function loadUserNotifications() {

  if (!currentUser) return;

  try {

    const {
      data: reservations,
      error
    } = await supabase
      .from('reservations')
      .select('*, games(name)')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const listContainer = $('notifList');
    const badge = $('notifBadge');

    if (!reservations || !reservations.length) {

      if (listContainer) {

        listContainer.innerHTML =
          '<div class="empty">Vous n\'avez effectué aucune demande.</div>';

      }

      badge?.classList.add('hidden');

      return;

    }

    const processedCount =
      reservations.filter(
        r =>
          r.status === 'approved' ||
          r.status === 'rejected'
      ).length;

    if (badge) {

      if (processedCount > 0) {

        badge.textContent = processedCount;
        badge.classList.remove('hidden');

      } else {

        badge.classList.add('hidden');

      }

    }

    if (listContainer) {

      listContainer.innerHTML =
        reservations.map(r => {

          let statusBadge =
            '<span class="badge badge-warning">En attente</span>';

          let msgText =
            'Votre demande est en cours de traitement par l\'administrateur.';

          if (r.status === 'approved') {

            statusBadge =
              '<span class="badge badge-success">Acceptée</span>';

            msgText =
              'Bonne nouvelle ! Votre réservation a été validée.';

          }

          if (r.status === 'rejected') {

            statusBadge =
              '<span class="badge badge-danger">Rejetée</span>';

            msgText =
              'Désolé, votre demande a été refusée pour cette période.';

          }

          return `
            <div
              class="panel"
              style="padding:12px; font-size:13px;"
            >

              <div
                style="
                  display:flex;
                  justify-content:space-between;
                  align-items:center;
                  gap:10px;
                "
              >

                <strong>
                  ${esc(r.games?.name || 'Jeu')}
                </strong>

                ${statusBadge}

              </div>

              <p
                style="
                  color:var(--muted);
                  font-size:12px;
                  margin-top:4px;
                "
              >
                Du ${esc(r.date_start)}
                au ${esc(r.date_end)}
              </p>

              <p
                style="
                  margin-top:6px;
                  font-size:12px;
                "
              >
                ${msgText}
              </p>

            </div>
          `;

        }).join('');

    }

  } catch (error) {

    console.error(
      'Erreur notifications :',
      error
    );

  }

}

// =========================================================
// CALENDRIER
// =========================================================

async function renderCalendar() {

  const container = $('calendar');
  const label = $('currentMonthLabel');

  if (!container) return;

  const year =
    currentCalendarDate.getFullYear();

  const month =
    currentCalendarDate.getMonth();

  if (label) {

    label.textContent =
      currentCalendarDate.toLocaleDateString(
        'fr-FR',
        {
          month: 'long',
          year: 'numeric'
        }
      );

  }

  try {

    const {
      data: reservations,
      error
    } = await supabase
      .from('reservations')
      .select('*, games(name)')
      .eq('status', 'approved');

    if (error) {

      console.warn(
        'Erreur récupération calendrier :',
        error.message
      );

    }

    let html = '';

    const firstDay =
      new Date(year, month, 1);

    const lastDay =
      new Date(year, month + 1, 0);

    let startOffset =
      firstDay.getDay() - 1;

    if (startOffset === -1) {
      startOffset = 6;
    }

    for (
      let i = 0;
      i < startOffset;
      i++
    ) {

      html += `
        <div
          class="cal-day"
          style="
            opacity:0.15;
            background:transparent;
            border:1px dashed var(--line);
          "
        ></div>
      `;

    }

    const dayEventsMap = {};

    for (
      let day = 1;
      day <= lastDay.getDate();
      day++
    ) {

      const currentDateStr =
        `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const events =
        (reservations || []).filter(
          reservation =>
            currentDateStr >= reservation.date_start &&
            currentDateStr <= reservation.date_end
        );

      dayEventsMap[currentDateStr] =
        events;

      html += `
        <div
          class="cal-day${events.length ? ' has-events' : ''}"
          data-date="${currentDateStr}"
        >

          <span class="cal-day-num">
            ${day}
          </span>

          ${
            events.map(event => `
              <span
                class="cal-event"
                title="${esc(event.games?.name || 'Jeu')}"
              >
                📌 ${esc(event.games?.name || 'Jeu')}
              </span>
            `).join('')
          }

        </div>
      `;

    }

    container.innerHTML = html;

    container
      .querySelectorAll('.cal-day.has-events')
      .forEach(dayEl => {

        dayEl.addEventListener('click', () => {

          openDayModal(
            dayEl.dataset.date,
            dayEventsMap[dayEl.dataset.date] || []
          );

        });

      });

  } catch (error) {

    console.error(
      'Erreur calendrier :',
      error
    );

    container.innerHTML =
      '<div class="empty">Impossible de charger le calendrier.</div>';

  }

}

// =========================================================
// MODALE D'UN JOUR
// =========================================================

function openDayModal(dateStr, events) {

  const modal = $('dayModal');
  const title = $('dayModalTitle');
  const list = $('dayModalList');

  if (!modal || !list) return;

  if (title) {

    const date =
      new Date(dateStr + 'T00:00:00');

    let label =
      date.toLocaleDateString(
        'fr-FR',
        {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }
      );

    label =
      label.charAt(0).toUpperCase() +
      label.slice(1);

    title.textContent = label;

  }

  if (!events.length) {

    list.innerHTML =
      '<div class="empty">Aucun jeu réservé ce jour-là.</div>';

  } else {

    list.innerHTML =
      events.map(event => `

        <div
          class="panel"
          style="padding:12px; font-size:13px;"
        >

          <strong>
            ${esc(event.games?.name || 'Jeu')}
          </strong>

          <p
            style="
              color:var(--muted);
              font-size:12px;
              margin-top:4px;
            "
          >
            Du ${esc(event.date_start)}
            au ${esc(event.date_end)}
          </p>

          <p
            style="
              margin-top:4px;
              font-size:12px;
            "
          >
            ${esc(event.first_name)}
            ${esc(event.last_name)}

            ${
              event.promotion
                ? ` — ${esc(event.promotion)}`
                : ''
            }

          </p>

        </div>

      `).join('');

  }

  modal.classList.remove('hidden');

}

// =========================================================
// CHARGEMENT DES JEUX
// =========================================================

async function loadGames() {

  const container = $('games');

  try {

    const {
      data,
      error
    } = await supabase
      .from('games')
      .select('*')
      .order('name');

    if (error) throw error;

    allGames = data || [];

    const categories = [
      ...new Set(
        allGames
          .map(game => game.category)
          .filter(Boolean)
      )
    ].sort();

    if ($('category')) {

      $('category').innerHTML =
        '<option value="">Toutes les catégories</option>' +
        categories.map(category =>
          `<option value="${esc(category)}">${esc(category)}</option>`
        ).join('');

    }

    if ($('gameSelect')) {

      $('gameSelect').innerHTML =
        '<option value="">Sélectionnez un jeu…</option>' +
        allGames.map(game =>
          `<option value="${esc(game.id)}">${esc(game.name)}</option>`
        ).join('');

    }

    await loadAllReviews();

    renderGames();

  } catch (error) {

    console.error(
      'Erreur chargement jeux :',
      error
    );

    if (container) {

      container.innerHTML = `
        <div class="empty panel">
          Impossible de charger le catalogue.
          <br>
          <small>${esc(error.message)}</small>
        </div>
      `;

    }

  }

}

// =========================================================
// CHARGEMENT DES AVIS
// =========================================================

async function loadAllReviews() {

  try {

    const {
      data,
      error
    } = await supabase
      .from('game_reviews')
      .select('*')
      .order('created_at', {
        ascending: false
      });

    if (error) throw error;

    allReviews = data || [];

  } catch (error) {

    console.error(
      'Erreur chargement avis :',
      error
    );

    allReviews = [];

  }

}

// =========================================================
// CALCUL MOYENNE AVIS
// =========================================================

function getGameReviews(gameId) {

  return allReviews.filter(
    review =>
      String(review.game_id) ===
      String(gameId)
  );

}

function getAverageRating(gameId) {

  const reviews =
    getGameReviews(gameId);

  if (!reviews.length) return 0;

  return (
    reviews.reduce(
      (sum, review) =>
        sum + Number(review.rating),
      0
    ) / reviews.length
  );

}

// =========================================================
// AFFICHAGE DU CATALOGUE
// =========================================================

function renderGames() {

  const container = $('games');

  if (!container) return;

  const query =
    $('search')?.value
      .toLowerCase()
      .trim() || '';

  const category =
    $('category')?.value || '';

  const minPlayers =
    Number($('players')?.value || 0);

  const sortBy =
    $('sort')?.value || 'name';

  let games =
    allGames.filter(game => {

      const searchText =
        `${game.name || ''} ${game.publisher || ''}`
          .toLowerCase();

      return (
        (!query ||
          searchText.includes(query)) &&

        (!category ||
          game.category === category) &&

        (!minPlayers ||
          (game.players_max || 0) >= minPlayers)
      );

    });

  // TRI

  if (sortBy === 'duration') {

    games.sort(
      (a, b) =>
        (a.duration || 0) -
        (b.duration || 0)
    );

  } else if (sortBy === 'players') {

    games.sort(
      (a, b) =>
        (b.players_max || 0) -
        (a.players_max || 0)
    );

  } else if (sortBy === 'newest') {

    games.sort(
      (a, b) =>
        new Date(b.created_at || 0) -
        new Date(a.created_at || 0)
    );

  } else {

    games.sort(
      (a, b) =>
        (a.name || '').localeCompare(
          b.name || '',
          'fr'
        )
    );

  }

  if ($('count')) {

    $('count').textContent =
      `${games.length} jeu(x)`;

  }

  if (!games.length) {

    container.innerHTML =
      '<div class="empty panel">Aucun jeu trouvé.</div>';

    return;

  }

  container.innerHTML =
    games.map(game => {

      const reviews =
        getGameReviews(game.id);

      const average =
        getAverageRating(game.id);

      let ratingHTML;

      if (reviews.length) {

        ratingHTML = `
          <div
            style="
              display:flex;
              align-items:center;
              gap:7px;
              margin-top:8px;
            "
          >

            <span class="review-stars">
              ${'★'.repeat(Math.round(average))}
              <span style="color:var(--line);">
                ${'★'.repeat(5 - Math.round(average))}
              </span>
            </span>

            <span
              style="
                color:var(--muted);
                font-size:12px;
              "
            >
              ${average.toFixed(1)}/5
              · ${reviews.length} avis
            </span>

          </div>
        `;

      } else {

        ratingHTML = `
          <div
            style="
              color:var(--muted);
              font-size:12px;
              margin-top:8px;
            "
          >
            Aucun avis
          </div>
        `;

      }

      return `
        <article
          class="card"
          data-review-game="${esc(game.id)}"
          style="cursor:pointer;"
          title="Voir les avis"
        >

          <div class="cover">

            ${
              game.cover_image
                ? `
                  <img
                    src="${esc(game.cover_image)}"
                    alt="${esc(game.name)}"
                  >
                `
                : '<span>✦</span>'
            }

          </div>

          <div class="card-body">

            <p class="tag">
              ${esc(game.category || 'Jeu')}
            </p>

            <h3>
              ${esc(game.name)}
            </h3>

            <p class="publisher">
              ${esc(game.publisher || '')}
            </p>

            <div class="meta">

              <span>
                ♙ ${game.players_min || '?'}-${game.players_max || '?'} joueurs
              </span>

              <span>
                ◷ ${game.duration || '?'} min
              </span>

            </div>

            ${ratingHTML}

            <p class="desc">
              ${esc(game.description || '')}
            </p>

            <p
              style="
                color:#2583ff;
                font-size:12px;
                margin-top:10px;
                font-weight:700;
              "
            >
              Voir les avis →
            </p>

          </div>

        </article>
      `;

    }).join('');

  // Clic sur un jeu

  container
    .querySelectorAll('[data-review-game]')
    .forEach(card => {

      card.addEventListener('click', () => {

        const game =
          allGames.find(
            g =>
              String(g.id) ===
              String(card.dataset.reviewGame)
          );

        if (game) {

          openReviewModal(game);

        }

      });

    });

}

// =========================================================
// RÉSERVATION
// =========================================================

async function handleBookingSubmit(e) {

  e.preventDefault();

  const msg = $('formMessage');
  const submitBtn =
    e.currentTarget.querySelector(
      'button[type="submit"]'
    );

  if (!currentUser) {

    if (msg) {

      msg.textContent =
        'Vous devez être connecté pour effectuer une réservation.';

      msg.style.color =
        'var(--danger)';

    }

    $('authModal')?.classList.remove('hidden');

    return;

  }

  if (msg) {

    msg.textContent =
      'Envoi de la demande…';

    msg.style.color =
      'var(--text)';

  }

  if (submitBtn) {
    submitBtn.disabled = true;
  }

  try {

    const form =
      e.currentTarget;

    const f =
      new FormData(form);

    const gameId =
      f.get('game_id');

    const dateStart =
      f.get('date_start');

    const dateEnd =
      f.get('date_end');

    const firstName =
      String(f.get('first_name') || '').trim();

    const lastName =
      String(f.get('last_name') || '').trim();

    const promotion =
      String(f.get('promotion') || '').trim();

    if (!gameId ||
        !dateStart ||
        !dateEnd ||
        !firstName ||
        !lastName ||
        !promotion) {

      throw new Error(
        'Veuillez remplir tous les champs.'
      );

    }

    if (dateEnd < dateStart) {

      throw new Error(
        'La date de fin doit être postérieure ou égale à la date de début.'
      );

    }

    const newReservation = {

      id: crypto.randomUUID(),

      user_id:
        currentUser.id,

      game_id:
        gameId,

      date_start:
        dateStart,

      date_end:
        dateEnd,

      first_name:
        firstName,

      last_name:
        lastName,

      promotion:
        promotion,

      status:
        'pending'

    };

    const {
      error
    } = await supabase
      .from('reservations')
      .insert(newReservation);

    if (error) throw error;

    if (msg) {

      msg.textContent =
        '✓ Demande enregistrée !';

      msg.style.color =
        'var(--success)';

    }

    form.reset();

    await loadUserNotifications();

  } catch (error) {

    console.error(
      'Erreur réservation :',
      error
    );

    if (msg) {

      msg.textContent =
        'Erreur : ' + error.message;

      msg.style.color =
        'var(--danger)';

    }

  } finally {

    if (submitBtn) {
      submitBtn.disabled = false;
    }

  }

}

// =========================================================
// PANNEAU ADMIN
// =========================================================

async function loadAdminPanel() {

  if (!isAdminEmail(currentUser?.email)) {

    $('adminModal')?.classList.add('hidden');

    return;

  }

  await loadAdminGamesList();

  await loadAdminReservationsList();

}

// =========================================================
// LISTE DES JEUX ADMIN
// =========================================================

async function loadAdminGamesList() {

  const container =
    $('adminGamesList');

  if (!container) return;

  const {
    data: games,
    error
  } = await supabase
    .from('games')
    .select('*')
    .order('name');

  if (error) {

    console.error(
      'Erreur jeux admin :',
      error
    );

    container.innerHTML =
      '<div class="empty">Erreur de chargement.</div>';

    return;

  }

  container.innerHTML =
    (games || []).map(game => `

      <div
        class="panel"
        style="
          padding:10px;
          font-size:12px;
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
        "
      >

        <span>
          <strong>
            ${esc(game.name)}
          </strong>
        </span>

        <button
          class="button danger"
          data-delete-game="${esc(game.id)}"
          style="
            padding:2px 6px;
            font-size:10px;
          "
        >
          Supprimer
        </button>

      </div>

    `).join('');

  container
    .querySelectorAll('[data-delete-game]')
    .forEach(button => {

      button.onclick = async () => {

        if (!isAdminEmail(currentUser?.email)) {
          return;
        }

        if (!confirm('Supprimer ce jeu ?')) {
          return;
        }

        button.disabled = true;

        const {
          error
        } = await supabase
          .from('games')
          .delete()
          .eq(
            'id',
            button.dataset.deleteGame
          );

        if (error) {

          console.error(
            'Erreur suppression jeu :',
            error
          );

          alert(
            'Impossible de supprimer le jeu : ' +
            error.message
          );

          button.disabled = false;

          return;

        }

        await loadAdminGamesList();

        await loadGames();

      };

    });

}

// =========================================================
// LISTE DES RÉSERVATIONS ADMIN
// =========================================================

async function loadAdminReservationsList() {

  const pendingContainer =
    $('adminPendingReservations');

  const processedContainer =
    $('adminProcessedReservations');

  if (!pendingContainer ||
      !processedContainer) {
    return;
  }

  if (!isAdminEmail(currentUser?.email)) {
    return;
  }

  const {
    data: reservations,
    error
  } = await supabase
    .from('reservations')
    .select('*, games(name)')
    .order('created_at', {
      ascending: false
    });

  if (error) {

    console.error(
      'Erreur réservations admin :',
      error
    );

    pendingContainer.innerHTML =
      '<div class="empty">Accès refusé ou erreur.</div>';

    return;

  }

  const pending =
    (reservations || []).filter(
      reservation =>
        !reservation.status ||
        reservation.status === 'pending'
    );

  const processed =
    (reservations || []).filter(
      reservation =>
        reservation.status === 'approved' ||
        reservation.status === 'rejected'
    );

  // DEMANDES EN ATTENTE

  pendingContainer.innerHTML =
    !pending.length

      ? '<div class="empty">Aucune demande en attente.</div>'

      : pending.map(reservation => `

        <div
          class="panel"
          style="
            padding:12px;
            font-size:13px;
            border-left:3px solid var(--warning);
          "
        >

          <p>

            <strong>
              ${esc(reservation.games?.name || 'Jeu')}
            </strong>

            —

            <span class="badge badge-warning">
              En attente
            </span>

          </p>

          <p
            style="
              color:var(--muted);
              margin-top:4px;
            "
          >

            ${esc(reservation.first_name)}
            ${esc(reservation.last_name)}

            ${
              reservation.promotion
                ? `(${esc(reservation.promotion)})`
                : ''
            }

            — du
            ${esc(reservation.date_start)}
            au
            ${esc(reservation.date_end)}

          </p>

          <div
            style="
              display:flex;
              gap:6px;
              margin-top:8px;
            "
          >

            <button
              class="button primary"
              data-act="approved"
              data-id="${esc(reservation.id)}"
            >
              ✓ Accepter
            </button>

            <button
              class="button danger"
              data-act="rejected"
              data-id="${esc(reservation.id)}"
            >
              ✕ Rejeter
            </button>

          </div>

        </div>

      `).join('');

  // HISTORIQUE

  processedContainer.innerHTML =
    !processed.length

      ? '<div class="empty">Aucun historique.</div>'

      : processed.map(reservation => `

        <div
          class="panel"
          style="
            padding:12px;
            font-size:13px;
            opacity:0.85;
          "
        >

          <p>

            <strong>
              ${esc(reservation.games?.name || 'Jeu')}
            </strong>

            —

            <span
              class="badge ${
                reservation.status === 'approved'
                  ? 'badge-success'
                  : 'badge-danger'
              }"
            >
              ${
                reservation.status === 'approved'
                  ? 'Acceptée'
                  : 'Rejetée'
              }
            </span>

          </p>

          <p
            style="
              color:var(--muted);
              margin-top:4px;
            "
          >

            ${esc(reservation.first_name)}
            ${esc(reservation.last_name)}

            — du
            ${esc(reservation.date_start)}
            au
            ${esc(reservation.date_end)}

          </p>

          <div
            style="
              display:flex;
              gap:6px;
              margin-top:8px;
              flex-wrap:wrap;
            "
          >

            ${
              reservation.status !== 'approved'
                ? `
                  <button
                    class="button"
                    data-act="approved"
                    data-id="${esc(reservation.id)}"
                  >
                    Valider
                  </button>
                `
                : ''
            }

            ${
              reservation.status !== 'rejected'
                ? `
                  <button
                    class="button"
                    data-act="rejected"
                    data-id="${esc(reservation.id)}"
                  >
                    Refuser
                  </button>
                `
                : ''
            }

            <button
              class="button"
              data-act="pending"
              data-id="${esc(reservation.id)}"
            >
              Remettre en attente
            </button>

          </div>

        </div>

      `).join('');

  // ACTIONS

  document
    .querySelectorAll('#adminModal [data-act]')
    .forEach(button => {

      button.onclick = async () => {

        if (!isAdminEmail(currentUser?.email)) {
          return;
        }

        button.disabled = true;

        const {
          error
        } = await supabase
          .from('reservations')
          .update({
            status:
              button.dataset.act
          })
          .eq(
            'id',
            button.dataset.id
          );

        if (error) {

          console.error(
            'Erreur modification réservation :',
            error
          );

          alert(
            'Erreur : ' +
            error.message
          );

          button.disabled = false;

          return;

        }

        await loadAdminReservationsList();

        await renderCalendar();

        await loadUserNotifications();

      };

    });

}

// =========================================================
// AVIS — OUVERTURE MODALE
// =========================================================

function openReviewModal(game) {

  selectedReviewGame =
    game;

  selectedRating =
    0;

  const modal =
    $('reviewModal');

  const header =
    $('reviewGameHeader');

  const ratingInput =
    $('reviewRating');

  const ratingHelp =
    $('ratingHelp');

  if (!modal || !header) {
    return;
  }

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

    <div
      style="
        display:flex;
        gap:16px;
        align-items:center;
      "
    >

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
            <div
              style="
                width:90px;
                height:90px;
                border-radius:8px;
                background:var(--bg);
                border:1px solid var(--line);
                display:flex;
                align-items:center;
                justify-content:center;
                font-size:30px;
              "
            >
              ✦
            </div>
          `
      }

      <div>

        <p class="eyebrow">
          AVIS DU JEU
        </p>

        <h2
          style="margin-top:4px;"
        >
          ${esc(game.name)}
        </h2>

        <div
          id="reviewAverage"
          style="margin-top:6px;"
        ></div>

      </div>

    </div>

  `;

  // Pré-remplir les informations du compte si disponibles

  if (currentUser?.user_metadata) {

    const first =
      currentUser.user_metadata.first_name;

    const last =
      currentUser.user_metadata.last_name;

    if ($('reviewFirstName') && first) {
      $('reviewFirstName').value =
        first;
    }

    if ($('reviewLastName') && last) {
      $('reviewLastName').value =
        last;
    }

  }

  renderReviews(game);

  modal.classList.remove('hidden');

}

// =========================================================
// AFFICHAGE DES AVIS
// =========================================================

function renderReviews(game) {

  const list =
    $('reviewsList');

  if (!list) return;

  const reviews =
    getGameReviews(game.id);

  const average =
    getAverageRating(game.id);

  const averageContainer =
    $('reviewAverage');

  if (averageContainer) {

    if (reviews.length) {

      const rounded =
        Math.round(average);

      averageContainer.innerHTML = `

        <span class="review-stars">
          ${'★'.repeat(rounded)}
          <span style="color:var(--line);">
            ${'★'.repeat(5 - rounded)}
          </span>
        </span>

        <span
          style="
            color:var(--muted);
            font-size:13px;
            margin-left:6px;
          "
        >
          ${average.toFixed(1)}/5
          · ${reviews.length} avis
        </span>

      `;

    } else {

      averageContainer.innerHTML = `

        <span
          style="
            color:var(--muted);
            font-size:13px;
          "
        >
          Aucun avis pour le moment
        </span>

      `;

    }

  }

  if (!reviews.length) {

    list.innerHTML = `

      <div class="empty panel">

        Aucun avis pour le moment.

        <br>

        Soyez le premier à donner votre avis !

      </div>

    `;

    return;

  }

  list.innerHTML =
    reviews.map(review => {

      const admin =
        isAdminEmail(
          currentUser?.email
        );

      return `

        <div
          class="review-card"
        >

          <div
            style="
              display:flex;
              justify-content:space-between;
              gap:10px;
              align-items:flex-start;
            "
          >

            <div>

              <strong>
                ${esc(review.first_name)}
                ${esc(review.last_name)}
              </strong>

              <span
                style="
                  color:var(--muted);
                  font-size:12px;
                  margin-left:5px;
                "
              >
                ${esc(review.promotion)}
              </span>

            </div>

            <span
              class="review-stars"
              title="${esc(review.rating)}/5"
            >

              ${'★'.repeat(
                Number(review.rating)
              )}

              <span
                style="color:var(--line);"
              >
                ${'★'.repeat(
                  5 - Number(review.rating)
                )}
              </span>

            </span>

          </div>

          ${
            review.review
              ? `
                <p
                  style="
                    margin-top:10px;
                    font-size:14px;
                    white-space:pre-wrap;
                  "
                >
                  ${esc(review.review)}
                </p>
              `
              : ''
          }

          <div
            style="
              display:flex;
              justify-content:space-between;
              align-items:center;
              margin-top:10px;
              gap:10px;
            "
          >

            <span
              style="
                color:var(--muted);
                font-size:11px;
              "
            >
              ${formatReviewDate(
                review.created_at
              )}
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

  // Suppression admin

  list
    .querySelectorAll('[data-delete-review]')
    .forEach(button => {

      button.onclick = async event => {

        event.stopPropagation();

        if (!isAdminEmail(currentUser?.email)) {
          return;
        }

        if (
          !confirm(
            'Supprimer définitivement cet avis ?'
          )
        ) {
          return;
        }

        button.disabled = true;

        const {
          error
        } = await supabase
          .from('game_reviews')
          .delete()
          .eq(
            'id',
            button.dataset.deleteReview
          );

        if (error) {

          console.error(
            'Erreur suppression avis :',
            error
          );

          alert(
            'Impossible de supprimer l\'avis : ' +
            error.message
          );

          button.disabled = false;

          return;

        }

        allReviews =
          allReviews.filter(
            review =>
              String(review.id) !==
              String(
                button.dataset.deleteReview
              )
          );

        renderReviews(game);

        renderGames();

      };

    });

}

// =========================================================
// DATE AVIS
// =========================================================

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

// =========================================================
// NOTATION ÉTOILES
// =========================================================

function setReviewRating(rating) {

  selectedRating =
    Number(rating);

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
        Number(
          star.dataset.rating
        );

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

// =========================================================
// ENVOI D'UN AVIS
// =========================================================

async function submitReview(e) {

  e.preventDefault();

  const msg =
    $('reviewMsg');

  const submitBtn =
    e.currentTarget.querySelector(
      'button[type="submit"]'
    );

  if (!currentUser) {

    if (msg) {

      msg.textContent =
        'Vous devez être connecté pour laisser un avis.';

      msg.style.color =
        'var(--danger)';

    }

    $('authModal')
      ?.classList.remove('hidden');

    return;

  }

  if (!selectedReviewGame) {

    if (msg) {

      msg.textContent =
        'Impossible d\'identifier le jeu.';

      msg.style.color =
        'var(--danger)';

    }

    return;

  }

  const firstName =
    String(
      $('reviewFirstName')?.value || ''
    ).trim();

  const lastName =
    String(
      $('reviewLastName')?.value || ''
    ).trim();

  const promotion =
    String(
      $('reviewPromotion')?.value || ''
    ).trim();

  const reviewText =
    String(
      $('reviewText')?.value || ''
    ).trim();

  if (
    !firstName ||
    !lastName ||
    !promotion
  ) {

    if (msg) {

      msg.textContent =
        'Le prénom, le nom et la promotion sont obligatoires.';

      msg.style.color =
        'var(--danger)';

    }

    return;

  }

  if (
    selectedRating < 1 ||
    selectedRating > 5
  ) {

    if (msg) {

      msg.textContent =
        'Veuillez sélectionner une note de 1 à 5 étoiles.';

      msg.style.color =
        'var(--danger)';

    }

    return;

  }

  if (msg) {

    msg.textContent =
      'Publication de votre avis…';

    msg.style.color =
      'var(--muted)';

  }

  if (submitBtn) {
    submitBtn.disabled = true;
  }

  try {

    const {
      data,
      error
    } = await supabase
      .from('game_reviews')
      .insert({

        game_id:
          selectedReviewGame.id,

        user_id:
          currentUser.id,

        first_name:
          firstName,

        last_name:
          lastName,

        promotion:
          promotion,

        rating:
          selectedRating,

        review:
          reviewText || null

      })
      .select()
      .single();

    if (error) throw error;

    if (data) {

      allReviews.unshift(data);

    }

    if (msg) {

      msg.textContent =
        '✓ Votre avis a été publié !';

      msg.style.color =
        'var(--success)';

    }

    e.currentTarget.reset();

    selectedRating =
      0;

    if ($('reviewRating')) {
      $('reviewRating').value = '0';
    }

    document
      .querySelectorAll('.star-button')
      .forEach(star =>
        star.classList.remove('active')
      );

    if (selectedReviewGame) {

      renderReviews(
        selectedReviewGame
      );

    }

    renderGames();

  } catch (error) {

    console.error(
      'Erreur ajout avis :',
      error
    );

    if (msg) {

      if (error.code === '23505') {

        msg.textContent =
          'Vous avez déjà laissé un avis pour ce jeu.';

      } else {

        msg.textContent =
          'Erreur : ' +
          error.message;

      }

      msg.style.color =
        'var(--danger)';

    }

  } finally {

    if (submitBtn) {
      submitBtn.disabled = false;
    }

  }

}

// =========================================================
// LISTENERS
// =========================================================

function setupEventListeners() {

  // -------------------------------------------------------
  // FILTRES
  // -------------------------------------------------------

  [
    'search',
    'category',
    'players',
    'sort'
  ].forEach(id => {

    $(id)?.addEventListener(
      'input',
      renderGames
    );

    $(id)?.addEventListener(
      'change',
      renderGames
    );

  });

  // -------------------------------------------------------
  // FERMETURE MODALES
  // -------------------------------------------------------

  document
    .querySelectorAll('[data-close]')
    .forEach(button => {

      button.onclick = () => {

        const targetId =
          button.dataset.close;

        $(targetId)
          ?.classList.add('hidden');

      };

    });

  // -------------------------------------------------------
  // CALENDRIER
  // -------------------------------------------------------

  $('prevMonthBtn')
    ?.addEventListener(
      'click',
      () => {

        currentCalendarDate.setMonth(
          currentCalendarDate.getMonth() - 1
        );

        renderCalendar();

      }
    );

  $('nextMonthBtn')
    ?.addEventListener(
      'click',
      () => {

        currentCalendarDate.setMonth(
          currentCalendarDate.getMonth() + 1
        );

        renderCalendar();

      }
    );

  // -------------------------------------------------------
  // ÉTOILES
  // -------------------------------------------------------

  document
    .querySelectorAll('.star-button')
    .forEach(star => {

      star.addEventListener(
        'click',
        () => {

          setReviewRating(
            star.dataset.rating
          );

        }
      );

    });

  // -------------------------------------------------------
  // FORMULAIRE AVIS
  // -------------------------------------------------------

  $('reviewForm')
    ?.addEventListener(
      'submit',
      submitReview
    );

  // -------------------------------------------------------
  // NOTIFICATIONS
  // -------------------------------------------------------

  $('notifBtn')
    ?.addEventListener(
      'click',
      () => {

        if (!currentUser) {

          $('authModal')
            ?.classList.remove('hidden');

          return;

        }

        $('notifModal')
          ?.classList.remove('hidden');

        loadUserNotifications();

      }
    );

  // -------------------------------------------------------
  // RÉSERVATION
  // -------------------------------------------------------

  $('reservationForm')
    ?.addEventListener(
      'submit',
      handleBookingSubmit
    );

  $('noticeAuthBtn')
    ?.addEventListener(
      'click',
      () => {

        $('authModal')
          ?.classList.remove('hidden');

      }
    );

  // -------------------------------------------------------
  // AJOUT D'UN JEU — ADMIN
  // -------------------------------------------------------

  $('addGameForm')
    ?.addEventListener(
      'submit',
      async e => {

        e.preventDefault();

        const msg =
          $('addGameMsg');

        if (
          !isAdminEmail(
            currentUser?.email
          )
        ) {

          if (msg) {

            msg.textContent =
              'Accès réservé aux administrateurs.';

            msg.style.color =
              'var(--danger)';

          }

          return;

        }

        const submitBtn =
          e.currentTarget.querySelector(
            'button[type="submit"]'
          );

        if (submitBtn) {
          submitBtn.disabled = true;
        }

        try {

          const f =
            new FormData(
              e.currentTarget
            );

          const newGame = {

            id:
              crypto.randomUUID(),

            name:
              String(
                f.get('name') || ''
              ).trim(),

            publisher:
              String(
                f.get('publisher') || ''
              ).trim(),

            category:
              String(
                f.get('category') || ''
              ).trim() || null,

            cover_image:
              String(
                f.get('cover_image') || ''
              ).trim() || null,

            players_min:
              Number(
                f.get('players_min')
              ) || null,

            players_max:
              Number(
                f.get('players_max')
              ) || null,

            duration:
              Number(
                f.get('duration')
              ) || null,

            description:
              String(
                f.get('description') || ''
              ).trim() || null,

            is_active:
              true

          };

          const {
            error
          } = await supabase
            .from('games')
            .insert(newGame);

          if (error) throw error;

          if (msg) {

            msg.textContent =
              '✓ Jeu ajouté !';

            msg.style.color =
              'var(--success)';

          }

          e.currentTarget.reset();

          await loadAdminGamesList();

          await loadGames();

        } catch (error) {

          console.error(
            'Erreur ajout jeu :',
            error
          );

          if (msg) {

            msg.textContent =
              'Erreur : ' +
              error.message;

            msg.style.color =
              'var(--danger)';

          }

        } finally {

          if (submitBtn) {
            submitBtn.disabled = false;
          }

        }

      }
    );

  // -------------------------------------------------------
  // CONNEXION
  // -------------------------------------------------------

  $('loginForm')
    ?.addEventListener(
      'submit',
      async e => {

        e.preventDefault();

        const msg =
          $('loginMsg');

        const submitBtn =
          e.currentTarget.querySelector(
            'button[type="submit"]'
          );

        if (msg) {

          msg.textContent =
            'Connexion en cours…';

          msg.style.color =
            'var(--muted)';

        }

        if (submitBtn) {
          submitBtn.disabled = true;
        }

        try {

          const {
            error
          } = await supabase.auth
            .signInWithPassword({

              email:
                $('loginEmail')
                  .value
                  .trim(),

              password:
                $('loginPassword')
                  .value

            });

          if (error) throw error;

          if (msg) {

            msg.textContent = '';

            msg.style.color = '';

          }

          e.currentTarget.reset();

          $('authModal')
            ?.classList.add('hidden');

        } catch (error) {

          console.error(
            'Erreur connexion :',
            error
          );

          if (msg) {

            msg.textContent =
              error.message ===
              'Invalid login credentials'

                ? 'E-mail ou mot de passe incorrect.'

                : 'Erreur de connexion : ' +
                  error.message;

            msg.style.color =
              'var(--danger)';

          }

        } finally {

          if (submitBtn) {
            submitBtn.disabled = false;
          }

        }

      }
    );

  // -------------------------------------------------------
  // INSCRIPTION
  // -------------------------------------------------------

  $('signupForm')
    ?.addEventListener(
      'submit',
      async e => {

        e.preventDefault();

        const msg =
          $('signupMsg');

        const submitBtn =
          e.currentTarget.querySelector(
            'button[type="submit"]'
          );

        if (msg) {

          msg.textContent =
            'Création du compte…';

          msg.style.color =
            'var(--muted)';

        }

        if (submitBtn) {
          submitBtn.disabled = true;
        }

        try {

          const email =
            $('signupEmail')
              .value
              .trim();

          const password =
            $('signupPassword')
              .value;

          const firstName =
            $('signupFirst')
              .value
              .trim();

          const lastName =
            $('signupLast')
              .value
              .trim();

          const {
            error
          } = await supabase.auth
            .signUp({

              email:
                email,

              password:
                password,

              options: {

                data: {

                  first_name:
                    firstName,

                  last_name:
                    lastName

                }

              }

            });

          if (error) throw error;

          if (msg) {

            msg.textContent =
              '✓ Compte créé ! Vérifiez votre boîte mail si une confirmation est requise.';

            msg.style.color =
              'var(--success)';

          }

          e.currentTarget.reset();

        } catch (error) {

          console.error(
            'Erreur inscription :',
            error
          );

          if (msg) {

            msg.textContent =
              'Erreur : ' +
              error.message;

            msg.style.color =
              'var(--danger)';

          }

        } finally {

          if (submitBtn) {
            submitBtn.disabled = false;
          }

        }

      }
    );

}
