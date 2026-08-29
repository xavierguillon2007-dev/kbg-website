// CONFIGURATION SUPABASE
const SUPABASE_URL = "https://VOTRE_PROJET.supabase.co";
const SUPABASE_ANON_KEY = "VOTRE_CLE_ANON_SUPABASE";

let supabaseClient = null;
if (typeof supabase !== 'undefined' && !SUPABASE_URL.includes("VOTRE_PROJET")) {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// État initial local
let currentEvent = {
  id: 1,
  title: "Soirée Jeux de Société & Découvertes",
  date: "Vendredi 12 Septembre • 19h00",
  image_url: "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=600&q=80",
  description: "Rejoignez la communauté KBG pour tester les dernières nouveautés et affronter les membres du club !"
};

let reviewsList = [
  { id: 1, author: "Marc D.", rating: 5, comment: "Super club ! Très bonne ambiance et une sélection de jeux fantastique." },
  { id: 2, author: "Sophie L.", rating: 5, comment: "L'équipe KBG est super accueillante pour expliquer les règles." }
];

let bookingsList = [];

// Sélection Éléments DOM Panneau
const eventBanner = document.getElementById('event-banner');
const eventTitle = document.getElementById('event-title');
const eventDate = document.getElementById('event-date');
const eventDesc = document.getElementById('event-desc');
const eventImage = document.getElementById('event-image');

// Formulaires et Modales
const adminModal = document.getElementById('admin-modal');
const reviewModal = document.getElementById('review-modal');

const openAdminBtn = document.getElementById('open-admin-btn');
const closeAdminBtn = document.getElementById('close-admin-btn');
const openReviewBtn = document.getElementById('open-review-btn');
const closeReviewBtn = document.getElementById('close-review-btn');
const cancelReviewBtn = document.getElementById('cancel-review-btn');

const adminForm = document.getElementById('admin-event-form');
const addReviewForm = document.getElementById('add-review-form');
const bookingForm = document.getElementById('booking-form');

const reviewsGrid = document.getElementById('reviews-grid');
const adminReviewsList = document.getElementById('admin-reviews-list');
const adminBookingsList = document.getElementById('admin-bookings-list');

// 1. Affichage de l'Événement
function renderEvent(data) {
  eventTitle.textContent = data.title;
  eventDate.textContent = `📅 ${data.date}`;
  eventDesc.textContent = data.description;
  eventImage.src = data.image_url;

  eventBanner.style.transform = "scale(1.04) rotate(0deg)";
  setTimeout(() => { eventBanner.style.transform = "rotate(2deg)"; }, 300);
}

// 2. Affichage des Avis
function renderReviews() {
  reviewsGrid.innerHTML = "";
  adminReviewsList.innerHTML = "";

  if (reviewsList.length === 0) {
    reviewsGrid.innerHTML = `<div class="empty-state"><p>💬 Aucun avis publié pour le moment. Soyez le premier !</p></div>`;
    adminReviewsList.innerHTML = `<p class="desc">Aucun avis à modérer.</p>`;
    return;
  }

  reviewsList.forEach(rev => {
    // Carte sur le site
    const stars = "⭐".repeat(rev.rating);
    const card = document.createElement('div');
    card.className = "review-card";
    card.innerHTML = `
      <div class="review-author">
        <span>${rev.author}</span>
        <span class="review-stars">${stars}</span>
      </div>
      <p class="review-text">"${rev.comment}"</p>
    `;
    reviewsGrid.appendChild(card);

    // Item dans l'Espace Admin
    const adminItem = document.createElement('div');
    adminItem.className = "admin-item";
    adminItem.innerHTML = `
      <span><strong>${rev.author}</strong> (${rev.rating}/5) : "${rev.comment.substring(0, 30)}..."</span>
      <button class="admin-item-delete" onclick="deleteReview(${rev.id})">Supprimer</button>
    `;
    adminReviewsList.appendChild(adminItem);
  });
}

function deleteReview(id) {
  reviewsList = reviewsList.filter(r => r.id !== id);
  renderReviews();
}

// 3. Affichage des Réservations dans l'Admin
function renderBookings() {
  adminBookingsList.innerHTML = "";
  if (bookingsList.length === 0) {
    adminBookingsList.innerHTML = `<p class="desc">Aucune réservation pour le moment.</p>`;
    return;
  }

  bookingsList.forEach((b, idx) => {
    const item = document.createElement('div');
    item.className = "admin-item";
    item.innerHTML = `
      <span><strong>${b.name}</strong> — ${b.date} à ${b.time} (${b.players} joueurs)</span>
      <button class="admin-item-delete" onclick="deleteBooking(${idx})">Annuler</button>
    `;
    adminBookingsList.appendChild(item);
  });
}

function deleteBooking(index) {
  bookingsList.splice(index, 1);
  renderBookings();
}

// 4. Gestion de la Soumission des Avis
addReviewForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const newReview = {
    id: Date.now(),
    author: document.getElementById('review-author').value,
    rating: parseInt(document.getElementById('review-rating').value),
    comment: document.getElementById('review-comment').value
  };

  reviewsList.unshift(newReview);
  renderReviews();
  addReviewForm.reset();
  reviewModal.classList.remove('active');
});

