const $ = (selector) => document.querySelector(selector);
const dialog = $('#login-dialog');
let configured = false;
let localIssuer = false;
let demo = false;
let demoOptedIn = false;
const api = async (path, body) => {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
};
function resetForm() {
  $('#identifier-form').reset(); $('#code-form').reset();
  $('#identifier-form').hidden = false; $('#code-form').hidden = true; $('#error').textContent = '';
  $('#dialog-title').innerHTML = 'Welcome to<br>the community.';
  $('#flow-label').textContent = demo ? 'VISUAL PREVIEW · NO REAL SIGN-IN' : 'YOUR PEOPLE. YOUR MUSIC.';
  $('#setup-notice').hidden = configured || demo;
  $('#send-code').disabled = !configured && !demo;
  $('#demo-start').hidden = demo;
  $('#identifier').readOnly = demo;
  if (demo) $('#identifier').value = 'listener@example.com';
}
function openLogin(preview = false) { if (!preview && configured) { window.location.assign('/auth/login'); return; } demo = true; resetForm(); dialog.showModal(); $('#identifier').focus(); }
document.querySelectorAll('[data-login]').forEach((button) => button.addEventListener('click', () => openLogin()));
$('#preview-open').addEventListener('click', () => openLogin(true));
$('.close').addEventListener('click', () => dialog.close());
$('#demo-start').addEventListener('click', () => { demo = true; resetForm(); });
function showChallenge(challenge) {
  $('#identifier-form').hidden = true; $('#code-form').hidden = false;
  $('#dialog-title').textContent = 'Check your inbox.';
  if (challenge.channel !== 'EMAIL') $('#dialog-title').textContent = 'Check your phone.';
  $('#destination').textContent = demo ? 'Preview only — enter 123456 to continue. No code was sent.' : `Look for a code via ${challenge.channel.toLowerCase()} at ${challenge.destinationHint}.`;
  $('#disclosure').textContent = challenge.disclosure;
  $('#consent-label').textContent = challenge.marketingConsentPrompt.labelMarkdown;
  $('#consent-body').textContent = challenge.marketingConsentPrompt.bodyMarkdown;
  $('#opt-in').checked = false; $('#code').value = ''; $('#code').focus();
}
async function submit(form, action) {
  const button = form.querySelector('button[type=submit]'); button.disabled = true; $('#error').textContent = '';
  try { await action(); } catch (error) { $('#error').textContent = error.message; } finally { button.disabled = false; }
}
$('#identifier-form').addEventListener('submit', (event) => { event.preventDefault(); submit(event.currentTarget, async () => {
  const challenge = { channel: 'EMAIL', disclosure: 'Preview: signing in shares your name, email and phone number with ITMTV and adds you to its contacts.', marketingConsentPrompt: { labelMarkdown: 'Keep me in the loop with ITMTV. (Optional)', bodyMarkdown: 'Preview wording. In live sign-in, ITM supplies the exact marketing disclosure. Leave this unchecked to sign in without a new marketing subscription.' } };
  showChallenge(challenge);
}); });
function showMember(profile, isDemo) {
  $('.hero').hidden = true; $('#member').hidden = false;
  $('#member-mode').textContent = isDemo ? 'VISUAL PREVIEW · SAMPLE MEMBER' : localIssuer ? 'LOCAL OAUTH TEST · SAMPLE MEMBER' : 'YOUR ITMTV SPACE';
  $('#welcome').textContent = `You're in${profile.name ? ', ' + profile.name.split(' ')[0] : ''}.`;
  $('#member-description').textContent = isDemo ? `This is the signed-in experience. No real account, contact or subscription was changed. ${demoOptedIn ? 'You selected the optional marketing checkbox in this preview.' : 'You left marketing unchecked in this preview.'}` : localIssuer ? 'You completed the real hosted OAuth flow against a local test issuer. No messages were sent and no real account, contact or marketing subscription changed.' : 'Welcome to the ITMTV community. Signing in adds you to our contacts. Your existing marketing choices are preserved unless you chose to opt in.';
  $('#member-contact').textContent = profile.email || profile.phoneNumber || 'ITMTV MEMBER';
  document.querySelectorAll('[data-login]').forEach((button) => button.hidden = true);
  $('#logout').hidden = false; dialog.close(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('#code-form').addEventListener('submit', (event) => { event.preventDefault(); submit(event.currentTarget, async () => {
  const code = $('#code').value;
  if (code !== '123456') throw new Error('Use 123456 for this visual preview.');
    demoOptedIn = $('#opt-in').checked; showMember({ name: 'Alex', email: 'listener@example.com' }, true);

}); });
$('#back').addEventListener('click', resetForm);
$('#logout').addEventListener('click', async () => { try { await api('/api/logout', {}); window.location.reload(); } catch { $('#member-description').textContent = 'Sign out failed. Please try again.'; } });
if (new URLSearchParams(window.location.search).has('login_error')) { $('#auth-error').hidden = false; history.replaceState(null, '', '/'); }
api('/api/session').then((data) => { configured = data.configured; localIssuer = data.localIssuer; if (data.profile) { showMember(data.profile, false); } }).catch(() => { configured = false; });
