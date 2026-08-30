import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://qqelmmygalllmxinaxrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fqFvZNetzIdAfX860bmjBQ_GzJfeVK3';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let allEvents = [];
let currentUser = null;

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

  loadEvents();
});

supabase.auth.onAuthStateChange((_e, session) => {
  handleAuthChange(session?.user || null);
});

// --- AUTHENTIFICATION ---

async function handleAuthChange(user) {
  currentUser = user;
  const userNav = $('userNav');
  const addBtn = $('openAddEventBtn');

  if (currentUser) {
    if (userNav) {
      userNav.innerHTML = `
        <span style="font-size:13px; font-weight:700;">👋 ${esc(currentUser.email)}</span>
        <button class="button" id="logoutBtn">Déconnexion</button>
      `;
      $('logoutBtn').onclick = () => supabase.auth.signOut();
    }
    addBtn?.classList.remove('hidden');
  } else {
    if (userNav) {
      userNav.innerHTML = `<button class="button" id="openAuthBtn">👤 Connexion</button>`;
      $('openAuthBtn').onclick = () => $('authModal')?.classList.remove('hidden');
    }
    addBtn?.classList.add('hidden');
  }

  renderEvents();
}

// --- CATALOGUE D'ÉVÉNEMENTS ---

async function loadEvents() {
  try {
    const { data, error } = await supabase.from('events').select('*').order('created_at', { ascending: false });
    if (error) throw error;

    allEvents = data || [];
    renderEvents();
  } catch (e) {
    console.error("Erreur événements:", e);
    if ($('events')) $('events').innerHTML = '<div class="empty">Erreur de chargement des événements.</div>';
  }
}

function renderEvents() {
  const container = $('events');
  if (!container) return;

  if ($('eventsCount')) $('eventsCount').textContent = `${allEvents.length} événement(s)`;

  if (!allEvents.length) {
    container.innerHTML = '<div class="empty panel">Aucun événement pour le moment.</div>';
    return;
  }

  container.innerHTML = allEvents.map(ev => `
    <article class="card" data-event-id="${esc(ev.id)}" style="cursor:pointer;">
      <div class="cover">${ev.photo_url ? `<img src="${esc(ev.photo_url)}" alt="${esc(ev.name)}">` : '<span>✦</span>'}</div>
      <div class="card-body">
        <p class="tag">Événement</p>
        <h3>${esc(ev.name)}</h3>
        <p class="publisher">Organisé par ${esc(ev.organizers)}</p>
        <p class="desc">${esc(ev.description || '')}</p>
      </div>
    </article>
  `).join('');

  container.querySelectorAll('[data-event-id]').forEach(card => {
    card.addEventListener('click', () => {
      const ev = allEvents.find(e => String(e.id) === card.dataset.eventId);
      if (ev) openEventDetail(ev);
    });
  });
}

function openEventDetail(ev) {
  const body = $('eventDetailBody');
  if (!body) return;

  body.innerHTML = `
    ${ev.photo_url ? `<div class="cover" style="height:220px; border-radius:8px; margin-bottom:16px;"><img src="${esc(ev.photo_url)}" alt="${esc(ev.name)}" style="width:100%; height:100%; object-fit:cover; border-radius:8px;"></div>` : ''}
    <p class="eyebrow">ÉVÉNEMENT</p>
    <h2>${esc(ev.name)}</h2>
    <p class="publisher" style="margin-top:6px;">Organisé par ${esc(ev.organizers)}</p>
    <p style="margin-top:16px; color:var(--text); font-size:14px; white-space:pre-wrap;">${esc(ev.description || '')}</p>
    ${currentUser ? `<button class="button danger" id="deleteEventBtn" style="margin-top:20px;">Supprimer l'événement</button>` : ''}
  `;

  if (currentUser) {
    $('deleteEventBtn').onclick = async () => {
      if (!confirm('Supprimer cet événement ?')) return;
      const { error } = await supabase.from('events').delete().eq('id', ev.id);
      if (!error) {
        $('eventDetailModal')?.classList.add('hidden');
        loadEvents();
      }
    };
  }

  $('eventDetailModal')?.classList.remove('hidden');
}

// --- ÉVÉNEMENTS & LISTENERS ---

function setupEventListeners() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.dataset.close;
      $(targetId)?.classList.add('hidden');
    };
  });

  $('openAddEventBtn')?.addEventListener('click', () => {
    if (!currentUser) {
      $('authModal')?.classList.remove('hidden');
      return;
    }
    $('addEventModal')?.classList.remove('hidden');
  });

  $('addEventForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('addEventMsg');
    const submitBtn = e.currentTarget.querySelector('button[type="submit"]');

    if (!currentUser) {
      if (msg) {
        msg.textContent = 'Vous devez être connecté pour ajouter un événement.';
        msg.style.color = 'var(--danger)';
      }
      return;
    }

    if (msg) {
      msg.textContent = 'Publication…';
      msg.style.color = 'var(--muted)';
    }
    if (submitBtn) submitBtn.disabled = true;

    const f = new FormData(e.currentTarget);
    const newEvent = {
      id: crypto.randomUUID(),
      name: f.get('name').trim(),
      organizers: f.get('organizers').trim(),
      photo_url: f.get('photo_url').trim() || null,
      description: f.get('description').trim()
    };

    const { error } = await supabase.from('events').insert(newEvent);
    if (submitBtn) submitBtn.disabled = false;

    if (error) {
      if (msg) {
        msg.textContent = 'Erreur : ' + error.message;
        msg.style.color = 'var(--danger)';
      }
      return;
    }

    if (msg) {
      msg.textContent = '✓ Événement publié !';
      msg.style.color = 'var(--success)';
    }
    e.currentTarget.reset();
    loadEvents();
    setTimeout(() => $('addEventModal')?.classList.add('hidden'), 800);
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

    const { error } = await supabase.auth.signInWithPassword({
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

    if (msg) {
      msg.textContent = 'Création du compte…';
      msg.style.color = 'var(--muted)';
    }
    if (submitBtn) submitBtn.disabled = true;

    const { error } = await supabase.auth.signUp({
      email: $('signupEmail').value.trim(),
      password: $('signupPassword').value,
      options: { data: { first_name: $('signupFirst').value.trim(), last_name: $('signupLast').value.trim() } }
    });

    if (submitBtn) submitBtn.disabled = false;

    if (error) {
      if (msg) {
        msg.textContent = 'Erreur : ' + error.message;
        msg.style.color = 'var(--danger)';
      }
      return;
    }

    if (msg) {
      msg.textContent = '✓ Compte créé ! Vérifiez votre boîte mail si une confirmation est requise.';
      msg.style.color = 'var(--success)';
    }
    e.currentTarget.reset();
  });
}
