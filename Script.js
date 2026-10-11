// Finder HTML-elementerne, hvor dato og klokkeslæt skal vises.
const dateDisplay = document.querySelector('#date');
const clockDisplay = document.querySelector('#clock');

// Opdater dato og klokkeslæt, hvis siden har urfelterne (TV-skærmen).
if (dateDisplay && clockDisplay) {
  function updateDateTime() {
    const now = new Date();
    // Viser ugedag, dag i måneden og månedsnavn, fx "mandag 10. oktober".
    dateDisplay.textContent = new Intl.DateTimeFormat('da-DK', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(now);
    // Viser timer, minutter og sekunder med dansk tidsformat.
    clockDisplay.textContent = new Intl.DateTimeFormat('da-DK', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(now);
  }

  // Opdaterer straks og derefter én gang i sekundet.
  updateDateTime();
  window.setInterval(updateDateTime, 1_000);
}

// Popup-vinduet til lægerne findes kun på dashboardet.
const doctorDialog = document.querySelector('#doctor-dialog');
if (doctorDialog) {
  const openDoctorsButton = document.querySelector('#open-doctors-dialog');
  const closeDoctorsButton = document.querySelector('#close-doctors-dialog');

  openDoctorsButton.addEventListener('click', () => doctorDialog.showModal());
  closeDoctorsButton.addEventListener('click', () => doctorDialog.close());

  // Klik på den mørke baggrund uden for dialogen lukker popup-vinduet.
  doctorDialog.addEventListener('click', (event) => {
    if (event.target === doctorDialog) doctorDialog.close();
  });
}
