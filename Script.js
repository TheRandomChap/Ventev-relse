// Finder HTML-elementerne, hvor dato og klokkeslæt skal vises.
const dateDisplay = document.querySelector('#date');
const clockDisplay = document.querySelector('#clock');

// Henter den aktuelle dato og tid og formaterer dem efter danske regler.
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

// Opdaterer straks ved sideindlæsning og derefter én gang i sekundet.
updateDateTime();
window.setInterval(updateDateTime, 1_000);
