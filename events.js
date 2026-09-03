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

// Les droits administrateur sont centralisés dans Supabase via
// public.admin_users / public.is_admin_user().
// Il ne faut plus maintenir de liste d'e-mails dans cette page.
let currentUserIsAdmin = false;

async function loadAdminStatus(userId = currentUser?.id) {
  currentUserIsAdmin = false;

  if (!userId) return false;

  const { data, error } = await supabase.rpc('is_admin_user', {
    p_user_id: userId
  });

  if (error) {
    console.error('Erreur vérification administrateur :', error);
    return false;
  }

  currentUserIsAdmin = data === true;
  return currentUserIsAdmin;
}

function isAdminEmail(_email) {
  // Nom conservé pour compatibilité avec le reste du fichier.
  // Le résultat provient désormais exclusivement de admin_users.
  return currentUserIsAdmin;
}

async function ensureCurrentUserIsAdmin() {
  return loadAdminStatus(currentUser?.id);
}


// =========================================================
// VARIABLES
// =========================================================

let currentUser = null;
let currentProfile = null;
let allEvents = [];
let editingEventId = null;
let participantCounts = new Map();


async function loadCurrentProfile(user = currentUser) {
  currentProfile = null;
  if (!user) return null;
  const { data, error } = await supabase.from('profiles')
    .select('user_id, first_name, last_name, promotion, account_status')
    .eq('user_id', user.id).maybeSingle();
  if (error) { console.error('Erreur chargement profil :', error); return null; }
  currentProfile = data || null;
  return currentProfile;
}

function isApprovedMember() {
  return !!currentUser && (isAdminEmail(currentUser.email) || currentProfile?.account_status === 'approved');
}

// =========================================================
// VISIBILITÉ (membres connectés uniquement)
// =========================================================

function isEventVisible(event) {

  /*
   * Un événement marqué "members_only" n'est visible
   * que par les comptes connectés (pas nécessairement admin).
   */

  return !event.members_only || isApprovedMember() || isAdminEmail(currentUser?.email);

}


// =========================================================
// OUTILS
// =========================================================

const $ = id =>
  document.getElementById(id);


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
// DATE
// =========================================================

function parseEventDate(event) {

  /*
   * On accepte plusieurs noms possibles pour la colonne
   * de date afin de rendre le système plus robuste.
   */

  const value =
    event.date ||
    event.event_date ||
    event.date_start ||
    event.start_date;

  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;

}


function formatEventDate(event) {

  const date =
    parseEventDate(event);

  if (!date) {
    return 'Date non renseignée';
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


function formatEventDateShort(event) {

  const date =
    parseEventDate(event);

  if (!date) {
    return 'Date non renseignée';
  }

  return date.toLocaleDateString(
    'fr-FR',
    {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }
  );

}


function isEventPast(event) {

  const date =
    parseEventDate(event);

  if (!date) {
    return false;
  }

  /*
   * On compare uniquement la date,
   * pas l'heure.
   */

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  date.setHours(
    0,
    0,
    0,
    0
  );

  return date < today;

}


// =========================================================
// INITIALISATION
// =========================================================

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    setupEventListeners();

    await initializeAuth();

    await loadEvents();

  }
);


// =========================================================
// AUTHENTIFICATION
// =========================================================

async function initializeAuth() {

  try {

    const {
      data,
      error
    } =
      await supabase.auth.getSession();

    if (error) {
      throw error;
    }

    currentUser =
      data?.session?.user || null;

    await loadCurrentProfile(currentUser);
    await loadAdminStatus(currentUser?.id);
    updateUserNav();

  } catch (error) {

    console.error(
      'Erreur récupération session :',
      error
    );

    currentUser = null;
    currentUserIsAdmin = false;

    updateUserNav();

  }


  supabase.auth.onAuthStateChange(
    async (_event, session) => {

      currentUser =
        session?.user || null;

      await loadCurrentProfile(currentUser);
      await loadAdminStatus(currentUser?.id);
      updateUserNav();

      /*
       * On recharge les événements pour appliquer
       * immédiatement les règles de visibilité
       * (événements réservés aux membres).
       */

      await loadEvents();

    }
  );

}


// =========================================================
// NAVIGATION UTILISATEUR
// =========================================================

