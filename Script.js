// Finder HTML-elementerne, hvor dato og klokkeslæt skal vises.
const dateDisplay = document.querySelector('#date');
const clockDisplay = document.querySelector('#clock');
const hourHand = document.querySelector('#hour-hand');
const minuteHand = document.querySelector('#minute-hand');
const secondHand = document.querySelector('#second-hand');

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
    const seconds = now.getSeconds();
    const minutes = now.getMinutes() + seconds / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    if (hourHand && minuteHand && secondHand) {
      hourHand.style.transform = `translateX(-50%) rotate(${hours * 30}deg)`;
      minuteHand.style.transform = `translateX(-50%) rotate(${minutes * 6}deg)`;
      secondHand.style.transform = `translateX(-50%) rotate(${seconds * 6}deg)`;
    }
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
