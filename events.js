import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// =========================================================
// SUPABASE
// =========================================================

const SUPABASE_URL =
'https://qqelmmygalllmxinaxrf.supabase.co';

const SUPABASE_KEY =
'sb_publishable_fqFvZNetzIdAfX860bmjBQ_GzJfeVK3';

const supabase =
createClient(
SUPABASE_URL,
SUPABASE_KEY
);

// =========================================================
// VARIABLES
// =========================================================

let allEvents = [];

let currentUser = null;

let isAdmin = false;

// =========================================================
// OUTILS
// =========================================================

const $ =
id => document.getElementById(id);

function esc(value) {

return String(
value ?? ''
).replace(
/[&<>"']/g,
char => ({
'&': '&',
'<': '<',
'>': '>',
'"': '"',
"'": '''
}[char])
);

}

// =========================================================
// DATES
// =========================================================

function getTodayString() {

const now =
new Date();

const year =
now.getFullYear();

const month =
String(
now.getMonth() + 1
).padStart(2, '0');

const day =
String(
now.getDate()
).padStart(2, '0');

return `${year}-${month}-${day}`;

}

function formatEventDate(dateString) {

if (!dateString) {
return '';
}

const date =
new Date(
dateString + 'T00:00:00'
);

if (
Number.isNaN(
date.getTime()
)
) {
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

function formatShortEventDate(dateString) {

if (!dateString) {
return '';
}

const date =
new Date(
dateString + 'T00:00:00'
);

if (
Number.isNaN(
date.getTime()
)
) {
return dateString;
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

// =========================================================
// INITIALISATION
// =========================================================

document.addEventListener(
'DOMContentLoaded',
async () => {

```
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

  await handleAuthChange(
    data?.session?.user || null
  );

} catch (error) {

  console.error(
    'Erreur Auth :',
    error
  );

}

await loadEvents();
```

}
);

// =========================================================
// AUTHENTIFICATION
// =========================================================

supabase.auth.onAuthStateChange(
async (
_event,
session
) => {

```
await handleAuthChange(
  session?.user || null
);
```

}
);

async function handleAuthChange(user) {

currentUser =
user;

isAdmin =
false;

const userNav =
$('userNav');

const addBtn =
$('openAddEventBtn');

if (currentUser) {

```
// -----------------------------------------------------
// VÉRIFICATION ADMIN
// -----------------------------------------------------

const {
  data: adminData,
  error: adminError
} =
  await supabase
    .from('admins')
    .select('user_id')
    .eq(
      'user_id',
      currentUser.id
    )
    .maybeSingle();


if (adminError) {

  console.error(
    'Erreur vérification admin :',
    adminError
  );

}


isAdmin =
  !!adminData;


// -----------------------------------------------------
// NAVIGATION
// -----------------------------------------------------

if (userNav) {

  userNav.innerHTML = `

    <span
      style="
        font-size:13px;
        font-weight:700;
      "
    >
      👋 ${esc(
        currentUser.email
      )}
    </span>

    ${
      isAdmin
        ? `
          <span
            class="tag"
            style="margin-left:6px;"
          >
            ADMIN
          </span>
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

        const {
          error
        } =
          await supabase.auth
            .signOut();

        if (error) {

          console.error(
            'Erreur déconnexion :',
            error
          );

        }

      }
    );

}


// -----------------------------------------------------
// BOUTON ADMIN
// -----------------------------------------------------

if (isAdmin) {

  addBtn
    ?.classList.remove(
      'hidden'
    );

} else {

  addBtn
    ?.classList.add(
      'hidden'
    );

}
```

} else {

```
// -----------------------------------------------------
// UTILISATEUR NON CONNECTÉ
// -----------------------------------------------------

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
          ?.classList.remove(
            'hidden'
          );

      }
    );

}


addBtn
  ?.classList.add(
    'hidden'
  );
```

}

renderEvents();

}

// =========================================================
// CHARGEMENT DES ÉVÉNEMENTS
// =========================================================

async function loadEvents() {

try {

```
const {
  data,
  error
} =
  await supabase
    .from('events')
    .select('*')
    .order(
      'date',
      {
        ascending: true,
        nullsFirst: false
      }
    );


if (error) {
  throw error;
}


allEvents =
  data || [];


renderEvents();
```

} catch (error) {

```
console.error(
  'Erreur événements :',
  error
);


if ($('events')) {

  $('events').innerHTML = `

    <div class="empty">

      Erreur de chargement des événements.

      <br><br>

      <small>
        ${esc(
          error.message
        )}
      </small>

    </div>

  `;

}
```

}

}

// =========================================================
// PROCHAIN ÉVÉNEMENT
// =========================================================

function getNextEvent() {

const today =
getTodayString();

const upcomingEvents =
allEvents
.filter(
event =>
event.date &&
event.date >= today
)
.sort(
(a, b) =>
String(a.date)
.localeCompare(
String(b.date)
)
);

return (
upcomingEvents[0] ||
null
);

}

function renderFeaturedEvent() {

const container =
$('featuredEvent');

const image =
$('featuredEventImage');

const placeholder =
$('featuredEventPlaceholder');

const date =
$('featuredEventDate');

const title =
$('featuredEventTitle');

const description =
$('featuredEventDescription');

if (
!container ||
!title ||
!description
) {
return;
}

const event =
getNextEvent();

// -------------------------------------------------------
// AUCUN ÉVÉNEMENT À VENIR
// -------------------------------------------------------

if (!event) {

```
title.textContent =
  'Aucun événement à venir';

description.textContent =
  'De nouveaux événements seront bientôt annoncés par le KBG.';

if (date) {

  date.textContent =
    'À VENIR';

}

if (image) {

  image.style.display =
    'none';

  image.removeAttribute(
    'src'
  );

}

if (placeholder) {

  placeholder.style.display =
    'flex';

}

container.onclick =
  null;

container.style.cursor =
  'default';

return;
```

}

// -------------------------------------------------------
// IMAGE
// -------------------------------------------------------

if (
event.photo_url
) {

```
if (image) {

  image.src =
    event.photo_url;

  image.alt =
    event.name || 'Événement';

  image.style.display =
    'block';

}

if (placeholder) {

  placeholder.style.display =
    'none';

}
```

} else {

```
if (image) {

  image.style.display =
    'none';

  image.removeAttribute(
    'src'
  );

}

if (placeholder) {

  placeholder.style.display =
    'flex';

}
```

}

// -------------------------------------------------------
// DATE
// -------------------------------------------------------

if (date) {

```
date.textContent =
  formatEventDate(
    event.date
  );
```

}

// -------------------------------------------------------
// TITRE
// -------------------------------------------------------

title.textContent =
event.name ||
'Événement';

// -------------------------------------------------------
// DESCRIPTION BRÈVE
// -------------------------------------------------------

description.textContent =
event.brief_description ||
event.description ||
'Aucune description disponible.';

// -------------------------------------------------------
// CLIC
// -------------------------------------------------------

container.style.cursor =
'pointer';

container.onclick =
() => {

```
  openEventDetail(
    event
  );

};
```

}

// =========================================================
// AFFICHAGE DES ÉVÉNEMENTS
// =========================================================

function renderEvents() {

const container =
$('events');

renderFeaturedEvent();

if (!container) {
return;
}

if ($('eventsCount')) {

```
$('eventsCount').textContent =
  `${allEvents.length} événement(s)`;
```

}

if (!allEvents.length) {

```
container.innerHTML = `

  <div
    class="empty panel"
  >
    Aucun événement pour le moment.
  </div>

`;

return;
```

}

// -------------------------------------------------------
// TRI
// -------------------------------------------------------

const today =
getTodayString();

const sortedEvents =
[...allEvents].sort(
(a, b) => {

```
    const aDate =
      a.date || '9999-12-31';

    const bDate =
      b.date || '9999-12-31';


    // Les événements à venir d'abord
    const aUpcoming =
      a.date &&
      a.date >= today;

    const bUpcoming =
      b.date &&
      b.date >= today;


    if (
      aUpcoming &&
      !bUpcoming
    ) {
      return -1;
    }

    if (
      !aUpcoming &&
      bUpcoming
    ) {
      return 1;
    }


    if (aUpcoming && bUpcoming) {

      return aDate.localeCompare(
        bDate
      );

    }


    // Événements passés :
    // les plus récents d'abord

    return bDate.localeCompare(
      aDate
    );

  }
);
```

// -------------------------------------------------------
// CARTES
// -------------------------------------------------------

container.innerHTML =
sortedEvents
.map(
event => {

```
      const isPast =
        event.date &&
        event.date < today;


      return `

        <article
          class="card"
          data-event-id="${esc(
            event.id
          )}"
          style="
            cursor:pointer;
            ${
              isPast
                ? 'opacity:.72;'
                : ''
            }
          "
        >

          <div class="cover">

            ${
              event.photo_url

                ? `

                  <img
                    src="${esc(
                      event.photo_url
                    )}"
                    alt="${esc(
                      event.name
                    )}"
                  >

                `

                : '<span>✦</span>'
            }

          </div>


          <div class="card-body">

            <p class="tag">

              ${
                isPast
                  ? 'Événement passé'
                  : 'À venir'
              }

            </p>


            <h3>
              ${esc(
                event.name
              )}
            </h3>


            ${
              event.date
                ? `

                  <p class="publisher">

                    📅
                    ${esc(
                      formatShortEventDate(
                        event.date
                      )
                    )}

                  </p>

                `
                : ''
            }


            <p class="publisher">

              Organisé par
              ${esc(
                event.organizers ||
                ''
              )}

            </p>


            ${
              event.brief_description

                ? `

                  <p
                    class="desc"
                    style="
                      font-weight:600;
                    "
                  >
                    ${esc(
                      event.brief_description
                    )}
                  </p>

                `

                : `

                  <p class="desc">
                    ${esc(
                      event.description ||
                      ''
                    )}
                  </p>

                `
            }


            <p
              style="
                color:var(--accent);
                font-size:12px;
                margin-top:10px;
                font-weight:700;
              "
            >
              Voir les détails →
            </p>

          </div>

        </article>

      `;

    }
  )
  .join('');
```

// -------------------------------------------------------
// CLIC CARTES
// -------------------------------------------------------

container
.querySelectorAll(
'[data-event-id]'
)
.forEach(
card => {

```
    card.addEventListener(
      'click',
      () => {

        const event =
          allEvents.find(
            item =>
              String(item.id) ===
              String(
                card.dataset.eventId
              )
          );


        if (event) {

          openEventDetail(
            event
          );

        }

      }
    );

  }
);
```

}

// =========================================================
// DÉTAIL D'UN ÉVÉNEMENT
// =========================================================

function openEventDetail(event) {

const body =
$('eventDetailBody');

if (!body) {
return;
}

body.innerHTML = `

```
${
  event.photo_url

    ? `

      <div
        class="cover"
        style="
          height:220px;
          border-radius:8px;
          margin-bottom:16px;
        "
      >

        <img
          src="${esc(
            event.photo_url
          )}"
          alt="${esc(
            event.name
          )}"
          style="
            width:100%;
            height:100%;
            object-fit:cover;
            border-radius:8px;
          "
        >

      </div>

    `

    : ''
}


<p class="eyebrow">
  ÉVÉNEMENT
</p>


<h2>
  ${esc(
    event.name
  )}
</h2>


${
  event.date

    ? `

      <p
        class="publisher"
        style="
          margin-top:6px;
        "
      >
        📅
        ${esc(
          formatEventDate(
            event.date
          )
        )}
      </p>

    `

    : ''
}


<p
  class="publisher"
  style="
    margin-top:6px;
  "
>
  Organisé par
  ${esc(
    event.organizers ||
    ''
  )}
</p>


${
  event.brief_description

    ? `

      <div
        style="
          margin-top:18px;
          padding:14px;
          background:var(--bg);
          border:1px solid var(--line);
          border-radius:8px;
        "
      >

        <p
          class="eyebrow"
          style="
            margin-bottom:6px;
          "
        >
          EN BREF
        </p>

        <p
          style="
            font-size:13px;
            line-height:1.6;
          "
        >
          ${esc(
            event.brief_description
          )}
        </p>

      </div>

    `

    : ''
}


<p
  style="
    margin-top:18px;
    color:var(--text);
    font-size:14px;
    line-height:1.7;
    white-space:pre-wrap;
    overflow-wrap:anywhere;
  "
>
  ${esc(
    event.description ||
    ''
  )}
</p>


${
  isAdmin

    ? `

      <button
        class="button danger"
        id="deleteEventBtn"
        style="
          margin-top:20px;
        "
      >
        Supprimer l'événement
      </button>

    `

    : ''
}
```

`;

// -------------------------------------------------------
// SUPPRESSION
// -------------------------------------------------------

if (isAdmin) {

```
$('deleteEventBtn')
  ?.addEventListener(
    'click',
    async () => {

      if (
        !confirm(
          'Supprimer cet événement ?'
        )
      ) {
        return;
      }


      const {
        error
      } =
        await supabase
          .from('events')
          .delete()
          .eq(
            'id',
            event.id
          );


      if (error) {

        console.error(
          'Erreur suppression événement :',
          error
        );


        alert(
          "Impossible de supprimer l'événement :\n" +
          error.message
        );

        return;

      }


      $('eventDetailModal')
        ?.classList.add(
          'hidden'
        );


      await loadEvents();

    }
  );
```

}

$('eventDetailModal')
?.classList.remove(
'hidden'
);

}

// =========================================================
// LISTENERS
// =========================================================

function setupEventListeners() {

// -------------------------------------------------------
// FERMETURE MODALES
// -------------------------------------------------------

document
.querySelectorAll(
'[data-close]'
)
.forEach(
button => {

```
    button.onclick =
      () => {

        const targetId =
          button.dataset.close;

        $(targetId)
          ?.classList.add(
            'hidden'
          );

      };

  }
);
```

// -------------------------------------------------------
// AJOUT ÉVÉNEMENT
// -------------------------------------------------------

$('openAddEventBtn')
?.addEventListener(
'click',
() => {

```
    if (!currentUser) {

      $('authModal')
        ?.classList.remove(
          'hidden'
        );

      return;

    }


    if (!isAdmin) {

      alert(
        'Seuls les administrateurs peuvent ajouter un événement.'
      );

      return;

    }


    $('addEventModal')
      ?.classList.remove(
        'hidden'
      );

  }
);
```

// -------------------------------------------------------
// FORMULAIRE AJOUT
// -------------------------------------------------------

$('addEventForm')
?.addEventListener(
'submit',
async e => {

```
    e.preventDefault();


    const form =
      e.currentTarget;

    const msg =
      $('addEventMsg');

    const submitBtn =
      form.querySelector(
        'button[type="submit"]'
      );


    if (!currentUser) {

      if (msg) {

        msg.textContent =
          'Vous devez être connecté pour ajouter un événement.';

        msg.style.color =
          'var(--danger)';

      }

      return;

    }


    if (!isAdmin) {

      if (msg) {

        msg.textContent =
          'Seuls les administrateurs peuvent ajouter un événement.';

        msg.style.color =
          'var(--danger)';

      }

      return;

    }


    const formData =
      new FormData(form);


    const name =
      String(
        formData.get('name') ||
        ''
      ).trim();


    const date =
      String(
        formData.get('date') ||
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


    const briefDescription =
      String(
        formData.get(
          'brief_description'
        ) ||
        ''
      ).trim();


    const description =
      String(
        formData.get('description') ||
        ''
      ).trim();


    // ---------------------------------------------------
    // VALIDATION
    // ---------------------------------------------------

    if (!name) {

      if (msg) {

        msg.textContent =
          "Le nom de l'événement est obligatoire.";

        msg.style.color =
          'var(--danger)';

      }

      return;

    }


    if (!date) {

      if (msg) {

        msg.textContent =
          "La date de l'événement est obligatoire.";

        msg.style.color =
          'var(--danger)';

      }

      return;

    }


    if (!organizers) {

      if (msg) {

        msg.textContent =
          "L'organisateur est obligatoire.";

        msg.style.color =
          'var(--danger)';

      }

      return;

    }


    if (!briefDescription) {

      if (msg) {

        msg.textContent =
          'La description brève est obligatoire.';

        msg.style.color =
          'var(--danger)';

      }

      return;

    }


    if (!description) {

      if (msg) {

        msg.textContent =
          'La description complète est obligatoire.';

        msg.style.color =
          'var(--danger)';

      }

      return;

    }


    if (submitBtn) {
      submitBtn.disabled = true;
    }


    if (msg) {

      msg.textContent =
        'Publication…';

      msg.style.color =
        'var(--muted)';

    }


    try {

      const newEvent = {

        name,

        date,

        organizers,

        photo_url:
          photoUrl ||
          null,

        brief_description:
          briefDescription,

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


      setTimeout(
        () => {

          $('addEventModal')
            ?.classList.add(
              'hidden'
            );

          if (msg) {
            msg.textContent = '';
          }

        },
        800
      );


    } catch (error) {

      console.error(
        'Erreur création événement :',
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
```

// -------------------------------------------------------
// CONNEXION
// -------------------------------------------------------

$('loginForm')
?.addEventListener(
'submit',
async e => {

```
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
      } =
        await supabase.auth
          .signInWithPassword({

            email:
              $('loginEmail')
                .value
                .trim(),

            password:
              $('loginPassword')
                .value

          });


      if (error) {
        throw error;
      }


      e.currentTarget.reset();


      $('authModal')
        ?.classList.add(
          'hidden'
        );


    } catch (error) {

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
```

// -------------------------------------------------------
// INSCRIPTION
// -------------------------------------------------------

$('signupForm')
?.addEventListener(
'submit',
async e => {

```
    e.preventDefault();


    const msg =
      $('signupMsg');

    const submitBtn =
      e.currentTarget.querySelector(
        'button[type="submit"]'
      );


    if (submitBtn) {
      submitBtn.disabled = true;
    }


    if (msg) {

      msg.textContent =
        'Création du compte…';

      msg.style.color =
        'var(--muted)';

    }


    try {

      const {
        error
      } =
        await supabase.auth
          .signUp({

            email:
              $('signupEmail')
                .value
                .trim(),

            password:
              $('signupPassword')
                .value,

            options: {

              data: {

                first_name:
                  $('signupFirst')
                    .value
                    .trim(),

                last_name:
                  $('signupLast')
                    .value
                    .trim()

              }

            }

          });


      if (error) {
        throw error;
      }


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
```

}
