// Fælles datafunktioner til TV-skærmen og kontrolpanelet.
const doctorFields = 'id, name, location, sort_order';

async function fetchDoctors() {
  if (!window.authClient) throw new Error('Supabase er ikke konfigureret.');
  const { data, error } = await window.authClient
    .from('doctors')
    .select(doctorFields)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

function makeDoctorRow(doctor) {
  const row = document.createElement('article');
  row.className = 'doctor-row';

  const details = document.createElement('div');
  details.className = 'doctor-details';
  const name = document.createElement('h3');
  name.textContent = doctor.name;
  const location = document.createElement('span');
  location.className = 'doctor-room';
  location.textContent = doctor.location;
  details.append(name, location);
  row.append(details);
  return row;
}

// TV-visningen opdateres jævnligt, så dashboardændringer vises automatisk.
const tvDoctorList = document.querySelector('#doctor-list');
if (tvDoctorList) {
  const count = document.querySelector('#doctor-count');
  const message = document.querySelector('#doctor-load-message');

  async function loadDoctors() {
    try {
      const doctors = await fetchDoctors();
      tvDoctorList.replaceChildren(...doctors.map(makeDoctorRow));
      count.textContent = String(doctors.length);
      message.textContent = doctors.length ? '' : 'Der er endnu ikke tilføjet læger.';
    } catch (error) {
      console.error('Kunne ikke hente læger:', error.message);
      message.textContent = 'Lægelisten kunne ikke hentes. Kontrollér Supabase-opsætningen.';
    }
  }

  loadDoctors();
  window.setInterval(loadDoctors, 15_000);
}

// Kontrolpanelet kan oprette, redigere og slette læger.
const doctorForm = document.querySelector('#doctor-form');
if (doctorForm) {
  const list = document.querySelector('#dashboard-doctor-list');
  const message = document.querySelector('#doctor-admin-message');
  const submitButton = doctorForm.querySelector('button[type="submit"]');
  const idInput = doctorForm.elements.doctorId;
  const nameInput = doctorForm.elements.name;
  const locationInput = doctorForm.elements.location;
  const emailInput = doctorForm.elements.email;
  const passwordInput = doctorForm.elements.password;
  const accountFields = document.querySelector('#doctor-account-fields');
  let doctors = [];

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle('is-error', isError);
  }

  async function refreshDoctors() {
    try {
      doctors = await fetchDoctors();
      list.replaceChildren();
      if (!doctors.length) {
        const empty = document.createElement('p');
        empty.className = 'doctor-admin-empty';
        empty.textContent = 'Der er endnu ikke tilføjet læger.';
        list.append(empty);
      }

      doctors.forEach((doctor) => {
        const row = document.createElement('div');
        row.className = 'doctor-admin-row';
        const details = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = doctor.name;
        const location = document.createElement('span');
        location.textContent = doctor.location;
        details.append(name, location);

        const actions = document.createElement('div');
        actions.className = 'doctor-admin-actions';
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'secondary-button';
        edit.textContent = 'Rediger';
        edit.addEventListener('click', () => {
          idInput.value = String(doctor.id);
          nameInput.value = doctor.name;
          locationInput.value = doctor.location;
          accountFields.hidden = true;
          emailInput.required = false;
          passwordInput.required = false;
          submitButton.textContent = 'Gem ændringer';
          setMessage('Redigerer ' + doctor.name);
          nameInput.focus();
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'secondary-button delete-button';
        remove.textContent = 'Slet';
        remove.addEventListener('click', async () => {
          if (!window.confirm('Vil du slette ' + doctor.name + '?')) return;
          remove.disabled = true;
          const { error } = await window.authClient.from('doctors').delete().eq('id', doctor.id);
          if (error) {
            setMessage('Lægen kunne ikke slettes: ' + error.message, true);
            remove.disabled = false;
            return;
          }
          setMessage('Lægen blev slettet.');
          await refreshDoctors();
        });
        actions.append(edit, remove);
        row.append(details, actions);
        list.append(row);
      });
    } catch (error) {
      console.error('Kunne ikke hente læger:', error.message);
      setMessage('Lægelisten kunne ikke hentes. Kontrollér SQL og Supabase-opsætningen.', true);
    }
  }

  doctorForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    setMessage('Gemmer…');
    const doctor = { name: nameInput.value.trim(), location: locationInput.value.trim() };
    const id = idInput.value;

    try {
      let result;
      if (id) {
        result = await window.authClient.from('doctors').update(doctor).eq('id', id);
      } else {
        result = await window.authClient.functions.invoke('create-doctor-account', {
          body: {
            ...doctor,
            email: emailInput.value.trim(),
            password: passwordInput.value,
          },
        });
      }
      if (result.error) throw result.error;
      doctorForm.reset();
      idInput.value = '';
      accountFields.hidden = false;
      emailInput.required = true;
      passwordInput.required = true;
      submitButton.textContent = 'Tilføj læge';
      setMessage(id ? 'Ændringerne blev gemt.' : 'Lægen blev tilføjet.');
      await refreshDoctors();
    } catch (error) {
      setMessage('Kunne ikke gemme lægen: ' + error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  });

  document.querySelector('#cancel-doctor-edit').addEventListener('click', () => {
    doctorForm.reset();
    idInput.value = '';
    accountFields.hidden = false;
    emailInput.required = true;
    passwordInput.required = true;
    submitButton.textContent = 'Tilføj læge';
    setMessage('');
  });

  refreshDoctors();
}