function updateUserNav() {

  const userNav =
    $('userNav');

  const addButton =
    $('openAddEventBtn');


  if (!userNav) {
    return;
  }


  if (currentUser) {

    const approved = isApprovedMember();
    const email =
      currentUser.email || '';

    const admin =
      isAdminEmail(email);


    userNav.innerHTML = `

      <span
        style="
          font-size:13px;
          font-weight:700;
        "
      >
        👋 ${esc(email)}
        ${approved ? '' : '<span class="badge badge-warning" style="margin-left:8px;">⏳ En attente</span>'}
      </span>

      <button
        class="button"
        id="eventsLogoutBtn"
      >
        Déconnexion
      </button>

    `;


    $('eventsLogoutBtn')
      ?.addEventListener(
        'click',
        async () => {

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


    /*
     * Seuls les administrateurs voient
     * le bouton d'ajout.
     */

    if (addButton) {

      if (admin) {

        addButton.classList.remove(
          'hidden'
        );

      } else {

        addButton.classList.add(
          'hidden'
        );

      }

    }

  } else {

    userNav.innerHTML = `

      <button
        class="button"
        id="eventsLoginBtn"
      >
        👤 Connexion
      </button>

    `;


    $('eventsLoginBtn')
      ?.addEventListener(
        'click',
        () => {

          $('authModal')
            ?.classList.remove('hidden');

        }
      );


    addButton?.classList.add(
      'hidden'
    );

  }

}


// =========================================================
// CHARGEMENT DES ÉVÉNEMENTS
// =========================================================

async function loadEvents() {

  const container =
    $('events');

  const count =
    $('eventsCount');


  if (!container) {
    return;
  }


  container.innerHTML = `
    <div class="loading">
      Connexion au catalogue d'événements…
    </div>
  `;


  try {

    /*
     * On récupère toutes les colonnes.
     * Cela permet au JS de fonctionner même si
     * la table possède quelques champs supplémentaires.
     */

    const {
      data,
      error
    } =
      await supabase
        .from('events')
        .select('*');


    if (error) {
      throw error;
    }


    allEvents =
      Array.isArray(data)
        ? data
        : [];


    /*
     * On masque les événements réservés aux membres
     * pour les visiteurs non connectés. Les comptes
     * connectés (admin ou non) voient tout.
     *
     * Note : ce filtrage se fait côté client. Pour une
     * sécurité complète, il est recommandé d'ajouter
     * également une policy RLS côté Supabase qui empêche
     * les requêtes anonymes de récupérer ces lignes.
     */

    allEvents =
      allEvents.filter(
        isEventVisible
      );


    // Nombre de participants affichable sur les cartes.
    // Le RPC ne renvoie que des compteurs, jamais les noms.
    await loadParticipantCounts();


    /*
     * Tri chronologique.
     */

    allEvents.sort(
      (a, b) => {

        const dateA =
          parseEventDate(a);

        const dateB =
          parseEventDate(b);


        if (!dateA && !dateB) {
          return 0;
        }

        if (!dateA) {
          return 1;
        }

        if (!dateB) {
          return -1;
        }

        return dateA - dateB;

      }
    );


    if (count) {

      count.textContent =
        `${allEvents.length} événement${
          allEvents.length > 1
            ? 's'
            : ''
        }`;

    }


    renderEvents();

    const hash = window.location.hash;
    if (hash.startsWith('#event-')) {
      const id = decodeURIComponent(hash.slice(7));
      const event = allEvents.find(item => String(item.id) === String(id));
      if (event) setTimeout(() => openEventDetail(event), 0);
    }


  } catch (error) {

    console.error(
      'Erreur chargement événements :',
      error
    );


    container.innerHTML = `

      <div
        class="empty panel"
        style="grid-column:1/-1;"
      >

        <strong>
          Impossible de charger les événements.
        </strong>

        <br><br>

        <small>
          ${esc(error.message)}
        </small>

      </div>

    `;


    if (count) {
      count.textContent = 'Erreur';
    }

  }

}


// =========================================================
// COMPTEUR DE PARTICIPANTS
// =========================================================

async function loadParticipantCounts() {

  participantCounts = new Map();

  const eventIds = allEvents
    .map(event => event.id)
    .filter(id => id !== null && id !== undefined);

  if (!eventIds.length) return;

  try {
    const { data, error } = await supabase
      .rpc('get_event_participant_counts', {
        p_event_ids: eventIds
      });

    if (error) throw error;

    (data || []).forEach(row => {
      participantCounts.set(
        String(row.event_id),
        Number(row.participant_count || 0)
      );
    });
  } catch (error) {
    // Si le RPC n'est pas encore créé dans Supabase, les cartes
    // restent fonctionnelles et affichent simplement 0 participant.
    console.warn('Compteurs de participants indisponibles :', error.message);
  }
}


// =========================================================
// PROCHAIN ÉVÉNEMENT
// =========================================================

function getNextEvent() {

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );


  const upcoming =
    allEvents
      .filter(event => {

        const date =
          parseEventDate(event);

        if (!date) {
          return false;
        }

        date.setHours(
          0,
          0,
          0,
          0
        );

        return date >= today;

      })
      .sort(
        (a, b) => {
          // La priorité (1 à 3, 1 = la plus faible) prime sur la date.
          const aPriority = Number(a.priority) || 0;
          const bPriority = Number(b.priority) || 0;

          if (bPriority !== aPriority) {
            return bPriority - aPriority;
          }

          return parseEventDate(a) - parseEventDate(b);
        }
      );


  return upcoming[0] || null;

}


// =========================================================
// RENDU DES ÉVÉNEMENTS
// =========================================================

function renderEvents() {

  const container =
    $('events');


  if (!container) {
    return;
  }


  if (!allEvents.length) {

    container.innerHTML = `

      <div
        class="empty panel"
        style="grid-column:1/-1;"
      >

        Aucun événement n'est encore prévu.

      </div>

    `;

    return;

  }


  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );


  const upcoming =
    allEvents.filter(
      event => {

        const date =
          parseEventDate(event);

        if (!date) {
          return true;
        }

        date.setHours(
          0,
          0,
          0,
          0
        );

        return date >= today;

      }
    );


  const past =
    allEvents.filter(
      event => {

        const date =
          parseEventDate(event);

        if (!date) {
          return false;
        }

        date.setHours(
          0,
          0,
          0,
          0
        );

        return date < today;

      }
    );


  let html = '';


  // =======================================================
  // À VENIR
  // =======================================================

  if (upcoming.length) {

    html += `

      <div
        style="
          grid-column:1/-1;
          margin-bottom:4px;
        "
      >

        <p class="eyebrow">
          PROCHAINEMENT
        </p>

      </div>

    `;


    html += upcoming
      .map(
        event =>
          renderEventCard(
            event,
            false
          )
      )
      .join('');

  }


  // =======================================================
  // PASSÉS
  // =======================================================

  if (past.length) {

    html += `

      <div
        style="
          grid-column:1/-1;
          margin-top:28px;
          margin-bottom:4px;
        "
      >

        <p class="eyebrow">
          ÉVÉNEMENTS PASSÉS
        </p>

      </div>

    `;


    html += past
      .slice()
      .reverse()
      .map(
        event =>
          renderEventCard(
            event,
            true
          )
      )
      .join('');

  }


  container.innerHTML =
    html;


  /*
   * Activation des clics.
   */

  container
    .querySelectorAll(
      '[data-event-id]'
    )
    .forEach(
      card => {

        card.addEventListener(
          'click',
          () => {

            const id =
              card.dataset.eventId;

            const event =
              allEvents.find(
                item =>
                  String(item.id) ===
                  String(id)
              );

            if (event) {
              openEventDetail(event);
            }

          }
        );

      }
    );

  // Édition réservée aux administrateurs.
  container
    .querySelectorAll('[data-edit-event]')
    .forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();

        if (!isAdminEmail(currentUser?.email)) return;

        const id = button.dataset.editEvent;
        if (!id) return;

        const eventData = allEvents.find(
          item => String(item.id) === String(id)
        );

        if (eventData) {
          openEditEventModal(eventData);
        }
      });
    });

  // Suppression réservée aux administrateurs.
  container
    .querySelectorAll('[data-delete-event]')
    .forEach(button => {
      button.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();

        if (!isAdminEmail(currentUser?.email)) return;

        const id = button.dataset.deleteEvent;
        if (!id) return;

        if (!confirm('Voulez-vous vraiment supprimer cet événement ?')) return;

        const oldText = button.textContent;
        button.disabled = true;
        button.textContent = 'Suppression…';

        try {
          const { error } = await supabase
            .from('events')
            .delete()
            .eq('id', id);

          if (error) throw error;

          await loadEvents();
        } catch (error) {
          console.error('Erreur suppression événement :', error);
          alert(`Impossible de supprimer l'événement : ${error.message}`);
          button.disabled = false;
          button.textContent = oldText;
        }
      });
    });


}


