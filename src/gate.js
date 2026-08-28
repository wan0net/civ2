const TERMS_KEY = 'civ2_mge_ownership_terms_v1';
const gate = document.getElementById('ownership-gate');
const confirmation = document.getElementById('ownership-confirmation');
const acceptButton = document.getElementById('accept-terms');
const loading = document.getElementById('loading');

let bootStarted = false;

function hasAcceptedTerms() {
  try {
    return localStorage.getItem(TERMS_KEY) === 'accepted';
  } catch {
    return false;
  }
}

async function openGame() {
  if (bootStarted) return;
  bootStarted = true;
  gate.hidden = true;
  loading.hidden = false;
  await import('./main.js');
}

confirmation.addEventListener('change', () => {
  acceptButton.disabled = !confirmation.checked;
});

acceptButton.addEventListener('click', () => {
  if (!confirmation.checked) return;
  try {
    localStorage.setItem(TERMS_KEY, 'accepted');
  } catch {
    // The current session can continue even when storage is unavailable.
  }
  openGame();
});

const forceTerms = new URLSearchParams(location.search).has('terms');
if (hasAcceptedTerms() && !forceTerms) openGame();
