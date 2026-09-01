import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://qqelmmygalllmxinaxrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fqFvZNetzIdAfX860bmjBQ_GzJfeVK3';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const ADMIN_EMAILS = ['xavierguillon2007@gmail.com', 'kbg.asso@gmail.com'];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let accounts = [];
let selected = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return deny('Connectez-vous d’abord.');
  if (!ADMIN_EMAILS.includes((session.user.email || '').toLowerCase())) return deny('Accès réservé aux administrateurs.');
  $('userNav').innerHTML = `<span style="font-weight:700;font-size:13px;">👋 ${esc(session.user.email)}</span> <button class="button" id="logoutBtn">Déconnexion</button>`;
  $('logoutBtn').onclick = async () => { await supabase.auth.signOut(); location.href='index.html'; };
  document.querySelectorAll('[data-close]').forEach(b => b.onclick=()=>$(b.dataset.close)?.classList.add('hidden'));
  $('accountSearch').addEventListener('input', render);
  $('accountEditForm').addEventListener('submit', saveAccount);
  $('deleteAccountBtn').addEventListener('click', deleteAccount);
  await loadAccounts();
}

function deny(message) {
  $('accountsList').innerHTML = `<div class="empty panel">${esc(message)}</div>`;
}

async function loadAccounts() {
  $('accountsList').innerHTML='<div class="loading">Chargement des comptes…</div>';
  const { data, error } = await supabase.rpc('get_all_accounts_admin');
  if (error) { $('accountsList').innerHTML=`<div class="empty panel">Erreur : ${esc(error.message)}</div>`; return; }
  accounts = Array.isArray(data) ? data : [];
  render();
}

function render() {
  const q = ($('accountSearch').value || '').trim().toLowerCase();
  const list = accounts.filter(a => !q || `${a.first_name} ${a.last_name} ${a.email}`.toLowerCase().includes(q));
  if (!list.length) { $('accountsList').innerHTML='<div class="empty panel">Aucun compte trouvé.</div>'; return; }
  $('accountsList').innerHTML=list.map(a=>`
    <article class="panel admin-card">
      <div><span class="badge badge-${a.account_status==='approved'?'success':a.account_status==='rejected'?'danger':'warning'}">${statusLabel(a.account_status)}</span><h3 style="margin-top:8px;">${esc(a.first_name)} ${esc(a.last_name)}</h3><p class="publisher">${esc(a.email)}</p></div>
      <div class="admin-card-body"><p><strong>Promotion :</strong> ${esc(a.promotion || 'Non renseignée')}</p><p><strong>Créé le :</strong> ${formatDate(a.created_at)}</p></div>
      <div class="admin-card-actions"><button class="button primary" data-open-account="${esc(a.user_id)}">👁 Voir / modifier</button><button class="button danger" data-delete-account="${esc(a.user_id)}">🗑 Supprimer</button></div>
    </article>`).join('');
  document.querySelectorAll('[data-open-account]').forEach(b=>b.onclick=()=>openAccount(b.dataset.openAccount));
  document.querySelectorAll('[data-delete-account]').forEach(b=>b.onclick=()=>removeAccount(b.dataset.deleteAccount));
}

function statusLabel(s){return s==='approved'?'Validé':s==='rejected'?'Refusé':'En attente';}
function formatDate(v){const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'});}

function openAccount(id){
  selected=accounts.find(a=>String(a.user_id)===String(id));
  if(!selected)return;
  $('accountModalTitle').textContent=`${selected.first_name || ''} ${selected.last_name || ''}`.trim() || 'Compte';
  $('accountModalEmail').textContent=selected.email || '';
  const f=$('accountEditForm'); f.user_id.value=selected.user_id; f.first_name.value=selected.first_name||''; f.last_name.value=selected.last_name||''; f.promotion.value=selected.promotion||''; f.account_status.value=selected.account_status||'pending'; $('accountEditMsg').textContent=''; $('accountModal').classList.remove('hidden');
}

async function saveAccount(e){
  e.preventDefault(); if(!selected)return; const f=e.currentTarget; const msg=$('accountEditMsg'); msg.textContent='Enregistrement…';
  const { error }=await supabase.rpc('update_account_admin',{p_user_id:selected.user_id,p_first_name:f.first_name.value.trim(),p_last_name:f.last_name.value.trim(),p_promotion:f.promotion.value.trim(),p_account_status:f.account_status.value});
  if(error){msg.textContent='Erreur : '+error.message;msg.style.color='var(--danger)';return;}
  msg.textContent='✓ Modifications enregistrées.';msg.style.color='var(--success)'; await loadAccounts(); setTimeout(()=> $('accountModal').classList.add('hidden'),500);
}

async function deleteAccount(){if(!selected)return; await removeAccount(selected.user_id,true);}

async function removeAccount(id, fromModal=false){
  const account=accounts.find(a=>String(a.user_id)===String(id)); if(!account)return;
  if(!confirm(`Supprimer définitivement le compte de ${account.first_name} ${account.last_name} (${account.email}) ?\n\nCette action est irréversible.`))return;
  const { error }=await supabase.rpc('delete_account_admin',{p_user_id:account.user_id});
  if(error){alert('Erreur : '+error.message);return;}
  if(fromModal)$('accountModal').classList.add('hidden');
  await loadAccounts();
}