// =========================================================
// CARTE ÉVÉNEMENT
// =========================================================

function renderEventCard(
  event,
  past = false
) {

  const photo =
    event.photo_url ||
    event.photo ||
    event.image_url ||
    '';


  const brief =
    event.short_description ||
    event.brief_description ||
    event.description_brief ||
    '';


  const description =
    brief ||
    event.description ||
    '';


  return `

    <article
      class="card"
      data-event-id="${esc(event.id)}"
      style="
        cursor:pointer;
        ${past ? 'opacity:0.65;' : ''}
      "
      title="Voir les détails de l'événement"
    >

      <div
        class="cover"
        style="
          position:relative;
          overflow:hidden;
        "
      >

        ${
          photo
            ? `
              <img
                src="${esc(photo)}"
                alt="${esc(event.name)}"
                style="
                  width:100%;
                  height:100%;
                  object-fit:cover;
                "
              >
            `
            : `
              <span>
                ✦
              </span>
            `
        }

      </div>


      <div class="card-body">

        ${
          past
            ? `
              <p class="tag">
                ÉVÉNEMENT PASSÉ
              </p>
            `
            : `
              <p class="tag">
                ÉVÉNEMENT
              </p>
            `
        }

        ${
          event.members_only
            ? `
              <p class="tag" style="color:var(--warning);margin-top:2px;">
                🔒 RÉSERVÉ AUX MEMBRES
              </p>
            `
            : ''
        }

        ${
          Number(event.priority) >= 2
            ? `
              <p class="tag" style="color:var(--accent);margin-top:2px;">
                ${'⭐'.repeat(Number(event.priority))} PRIORITÉ ${Number(event.priority) === 3 ? 'ÉLEVÉE' : 'MOYENNE'}
              </p>
            `
            : ''
        }


        <h3>
          ${esc(
            event.name ||
            'Événement'
          )}
        </h3>


        <p
          style="
            color:var(--accent);
            font-size:13px;
            font-weight:700;
            margin-top:6px;
          "
        >
          📅 ${esc(
            formatEventDateShort(event)
          )}
        </p>


        ${
          event.organizers
            ? `
              <p
                class="publisher"
                style="margin-top:5px;"
              >
                Organisé par
                ${esc(event.organizers)}
              </p>
            `
            : ''
        }


        ${
          description
            ? `
              <p
                class="desc"
                style="
                  display:-webkit-box;
                  -webkit-line-clamp:3;
                  -webkit-box-orient:vertical;
                  overflow:hidden;
                  margin-top:10px;
                "
              >
                ${esc(description)}
              </p>
            `
            : ''
        }


        <div
          style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:12px;
            margin-top:12px;
          "
        >
          <p
            style="
              color:#2583ff;
              font-size:12px;
              font-weight:700;
              margin:0;
            "
          >
            Voir les détails →
          </p>

          <span
            class="event-participant-count"
            title="Nombre de participants inscrits"
            style="
              flex-shrink:0;
              padding:5px 9px;
              border:1px solid var(--line);
              border-radius:999px;
              font-size:12px;
              font-weight:700;
              color:var(--muted);
              background:var(--bg);
            "
          >
            👥 ${participantCounts.get(String(event.id)) || 0} participant${(participantCounts.get(String(event.id)) || 0) > 1 ? 's' : ''}
          </span>
        </div>

        ${
          isAdminEmail(currentUser?.email)
            ? `
              <div style="display:flex;gap:8px;margin-top:12px;">

                <button
                  type="button"
                  class="button"
                  data-edit-event="${esc(event.id)}"
                  style="flex:1;"
                >
                  ✏️ Modifier
                </button>

                <button
                  type="button"
                  class="button danger"
                  data-delete-event="${esc(event.id)}"
                  style="flex:1;"
                >
                  🗑 Supprimer
                </button>

              </div>
            `
            : ''
        }

      </div>

    </article>

  `;

}


