// CONFIGURATION SUPABASE
const SUPABASE_URL = "https://VOTRE_PROJET.supabase.co";
const SUPABASE_ANON_KEY = "VOTRE_CLE_ANON_SUPABASE";

let supabaseClient = null;
if (typeof supabase !== 'undefined' && !SUPABASE_URL.includes("VOTRE_PROJET")) {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// State Utilisateur
let currentUser = null; // null si non connecté, sinon objet utilisateur

// Données locales
let currentEvent = {
  id: 1,
  title: "Soirée Jeux de Société & Découvertes",
  date: "Vendredi 12 Septembre • 19h00",
  image_url: "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=600&q=80",
  description: "Rejoignez la communauté KBG pour tester les dernières nouveautés !"
};

let gamesList = [
  {
    id: 1,
    title: "Catan",
    genre: "Gestion",
    players: "3-4",
    duration: 75,
    image_url: "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=600&q=80",
    description: "Bâtissez vos colonies et devenez le maître de l'île de Catan."
  }
];
let gameReviewsList = [];
let bookingsList = [];

// Éléments DOM Auth
const authModal = document.getElementById('auth-modal');
const openAuthBtn = document.getElementById('open-auth-btn');
const closeAuthModal = document.getElementById('close-auth-modal');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const btnShowLogin = document.getElementById('btn-show-login');
const btnShowSignup = document.getElementById('btn-show-signup');
const authWarning = document.getElementById('auth-warning');
const submitBookingBtn = document.getElementById('submit-booking-btn');

// Éléments DOM Modales & Administration
const adminModal = document.getElementById('admin-modal');
const gameModal = document.getElementById('game-modal');
const openAdminBtn = document.getElementById('open-admin-btn');
const closeAdminBtn = document.getElementById('close-admin-btn');
const closeGameModal = document.getElementById('close-game-modal');

// 1. GESTION DU SYSTÈME DE COMPTE (AUTH)

// Mise à jour de l'UI selon l'état de connexion
async function updateAuthUI() {
  const userNav = document.querySelector('.user-nav');

  if (currentUser) {
    let isAdmin = false;

    // Interrogation de Supabase pour savoir si l'utilisateur est admin
    if (supabaseClient) {
      // Note : si la colonne dans ta table s'appelle 'user_id', remplace 'id' par 'user_id' ci-dessous
      const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('is_admin')
        .eq('id', currentUser.id) 
        .single();
      
      if (!error && profile) {
        isAdmin = profile.is_admin;
      }
    }

    // Affichage des éléments du menu du haut
    userNav.innerHTML = `
      <span style="font-weight:700; font-size:13px;">👋 ${currentUser.user_metadata?.name || currentUser.email}</span>
      ${isAdmin ? '<button class="button primary" id="open-admin-btn">🔑 Espace Admin</button>' : ''}
      <button class="button" id="logout-btn">Déconnexion</button>
    `;

    // Attachement des événements sur les boutons
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    if (isAdmin) {
      document.getElementById('open-admin-btn').addEventListener('click', () => {
        adminModal.classList.add('active');
      });
    }

    authWarning.style.display = 'none';
    submitBookingBtn.disabled = false;
  } else {
    // Cas non connecté
    userNav.innerHTML = `<button class="button" id="open-auth-btn">👤 Se connecter</button>`;
    document.getElementById('open-auth-btn').addEventListener('click', () => authModal.classList.add('active'));
    authWarning.style.display = 'block';
  }
}
// Inscription
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;

  if (supabaseClient) {
    const { data, error } = await supabaseClient.auth.signUp({
      email, password, options: { data: { name } }
    });
    if (error) return alert(`Erreur: ${error.message}`);
    currentUser = data.user;
  } else {
    // Mode démo sans Supabase configuré
    currentUser = { email, user_metadata: { name } };
  }

  alert("🎉 Compte créé avec succès !");
  authModal.classList.remove('active');
  updateAuthUI();
});

// Connexion
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  if (supabaseClient) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return alert(`Erreur: ${error.message}`);
    currentUser = data.user;
  } else {
    // Mode démo sans Supabase configuré
    currentUser = { email, user_metadata: { name: email.split('@')[0] } };
  }

  alert("👋 Connexion réussie !");
  authModal.classList.remove('active');
  updateAuthUI();
});

// Déconnexion
async function handleLogout() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentUser = null;
  updateAuthUI();
  alert("Vous êtes déconnecté.");
}

// Toggle Onglets Auth
btnShowLogin.addEventListener('click', () => {
  btnShowLogin.classList.add('active');
  btnShowSignup.classList.remove('active');
  loginForm.style.display = 'grid';
  signupForm.style.display = 'none';
});

btnShowSignup.addEventListener('click', () => {
  btnShowSignup.classList.add('active');
  btnShowLogin.classList.remove('active');
  signupForm.style.display = 'grid';
  loginForm.style.display = 'none';
});