// 5. Gestion de la Réservation
bookingForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const booking = {
    name: document.getElementById('book-name').value,
    date: document.getElementById('book-date').value,
    time: document.getElementById('book-time').value,
    players: document.getElementById('book-players').value
  };

  bookingsList.unshift(booking);
  renderBookings();
  alert("✨ Merci ! Votre demande de réservation a été enregistrée.");
  bookingForm.reset();
});

// 6. Gestion des Onglets Admin
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// 7. Synchronisation Temps Réel Supabase (Panneau d'Événement)
async function initRealtime() {
  renderReviews();
  renderBookings();

  if (!supabaseClient) {
    renderEvent(currentEvent);
    return;
  }

  try {
    const { data } = await supabaseClient.from('events').select('*').eq('id', 1).single();
    if (data) {
      currentEvent = data;
      renderEvent(currentEvent);
    }

    supabaseClient
      .channel('public:events')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events' }, (payload) => {
        currentEvent = payload.new;
        renderEvent(currentEvent);
      })
      .subscribe();
  } catch (err) {
    renderEvent(currentEvent);
  }
}

// Validation Formulaire Admin Événement
adminForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const updated = {
    title: document.getElementById('input-title').value,
    date: document.getElementById('input-date').value,
    image_url: document.getElementById('input-image').value,
    description: document.getElementById('input-desc').value
  };

  if (supabaseClient) {
    await supabaseClient.from('events').update(updated).eq('id', 1);
  } else {
    currentEvent = { ...currentEvent, ...updated };
    renderEvent(currentEvent);
  }

  adminModal.classList.remove('active');
});

// Modales Toggle
openAdminBtn.addEventListener('click', () => {
  document.getElementById('input-title').value = currentEvent.title;
  document.getElementById('input-date').value = currentEvent.date;
  document.getElementById('input-image').value = currentEvent.image_url;
  document.getElementById('input-desc').value = currentEvent.description;
  adminModal.classList.add('active');
});

closeAdminBtn.addEventListener('click', () => adminModal.classList.remove('active'));
document.querySelectorAll('.cancel-admin-btn').forEach(b => b.addEventListener('click', () => adminModal.classList.remove('active')));

openReviewBtn.addEventListener('click', () => reviewModal.classList.add('active'));
closeReviewBtn.addEventListener('click', () => reviewModal.classList.remove('active'));
cancelReviewBtn.addEventListener('click', () => reviewModal.classList.remove('active'));

document.addEventListener('DOMContentLoaded', initRealtime);
