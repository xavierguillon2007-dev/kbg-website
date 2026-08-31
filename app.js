import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// =========================================================
// SUPABASE
// =========================================================

const SUPABASE_URL =
  'https://qqelmmygalllmxinaxrf.supabase.co';

const SUPABASE_KEY =
  'sb_publishable_fqFvZNetzIdAfX860bmjBQ_GzJfeVK3';

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


// =========================================================
// ADMIN
// =========================================================

const ADMIN_EMAILS = [
  'xavierguillon2007@gmail.com',
  'kbg.asso@gmail.com'
];

function isAdminEmail(email) {
  return !!email &&
    ADMIN_EMAILS.includes(
      email.toLowerCase().trim()
    );
}


// =========================================================
// VARIABLES
// =========================================================

let allGames = [];
let allReviews = [];
let allEvents = [];

let currentUser = null;

let currentCalendarDate = new Date();

let selectedReviewGame = null;
let selectedRating = 0;
// =========================================================
// CALENDRIER DE DISPONIBILITÉ PAR JEU
// =========================================================

let gameAvailabilityMonth = new Date();
let gameAvailabilityReservations = [];
let gameAvailabilityStart = null;
let gameAvailabilityEnd = null;
// Affichage limité du catalogue
const GAMES_PREVIEW_LIMIT = 8;
let showAllGames = false;


// =========================================================
// OUTILS
// =========================================================

const $ = id => document.getElementById(id);

function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char])
  );
}


// =========================================================
// PROFIL
// =========================================================

function getUserProfile() {

  if (!currentUser) {
    return {
      firstName: '',
      lastName: '',
      promotion: ''
    };
  }

  const metadata =
    currentUser.user_metadata || {};

  return {
    firstName:
      String(
        metadata.first_name || ''
      ).trim(),

    lastName:
      String(
        metadata.last_name || ''
      ).trim(),

    promotion:
      String(
        metadata.promotion || ''
      ).trim()
  };
}


function hasCompleteProfile() {

  const profile =
    getUserProfile();

  return !!(
    profile.firstName &&
    profile.lastName &&
    profile.promotion
  );
}


async function ensureUserProfile() {

  if (!currentUser) {
    return false;
  }

  if (hasCompleteProfile()) {
    return true;
  }

  const modal =
    $('profileModal');

  const firstInput =
    $('profileFirstName');

  const lastInput =
    $('profileLastName');

  const promotionInput =
    $('profilePromotion');

  const profile =
    getUserProfile();

  if (firstInput) {
    firstInput.value =
      profile.firstName;
  }

  if (lastInput) {
    lastInput.value =
      profile.lastName;
  }

  if (promotionInput) {
    promotionInput.value =
      profile.promotion;
  }

  modal?.classList.remove('hidden');

  return false;
}


// =========================================================
// INITIALISATION
// =========================================================

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    setupEventListeners();

    try {

      const {
        data,
        error
      } =
        await supabase.auth.getSession();

      if (error) {
        console.error(
          'Erreur récupération session :',
          error
        );
      }

      currentUser =
        data?.session?.user || null;

      await handleAuthChange(
        currentUser
      );

    } catch (error) {

      console.error(
        'Erreur initialisation Auth :',
        error
      );

    }

   await loadGames();
await renderCalendar();
await loadNextEvent();

  }
);


// =========================================================
// AUTH
// =========================================================

supabase.auth.onAuthStateChange(
  async (_event, session) => {

    currentUser =
      session?.user || null;

    await handleAuthChange(
      currentUser
    );

  }
);


async function handleAuthChange(user) {

  currentUser = user;

  const userNav =
    $('userNav');

  const authWarning =
    $('authWarning');

  const notifBadge =
    $('notifBadge');


  if (currentUser) {

    const admin =
      isAdminEmail(
        currentUser.email
      );

    if (userNav) {

      const profile =
        getUserProfile();

      const displayName =
        profile.firstName ||
        currentUser.email;

      userNav.innerHTML = `

        <span
          style="
            font-size:13px;
            font-weight:700;
          "
        >
          👋 ${esc(displayName)}
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

      $('logoutBtn')
        ?.addEventListener(
          'click',
          async () => {

            if (notificationsChannel) {
              await supabase.removeChannel(notificationsChannel);
              notificationsChannel = null;
              notificationRealtimeStartedFor = null;
            }

            const {
              error
            } =
              await supabase.auth.signOut();

            if (error) {
              console.error(
                'Erreur déconnexion :',
                error
              );
            }

          }
        );


      if (admin) {

        $('openAdminBtn')
          ?.addEventListener(
            'click',
            async () => {

              $('adminModal')
                ?.classList.remove('hidden');

              await loadAdminPanel();

            }
          );

      }

    }

    authWarning
      ?.classList.add('hidden');

    await loadUserNotifications(false);
    startNotificationRealtime();
    await refreshNotificationBadge();

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

      $('openAuthBtn')
        ?.addEventListener(
          'click',
          () => {

            $('authModal')
              ?.classList.remove('hidden');

          }
        );

    }

    authWarning
      ?.classList.remove('hidden');

    updateNotificationBadge(0);
    notificationRealtimeStartedFor = null;

  }

  renderGames();

}


// =========================================================
// ENREGISTREMENT PROFIL
// =========================================================

async function submitProfile(e) {

  e.preventDefault();

  const msg =
    $('profileMsg');

  const firstName =
    String(
      $('profileFirstName')?.value || ''
    ).trim();

  const lastName =
    String(
      $('profileLastName')?.value || ''
    ).trim();

  const promotion =
    String(
      $('profilePromotion')?.value || ''
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


  try {

    const {
      data,
      error
    } =
      await supabase.auth.updateUser({

        data: {

          ...(currentUser.user_metadata || {}),

          first_name:
            firstName,

          last_name:
            lastName,

          promotion:
            promotion

        }

      });


    if (error) {
      throw error;
    }


    currentUser =
      data.user;


    if (msg) {

      msg.textContent =
        '✓ Profil enregistré.';

      msg.style.color =
        'var(--success)';

    }


    setTimeout(
      () => {

        $('profileModal')
          ?.classList.add('hidden');

        if (msg) {
          msg.textContent = '';
        }

      },
      500
    );


    await handleAuthChange(
      currentUser
    );


  } catch (error) {

    console.error(
      'Erreur profil :',
      error
    );

    if (msg) {

      msg.textContent =
        'Erreur : ' +
        error.message;

      msg.style.color =
        'var(--danger)';

    }

  }

}


// =========================================================
// NOTIFICATIONS
// =========================================================

let notificationsChannel = null;
let notificationRealtimeStartedFor = null;

function updateNotificationBadge(count) {
  const badge = $('notifBadge');
  if (!badge) return;

  const safeCount = Math.max(0, Number(count) || 0);

  if (safeCount > 0) {
    badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '0';
    badge.classList.add('hidden');
  }
}

async function refreshNotificationBadge() {
  if (!currentUser) {
    updateNotificationBadge(0);
    return;
  }

  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', currentUser.id)
      .is('read_at', null);

    if (error) throw error;
    updateNotificationBadge(count || 0);
  } catch (error) {
    console.error('Erreur compteur notifications :', error);
    updateNotificationBadge(0);
  }
}

function startNotificationRealtime() {
  if (!currentUser) return;

  if (notificationRealtimeStartedFor === currentUser.id) return;

  if (notificationsChannel) {
    supabase.removeChannel(notificationsChannel);
    notificationsChannel = null;
  }

  notificationRealtimeStartedFor = currentUser.id;

  notificationsChannel = supabase
    .channel(`user-notifications-${currentUser.id}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${currentUser.id}`
      },
      async () => {
        // Une nouvelle action concernant l'utilisateur : le compteur
        // est recalculé depuis Supabase plutôt que simplement incrémenté,
        // ce qui évite les doubles comptages après un rafraîchissement.
        await refreshNotificationBadge();
        await loadUserNotifications(false);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        refreshNotificationBadge();
      }
    });
}

async function loadUserNotifications(markAsRead = false) {
  if (!currentUser) {
    updateNotificationBadge(0);
    return;
  }

  try {
    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const list = $('notifList');

    if (!notifications?.length) {
      if (list) {
        list.innerHTML = `
          <div class="empty">
            Vous n'avez aucune notification.
          </div>
        `;
      }
      updateNotificationBadge(0);
      return;
    }

    const unreadCount = notifications.filter(n => !n.read_at).length;

    // Lorsqu'on ouvre la cloche, toutes les notifications actuellement
    // présentes sont considérées comme vues.
    if (markAsRead && unreadCount > 0) {
      const { error: readError } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', currentUser.id)
        .is('read_at', null);

      if (readError) throw readError;

      notifications.forEach(n => {
        if (!n.read_at) n.read_at = new Date().toISOString();
      });
    }

    updateNotificationBadge(markAsRead ? 0 : unreadCount);

    if (!list) return;

    list.innerHTML = notifications.map(notification => {
      const metadata = notification.metadata || {};
      const type = notification.type || '';

      let icon = '🔔';
      if (type.startsWith('reservation')) icon = '🎲';
      if (type === 'account_status') icon = '👤';

      const isUnread = !notification.read_at && !markAsRead;

      return `
        <div
          class="panel"
          style="
            padding:12px;
            font-size:13px;
            border-left:3px solid ${isUnread ? 'var(--accent)' : 'var(--line)'};
            ${isUnread ? 'background:var(--surface,var(--bg));' : ''}
          "
        >
          <div style="display:flex;align-items:flex-start;gap:10px;">
            <span style="font-size:20px;line-height:1;">${icon}</span>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
                <strong>${esc(notification.title)}</strong>
                ${isUnread ? '<span class="badge badge-warning">Nouveau</span>' : ''}
              </div>
              <p style="margin-top:6px;line-height:1.5;">${esc(notification.message)}</p>
              <p style="color:var(--muted);font-size:11px;margin-top:7px;">
                ${formatNotificationDate(notification.created_at)}
              </p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Erreur notifications :', error);

    const list = $('notifList');
    if (list) {
      list.innerHTML = `
        <div class="empty">
          Impossible de charger les notifications.<br>
          <small>${esc(error?.message || error)}</small>
        </div>
      `;
    }
  }
}

function formatNotificationDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}


