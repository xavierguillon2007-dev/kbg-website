import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://qqelmmygalllmxinaxrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fqFvZNetzIdAfX860bmjBQ_GzJfeVK3';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let allEvents = [];
let currentUser = null;
let isAdmin = false;

const $ = id => document.getElementById(id);

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));


/* =========================================================
   INITIALISATION
   ========================================================= */

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error("Erreur récupération session :", error);
    }

    await handleAuthChange(data?.session?.user || null);

  } catch (err) {
    console.error("Erreur Auth :", err);
  }

  loadEvents();
});


/* =========================================================
   AUTHENTIFICATION
   ========================================================= */

supabase.auth.onAuthStateChange((_event, session) => {
  handleAuthChange(session?.user || null);
});


async function handleAuthChange(user) {
  currentUser = user;
  isAdmin = false;

  const userNav = $('userNav');
  const addBtn = $('openAddEventBtn');

  if (currentUser) {

    /* -----------------------------------------
       Vérification du statut administrateur
       ----------------------------------------- */

    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (adminError) {
      console.error("Erreur vérification admin :", adminError);
    }

    isAdmin = !!adminData;


    /* -----------------------------------------
       Navigation utilisateur
       ----------------------------------------- */

    if (userNav) {
      userNav.innerHTML = `
        <span style="font-size:13px; font-weight:700;">
          👋 ${esc(currentUser.email)}
        </span>

        ${
          isAdmin
            ? `<span class="tag" style="margin-left:6px;">ADMIN</span>`
            : ''
        }

        <button class="button" id="logoutBtn">
          Déconnexion
        </button>
      `;

      $('logoutBtn').onclick = async () => {
        const { error } = await supabase.auth.signOut();

        if (error) {
          console.error("Erreur déconnexion :", error);
        }
      };
    }


    /* -----------------------------------------
       Bouton ajouter événement
       ----------------------------------------- */

    if (isAdmin) {
      addBtn?.classList.remove('hidden');
    } else {
      addBtn?.classList.add('hidden');
    }

  } else {

    /* -----------------------------------------
       Utilisateur non connecté
       ----------------------------------------- */

    if (userNav) {
      userNav.innerHTML = `
        <button class="button" id="openAuthBtn">
          👤 Connexion
        </button>
      `;

      $('openAuthBtn').onclick = () => {
        $('authModal')?.classList.remove('hidden');
      };
    }

    addBtn?.classList.add('hidden');
  }

  renderEvents();
}


/* =========================================================
   CHARGEMENT DES ÉVÉNEMENTS
   ========================================================= */

async function loadEvents() {
  try {

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    allEvents = data || [];

    renderEvents();

  } catch (e) {

    console.error("Erreur événements :", e);

    if ($('events')) {
      $('events').innerHTML = `
        <div class="empty">
          Erreur de chargement des événements.
        </div>
      `;
    }
  }
}


/* =========================================================
   AFFICHAGE DES ÉVÉNEMENTS
   ========================================================= */

function renderEvents() {

  const container = $('events');

  if (!container) return;

  if ($('eventsCount')) {
    $('eventsCount').textContent =
      `${allEvents.length} événement(s)`;
  }

  if (!allEvents.length) {

    container.innerHTML = `
      <div class="empty panel">
        Aucun événement pour le moment.
      </div>
    `;

    return;
  }


  container.innerHTML = allEvents.map(ev => `

    <article
      class="card"
      data-event-id="${esc(ev.id)}"
      style="cursor:pointer;"
    >

      <div class="cover">

        ${
          ev.photo_url
            ? `
              <img
                src="${esc(ev.photo_url)}"
                alt="${esc(ev.name)}"
              >
            `
            : '<span>✦</span>'
        }

      </div>

      <div class="card-body">

        <p class="tag">
          Événement
        </p>

        <h3>
          ${esc(ev.name)}
        </h3>

        ${
          ev.date
            ? `
              <p class="publisher">
                📅 ${esc(ev.date)}
              </p>
            `
            : ''
        }

        <p class="publisher">
          Organisé par ${esc(ev.organizers || '')}
        </p>

        <p class="desc">
          ${esc(ev.description || '')}
        </p>

      </div>

    </article>

  `).join('');


  /* -----------------------------------------
     Ouverture des détails
     ----------------------------------------- */

  container
    .querySelectorAll('[data-event-id]')
    .forEach(card => {

      card.addEventListener('click', () => {

        const ev = allEvents.find(
          e => String(e.id) === card.dataset.eventId
        );

        if (ev) {
          openEventDetail(ev);
        }

      });

    });
}


/* =========================================================
   DÉTAIL D'UN ÉVÉNEMENT
   ========================================================= */

