// CONFIGURATION SUPABASE
const SUPABASE_URL = "https://VOTRE_PROJET.supabase.co";
const SUPABASE_ANON_KEY = "VOTRE_CLE_ANON_SUPABASE";

let supabaseClient = null;
if (typeof supabase !== 'undefined' && !SUPABASE_URL.includes("VOTRE_PROJET")) {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Données initiales locales
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

// Sélection DOM
const eventTitle = document.getElementById('event-title');
const eventDate = document.getElementById('event-date');
const eventDesc = document.getElementById('event-desc');
const eventImage = document.getElementById('event-image');

const gamesGrid = document.getElementById('games-grid');
const gamesCounter = document.getElementById('games-counter');
const bookGameSelect = document.getElementById('book-game');

// Modales
const adminModal = document.getElementById('admin-modal');
const gameModal = document.getElementById('game-modal');

const openAdminBtn = document.getElementById('open-admin-btn');
const closeAdminBtn = document.getElementById('close-admin-btn');
const closeGameModal = document.getElementById('close-game-modal');

const adminAddGameForm = document.getElementById('admin-add-game-form');
const addGameReviewForm = document.getElementById('add-game-review-form');
const bookingForm = document.getElementById('booking-form');

const adminBookingsList = document.getElementById('admin-bookings-list');
const calendarDatePicker = document.getElementById('calendar-date-picker');

// 1. Rendu Événement
function renderEvent(data) {
  eventTitle.textContent = data.title;
  eventDate.textContent = `📅 ${data.date}`;
  eventDesc.textContent = data.description;
  eventImage.src = data.image_url;
}

// 2. Rendu Catalogue Jeux & Sélecteur du Formulaire
function renderGames() {
  gamesGrid.innerHTML = "";
  const filtered = filterGamesList();

  gamesCounter.textContent = `${filtered.length} Jeu${filtered.length > 1 ? 'x' : ''} Disponible${filtered.length > 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    gamesGrid.innerHTML = `<div class="empty-state"><p>🎲 Aucun jeu trouvé.</p></div>`;
  } else {
    filtered.forEach(game => {
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
  }

  // Mettre à jour la liste déroulante des jeux dans le formulaire d'emprunt
  bookGameSelect.innerHTML = `<option value="">-- Sélectionnez un jeu --</option>`;
  gamesList.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.title;
    opt.textContent = g.title;
    bookGameSelect.appendChild(opt);
  });
}

// Filtres du Catalogue
function filterGamesList() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const genre = document.getElementById('genre-select').value;
  const players = document.getElementById('players-select').value;
  const duration = document.getElementById('duration-select').value;

  return gamesList.filter(g => {
    const matchSearch = g.title.toLowerCase().includes(search);
    const matchGenre = !genre || g.genre === genre;
    const matchPlayers = !players || (
      players === '2' ? g.players.includes('2') :
      players === '3-5' ? (g.players.includes('3') || g.players.includes('4') || g.players.includes('5')) : true
    );
    const matchDuration = !duration || (
      duration === '30' ? g.duration <= 30 :
      duration === '60' ? (g.duration > 30 && g.duration <= 60) : g.duration > 60
    );
    return matchSearch && matchGenre && matchPlayers && matchDuration;
  });
}

['search-input', 'genre-select', 'players-select', 'duration-select'].forEach(id => {
  document.getElementById(id).addEventListener('change', renderGames);
  document.getElementById(id).addEventListener('input', renderGames);
});

// 3. Modale Fiche Jeu & Avis
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

  renderGameReviews(game.id);
  gameModal.classList.add('active');
}

function renderGameReviews(gameId) {
  const container = document.getElementById('modal-game-reviews');
  container.innerHTML = "";
  
  const reviews = gameReviewsList.filter(r => r.game_id === gameId);

  if (reviews.length === 0) {
    container.innerHTML = `<p class="desc" style="font-size:13px;">Aucun avis pour ce jeu pour le moment. Soyez le premier !</p>`;
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

addGameReviewForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const gameId = parseInt(document.getElementById('modal-game-id').value);
  const newRev = {
    id: Date.now(),
    game_id: gameId,
    author: document.getElementById('game-review-author').value,
    rating: parseInt(document.getElementById('game-review-rating').value),
    comment: document.getElementById('game-review-comment').value
  };

  gameReviewsList.unshift(newRev);
  renderGameReviews(gameId);
  addGameReviewForm.reset();
});

// 4. Administration - Création d'un Jeu
adminAddGameForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const newGame = {
    id: Date.now(),
    title: document.getElementById('new-game-title').value,
    genre: document.getElementById('new-game-genre').value,
    players: document.getElementById('new-game-players').value,
    duration: parseInt(document.getElementById('new-game-duration').value),
    image_url: document.getElementById('new-game-image').value,
    description: document.getElementById('new-game-desc').value
  };

  gamesList.unshift(newGame);
  renderGames();
  adminAddGameForm.reset();
  alert("✨ Jeu ajouté avec succès au catalogue !");
  adminModal.classList.remove('active');
});

// 5. Calendrier des Emprunts (sur plusieurs jours)
function renderBookingsCalendar() {
  adminBookingsList.innerHTML = "";
  const filterDate = calendarDatePicker.value;

  // Filtrer les emprunts qui couvrent la date sélectionnée (si une date est choisie)
  const filtered = filterDate 
    ? bookingsList.filter(b => b.startDate <= filterDate && b.endDate >= filterDate)
    : bookingsList;

  if (filtered.length === 0) {
    adminBookingsList.innerHTML = `<p class="desc" style="font-size:13px;">Aucun emprunt trouvé pour cette période.</p>`;
    return;
  }

  filtered.forEach((b, idx) => {
    const item = document.createElement('div');
    item.className = "admin-item";
    item.innerHTML = `
      <span>📦 <strong>${b.game}</strong> — Emprunté par ${b.name}<br><small>Du ${b.startDate} au ${b.endDate}</small></span>
      <button class="admin-item-delete" onclick="deleteBooking(${idx})">Annuler</button>
    `;
    adminBookingsList.appendChild(item);
  });
}

calendarDatePicker.addEventListener('change', renderBookingsCalendar);

function deleteBooking(index) {
  bookingsList.splice(index, 1);
  renderBookingsCalendar();
}

// Formulaire Emprunt Utilisateur
bookingForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const startDate = document.getElementById('book-start-date').value;
  const endDate = document.getElementById('book-end-date').value;

  if (endDate < startDate) {
    alert("La date de retour doit être supérieure ou égale à la date de début.");
    return;
  }

  const booking = {
    name: document.getElementById('book-name').value,
    game: document.getElementById('book-game').value,
    startDate: startDate,
    endDate: endDate
  };

  bookingsList.unshift(booking);
  renderBookingsCalendar();
  alert("✨ Votre réservation d'emprunt a été validée !");
  bookingForm.reset();
});

// 6. Onglets Admin
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// 7. Initialisation
function init() {
  renderEvent(currentEvent);
  renderGames();
  renderBookingsCalendar();
}

openAdminBtn.addEventListener('click', () => {
  document.getElementById('input-title').value = currentEvent.title;
  document.getElementById('input-date').value = currentEvent.date;
  document.getElementById('input-image').value = currentEvent.image_url;
  document.getElementById('input-desc').value = currentEvent.description;
  adminModal.classList.add('active');
});

closeAdminBtn.addEventListener('click', () => adminModal.classList.remove('active'));
closeGameModal.addEventListener('click', () => gameModal.classList.remove('active'));

document.addEventListener('DOMContentLoaded', init);
