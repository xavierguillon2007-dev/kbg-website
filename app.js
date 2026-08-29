// CONFIGURATION SUPABASE
// Remplacez ces 2 clés par vos identifiants réels issus de votre projet Supabase (https://supabase.com)
const SUPABASE_URL = "https://supabase.com/dashboard/project/qqelmmygalllmxinaxrf";
const SUPABASE_ANON_KEY = "VeyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxZWxtbXlnYWxsbG14aW5heHJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MTYzMjMsImV4cCI6MjEwMzQ5MjMyM30.4aNKVUl0xJ1ffiVlx4vyniq9R6J_By9-6mUiLi-zC_U";

// Initialisation du client Supabase
let supabaseClient = null;
if (typeof supabase !== 'undefined' && !SUPABASE_URL.includes("VOTRE_PROJET")) {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Données par défaut (Mode Démo / Fallback)
let currentEvent = {
  id: 1,
  title: "Soirée Jeux de Société & Découvertes",
  date: "Vendredi 12 Septembre • 19h00",
  image_url: "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=600&q=80",
  description: "Rejoignez la communauté KBG pour tester les dernières nouveautés et affronter les membres du club !"
};

// Éléments du DOM
const eventBanner = document.getElementById('event-banner');
const eventTitle = document.getElementById('event-title');
const eventDate = document.getElementById('event-date');
const eventDesc = document.getElementById('event-desc');
const eventImage = document.getElementById('event-image');

const adminModal = document.getElementById('admin-modal');
const openAdminBtn = document.getElementById('open-admin-btn');
const closeAdminBtn = document.getElementById('close-admin-btn');
const cancelAdminBtn = document.getElementById('cancel-admin-btn');
const adminForm = document.getElementById('admin-event-form');

const inputTitle = document.getElementById('input-title');
const inputDate = document.getElementById('input-date');
const inputImage = document.getElementById('input-image');
const inputDesc = document.getElementById('input-desc');

// Render
function renderEvent(data) {
  eventTitle.textContent = data.title;
  eventDate.textContent = `📅 ${data.date}`;
  eventDesc.textContent = data.description;
  eventImage.src = data.image_url;

  // Animation d'actualisation en temps réel
  eventBanner.style.transform = "scale(1.04) rotate(0deg)";
  setTimeout(() => {
    eventBanner.style.transform = "rotate(2deg)";
  }, 300);
}

// Écoute des mises à jour Supabase Realtime
async function initRealtimeEvent() {
  if (!supabaseClient) {
    console.log("⚡ Mode Démo : Supabase non configuré. Chargement des données locales.");
    renderEvent(currentEvent);
    return;
  }

  try {
    const { data } = await supabaseClient.from('events').select('*').eq('id', 1).single();

    if (data) {
      currentEvent = data;
      renderEvent(currentEvent);
    }

    // Écoute en temps réel de la table 'events'
    supabaseClient
      .channel('public:events')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events' }, (payload) => {
        console.log("⚡ Modification temps réel reçue :", payload.new);
        currentEvent = payload.new;
        renderEvent(currentEvent);
      })
      .subscribe();

  } catch (err) {
    console.warn("Erreur Supabase:", err);
    renderEvent(currentEvent);
  }
}

// Validation du formulaire Admin
adminForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const updatedData = {
    title: inputTitle.value,
    date: inputDate.value,
    image_url: inputImage.value,
    description: inputDesc.value
  };

  if (supabaseClient) {
    const { error } = await supabaseClient
      .from('events')
      .update(updatedData)
      .eq('id', 1);

    if (error) {
      alert("Erreur lors de la mise à jour : " + error.message);
      return;
    }
  } else {
    // Mode démo direct si Supabase n'est pas lié
    currentEvent = { ...currentEvent, ...updatedData };
    renderEvent(currentEvent);
  }

  closeModal();
});

// Modal Controls
function openModal() {
  inputTitle.value = currentEvent.title;
  inputDate.value = currentEvent.date;
  inputImage.value = currentEvent.image_url;
  inputDesc.value = currentEvent.description;
  adminModal.classList.add('active');
}

function closeModal() {
  adminModal.classList.remove('active');
}

openAdminBtn.addEventListener('click', openModal);
closeAdminBtn.addEventListener('click', closeModal);
cancelAdminBtn.addEventListener('click', closeModal);
adminModal.addEventListener('click', (e) => { if (e.target === adminModal) closeModal(); });

document.addEventListener('DOMContentLoaded', initRealtimeEvent);