// =========================================================
// CALENDRIER
// =========================================================

async function renderCalendar() {

  const container = $('calendar');
  const label = $('currentMonthLabel');

  if (!container) return;

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  if (label) {
    label.textContent = currentCalendarDate.toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric'
    });
  }

  try {
    // IMPORTANT : ce calendrier affiche uniquement les EVENEMENTS.
    // Les réservations de jeux ne sont volontairement plus utilisées ici.
    const { data: events, error } = await supabase
      .from('events')
      .select('*');

    if (error) throw error;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Lundi = 0 ... Dimanche = 6
    let startOffset = firstDay.getDay() - 1;
    if (startOffset === -1) startOffset = 6;

    const dayEventsMap = {};
    const monthEvents = Array.isArray(events) ? events : [];

    let html = '';

    for (let i = 0; i < startOffset; i++) {
      html += `
        <div class="cal-day" style="opacity:0.15;background:transparent;border:1px dashed var(--line);"></div>
      `;
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const dayEvents = monthEvents.filter(event => {
        const startValue = event.date || event.event_date || event.date_start || event.start_date;
        const endValue = event.date_end || event.end_date || startValue;

        if (!startValue) return false;

        const start = String(startValue).slice(0, 10);
        const end = String(endValue || startValue).slice(0, 10);

        return dateStr >= start && dateStr <= end;
      });

      dayEventsMap[dateStr] = dayEvents;

      html += `
        <div class="cal-day${dayEvents.length ? ' has-events' : ''}" data-date="${dateStr}">
          <span class="cal-day-num">${day}</span>
          ${dayEvents.map(event => `
            <span class="cal-event" title="${esc(event.name || 'Événement')}">
              📅 ${esc(event.name || 'Événement')}
            </span>
          `).join('')}
        </div>
      `;
    }

    container.innerHTML = html;

    container.querySelectorAll('.cal-day.has-events').forEach(dayEl => {
      dayEl.addEventListener('click', () => {
        openDayModal(dayEl.dataset.date, dayEventsMap[dayEl.dataset.date] || []);
      });
    });

  } catch (error) {
    console.error('Erreur calendrier événements :', error);
    container.innerHTML = `
      <div class="empty panel" style="grid-column:1/-1;">
        Impossible de charger les événements.
        <br>
        <small>${esc(error?.message || error)}</small>
      </div>
    `;
  }

}


// =========================================================
// MODALE JOUR — ÉVÉNEMENTS UNIQUEMENT
// =========================================================

function openDayModal(dateStr, events) {

  const modal = $('dayModal');
  const title = $('dayModalTitle');
  const list = $('dayModalList');

  if (!modal || !list) return;

  const date = new Date(dateStr + 'T00:00:00');

  if (title) {
    let label = date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    title.textContent = label.charAt(0).toUpperCase() + label.slice(1);
  }

  if (!events.length) {
    list.innerHTML = '<div class="empty">Aucun événement ce jour-là.</div>';
  } else {
    list.innerHTML = events.map(event => `
      <div class="panel" style="padding:12px;font-size:13px;">
        <strong>${esc(event.name || 'Événement')}</strong>
        ${event.organizers ? `<p style="color:var(--muted);font-size:12px;margin-top:4px;">Organisé par : ${esc(event.organizers)}</p>` : ''}
        ${event.short_description || event.description ? `<p style="margin-top:6px;font-size:12px;">${esc(event.short_description || event.description)}</p>` : ''}
      </div>
    `).join('');
  }

  modal.classList.remove('hidden');
}


// =========================================================
// CATALOGUE
// =========================================================

// =========================================================
// CATALOGUE
// =========================================================
// =========================================================
// PROCHAIN ÉVÉNEMENT — ACCUEIL
// =========================================================

async function loadNextEvent() {

  try {

    const {
      data: events,
      error
    } = await supabase
      .from('events')
      .select('*')
      .order('date', {
        ascending: true
      });


    if (error) {
      throw error;
    }


    allEvents =
      Array.isArray(events)
        ? events
        : [];


    renderNextEvent();


  } catch (error) {

    console.error(
      'Erreur chargement événements :',
      error
    );

  }

}


// =========================================================
// TROUVER LE PROCHAIN ÉVÉNEMENT
// =========================================================

function getNextEvent() {

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingEvents = allEvents
    .filter(event => {
      const value = event.date || event.event_date || event.date_start || event.start_date;
      if (!value) return false;

      const eventDate = new Date(String(value).slice(0, 10) + 'T00:00:00');
      return !Number.isNaN(eventDate.getTime()) && eventDate >= today;
    })
    .sort((a, b) => {
      const aValue = a.date || a.event_date || a.date_start || a.start_date;
      const bValue = b.date || b.event_date || b.date_start || b.start_date;
      return new Date(String(aValue).slice(0, 10) + 'T00:00:00') -
             new Date(String(bValue).slice(0, 10) + 'T00:00:00');
    });

  return upcomingEvents[0] || null;
}


// =========================================================
// FORMATAGE DATE ÉVÉNEMENT
// =========================================================

function formatEventDate(dateString) {

  if (!dateString) {
    return '';
  }


  const date =
    new Date(
      `${dateString}T00:00:00`
    );


  if (isNaN(date.getTime())) {
    return dateString;
  }


  return date.toLocaleDateString(
    'fr-FR',
    {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }
  );

}


// =========================================================
// CRÉATION DU CADRE DANS LE HERO
// =========================================================

function renderNextEvent() {

  // Le cadre existe déjà dans index.html (#featuredEvent).
  // On le remplit au lieu de créer un second cadre dans le hero.
  const card = $('featuredEvent');
  if (!card) return;

  const image = $('featuredEventImage');
  const placeholder = $('featuredEventPlaceholder');
  const dateEl = $('featuredEventDate');
  const titleEl = $('featuredEventTitle');
  const descriptionEl = $('featuredEventDescription');

  const nextEvent = getNextEvent();

  if (!nextEvent) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');

  const eventDate = nextEvent.date || nextEvent.event_date || nextEvent.date_start;

  if (dateEl) {
    dateEl.textContent = formatEventDate(eventDate);
  }

  if (titleEl) {
    titleEl.textContent = nextEvent.name || 'Événement';
  }

  if (descriptionEl) {
    descriptionEl.textContent =
      nextEvent.short_description ||
      nextEvent.description ||
      'Retrouvez toutes les informations sur cet événement.';
  }

  if (image && placeholder) {
    if (nextEvent.photo_url) {
      image.src = nextEvent.photo_url;
      image.alt = nextEvent.name || 'Événement';
      image.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      image.removeAttribute('src');
      image.alt = '';
      image.style.display = 'none';
      placeholder.style.display = 'flex';
    }
  }

  card.onclick = () => {
    window.location.href = 'events.html';
  };

}


