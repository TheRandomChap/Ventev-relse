// Supabase-konfiguration deles mellem login- og dashboardsiden.
// Brug kun en publishable key i browseren, aldrig en secret/service_role key.
const SUPABASE_URL = 'https://ytinlidtxathvoamqebl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_1mCusrqDLWSo89hXQuV4Fg_ycq_yhX4';
const configured = !SUPABASE_URL.includes('YOUR-PROJECT') &&
  !SUPABASE_PUBLISHABLE_KEY.includes('YOUR_SUPABASE_PUBLISHABLE_KEY');
window.authClient = configured && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

// Login-sidens formular findes kun på logon.html.
const loginForm = document.querySelector('#login-form');
if (loginForm) {
  const loginMessage = document.querySelector('#login-message');
  const loginButton = document.querySelector('#login-button');

  if (!window.authClient) {
    loginButton.disabled = true;
    loginMessage.textContent = 'Login skal først forbindes til Supabase. Følg opsætningen i README.md.';
  } else {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      loginButton.disabled = true;
      loginButton.textContent = 'Logger ind…';
      loginMessage.textContent = '';

      try {
        const { error } = await window.authClient.auth.signInWithPassword({
          email: loginForm.elements.email.value.trim(),
          password: loginForm.elements.password.value,
        });

        if (error) throw error;
        const requestedPage = new URLSearchParams(window.location.search).get('next');
        const nextPage = ['app.html', 'dashboard.html'].includes(requestedPage)
          ? requestedPage
          : 'dashboard.html';
        window.location.replace(nextPage);
      } catch {
        // Generisk fejl fortæller ikke, om en bestemt e-mail har en konto.
        loginMessage.textContent = 'Login mislykkedes. Kontrollér e-mail og adgangskode.';
        loginButton.disabled = false;
        loginButton.textContent = 'Log ind';
      }
    });
  }
}

// Dashboardets indhold vises kun med en aktiv Supabase-session.
const userLabel = document.querySelector('#signed-in-user');
if (userLabel) {
  const dashboardMessage = document.querySelector('#dashboard-message');
  const logoutButton = document.querySelector('#logout-button');

  async function loadDashboard() {
    if (!window.authClient) {
      window.location.replace('logon.html');
      return;
    }

    const { data, error } = await window.authClient.auth.getSession();
    if (error || !data.session) {
      window.location.replace('logon.html');
      return;
    }

    const { data: admin, error: adminError } = await window.authClient
      .from('clinic_admins')
      .select('user_id')
      .eq('user_id', data.session.user.id)
      .maybeSingle();
    userLabel.textContent = data.session.user.email;
    if (adminError || !admin) {
      dashboardMessage.textContent = adminError
        ? 'Kunne ikke kontrollere administratoradgangen. Kontrollér Supabase-opsætningen.'
        : 'Denne konto mangler administratoradgang. Tilføj kontoen i clinic_admins i Supabase.';
      dashboardMessage.classList.add('is-error');
      return;
    }
    dashboardMessage.textContent = '';
    dashboardMessage.classList.remove('is-error');
  }

  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    const { error } = await window.authClient.auth.signOut();
    if (error) {
      dashboardMessage.textContent = 'Kunne ikke logge ud. Prøv igen.';
      logoutButton.disabled = false;
      return;
    }
    window.location.replace('logon.html');
  });

  loadDashboard();
}