// 2. EMBARQUEMENT & CATALOGUE
function renderEvent(data) {
  document.getElementById('event-title').textContent = data.title;
  document.getElementById('event-date').textContent = `📅 ${data.date}`;
  document.getElementById('event-desc').textContent = data.description;
  document.getElementById('event-image').src = data.image_url;
}

function renderGames() {
  const gamesGrid = document.getElementById('games-grid');
  const gamesCounter = document.getElementById('games-counter');
  const bookGameSelect = document.getElementById('book-game');

  gamesGrid.innerHTML = "";
  gamesCounter.textContent = `${gamesList.length} Jeu${gamesList.length > 1 ? 'x' : ''} Disponible${gamesList.length > 1 ? 's' : ''}`;

  gamesList.forEach(game => {
    const card = document.createElement('div');
    card.className = "game-card";
    card.innerHTML = `
      <img src="${game.image_url}" class="game-card-img" alt="${game.title}">
      <div class="game-card-body">
        <span class="badge">${game.genre}</span>
        <h3 class="game-card-title">${game.title}</h3>
        <p style="font-size: 13px; color: var(--text-muted); margin: 0;">👥 ${game.players} joueurs • ⏱️ ${game.duration} min</p>
        <button class="button" style="margin-top: auto;" onclick="openGameDetails(${game.id})">💬 Fiche & Avis</button>
      </div>
    `;
    gamesGrid.appendChild(card);
  });

  bookGameSelect.innerHTML = `<option value="">-- Sélectionnez un jeu --</option>`;
  gamesList.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.title;
    opt.textContent = g.title;
    bookGameSelect.appendChild(opt);
  });
}

// Fiche Jeu & Avis
function openGameDetails(gameId) {
  const game = gamesList.find(g => g.id === gameId);
  if (!game) return;

  document.getElementById('modal-game-id').value = game.id;
  document.getElementById('modal-game-title').textContent = game.title;
  document.getElementById('modal-game-image').src = game.image_url;
  document.getElementById('modal-game-genre').textContent = game.genre;
  document.getElementById('modal-game-players').textContent = `👥 ${game.players} joueurs`;
  document.getElementById('modal-game-duration').textContent = `⏱️ ${game.duration} min`;
  document.getElementById('modal-game-desc').textContent = game.description;

  if (currentUser) {
    document.getElementById('game-review-author').value = currentUser.user_metadata?.name || currentUser.email;
  }

  renderGameReviews(game.id);
  gameModal.classList.add('active');
}

function renderGameReviews(gameId) {
  const container = document.getElementById('modal-game-reviews');
  container.innerHTML = "";
  const reviews = gameReviewsList.filter(r => r.game_id === gameId);

  if (reviews.length === 0) {
    container.innerHTML = `<p style="font-size:13px;">Aucun avis pour ce jeu pour le moment.</p>`;
    return;
  }

  reviews.forEach(r => {
    const stars = "⭐".repeat(r.rating);
    const div = document.createElement('div');
    div.className = "admin-item";
    div.innerHTML = `<span><strong>${r.author}</strong> (${stars}) : "${r.comment}"</span>`;
    container.appendChild(div);
  });
}

document.getElementById('add-game-review-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!currentUser) return alert("Vous devez être connecté pour laisser un avis.");

  const gameId = parseInt(document.getElementById('modal-game-id').value);
  gameReviewsList.unshift({
    id: Date.now(),
    game_id: gameId,
    author: document.getElementById('game-review-author').value,
    rating: parseInt(document.getElementById('game-review-rating').value),
    comment: document.getElementById('game-review-comment').value
  });

  renderGameReviews(gameId);
  document.getElementById('add-game-review-form').reset();
});

// Emprunts & Admin Forms
document.getElementById('booking-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!currentUser) return alert("Veuillez vous connecter pour emprunter un jeu.");

  const startDate = document.getElementById('book-start-date').value;
  const endDate = document.getElementById('book-end-date').value;

  if (endDate < startDate) return alert("La date de retour doit être postérieure à la date de début.");

  bookingsList.unshift({
    name: document.getElementById('book-name').value,
    game: document.getElementById('book-game').value,
    startDate, endDate
  });

  alert("✨ Emprunt enregistré !");
  document.getElementById('booking-form').reset();
});

// Modal Events
openAuthBtn?.addEventListener('click', () => authModal.classList.add('active'));
closeAuthModal.addEventListener('click', () => authModal.classList.remove('active'));
closeAdminBtn.addEventListener('click', () => adminModal.classList.remove('active'));
closeGameModal.addEventListener('click', () => gameModal.classList.remove('active'));

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
  if (supabaseClient) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    currentUser = user;
  }
  updateAuthUI();
  renderEvent(currentEvent);
  renderGames();
});