function injectNextEventStyles() {

  if (
    $('nextEventStyles')
  ) {
    return;
  }


  const style =
    document.createElement('style');


  style.id =
    'nextEventStyles';


  style.textContent = `

    /* =========================================
       CADRE PROCHAIN ÉVÉNEMENT
       ========================================= */

    .next-event-card {

      width: min(
        380px,
        100%
      );

      flex-shrink: 0;

      background:
        var(--panel);

      border:
        1px solid var(--line);

      border-radius:
        12px;

      overflow:
        hidden;

      box-shadow:
        0 18px 50px
        rgba(0, 0, 0, 0.25);

      transition:
        transform .2s ease,
        border-color .2s ease;

      position:
        relative;

      z-index:
        2;

    }


    .next-event-card:hover {

      transform:
        translateY(-3px);

      border-color:
        var(--accent);

    }


    .next-event-label {

      padding:
        11px 14px;

      background:
        var(--accent);

      color:
        #fff;

      font-size:
        10px;

      font-weight:
        900;

      letter-spacing:
        .14em;

      text-transform:
        uppercase;

    }


    .next-event-image {

      width:
        100%;

      height:
        150px;

      overflow:
        hidden;

      background:
        var(--bg);

    }


    .next-event-image img {

      width:
        100%;

      height:
        100%;

      object-fit:
        cover;

      display:
        block;

    }


    .next-event-no-image {

      display:
        flex;

      align-items:
        center;

      justify-content:
        center;

      font-size:
        48px;

      color:
        var(--muted);

    }


    .next-event-content {

      padding:
        16px;

    }


    .next-event-date {

      margin:
        0 0 7px;

      color:
        var(--accent);

      font-size:
        12px;

      font-weight:
        800;

      text-transform:
        capitalize;

    }


    .next-event-content h3 {

      margin:
        0;

      font-size:
        21px;

      line-height:
        1.2;

      color:
        var(--text);

    }


    .next-event-description {

      margin:
        10px 0 0;

      color:
        var(--muted);

      font-size:
        13px;

      line-height:
        1.55;

      display:
        -webkit-box;

      -webkit-line-clamp:
        3;

      -webkit-box-orient:
        vertical;

      overflow:
        hidden;

    }


    .next-event-link {

      display:
        inline-block;

      margin-top:
        14px;

      color:
        var(--accent);

      font-size:
        12px;

      font-weight:
        800;

      text-decoration:
        none;

    }


    .next-event-link:hover {
      text-decoration:
        underline;
    }


    /* =========================================
       HERO
       ========================================= */

    .hero {

      display:
        flex;

      align-items:
        center;

      justify-content:
        space-between;

      gap:
        40px;

    }


    /* =========================================
       MOBILE
       ========================================= */

    @media (max-width: 800px) {

      .hero {

        flex-direction:
          column;

        align-items:
          stretch;

      }


      .next-event-card {

        width:
          100%;

        max-width:
          100%;

      }

    }

  `;


  document.head.appendChild(
    style
  );

}
async function loadGames() {

  const container =
    $('games');


  if (!container) {
    return;
  }


  container.innerHTML = `
    <div class="loading">
      Connexion au catalogue…
    </div>
  `;


  try {

    const {
      data,
      error
    } =
      await supabase
        .from('games')
        .select('*')
        .order('name');


    if (error) {
      throw error;
    }


    allGames =
      Array.isArray(data)
        ? data
        : [];


    const categories =
      [
        ...new Set(
          allGames
            .map(
              game => game.category
            )
            .filter(Boolean)
        )
      ].sort();


    if ($('category')) {

      $('category').innerHTML = `
        <option value="">
          Toutes les catégories
        </option>
      ` +
      categories.map(
        category => `
          <option value="${esc(category)}">
            ${esc(category)}
          </option>
        `
      ).join('');

    }


    if ($('gameSelect')) {

      $('gameSelect').innerHTML = `
        <option value="">
          Sélectionnez un jeu…
        </option>
      ` +
      allGames.map(
        game => `
          <option value="${esc(game.id)}">
            ${esc(game.name)}
          </option>
        `
      ).join('');

    }


    await loadAllReviews();

    renderGames();


  } catch (error) {

    console.error(
      'Erreur chargement catalogue :',
      error
    );


    container.innerHTML = `
      <div
        class="empty panel"
        style="grid-column:1/-1;"
      >

        <strong>
          Impossible de charger le catalogue.
        </strong>

        <br><br>

        <small>
          ${esc(
            error.message ||
            'Erreur inconnue'
          )}
        </small>

      </div>
    `;


    if ($('count')) {
      $('count').textContent =
        'Erreur';
    }

  }

}


// =========================================================
// AVIS
// =========================================================

async function loadAllReviews() {

  try {

    const {
      data,
      error
    } =
      await supabase
        .from('game_reviews')
        .select('*')
        .order(
          'created_at',
          {
            ascending: false
          }
        );


    if (error) {
      throw error;
    }


    allReviews =
      data || [];


  } catch (error) {

    console.error(
      'Erreur chargement avis :',
      error
    );

    allReviews = [];

  }

}


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


  if (!reviews.length) {
    return 0;
  }


  return (
    reviews.reduce(
      (sum, review) =>
        sum +
        Number(review.rating || 0),
      0
    ) /
    reviews.length
  );

}


// =========================================================
// RENDU CATALOGUE
// =========================================================