// =========================================================
// MODALE DÉTAIL
// =========================================================


// =========================================================
// PARTICIPATION AUX ÉVÉNEMENTS
// =========================================================

async function getEventParticipation(eventId) {
  if (!currentUser || !eventId) {
    return { participating: false, participants: [] };
  }

  const { data: mine, error: mineError } = await supabase
    .from('event_participants')
    .select('event_id')
    .eq('event_id', eventId)
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (mineError) throw mineError;

  let participants = [];

  if (isAdminEmail(currentUser.email)) {
    const { data, error } = await supabase
      .from('event_participants')
      .select('user_id, first_name, last_name, created_at')
      .eq('event_id', eventId)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true });

    if (error) throw error;
    participants = data || [];
  }

  return {
    participating: !!mine,
    participants
  };
}

async function toggleEventParticipation(event) {
  if (!isApprovedMember()) {
    if (currentUser) {
      alert('Votre compte doit être validé par un administrateur pour participer à un événement.');
      return;
    }
    $('authModal')?.classList.remove('hidden');
    return;
  }

  const button = $('eventParticipationBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Enregistrement…';
  }

  try {
    const { data: existing, error: findError } = await supabase
      .from('event_participants')
      .select('user_id')
      .eq('event_id', event.id)
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (findError) throw findError;

    if (existing) {
      const { error } = await supabase
        .from('event_participants')
        .delete()
        .eq('event_id', event.id)
        .eq('user_id', currentUser.id);

      if (error) throw error;
    } else {
      // Le navigateur ne fournit jamais le nom/prénom de l'inscription.
      // Le trigger PostgreSQL les récupère depuis public.profiles.
      const { error } = await supabase
        .from('event_participants')
        .insert({
          event_id: event.id,
          user_id: currentUser.id
        });

      if (error) throw error;
    }

    await loadParticipantCounts();
    renderEvents();
    await openEventDetail(event);
  } catch (error) {
    console.error('Erreur participation événement :', error);
    alert(`Impossible de modifier votre participation : ${error.message}`);
    if (button) {
      button.disabled = false;
      button.textContent = 'Participer';
    }
  }
}

