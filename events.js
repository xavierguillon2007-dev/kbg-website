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

let currentUser = null;
let allEvents = [];


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

    updateUserNav();

  } catch (error) {

    console.error(
      'Erreur récupération session :',
      error
    );

    currentUser = null;

    updateUserNav();

  }


  supabase.auth.onAuthStateChange(
    (_event, session) => {

      currentUser =
        session?.user || null;

      updateUserNav();

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
        (a, b) =>
          parseEventDate(a) -
          parseEventDate(b)
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


        <p
          style="
            color:#2583ff;
            font-size:12px;
            margin-top:12px;
            font-weight:700;
          "
        >
          Voir les détails →
        </p>

      </div>

    </article>

  `;

}


// =========================================================
// MODALE DÉTAIL
// =========================================================

function openEventDetail(event) {

  const modal =
    $('eventDetailModal');

  const body =
    $('eventDetailBody');


  if (!modal || !body) {
    return;
  }


  const photo =
    event.photo_url ||
    event.photo ||
    event.image_url ||
    '';


  const date =
    parseEventDate(event);


  const past =
    isEventPast(event);


  body.innerHTML = `

    ${
      photo
        ? `
          <img
            src="${esc(photo)}"
            alt="${esc(event.name)}"
            style="
              width:100%;
              max-height:350px;
              object-fit:cover;
              border-radius:8px;
              margin-bottom:20px;
            "
          >
        `
        : ''
    }


    <p class="eyebrow">
      ${
        past
          ? 'ÉVÉNEMENT PASSÉ'
          : 'ÉVÉNEMENT À VENIR'
      }
    </p>


    <h2
      style="
        margin-top:5px;
      "
    >
      ${esc(
        event.name ||
        'Événement'
      )}
    </h2>


    <p
      style="
        color:var(--accent);
        font-weight:700;
        margin-top:8px;
      "
    >
      📅 ${esc(
        formatEventDate(event)
      )}
    </p>


    ${
      event.organizers
        ? `
          <p
            style="
              color:var(--muted);
              font-size:13px;
              margin-top:8px;
            "
          >
            Organisé par :
            ${esc(event.organizers)}
          </p>
        `
        : ''
    }


    ${
      event.short_description ||
      event.brief_description ||
      event.description_brief
        ? `
          <div
            style="
              margin-top:20px;
              padding:14px;
              border:1px solid var(--line);
              background:var(--bg);
              border-radius:8px;
            "
          >

            <p class="eyebrow">
              EN BREF
            </p>

            <p
              style="
                margin-top:7px;
                font-size:14px;
                line-height:1.6;
              "
            >
              ${esc(
                event.short_description ||
                event.brief_description ||
                event.description_brief
              )}
            </p>

          </div>
        `
        : ''
    }


    <div
      style="
        margin-top:22px;
      "
    >

      <p class="eyebrow">
        DESCRIPTION
      </p>

      <p
        style="
          margin-top:8px;
          font-size:14px;
          line-height:1.75;
          white-space:pre-wrap;
          overflow-wrap:anywhere;
        "
      >
        ${esc(
          event.description ||
          'Aucune description disponible.'
        )}
      </p>

    </div>

  `;


  modal.classList.remove(
    'hidden'
  );

}


// =========================================================
// AJOUT ÉVÉNEMENT
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

    const newEvent = {

      id:
        crypto.randomUUID(),

      name:
        name,

      organizers:
        organizers,

      date:
        date,

      photo_url:
        photoUrl || null,

      short_description:
        shortDescription || null,

      description:
        description

    };


    const {
      error
    } =
      await supabase
        .from('events')
        .insert(
          newEvent
        );


    if (error) {
      throw error;
    }


    if (msg) {

      msg.textContent =
        '✓ Événement publié !';

      msg.style.color =
        'var(--success)';

    }


    form.reset();


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
          ? '✓ Compte créé et connecté !'
          : '✓ Compte créé ! Vérifiez votre boîte mail si nécessaire.';

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


        if (
          !isAdminEmail(
            currentUser.email
          )
        ) {

          return;

        }


        $('addEventModal')
          ?.classList.remove(
            'hidden'
          );

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