function openEventDetail(ev) {

  const body = $('eventDetailBody');

  if (!body) return;


  body.innerHTML = `

    ${
      ev.photo_url
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
              src="${esc(ev.photo_url)}"
              alt="${esc(ev.name)}"
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
      ${esc(ev.name)}
    </h2>

    ${
      ev.date
        ? `
          <p
            class="publisher"
            style="margin-top:6px;"
          >
            📅 ${esc(ev.date)}
          </p>
        `
        : ''
    }

    <p
      class="publisher"
      style="margin-top:6px;"
    >
      Organisé par ${esc(ev.organizers || '')}
    </p>

    <p
      style="
        margin-top:16px;
        color:var(--text);
        font-size:14px;
        white-space:pre-wrap;
      "
    >
      ${esc(ev.description || '')}
    </p>

    ${
      isAdmin
        ? `
          <button
            class="button danger"
            id="deleteEventBtn"
            style="margin-top:20px;"
          >
            Supprimer l'événement
          </button>
        `
        : ''
    }

  `;


  /* -----------------------------------------
     Suppression
     ----------------------------------------- */

  if (isAdmin) {

    $('deleteEventBtn').onclick = async () => {

      if (!confirm('Supprimer cet événement ?')) {
        return;
      }

      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', ev.id);

      if (error) {

        console.error(
          "Erreur suppression événement :",
          error
        );

        alert(
          "Impossible de supprimer l'événement :\n" +
          error.message
        );

        return;
      }

      $('eventDetailModal')?.classList.add('hidden');

      await loadEvents();
    };
  }


  $('eventDetailModal')?.classList.remove('hidden');
}


/* =========================================================
   LISTENERS
   ========================================================= */

function setupEventListeners() {


  /* -----------------------------------------
     Fermeture des modales
     ----------------------------------------- */

  document
    .querySelectorAll('[data-close]')
    .forEach(btn => {

      btn.onclick = () => {

        const targetId = btn.dataset.close;

        $(targetId)?.classList.add('hidden');
      };

    });


  /* -----------------------------------------
     Ajouter un événement
     ----------------------------------------- */

  $('openAddEventBtn')?.addEventListener(
    'click',
    () => {

      if (!currentUser) {

        $('authModal')?.classList.remove('hidden');

        return;
      }

      if (!isAdmin) {

        alert(
          "Seuls les administrateurs peuvent ajouter un événement."
        );

        return;
      }

      $('addEventModal')?.classList.remove('hidden');
    }
  );


  /* -----------------------------------------
     Formulaire ajout événement
     ----------------------------------------- */

  $('addEventForm')?.addEventListener(
    'submit',
    async e => {

      e.preventDefault();

      const msg = $('addEventMsg');

      const submitBtn =
        e.currentTarget.querySelector(
          'button[type="submit"]'
        );


      /* Sécurité côté client */

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


      /* Message de chargement */

      if (msg) {
        msg.textContent =
          'Publication…';

        msg.style.color =
          'var(--muted)';
      }


      if (submitBtn) {
        submitBtn.disabled = true;
      }


      /* Récupération formulaire */

      const f = new FormData(e.currentTarget);


      const newEvent = {

        name: String(
          f.get('name') || ''
        ).trim(),

        organizers: String(
          f.get('organizers') || ''
        ).trim(),

        photo_url:
          String(
            f.get('photo_url') || ''
          ).trim() || null,

        description: String(
          f.get('description') || ''
        ).trim()
      };


      /* Insertion */

      const { error } = await supabase
        .from('events')
        .insert(newEvent);


      if (submitBtn) {
        submitBtn.disabled = false;
      }


      /* Erreur */

      if (error) {

        console.error(
          "Erreur création événement :",
          error
        );

        if (msg) {

          msg.textContent =
            'Erreur : ' + error.message;

          msg.style.color =
            'var(--danger)';
        }

        return;
      }


      /* Succès */

      if (msg) {

        msg.textContent =
          '✓ Événement publié !';

        msg.style.color =
          'var(--success)';
      }


      e.currentTarget.reset();

      await loadEvents();


      setTimeout(() => {

        $('addEventModal')
          ?.classList.add('hidden');

      }, 800);

    }
  );


  /* -----------------------------------------
     CONNEXION
     ----------------------------------------- */

  $('loginForm')?.addEventListener(
    'submit',
    async e => {

      e.preventDefault();

      const msg = $('loginMsg');

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


      const { error } =
        await supabase.auth.signInWithPassword({

          email:
            $('loginEmail').value.trim(),

          password:
            $('loginPassword').value

        });


      if (submitBtn) {
        submitBtn.disabled = false;
      }


      if (error) {

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

        return;
      }


      if (msg) {

        msg.textContent = '';
        msg.style.color = '';
      }


      e.currentTarget.reset();

      $('authModal')
        ?.classList.add('hidden');
    }
  );


  /* -----------------------------------------
     INSCRIPTION
     ----------------------------------------- */

  $('signupForm')?.addEventListener(
    'submit',
    async e => {

      e.preventDefault();

      const msg = $('signupMsg');

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


      const { error } =
        await supabase.auth.signUp({

          email:
            $('signupEmail').value.trim(),

          password:
            $('signupPassword').value,

          options: {

            data: {

              first_name:
                $('signupFirst').value.trim(),

              last_name:
                $('signupLast').value.trim()

            }

          }

        });


      if (submitBtn) {
        submitBtn.disabled = false;
      }


      if (error) {

        console.error(
          "Erreur inscription :",
          error
        );

        if (msg) {

          msg.textContent =
            'Erreur : ' +
            error.message;

          msg.style.color =
            'var(--danger)';
        }

        return;
      }


      if (msg) {

        msg.textContent =
          '✓ Compte créé ! Vérifiez votre boîte mail si une confirmation est requise.';

        msg.style.color =
          'var(--success)';
      }


      e.currentTarget.reset();
    }
  );

}