async function openEventDetail(event) {

  const modal = $('eventDetailModal');
  const body = $('eventDetailBody');

  if (!modal || !body) return;

  const photo =
    event.photo_url ||
    event.photo ||
    event.image_url ||
    '';

  const past = isEventPast(event);

  body.innerHTML = `
    ${
      photo
        ? `
          <img
            src="${esc(photo)}"
            alt="${esc(event.name)}"
            style="width:100%;max-height:350px;object-fit:cover;border-radius:8px;margin-bottom:20px;"
          >
        `
        : ''
    }

    <p class="eyebrow">
      ${past ? 'ÉVÉNEMENT PASSÉ' : 'ÉVÉNEMENT À VENIR'}
      ${event.members_only ? ' · 🔒 RÉSERVÉ AUX MEMBRES' : ''}
    </p>

    <h2 style="margin-top:5px;">${esc(event.name || 'Événement')}</h2>

    <p style="color:var(--accent);font-weight:700;margin-top:8px;">
      📅 ${esc(formatEventDate(event))}
    </p>

    ${
      event.organizers
        ? `
          <p style="color:var(--muted);font-size:13px;margin-top:8px;">
            Organisé par : ${esc(event.organizers)}
          </p>
        `
        : ''
    }

    ${
      event.short_description ||
      event.brief_description ||
      event.description_brief
        ? `
          <div style="margin-top:20px;padding:14px;border:1px solid var(--line);background:var(--bg);border-radius:8px;">
            <p class="eyebrow">EN BREF</p>
            <p style="margin-top:7px;font-size:14px;line-height:1.6;">
              ${esc(event.short_description || event.brief_description || event.description_brief)}
            </p>
          </div>
        `
        : ''
    }

    <div style="margin-top:22px;">
      <p class="eyebrow">DESCRIPTION</p>
      <p style="margin-top:8px;font-size:14px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere;">
        ${esc(event.description || 'Aucune description disponible.')}
      </p>
    </div>

    ${
      isApprovedMember() && !past
        ? `
          <div style="margin-top:22px;padding:16px;border:1px solid var(--line);background:var(--bg);border-radius:8px;">
            <p class="eyebrow">PARTICIPATION</p>
            <p id="eventParticipationStatus" style="margin-top:7px;color:var(--muted);font-size:13px;">
              Chargement…
            </p>
            <button
              type="button"
              id="eventParticipationBtn"
              class="button primary"
              style="width:100%;margin-top:12px;"
            >
              Participer
            </button>
          </div>
        `
        : !past
          ? `
            <div style="margin-top:22px;padding:14px;border:1px solid var(--line);background:var(--bg);border-radius:8px;">
              <p style="font-size:13px;color:var(--muted);">
                ${currentUser ? '⏳ Votre compte est en attente de validation. La participation sera disponible après validation.' : '👤 Connectez-vous pour indiquer votre participation.'}
              </p>
              ${currentUser ? '' : `
                <button type="button" id="eventLoginForParticipationBtn" class="button primary" style="width:100%;margin-top:10px;">
                  Se connecter
                </button>
              `}
            </div>
          `
          : ''
    }

    ${
      isAdminEmail(currentUser?.email)
        ? `
          <div id="adminEventParticipants" style="margin-top:22px;padding-top:20px;border-top:1px solid var(--line);">
            <p class="eyebrow">INSCRITS</p>
            <div id="eventParticipantsList" style="margin-top:10px;color:var(--muted);font-size:13px;">
              Chargement de la liste…
            </div>
          </div>

          <div style="display:flex;gap:8px;margin-top:20px;">
            <button type="button" id="editEventFromModal" class="button" style="flex:1;">
              ✏️ Modifier
            </button>
            <button type="button" id="deleteEventFromModal" class="button danger" style="flex:1;">
              🗑 Supprimer
            </button>
          </div>
        `
        : ''
    }
  `;

  modal.classList.remove('hidden');

  $('eventLoginForParticipationBtn')?.addEventListener('click', () => {
    modal.classList.add('hidden');
    $('authModal')?.classList.remove('hidden');
  });

  $('eventParticipationBtn')?.addEventListener('click', () => {
    toggleEventParticipation(event);
  });

  try {
    const { participating, participants } = await getEventParticipation(event.id);

    const status = $('eventParticipationStatus');
    const button = $('eventParticipationBtn');

    if (status) {
      status.textContent = participating
        ? '✓ Vous êtes inscrit à cet événement.'
        : 'Vous n’êtes pas encore inscrit.';
    }

    if (button) {
      button.textContent = participating
        ? 'Ne plus participer'
        : 'Participer';
      button.classList.toggle('danger', participating);
      button.classList.toggle('primary', !participating);
    }

    if (isAdminEmail(currentUser?.email)) {
      const list = $('eventParticipantsList');

      if (list) {
        if (!participants.length) {
          list.innerHTML = 'Aucune personne inscrite pour le moment.';
        } else {
          list.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <strong style="color:var(--text);">
                ${participants.length} inscrit${participants.length > 1 ? 's' : ''}
              </strong>
            </div>
            <ol style="margin:0;padding-left:22px;">
              ${participants.map(person => `
                <li style="padding:5px 0;">
                  ${esc(person.first_name)} ${esc(person.last_name)}
                </li>
              `).join('')}
            </ol>
          `;
        }
      }
    }
  } catch (error) {
    console.error('Erreur chargement participation :', error);

    const status = $('eventParticipationStatus');
    if (status) {
      status.textContent = 'Impossible de charger votre participation.';
    }

    const list = $('eventParticipantsList');
    if (list) {
      list.innerHTML = `Impossible de charger la liste : ${esc(error.message)}`;
    }
  }

  $('editEventFromModal')?.addEventListener('click', () => {
    if (!isAdminEmail(currentUser?.email)) return;
    openEditEventModal(event);
  });

  $('deleteEventFromModal')?.addEventListener('click', async () => {
    if (!(await ensureCurrentUserIsAdmin())) return;
    if (!confirm('Voulez-vous vraiment supprimer cet événement ?')) return;

    const button = $('deleteEventFromModal');
    button.disabled = true;
    button.textContent = 'Suppression…';

    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', event.id);

      if (error) throw error;

      modal.classList.add('hidden');
      await loadEvents();
    } catch (error) {
      console.error('Erreur suppression événement :', error);
      alert(`Impossible de supprimer l'événement : ${error.message}`);
      button.disabled = false;
      button.textContent = '🗑 Supprimer';
    }
  });
}

// =========================================================
// MODALE AJOUT / ÉDITION
// =========================================================

function resetAddEventForm() {

  const form =
    $('addEventForm');

  form?.reset();

  const msg =
    $('addEventMsg');

  if (msg) {
    msg.textContent = '';
  }

}


function openAddEventModal() {

  editingEventId = null;

  resetAddEventForm();

  const eyebrow = $('addEventModalEyebrow');
  const title = $('addEventModalTitle');
  const submitBtn = $('addEventSubmitBtn');

  if (eyebrow) {
    eyebrow.textContent = '+ NOUVEL ÉVÉNEMENT';
  }

  if (title) {
    title.textContent = "Ajouter un événement";
  }

  if (submitBtn) {
    submitBtn.textContent = "Publier l'événement →";
  }

  $('addEventModal')
    ?.classList.remove('hidden');

}


function openEditEventModal(event) {

  if (!isAdminEmail(currentUser?.email)) {
    return;
  }

  editingEventId = event.id;

  const form =
    $('addEventForm');

  const msg =
    $('addEventMsg');

  if (msg) {
    msg.textContent = '';
  }

  if (form) {

    const rawDate =
      event.date ||
      event.event_date ||
      event.date_start ||
      event.start_date ||
      '';

    if (form.elements['name']) {
      form.elements['name'].value = event.name || '';
    }

    if (form.elements['date']) {
      form.elements['date'].value = String(rawDate).slice(0, 10);
    }

    if (form.elements['priority']) {
      const rawPriority = parseInt(event.priority, 10);
      form.elements['priority'].value =
        [1, 2, 3].includes(rawPriority) ? String(rawPriority) : '1';
    }

    if (form.elements['organizers']) {
      form.elements['organizers'].value = event.organizers || '';
    }

    if (form.elements['photo_url']) {
      form.elements['photo_url'].value =
        event.photo_url ||
        event.photo ||
        event.image_url ||
        '';
    }

    if (form.elements['short_description']) {
      form.elements['short_description'].value =
        event.short_description ||
        event.brief_description ||
        event.description_brief ||
        '';
    }

    if (form.elements['description']) {
      form.elements['description'].value = event.description || '';
    }

    if (form.elements['members_only']) {
      form.elements['members_only'].checked = !!event.members_only;
    }

  }

  const eyebrow = $('addEventModalEyebrow');
  const title = $('addEventModalTitle');
  const submitBtn = $('addEventSubmitBtn');

  if (eyebrow) {
    eyebrow.textContent = '✏️ MODIFICATION';
  }

  if (title) {
    title.textContent = "Modifier l'événement";
  }

  if (submitBtn) {
    submitBtn.textContent = 'Enregistrer les modifications →';
  }

  $('eventDetailModal')
    ?.classList.add('hidden');

  $('addEventModal')
    ?.classList.remove('hidden');

}


// =========================================================
// AJOUT / MODIFICATION ÉVÉNEMENT
// =========================================================

async function handleAddEvent(e) {

  e.preventDefault();


  const form =
    e.currentTarget;

  const msg =
    $('addEventMsg');


  if (
    !(form instanceof HTMLFormElement)
  ) {

    console.error(
      'Formulaire événement invalide.'
    );

    return;

  }


  if (
    !(await ensureCurrentUserIsAdmin())
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


    const name =
      String(
        formData.get('name') ||
        ''
      ).trim();


    const organizers =
      String(
        formData.get('organizers') ||
        ''
      ).trim();


    const photoUrl =
      String(
        formData.get('photo_url') ||
        ''
      ).trim();


    const shortDescription =
      String(
        formData.get(
          'short_description'
        ) ||
        formData.get(
          'brief_description'
        ) ||
        formData.get(
          'description_brief'
        ) ||
        ''
      ).trim();


    const description =
      String(
        formData.get('description') ||
        ''
      ).trim();


    /*
     * Recherche de la date.
     *
     * Le champ peut être nommé :
     * date
     * event_date
     * date_start
     */

    const date =
      String(
        formData.get('date') ||
        formData.get('event_date') ||
        formData.get('date_start') ||
        ''
      ).trim();


    /*
     * Priorité d'affichage (1 à 3, 1 = la plus faible).
     * Sert à décider, avant la date, quel événement s'affiche
     * dans le cadre "Prochain événement" de l'accueil.
     */

    const rawPriority =
      parseInt(formData.get('priority'), 10);

    const priority =
      [1, 2, 3].includes(rawPriority) ? rawPriority : 1;


    if (!name) {

      throw new Error(
        "Le nom de l'événement est obligatoire."
      );

    }


    if (!organizers) {

      throw new Error(
        "Le nom de l'organisateur est obligatoire."
      );

    }


    if (!date) {

      throw new Error(
        "La date de l'événement est obligatoire."
      );

    }


    if (!description) {

      throw new Error(
        "La description est obligatoire."
      );

    }


    /*
     * On construit l'objet.
     *
     * IMPORTANT :
     * Ici j'utilise les noms de colonnes
     * que ton système doit avoir dans Supabase.
     */

    const membersOnly =
      formData.get('members_only') === 'on';


    const newEvent = {

      // La colonne id de Supabase est un BIGINT généré automatiquement.
      // Ne surtout pas lui envoyer un UUID.
      name:
        name,

      organizers:
        organizers,

      date:
        date,

      priority:
        priority,

      photo_url:
        photoUrl || null,

      short_description:
        shortDescription || null,

      description:
        description,

      members_only:
        membersOnly

    };


    const isEditing =
      !!editingEventId;


    const {
      error
    } =
      isEditing
        ? await supabase
            .from('events')
            .update(newEvent)
            .eq('id', editingEventId)
        : await supabase
            .from('events')
            .insert(newEvent);


    if (error) {
      throw error;
    }


    if (msg) {

      msg.textContent =
        isEditing
          ? '✓ Événement mis à jour !'
          : '✓ Événement publié !';

      msg.style.color =
        'var(--success)';

    }


    form.reset();

    editingEventId = null;


    await loadEvents();


    /*
     * On ferme automatiquement
     * la fenêtre après une courte pause.
     */

    setTimeout(
      () => {

        $('addEventModal')
          ?.classList.add('hidden');

        if (msg) {
          msg.textContent = '';
        }

      },
      700
    );


  } catch (error) {

    console.error(
      'Erreur ajout événement :',
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
// AUTH — CONNEXION
// =========================================================

async function handleLogin(e) {

  e.preventDefault();


  const form =
    e.currentTarget;

  const msg =
    $('loginMsg');


  const email =
    String(
      $('loginEmail')?.value ||
      ''
    ).trim();


  const password =
    $('loginPassword')?.value ||
    '';


  try {

    if (msg) {

      msg.textContent =
        'Connexion en cours…';

      msg.style.color =
        'var(--muted)';

    }


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

  }

}



const PASSWORD_RESET_PAGE = 'reset-password.html';

async function handleForgotPassword() {
  const emailInput = $('loginEmail');
  const email = String(emailInput?.value || '').trim();

  if (!email) {
    const msg = $('loginMsg');
    if (msg) {
      msg.textContent = 'Indiquez d’abord votre adresse e-mail.';
      msg.style.color = 'var(--danger)';
    }
    emailInput?.focus();
    return;
  }

  const msg = $('loginMsg');
  if (msg) {
    msg.textContent = 'Envoi du lien de récupération…';
    msg.style.color = 'var(--muted)';
  }

  try {
    const redirectTo =
      `${window.location.origin}/${PASSWORD_RESET_PAGE}`;

    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo }
    );

    if (error) throw error;

    if (msg) {
      msg.textContent =
        '✓ Un lien de récupération a été envoyé à cette adresse si elle correspond à un compte.';
      msg.style.color = 'var(--success)';
    }
  } catch (error) {
    console.error('Erreur récupération mot de passe :', error);

    if (msg) {
      msg.textContent =
        'Erreur : ' + (error?.message || error);
      msg.style.color = 'var(--danger)';
    }
  }
}


// =========================================================
// AUTH — INSCRIPTION
// =========================================================

async function handleSignup(e) {

  e.preventDefault();


  const form =
    e.currentTarget;

  const msg =
    $('signupMsg');


  const firstName =
    String(
      $('signupFirst')?.value ||
      ''
    ).trim();


  const lastName =
    String(
      $('signupLast')?.value ||
      ''
    ).trim();


  const email =
    String(
      $('signupEmail')?.value ||
      ''
    ).trim();


  const password =
    $('signupPassword')?.value ||
    '';


  try {

    if (msg) {

      msg.textContent =
        'Création du compte…';

      msg.style.color =
        'var(--muted)';

    }


    const {
      data,
      error
    } =
      await supabase.auth
        .signUp({

          email,

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


    if (error) {
      throw error;
    }


    if (msg) {

      msg.textContent =
        data?.session
          ? '✓ Compte créé ! Votre demande doit maintenant être validée par un administrateur.'
          : '✓ Compte créé ! Vérifiez votre boîte mail si nécessaire. Votre demande sera ensuite validée par un administrateur.';

      msg.style.color =
        'var(--success)';

    }


    form.reset();


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

  }

}


// =========================================================
// LISTENERS
// =========================================================

function setupEventListeners() {


  // -------------------------------------------------------
  // AJOUT ÉVÉNEMENT
  // -------------------------------------------------------

  $('openAddEventBtn')
    ?.addEventListener(
      'click',
      () => {

        if (
          !currentUser
        ) {

          $('authModal')
            ?.classList.remove(
              'hidden'
            );

          return;

        }


        if (!(await ensureCurrentUserIsAdmin())) {
          return;
        }

        openAddEventModal();

      }
    );


  $('addEventForm')
    ?.addEventListener(
      'submit',
      handleAddEvent
    );


  // -------------------------------------------------------
  // CONNEXION
  // -------------------------------------------------------

  $('loginForm')
    ?.addEventListener(
      'submit',
      handleLogin
    );


  $('forgotPasswordBtn')
    ?.addEventListener(
      'click',
      handleForgotPassword
    );


  // -------------------------------------------------------
  // INSCRIPTION
  // -------------------------------------------------------

  $('signupForm')
    ?.addEventListener(
      'submit',
      handleSignup
    );


  // -------------------------------------------------------
  // FERMETURE DES MODALES
  // -------------------------------------------------------

  document
    .querySelectorAll(
      '[data-close]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            const target =
              button.dataset.close;

            $(target)
              ?.classList.add(
                'hidden'
              );

          }
        );

      }
    );


  // -------------------------------------------------------
  // CLIC SUR LE FOND D'UNE MODALE
  // -------------------------------------------------------

  document
    .querySelectorAll(
      '.modal'
    )
    .forEach(
      modal => {

        modal.addEventListener(
          'click',
          event => {

            if (
              event.target === modal
            ) {

              modal.classList.add(
                'hidden'
              );

            }

          }
        );

      }
    );

}


// =========================================================
// FONCTION PUBLIQUE POUR APP.JS
// =========================================================

/*
 * Cette fonction permet à app.js de récupérer
 * le prochain événement sans avoir à connaître
 * la logique interne de events.js.
 *
 * Elle est exposée globalement.
 */

window.getNextKBGEvent =
  function () {

    return getNextEvent();

  };


// =========================================================
// FIN
// =========================================================