function renderGames() {

  const container =
    $('games');


  if (!container) {
    return;
  }


  const query =
    $('search')?.value
      .toLowerCase()
      .trim() || '';


  const category =
    $('category')?.value || '';


  const minPlayers =
    Number(
      $('players')?.value || 0
    );


  const sortBy =
    $('sort')?.value || 'name';


  let games =
    allGames.filter(
      game => {

        const searchText = `
          ${game.name || ''}
          ${game.publisher || ''}
          ${game.category || ''}
        `.toLowerCase();


        return (
          (!query ||
            searchText.includes(query))
          &&
          (!category ||
            game.category === category)
          &&
          (!minPlayers ||
            Number(game.players_max || 0) >= minPlayers)
        );

      }
    );


  if (sortBy === 'duration') {

    games.sort(
      (a, b) =>
        Number(a.duration || 0) -
        Number(b.duration || 0)
    );

  } else if (sortBy === 'players') {

    games.sort(
      (a, b) =>
        Number(b.players_max || 0) -
        Number(a.players_max || 0)
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
        String(a.name || '')
          .localeCompare(
            String(b.name || ''),
            'fr'
          )
    );

  }


  if ($('count')) {
    $('count').textContent =
      `${games.length} jeu(x)`;
  }


  if (!games.length) {

    container.innerHTML = `
      <div
        class="empty panel"
        style="grid-column:1/-1;"
      >
        Aucun jeu trouvé.
      </div>
    `;

    $('catalogueToggle')
      ?.style.setProperty('display', 'none');

    return;

  }


  const hasMore =
    games.length > GAMES_PREVIEW_LIMIT;

  const displayGames =
    (!hasMore || showAllGames)
      ? games
      : games.slice(0, GAMES_PREVIEW_LIMIT);


  const toggleWrapper =
    $('catalogueToggle');

  const toggleBtn =
    $('showAllGamesBtn');

  const toggleArrow =
    $('showAllGamesArrow');

  const toggleText =
    $('showAllGamesText');


  if (toggleWrapper) {

    toggleWrapper.style.display =
      hasMore ? 'flex' : 'none';

  }


  if (hasMore && toggleBtn) {

    toggleBtn.setAttribute(
      'aria-expanded',
      String(showAllGames)
    );

    if (toggleArrow) {
      toggleArrow.textContent =
        showAllGames ? '↑' : '↓';
    }

    if (toggleText) {
      toggleText.textContent =
        showAllGames
          ? 'Réduire la liste'
          : `Afficher tous les jeux (${games.length})`;
    }

    toggleBtn.onclick = () => {
      showAllGames = !showAllGames;
      renderGames();

      if (!showAllGames) {
        container.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    };

  }


  container.innerHTML =
    displayGames.map(
      game => {

        const reviews =
          getGameReviews(game.id);

        const average =
          getAverageRating(game.id);


        let ratingHTML = '';


        if (reviews.length) {

          const rounded =
            Math.max(
              0,
              Math.min(
                5,
                Math.round(average)
              )
            );


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
                ${'★'.repeat(rounded)}

                <span style="color:var(--line);">
                  ${'★'.repeat(5 - rounded)}
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
            title="Voir le jeu et les avis"
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
                ${esc(
                  game.category || 'Jeu'
                )}
              </p>

              <h3>
                ${esc(game.name)}
              </h3>

              <p class="publisher">
                ${esc(game.publisher || '')}
              </p>

              <div class="meta">

                <span>
                  ♙
                  ${game.players_min || '?'}-
                  ${game.players_max || '?'}
                  joueurs
                </span>

                <span>
                  ◷
                  ${game.duration || '?'}
                  min
                </span>

              </div>

              ${ratingHTML}

              <p
                class="desc"
                style="
                  display:-webkit-box;
                  -webkit-line-clamp:3;
                  -webkit-box-orient:vertical;
                  overflow:hidden;
                "
              >
                ${esc(
                  game.description ||
                  'Aucune description disponible.'
                )}
              </p>

              <p
                style="
                  color:#2583ff;
                  font-size:12px;
                  margin-top:10px;
                  font-weight:700;
                "
              >
                Voir la fiche complète et les avis →
              </p>

            </div>

          </article>

        `;

      }
    ).join('');


  container
    .querySelectorAll(
      '[data-review-game]'
    )
    .forEach(
      card => {

        card.addEventListener(
          'click',
          () => {

            const game =
              allGames.find(
                g =>
                  String(g.id) ===
                  String(
                    card.dataset.reviewGame
                  )
              );

            if (game) {
              openReviewModal(game);
            }

          }
        );

      }
    );

}

// =========================================================
// CALENDRIER DE DISPONIBILITÉ PAR JEU
// =========================================================

function parseISODate(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}


function isDateBeforeToday(dateStr) {

  const today = new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  return parseISODate(dateStr) < today;

}


function isDateReserved(dateStr) {

  return gameAvailabilityReservations.some(
    reservation =>
      dateStr >= reservation.date_start &&
      dateStr <= reservation.date_end
  );

}


function rangeContainsReservation(start, end) {

  return gameAvailabilityReservations.some(
    reservation =>
      reservation.date_start <= end &&
      reservation.date_end >= start
  );

}


function isDateInSelectedRange(dateStr) {

  if (!gameAvailabilityStart) {
    return false;
  }

  if (!gameAvailabilityEnd) {
    return dateStr === gameAvailabilityStart;
  }

  return (
    dateStr >= gameAvailabilityStart &&
    dateStr <= gameAvailabilityEnd
  );

}


function injectGameCalendarStyles() {

  if ($('gameAvailabilityStyles')) {
    return;
  }

  const style =
    document.createElement('style');

  style.id =
    'gameAvailabilityStyles';

  style.textContent = `

    .game-cal-shell {
      border:1px solid var(--line);
      border-radius:10px;
      overflow:hidden;
      background:var(--bg);
    }

    .game-cal-header {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      padding:10px 12px;
      border-bottom:1px solid var(--line);
    }

    .game-cal-title {
      font-size:14px;
      font-weight:800;
      text-transform:capitalize;
    }

    .game-cal-nav {
      width:32px;
      height:32px;
      border:1px solid var(--line);
      border-radius:7px;
      background:transparent;
      color:var(--text);
      cursor:pointer;
      font-size:18px;
    }

    .game-cal-nav:hover {
      border-color:#2583ff;
      color:#2583ff;
    }

    .game-cal-grid {
      display:grid;
      grid-template-columns:
        repeat(7,minmax(0,1fr));
      gap:4px;
      padding:10px;
    }

    .game-cal-weekday {
      text-align:center;
      color:var(--muted);
      font-size:10px;
      font-weight:800;
      padding:4px 0 6px;
    }

    .game-cal-day {
      min-height:42px;
      border:1px solid var(--line);
      border-radius:7px;
      background:var(--bg);
      color:var(--text);
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:12px;
      font-weight:700;
      cursor:pointer;
      transition:
        transform .12s,
        border-color .12s;
    }

    .game-cal-day:hover:not(.disabled) {
      transform:translateY(-1px);
      border-color:#2583ff;
    }

    .game-cal-day.empty {
      visibility:hidden;
      cursor:default;
    }

    .game-cal-day.available {
      background:rgba(34,197,94,.16);
      border-color:rgba(34,197,94,.65);
    }

    .game-cal-day.reserved {
      background:rgba(239,68,68,.16);
      border-color:rgba(239,68,68,.65);
      cursor:not-allowed;
    }

    .game-cal-day.past {
      opacity:.35;
      cursor:not-allowed;
    }

    .game-cal-day.selected {
      outline:2px solid #2583ff;
      outline-offset:-2px;
      background:rgba(37,131,255,.20);
    }

    .game-cal-loading {
      padding:22px;
      text-align:center;
      color:var(--muted);
      font-size:13px;
    }

    @media(max-width:520px) {

      .game-cal-grid {
        gap:3px;
        padding:7px;
      }

      .game-cal-day {
        min-height:38px;
        font-size:11px;
      }

    }

  `;

  document.head.appendChild(style);

}


async function loadGameAvailability(
  game,
  monthDate = gameAvailabilityMonth
) {

  const container =
    $('gameAvailabilityCalendar');

  if (!container || !game) {
    return;
  }

  injectGameCalendarStyles();

  container.innerHTML = `
    <div class="game-cal-loading">
      Chargement des disponibilités…
    </div>
  `;

  try {

    const {
      data,
      error
    } =
      await supabase
        .from('reservations')
        .select(
          'id,date_start,date_end,status'
        )
        .eq(
          'game_id',
          game.id
        )
        .eq(
          'status',
          'approved'
        )
        .order(
          'date_start',
          {
            ascending:true
          }
        );

    if (error) {
      throw error;
    }

    gameAvailabilityReservations =
      data || [];

    gameAvailabilityMonth =
      new Date(
        monthDate.getFullYear(),
        monthDate.getMonth(),
        1
      );

    renderGameAvailabilityCalendar(
      game
    );

  } catch (error) {

    console.error(
      'Erreur calendrier du jeu :',
      error
    );

    container.innerHTML = `
      <div class="empty panel">

        Impossible de charger
        les disponibilités.

        <br>

        <small>
          ${esc(error.message)}
        </small>

      </div>
    `;

  }

}


function renderGameAvailabilityCalendar(game) {

  const container =
    $('gameAvailabilityCalendar');

  if (!container || !game) {
    return;
  }

  const year =
    gameAvailabilityMonth
      .getFullYear();

  const month =
    gameAvailabilityMonth
      .getMonth();

  const firstDay =
    new Date(
      year,
      month,
      1
    );

  const lastDay =
    new Date(
      year,
      month + 1,
      0
    );

  let offset =
    firstDay.getDay() - 1;

  if (offset === -1) {
    offset = 6;
  }

  const label =
    gameAvailabilityMonth
      .toLocaleDateString(
        'fr-FR',
        {
          month:'long',
          year:'numeric'
        }
      );

  let html = `

    <div class="game-cal-shell">

      <div class="game-cal-header">

        <button
          type="button"
          class="game-cal-nav"
          id="gameCalPrev"
          aria-label="Mois précédent"
        >
          ‹
        </button>

        <span class="game-cal-title">
          ${esc(label)}
        </span>

        <button
          type="button"
          class="game-cal-nav"
          id="gameCalNext"
          aria-label="Mois suivant"
        >
          ›
        </button>

      </div>

      <div class="game-cal-grid">

  `;


  for (
    const dayName of
    ['L','M','M','J','V','S','D']
  ) {

    html += `
      <div class="game-cal-weekday">
        ${dayName}
      </div>
    `;

  }


  for (
    let i = 0;
    i < offset;
    i++
  ) {

    html += `
      <div class="game-cal-day empty">
      </div>
    `;

  }


  for (
    let day = 1;
    day <= lastDay.getDate();
    day++
  ) {

    const dateStr =
      `${year}-${String(month + 1)
        .padStart(2,'0')}-${String(day)
        .padStart(2,'0')}`;

    const reserved =
      isDateReserved(dateStr);

    const past =
      isDateBeforeToday(dateStr);

    const selected =
      isDateInSelectedRange(
        dateStr
      );

    const disabled =
      reserved || past;

    const classes =
      [
        'game-cal-day',

        reserved
          ? 'reserved'
          : 'available',

        past
          ? 'past'
          : '',

        selected
          ? 'selected'
          : '',

        disabled
          ? 'disabled'
          : ''

      ]
      .filter(Boolean)
      .join(' ');


    html += `

      <button
        type="button"
        class="${classes}"
        data-game-cal-date="${dateStr}"
        ${disabled ? 'disabled' : ''}
        title="${
          reserved
            ? 'Réservé'
            : past
              ? 'Date passée'
              : 'Libre — cliquer pour sélectionner'
        }"
      >
        ${day}
      </button>

    `;

  }


  html += `

      </div>

    </div>

  `;


  container.innerHTML =
    html;


  $('gameCalPrev')
    ?.addEventListener(
      'click',
      async () => {

        gameAvailabilityMonth =
          new Date(
            year,
            month - 1,
            1
          );

        await loadGameAvailability(
          game,
          gameAvailabilityMonth
        );

      }
    );


  $('gameCalNext')
    ?.addEventListener(
      'click',
      async () => {

        gameAvailabilityMonth =
          new Date(
            year,
            month + 1,
            1
          );

        await loadGameAvailability(
          game,
          gameAvailabilityMonth
        );

      }
    );


  container
    .querySelectorAll(
      '[data-game-cal-date]:not([disabled])'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            selectGameAvailabilityDate(
              button.dataset.gameCalDate,
              game
            );

          }
        );

      }
    );

}


function selectGameAvailabilityDate(
  dateStr,
  game
) {

  if (
    isDateBeforeToday(dateStr) ||
    isDateReserved(dateStr)
  ) {
    return;
  }


  const startInput =
    $('dateStart');

  const endInput =
    $('dateEnd');

  const gameSelect =
    $('gameSelect');

  const msg =
    $('formMessage');


  if (gameSelect) {

    gameSelect.value =
      String(game.id);

  }


  /*
   * Premier clic :
   * sélection de la date de début.
   *
   * Deuxième clic :
   * sélection de la date de fin.
   */

  if (
    !gameAvailabilityStart ||
    gameAvailabilityEnd ||
    dateStr < gameAvailabilityStart
  ) {

    gameAvailabilityStart =
      dateStr;

    gameAvailabilityEnd =
      null;


    if (startInput) {
      startInput.value =
        dateStr;
    }

    if (endInput) {
      endInput.value =
        '';
    }


    if (msg) {

      msg.textContent =
        'Date de début sélectionnée. ' +
        'Cliquez sur une autre date verte ' +
        'pour choisir la fin.';

      msg.style.color =
        'var(--muted)';

    }

  } else {

    /*
     * Vérifie que toute la période
     * est libre.
     */

    if (
      rangeContainsReservation(
        gameAvailabilityStart,
        dateStr
      )
    ) {

      if (msg) {

        msg.textContent =
          'Cette période contient une date déjà réservée. ' +
          'Choisissez une autre date de fin.';

        msg.style.color =
          'var(--danger)';

      }

      return;

    }


    gameAvailabilityEnd =
      dateStr;


    if (startInput) {

      startInput.value =
        gameAvailabilityStart;

    }

    if (endInput) {

      endInput.value =
        gameAvailabilityEnd;

    }


    if (msg) {

      msg.textContent =
        'Période sélectionnée. ' +
        'Vous pouvez envoyer la demande de réservation.';

      msg.style.color =
        'var(--success)';

    }

  }


  renderGameAvailabilityCalendar(
    game
  );


  if (
    gameAvailabilityStart &&
    gameAvailabilityEnd
  ) {

    $('reservationForm')
      ?.scrollIntoView({
        behavior:'smooth',
        block:'center'
      });

  }

}


function resetGameAvailabilitySelection() {

  gameAvailabilityStart =
    null;

  gameAvailabilityEnd =
    null;

}
// =========================================================
// MODALE JEU
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


  if (!modal || !header) {
    return;
  }


  if ($('reviewGameId')) {
    $('reviewGameId').value =
      game.id;
  }

  if ($('reviewRating')) {
    $('reviewRating').value =
      '0';
  }

  if ($('ratingHelp')) {
    $('ratingHelp').textContent =
      'Sélectionnez une note de 1 à 5 étoiles.';
  }


  document
    .querySelectorAll('.star-button')
    .forEach(
      star =>
        star.classList.remove('active')
    );


  const profile =
    getUserProfile();


  const authorName =
    profile.firstName || profile.lastName
      ? `${profile.firstName} ${profile.lastName}`.trim()
      : 'Profil incomplet';


  if ($('reviewAuthorName')) {
    $('reviewAuthorName').textContent =
      authorName;
  }


  const description =
    game.description
      ? esc(game.description)
      : 'Aucune description disponible pour ce jeu.';


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
                flex-shrink:0;
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
                flex-shrink:0;
              "
            >
              ✦
            </div>
          `
      }

      <div style="min-width:0;">

        <p class="eyebrow">
          FICHE DU JEU
        </p>

        <h2 style="margin-top:4px;">
          ${esc(game.name)}
        </h2>

        ${
          game.publisher
            ? `
              <p
                style="
                  color:var(--muted);
                  font-size:13px;
                  margin-top:4px;
                "
              >
                ${esc(game.publisher)}
              </p>
            `
            : ''
        }

        <div
          id="reviewAverage"
          style="margin-top:6px;"
        ></div>

      </div>

    </div>


    <div
      style="
        margin-top:22px;
        padding:16px;
        background:var(--bg);
        border:1px solid var(--line);
        border-radius:8px;
      "
    >

      <p
        class="eyebrow"
        style="margin-bottom:8px;"
      >
        DESCRIPTION
      </p>

      <p
        style="
          font-size:14px;
          line-height:1.7;
          color:var(--text);
          white-space:pre-wrap;
          overflow-wrap:anywhere;
        "
      >
        ${description}
      </p>

    </div>


    <div
      style="
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        margin-top:12px;
      "
    >

      ${
        game.category
          ? `
            <span class="badge">
              ${esc(game.category)}
            </span>
          `
          : ''
      }

      <span class="badge">
        ♙
        ${game.players_min || '?'}-
        ${game.players_max || '?'}
        joueurs
      </span>

      <span class="badge">
        ◷
        ${game.duration || '?'}
        min
      </span>

    </div>

  `;


  renderReviews(game);

resetGameAvailabilitySelection();

gameAvailabilityMonth =
  new Date();

loadGameAvailability(
  game,
  gameAvailabilityMonth
);

modal.classList.remove('hidden');

}


// =========================================================
// AFFICHAGE AVIS
// =========================================================

function renderReviews(game) {

  const list =
    $('reviewsList');


  if (!list) {
    return;
  }


  const reviews =
    getGameReviews(game.id);

  const average =
    getAverageRating(game.id);

  const averageContainer =
    $('reviewAverage');


  if (averageContainer) {

    if (reviews.length) {

      const rounded =
        Math.max(
          0,
          Math.min(
            5,
            Math.round(average)
          )
        );


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
    reviews.map(
      review => {

        const admin =
          isAdminEmail(
            currentUser?.email
          );


        const rating =
          Math.max(
            0,
            Math.min(
              5,
              Number(review.rating || 0)
            )
          );


        return `

          <div class="review-card">

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

                ${
                  review.promotion
                    ? `
                      <span
                        style="
                          color:var(--muted);
                          font-size:12px;
                          margin-left:5px;
                        "
                      >
                        ${esc(review.promotion)}
                      </span>
                    `
                    : ''
                }

              </div>

              <span
                class="review-stars"
                title="${rating}/5"
              >

                ${'★'.repeat(rating)}

                <span style="color:var(--line);">
                  ${'★'.repeat(5 - rating)}
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
                      overflow-wrap:anywhere;
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

      }
    ).join('');


  list
    .querySelectorAll(
      '[data-delete-review]'
    )
    .forEach(
      button => {

        button.onclick =
          async event => {

            event.stopPropagation();


            if (
              !isAdminEmail(
                currentUser?.email
              )
            ) {
              return;
            }


            if (
              !confirm(
                'Supprimer définitivement cet avis ?'
              )
            ) {
              return;
            }


            button.disabled =
              true;


            const {
              error
            } =
              await supabase
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

              button.disabled =
                false;

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

      }
    );

}


function formatReviewDate(date) {

  if (!date) {
    return '';
  }

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
// ÉTOILES
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
    .forEach(
      star => {

        const value =
          Number(
            star.dataset.rating
          );

        star.classList.toggle(
          'active',
          value <= selectedRating
        );

      }
    );


  if (help) {
    help.textContent =
      `${selectedRating}/5 étoiles`;
  }

}


// =========================================================
// ENVOI AVIS
// =========================================================

async function submitReview(e) {

  e.preventDefault();


  const form =
    e.currentTarget;

  const msg =
    $('reviewMsg');

  const submitBtn =
    form.querySelector(
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


  if (!hasCompleteProfile()) {

    $('reviewModal')
      ?.classList.add('hidden');

    await ensureUserProfile();

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


  const profile =
    getUserProfile();


  const reviewText =
    String(
      $('reviewText')?.value || ''
    ).trim();


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
    } =
      await supabase
        .from('game_reviews')
        .insert({

          game_id:
            selectedReviewGame.id,

          user_id:
            currentUser.id,

          first_name:
            profile.firstName,

          last_name:
            profile.lastName,

          promotion:
            profile.promotion,

          rating:
            selectedRating,

          review:
            reviewText || null

        })
        .select()
        .single();


    if (error) {
      throw error;
    }


    if (data) {
      allReviews.unshift(data);
    }


    if (msg) {

      msg.textContent =
        '✓ Votre avis a été publié !';

      msg.style.color =
        'var(--success)';

    }


    if ($('reviewText')) {
      $('reviewText').value = '';
    }


    selectedRating = 0;


    if ($('reviewRating')) {
      $('reviewRating').value = '0';
    }


    document
      .querySelectorAll('.star-button')
      .forEach(
        star =>
          star.classList.remove('active')
      );


    renderReviews(
      selectedReviewGame
    );

    renderGames();


  } catch (error) {

    console.error(
      'Erreur ajout avis :',
      error
    );


    if (msg) {

      msg.textContent =
        error.code === '23505'
          ? 'Vous avez déjà laissé un avis pour ce jeu.'
          : 'Erreur : ' + error.message;

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
// RÉSERVATION — VERSION CORRIGÉE
// =========================================================

async function handleBookingSubmit(e) {

  e.preventDefault();


  // IMPORTANT :
  // On récupère explicitement le formulaire.
  // Cela évite l'erreur FormData que tu avais.

  const form =
    e.target instanceof HTMLFormElement
      ? e.target
      : e.currentTarget instanceof HTMLFormElement
        ? e.currentTarget
        : null;


  if (!form) {

    console.error(
      'Erreur réservation : le formulaire est introuvable.'
    );

    return;
  }


  const msg =
    $('formMessage');

  const submitBtn =
    form.querySelector(
      'button[type="submit"]'
    );


  if (!currentUser) {

    if (msg) {

      msg.textContent =
        'Vous devez être connecté pour effectuer une réservation.';

      msg.style.color =
        'var(--danger)';

    }

    $('authModal')
      ?.classList.remove('hidden');

    return;
  }


  // -------------------------------------------------------
  // PROFIL OBLIGATOIRE
  // -------------------------------------------------------

  if (!hasCompleteProfile()) {

    if (msg) {

      msg.textContent =
        'Veuillez compléter votre profil avant de réserver.';

      msg.style.color =
        'var(--danger)';

    }

    await ensureUserProfile();

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

    // -----------------------------------------------------
    // LECTURE DES CHAMPS
    // -----------------------------------------------------

    const gameId =
      String(
        form.querySelector(
          '[name="game_id"]'
        )?.value || ''
      ).trim();


    const dateStart =
      String(
        form.querySelector(
          '[name="date_start"]'
        )?.value || ''
      ).trim();


    const dateEnd =
      String(
        form.querySelector(
          '[name="date_end"]'
        )?.value || ''
      ).trim();


    const profile =
      getUserProfile();


    // -----------------------------------------------------
    // VALIDATION
    // -----------------------------------------------------

    if (!gameId) {

      throw new Error(
        'Veuillez sélectionner un jeu.'
      );

    }


    if (!dateStart || !dateEnd) {

      throw new Error(
        'Veuillez sélectionner les dates de réservation.'
      );

    }


    if (!profile.firstName) {

      throw new Error(
        'Le prénom est obligatoire.'
      );

    }


    if (!profile.lastName) {

      throw new Error(
        'Le nom est obligatoire.'
      );

    }


    if (!profile.promotion) {

      throw new Error(
        'La promotion est obligatoire.'
      );

    }


    if (dateEnd < dateStart) {

      throw new Error(
        'La date de fin doit être postérieure ou égale à la date de début.'
      );

    }


    // -----------------------------------------------------
    // VÉRIFICATION DES DATES
    // -----------------------------------------------------

    const today =
      new Date();

    today.setHours(
      0,
      0,
      0,
      0
    );


    const startDateObject =
      new Date(
        dateStart + 'T00:00:00'
      );


    if (startDateObject < today) {

      throw new Error(
        'La date de début ne peut pas être dans le passé.'
      );

    }


    // -----------------------------------------------------
    // NOUVELLE RÉSERVATION
    // -----------------------------------------------------

    const newReservation = {

      id:
        crypto.randomUUID(),

      user_id:
        currentUser.id,

      game_id:
        gameId,

      date_start:
        dateStart,

      date_end:
        dateEnd,

      first_name:
        profile.firstName,

      last_name:
        profile.lastName,

      promotion:
        profile.promotion,

      status:
        'pending'

    };


    // -----------------------------------------------------
    // ENVOI SUPABASE
    // -----------------------------------------------------

    const {
      error
    } =
      await supabase
        .from('reservations')
        .insert(
          newReservation
        );


    if (error) {
      throw error;
    }


    // -----------------------------------------------------
    // SUCCÈS
    // -----------------------------------------------------

    if (msg) {

      msg.textContent =
        '✓ Demande enregistrée ! Elle sera examinée par un administrateur.';

      msg.style.color =
        'var(--success)';

    }


    form.reset();


    await loadUserNotifications();


    // Petit rafraîchissement du calendrier
    await renderCalendar();


  } catch (error) {

    console.error(
      'Erreur réservation :',
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


// =========================================================
// ADMIN
// =========================================================

async function loadAdminPanel() {

  if (!isAdminEmail(currentUser?.email)) {
    $('adminModal')?.classList.add('hidden');
    return;
  }

  // Chaque bloc est chargé indépendamment : une panne d'un bloc
  // ne doit pas laisser les autres en chargement infini.
  await loadAdminAccountRequests();
  await loadAdminGamesList();
  await loadAdminReservationsList();

}


// =========================================================
// ADMIN — DEMANDES DE COMPTES
// =========================================================

let currentAccountRequests = [];

async function loadAdminAccountRequests() {
  const container = $('adminPendingAccounts');
  if (!container) return;

  container.innerHTML = `
    <div class="loading">Chargement des demandes de validation…</div>
  `;

  try {
    const request = supabase
      .from('account_requests')
      .select('*')
      .order('created_at', { ascending: false });

    // Évite un écran de chargement permanent si la requête réseau bloque.
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Délai dépassé lors du chargement des demandes de comptes.')), 10000)
    );

    const { data, error } = await Promise.race([request, timeout]);

    if (error) throw error;

    currentAccountRequests = Array.isArray(data) ? data : [];
    renderAdminAccountRequests();
  } catch (error) {
    console.error('Erreur demandes de comptes admin :', error);
    container.innerHTML = `
      <div class="empty panel">
        <strong>Impossible de charger les demandes de validation.</strong>
        <br><br>
        <small>${esc(error?.message || 'Erreur inconnue')}</small>
      </div>
    `;
  }
}

function renderAdminAccountRequests() {
  const container = $('adminPendingAccounts');
  if (!container) return;

  const pending = currentAccountRequests.filter(
    request => request.status === 'pending'
  );

  if (!pending.length) {
    container.innerHTML = `
      <div class="empty panel">Aucune demande de compte en attente.</div>
    `;
    return;
  }

  container.innerHTML = pending.map(request => `
    <article class="panel admin-card">
      <div>
        <span class="badge badge-warning">En attente</span>
        <h3 style="margin-top:8px;">
          ${esc(request.first_name)} ${esc(request.last_name)}
        </h3>
        <p class="publisher">${esc(request.email)}</p>
      </div>
      <div class="admin-card-body">
        <p><strong>Promotion :</strong> ${esc(request.promotion)}</p>
        <p><strong>Demande créée :</strong> ${formatAdminAccountRequestDate(request.created_at)}</p>
      </div>
      <div class="admin-card-actions">
        <button class="button primary" data-admin-account-action="approved" data-request-id="${esc(request.id)}">✓ Valider</button>
        <button class="button danger" data-admin-account-action="rejected" data-request-id="${esc(request.id)}">✕ Refuser</button>
      </div>
    </article>
  `).join('');

  container.querySelectorAll('[data-admin-account-action]').forEach(button => {
    button.addEventListener('click', () =>
      handleAdminAccountDecision(
        button.dataset.requestId,
        button.dataset.adminAccountAction,
        button
      )
    );
  });
}

function formatAdminAccountRequestDate(value) {
  if (!value) return 'Date inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return date.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

async function handleAdminAccountDecision(requestId, decision, button) {
  const request = currentAccountRequests.find(
    item => String(item.id) === String(requestId)
  );

  if (!request || !['approved', 'rejected'].includes(decision)) {
    alert('Demande de compte invalide.');
    return;
  }

  const verb = decision === 'approved' ? 'valider' : 'refuser';
  if (!confirm(`Voulez-vous vraiment ${verb} le compte de ${request.first_name} ${request.last_name} ?`)) {
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '…';

  try {
    const { data, error } = await supabase.functions.invoke(
      'approve-account',
      {
        body: {
          request_id: request.id,
          action: decision
        }
      }
    );

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    alert(
      decision === 'approved'
        ? '✓ Compte validé avec succès.'
        : '✓ Compte refusé.'
    );

    await loadAdminAccountRequests();
  } catch (error) {
    console.error('Erreur validation compte :', error);
    alert('Erreur : ' + (error?.message || error));
    button.disabled = false;
    button.textContent = originalText;
  }
}


// =========================================================
// ADMIN — JEUX
// =========================================================

async function loadAdminGamesList() {

  const container =
    $('adminGamesList');


  if (!container) {
    return;
  }


  const {
    data: games,
    error
  } =
    await supabase
      .from('games')
      .select('*')
      .order('name');


  if (error) {

    console.error(
      'Erreur jeux admin :',
      error
    );


    container.innerHTML = `
      <div class="empty">
        Erreur de chargement.
        <br>
        <small>
          ${esc(error.message)}
        </small>
      </div>
    `;

    return;
  }


  container.innerHTML =
    (games || []).map(
      game => `

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

          <div style="display:flex; gap:6px; align-items:center;">

            <button
              class="button"
              data-edit-game="${esc(game.id)}"
              style="
                padding:2px 6px;
                font-size:10px;
              "
            >
              Modifier
            </button>

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

        </div>

      `
    ).join('');


  container
    .querySelectorAll(
      '[data-delete-game]'
    )
    .forEach(
      button => {

        button.onclick =
          async () => {

            if (
              !isAdminEmail(
                currentUser?.email
              )
            ) {
              return;
            }


            if (
              !confirm(
                'Supprimer ce jeu ?'
              )
            ) {
              return;
            }


            button.disabled = true;


            const {
              error
            } =
              await supabase
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

      }
    );

}


  // -------------------------------------------------------
  // MODIFICATION D'UN JEU
  // -------------------------------------------------------

  container
    .querySelectorAll('[data-edit-game]')
    .forEach(button => {

      button.onclick = () => {

        if (!isAdminEmail(currentUser?.email)) {
          return;
        }

        const game =
          games.find(
            item => String(item.id) === String(button.dataset.editGame)
          );

        if (game) {
          openEditGameModal(game);
        }

      };

    });


// =========================================================
// ADMIN — MODIFICATION D'UN JEU
// =========================================================

function openEditGameModal(game) {

  const modal = $('editGameAdminModal');
  const form = $('editGameAdminForm');

  if (!modal || !form) {
    console.error('Modale de modification du jeu introuvable.');
    return;
  }

  if (!isAdminEmail(currentUser?.email)) {
    return;
  }

  const setValue = (name, value) => {
    const field = form.querySelector(`[name="${name}"]`);
    if (field) field.value = value ?? '';
  };

  setValue('id', game.id);
  setValue('name', game.name);
  setValue('publisher', game.publisher);
  setValue('category', game.category);
  setValue('cover_image', game.cover_image);
  setValue('players_min', game.players_min);
  setValue('players_max', game.players_max);
  setValue('duration', game.duration);
  setValue('description', game.description);

  const msg = $('editGameAdminMsg');
  if (msg) {
    msg.textContent = '';
    msg.style.color = 'var(--muted)';
  }

  modal.classList.remove('hidden');
}

async function handleEditGameAdmin(event) {

  event.preventDefault();

  if (!isAdminEmail(currentUser?.email)) {
    return;
  }

  const form = event.currentTarget;
  const msg = $('editGameAdminMsg');
  const submitBtn = form.querySelector('button[type="submit"]');

  if (submitBtn) submitBtn.disabled = true;
  if (msg) {
    msg.textContent = 'Enregistrement…';
    msg.style.color = 'var(--muted)';
  }

  try {

    const formData = new FormData(form);
    const gameId = String(formData.get('id') || '').trim();
    const name = String(formData.get('name') || '').trim();

    if (!gameId) {
      throw new Error('Jeu introuvable.');
    }

    if (!name) {
      throw new Error('Le nom du jeu est obligatoire.');
    }

    const updatedGame = {
      name,
      publisher: String(formData.get('publisher') || '').trim(),
      category: String(formData.get('category') || '').trim() || null,
      cover_image: String(formData.get('cover_image') || '').trim() || null,
      players_min: Number(formData.get('players_min')) || null,
      players_max: Number(formData.get('players_max')) || null,
      duration: Number(formData.get('duration')) || null,
      description: String(formData.get('description') || '').trim() || null
    };

    const { error } = await supabase
      .from('games')
      .update(updatedGame)
      .eq('id', gameId);

    if (error) {
      throw error;
    }

    if (msg) {
      msg.textContent = '✓ Fiche du jeu mise à jour.';
      msg.style.color = 'var(--success)';
    }

    await loadAdminGamesList();
    await loadGames();

    setTimeout(() => {
      $('editGameAdminModal')?.classList.add('hidden');
    }, 500);

  } catch (error) {

    console.error('Erreur modification jeu :', error);

    if (msg) {
      msg.textContent = 'Erreur : ' + (error?.message || error);
      msg.style.color = 'var(--danger)';
    }

  } finally {

    if (submitBtn) submitBtn.disabled = false;

  }
}


// =========================================================
// ADMIN — RÉSERVATIONS
// =========================================================

async function loadAdminReservationsList() {

  const pendingContainer =
    $('adminPendingReservations');

  const processedContainer =
    $('adminProcessedReservations');


  if (
    !pendingContainer ||
    !processedContainer
  ) {
    return;
  }


  if (
    !isAdminEmail(
      currentUser?.email
    )
  ) {
    return;
  }


  const {
    data: reservations,
    error
  } =
    await supabase
      .from('reservations')
      .select('*, games(name)')
      .order(
        'created_at',
        {
          ascending: false
        }
      );


  if (error) {

    console.error(
      'Erreur réservations admin :',
      error
    );


    pendingContainer.innerHTML = `
      <div class="empty">
        Accès refusé ou erreur.
        <br>
        <small>
          ${esc(error.message)}
        </small>
      </div>
    `;

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


  pendingContainer.innerHTML =
    !pending.length

      ? `
        <div class="empty">
          Aucune demande en attente.
        </div>
      `

      : pending.map(
          reservation => `

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
                  ${esc(
                    reservation.games?.name ||
                    'Jeu'
                  )}
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

                ${esc(
                  reservation.first_name
                )}

                ${esc(
                  reservation.last_name
                )}

                ${
                  reservation.promotion
                    ? `(${esc(
                        reservation.promotion
                      )})`
                    : ''
                }

                — du
                ${esc(
                  reservation.date_start
                )}
                au
                ${esc(
                  reservation.date_end
                )}

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
                  data-id="${esc(
                    reservation.id
                  )}"
                >
                  ✓ Accepter
                </button>

                <button
                  class="button danger"
                  data-act="rejected"
                  data-id="${esc(
                    reservation.id
                  )}"
                >
                  ✕ Rejeter
                </button>

              </div>

            </div>

          `
        ).join('');


  processedContainer.innerHTML =
    !processed.length

      ? `
        <div class="empty">
          Aucun historique.
        </div>
      `

      : processed.map(
          reservation => `

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
                  ${esc(
                    reservation.games?.name ||
                    'Jeu'
                  )}
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

                ${esc(
                  reservation.first_name
                )}

                ${esc(
                  reservation.last_name
                )}

                ${
                  reservation.promotion
                    ? `(${esc(
                        reservation.promotion
                      )})`
                    : ''
                }

                — du
                ${esc(
                  reservation.date_start
                )}
                au
                ${esc(
                  reservation.date_end
                )}

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
                        data-id="${esc(
                          reservation.id
                        )}"
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
                        data-id="${esc(
                          reservation.id
                        )}"
                      >
                        Refuser
                      </button>
                    `
                    : ''
                }

                <button
                  class="button"
                  data-act="pending"
                  data-id="${esc(
                    reservation.id
                  )}"
                >
                  Remettre en attente
                </button>

              </div>

            </div>

          `
        ).join('');


  document
    .querySelectorAll(
      '#adminModal [data-act]'
    )
    .forEach(
      button => {

        button.onclick =
          async () => {

            if (
              !isAdminEmail(
                currentUser?.email
              )
            ) {
              return;
            }


            button.disabled =
              true;


            const originalText =
              button.textContent;

            button.textContent =
              '…';


            // -----------------------------------------------
            // MISE À JOUR + VÉRIFICATION QU'UNE LIGNE
            // A RÉELLEMENT ÉTÉ MODIFIÉE (garde-fou RLS)
            // -----------------------------------------------

            const {
              data,
              error
            } =
              await supabase
                .from('reservations')
                .update({

                  status:
                    button.dataset.act

                })
                .eq(
                  'id',
                  button.dataset.id
                )
                .select();


            if (error) {

              console.error(
                'Erreur modification réservation :',
                error
              );


              alert(
                'Erreur : ' +
                error.message
              );


              button.disabled =
                false;

              button.textContent =
                originalText;

              return;
            }


            if (!data || !data.length) {

              alert(
                "La mise à jour n'a pas été appliquée. C'est très probablement un problème de permissions Supabase : " +
                "la policy RLS d'UPDATE sur la table 'reservations' n'autorise pas votre compte à modifier cette ligne. " +
                "Vérifiez la policy admin dans Supabase."
              );

              button.disabled =
                false;

              button.textContent =
                originalText;

              return;
            }


           await loadAdminReservationsList();

await renderCalendar();

if (selectedReviewGame) {

  await loadGameAvailability(
    selectedReviewGame,
    gameAvailabilityMonth
  );

}

await loadUserNotifications();

          };

      }
    );

}


// =========================================================
// AJOUT JEU
// =========================================================

async function handleAddGame(e) {

  e.preventDefault();


  const form =
    e.currentTarget;

  const msg =
    $('addGameMsg');


  if (
    !(form instanceof HTMLFormElement)
  ) {

    console.error(
      'Le formulaire d’ajout de jeu est invalide.'
    );

    return;
  }


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
    form.querySelector(
      'button[type="submit"]'
    );


  if (submitBtn) {
    submitBtn.disabled = true;
  }


  try {

    const formData =
      new FormData(form);


    const newGame = {

      id:
        crypto.randomUUID(),

      name:
        String(
          formData.get('name') || ''
        ).trim(),

      publisher:
        String(
          formData.get('publisher') || ''
        ).trim(),

      category:
        String(
          formData.get('category') || ''
        ).trim() ||
        null,

      cover_image:
        String(
          formData.get('cover_image') || ''
        ).trim() ||
        null,

      players_min:
        Number(
          formData.get('players_min')
        ) || null,

      players_max:
        Number(
          formData.get('players_max')
        ) || null,

      duration:
        Number(
          formData.get('duration')
        ) || null,

      description:
        String(
          formData.get('description') || ''
        ).trim() ||
        null,

      is_active:
        true

    };


    if (!newGame.name) {

      throw new Error(
        'Le nom du jeu est obligatoire.'
      );

    }


    const {
      error
    } =
      await supabase
        .from('games')
        .insert(
          newGame
        );


    if (error) {
      throw error;
    }


    if (msg) {

      msg.textContent =
        '✓ Jeu ajouté !';

      msg.style.color =
        'var(--success)';

    }


    form.reset();


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


// =========================================================
// CONNEXION
// =========================================================

async function handleLogin(e) {

  e.preventDefault();


  const form =
    e.currentTarget;

  const msg =
    $('loginMsg');

  const submitBtn =
    form.querySelector(
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

    const email =
      String(
        $('loginEmail')?.value || ''
      ).trim();


    const password =
      $('loginPassword')?.value || '';


    const {
      error
    } =
      await supabase.auth
        .signInWithPassword({

          email,
          password

        });


    if (error) {
      throw error;
    }


    form.reset();


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


// =========================================================
// INSCRIPTION
// =========================================================

async function handleSignup(e) {
  e.preventDefault();

  const form = e.currentTarget;
  const msg = $('signupMsg');

  const submitBtn = form?.querySelector(
    'button[type="submit"]'
  );

  if (submitBtn) {
    submitBtn.disabled = true;
  }

  if (msg) {
    msg.textContent = 'Création du compte…';
    msg.style.color = 'var(--muted)';
  }

  try {
    const firstName = String(
      $('signupFirst')?.value || ''
    ).trim();

    const lastName = String(
      $('signupLast')?.value || ''
    ).trim();

    const promotion = String(
      $('signupPromotion')?.value || ''
    ).trim();

    const email = String(
      $('signupEmail')?.value || ''
    ).trim()
    .toLowerCase();

    const password =
      $('signupPassword')?.value || '';

    if (
      !firstName ||
      !lastName ||
      !promotion ||
      !email ||
      !password
    ) {
      throw new Error(
        'Le prénom, le nom, la promotion, l’e-mail et le mot de passe sont obligatoires.'
      );
    }

    if (password.length < 6) {
      throw new Error(
        'Le mot de passe doit contenir au moins 6 caractères.'
      );
    }

    const { data, error } =
      await supabase.functions.invoke(
        'request-account',
        {
          body: {
            first_name: firstName,
            last_name: lastName,
            promotion: promotion,
            email: email,
            password: password
          }
        }
      );

    if (error) {
      throw error;
    }

    if (!data?.ok) {
      throw new Error(
        data?.error ||
        'Impossible de créer la demande de compte.'
      );
    }

    if (msg) {
      msg.textContent =
        data.message ||
        '✓ Demande envoyée ! Votre compte est maintenant en attente de validation par un administrateur.';

      msg.style.color = 'var(--success)';
    }

    if (form) {
      form.reset();
    }

  } catch (error) {
    console.error(
      'Erreur inscription :',
      error
    );

    if (msg) {
      msg.textContent =
        'Erreur : ' +
        (
          error?.message ||
          'Une erreur est survenue.'
        );

      msg.style.color = 'var(--danger)';
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
  ].forEach(
    id => {

      $(id)?.addEventListener(
        'input',
        renderGames
      );

      $(id)?.addEventListener(
        'change',
        renderGames
      );

    }
  );


  // -------------------------------------------------------
  // FERMETURE MODALES
  // -------------------------------------------------------

  document
    .querySelectorAll(
      '[data-close]'
    )
    .forEach(
      button => {

        button.onclick =
          () => {

            const targetId =
              button.dataset.close;

            $(targetId)
              ?.classList.add('hidden');

          };

      }
    );


  // -------------------------------------------------------
  // ÉTOILES
  // -------------------------------------------------------

  document
    .querySelectorAll(
      '.star-button'
    )
    .forEach(
      star => {

        star.addEventListener(
          'click',
          () => {

            setReviewRating(
              star.dataset.rating
            );

          }
        );

      }
    );


  // -------------------------------------------------------
  // AVIS
  // -------------------------------------------------------

  $('reviewForm')
    ?.addEventListener(
      'submit',
      submitReview
    );


  // -------------------------------------------------------
  // PROFIL
  // -------------------------------------------------------

  $('profileForm')
    ?.addEventListener(
      'submit',
      submitProfile
    );


  // -------------------------------------------------------
  // NOTIFICATIONS
  // -------------------------------------------------------

  $('notifBtn')
    ?.addEventListener(
      'click',
      async () => {

        if (!currentUser) {

          $('authModal')
            ?.classList.remove('hidden');

          return;

        }


        $('notifModal')
          ?.classList.remove('hidden');

        await loadUserNotifications(true);

      }
    );


  // -------------------------------------------------------
  // RÉSERVATION
  // -------------------------------------------------------
// -------------------------------------------------------
// CALENDRIER DE DISPONIBILITÉ DU JEU
// -------------------------------------------------------

$('gameSelect')
  ?.addEventListener(
    'change',
    async () => {

      const gameId =
        $('gameSelect')?.value || '';

      const game =
        allGames.find(
          g =>
            String(g.id) ===
            String(gameId)
        );

      resetGameAvailabilitySelection();

      if (game) {

        gameAvailabilityMonth =
          new Date();

        await loadGameAvailability(
          game,
          gameAvailabilityMonth
        );

      }

    }
  );


$('dateStart')
  ?.addEventListener(
    'change',
    () => {

      const value =
        $('dateStart')?.value || '';

      if (!value) {

        resetGameAvailabilitySelection();

        return;

      }

      gameAvailabilityStart =
        value;

      gameAvailabilityEnd =
        null;


      const game =
        allGames.find(
          g =>
            String(g.id) ===
            String(
              $('gameSelect')?.value || ''
            )
        );


      if (game) {

        renderGameAvailabilityCalendar(
          game
        );

      }

    }
  );


$('dateEnd')
  ?.addEventListener(
    'change',
    () => {

      const start =
        $('dateStart')?.value || '';

      const end =
        $('dateEnd')?.value || '';


      if (
        !start ||
        !end ||
        end < start
      ) {

        return;

      }


      if (
        rangeContainsReservation(
          start,
          end
        )
      ) {

        $('dateEnd').value =
          '';


        const msg =
          $('formMessage');


        if (msg) {

          msg.textContent =
            'La période choisie contient ' +
            'une date déjà réservée pour ce jeu.';

          msg.style.color =
            'var(--danger)';

        }

        return;

      }


      gameAvailabilityStart =
        start;

      gameAvailabilityEnd =
        end;


      const game =
        allGames.find(
          g =>
            String(g.id) ===
            String(
              $('gameSelect')?.value || ''
            )
        );


      if (game) {

        renderGameAvailabilityCalendar(
          game
        );

      }

    }
  );
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
  // CALENDRIER
  // -------------------------------------------------------

  $('prevMonthBtn')
    ?.addEventListener(
      'click',
      async () => {

        currentCalendarDate.setMonth(
          currentCalendarDate.getMonth() - 1
        );

        await renderCalendar();

      }
    );


  $('nextMonthBtn')
    ?.addEventListener(
      'click',
      async () => {

        currentCalendarDate.setMonth(
          currentCalendarDate.getMonth() + 1
        );

        await renderCalendar();

      }
    );


  // -------------------------------------------------------
  // AJOUT JEU
  // -------------------------------------------------------

  $('addGameForm')
    ?.addEventListener(
      'submit',
      handleAddGame
    );

  $('editGameAdminForm')
    ?.addEventListener(
      'submit',
      handleEditGameAdmin
    );


  // -------------------------------------------------------
  // CONNEXION
  // -------------------------------------------------------

  $('loginForm')
    ?.addEventListener(
      'submit',
      handleLogin
    );


  // -------------------------------------------------------
  // INSCRIPTION
  // -------------------------------------------------------

  $('signupForm')
    ?.addEventListener(
      'submit',
      handleSignup
    );

}
