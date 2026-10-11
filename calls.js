// Patientkald på TV-skærmen og lægernes private indkaldningsapp.
const tvCallList = document.querySelector('#patient-call-list');
if (tvCallList) {
  const panel = document.querySelector('#patient-call-panel');
  const status = document.querySelector('#patient-call-status');
  let expiryTimer;

  async function refreshPatientCalls() {
    try {
      const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data, error } = await window.authClient
        .from('patient_calls')
        .select('id, patient_name, called_at, doctors(name, location)')
        .gte('called_at', cutoff)
        .order('called_at', { ascending: false });
      if (error) throw error;

      window.clearTimeout(expiryTimer);
      tvCallList.replaceChildren();
      (data || []).forEach((call) => {
        const card = document.createElement('article');
        card.className = 'patient-call-card';
        const name = document.createElement('strong');
        name.textContent = call.patient_name;
        const direction = document.createElement('span');
        direction.textContent = `Gå til ${call.doctors?.location || 'det angivne rum'} · ${call.doctors?.name || ''}`;
        card.append(name, direction);
        tvCallList.append(card);
      });
      panel.hidden = !data?.length;
      status.textContent = '';

      if (data?.length) {
        const oldestExpiry = Math.min(...data.map((call) => Date.parse(call.called_at) + 2 * 60 * 1000));
        expiryTimer = window.setTimeout(refreshPatientCalls, Math.max(100, oldestExpiry - Date.now() + 100));
      }
    } catch (error) {
      console.error('Kunne ikke hente patientkald:', error.message);
      panel.hidden = false;
      status.textContent = 'Patientkald kunne ikke hentes.';
    }
  }

  if (window.authClient) {
    refreshPatientCalls();
    window.setInterval(refreshPatientCalls, 15_000);
    window.authClient
      .channel('public-patient-calls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_calls' }, refreshPatientCalls)
      .subscribe();
  } else {
    status.textContent = 'Supabase er ikke tilgængelig.';
  }
}

// Lægefunktionerne findes kun i app.html (Windows-appen). TV-skærmen lytter aldrig efter alarmer.
const patientCallForm = document.querySelector('#patient-call-form');
if (patientCallForm) {
  const loginUrl = 'logon.html?next=app.html';
  const doctorPageMessage = document.querySelector('#doctor-page-message');
  const myCalls = document.querySelector('#my-patient-calls');
  const callMessage = document.querySelector('#call-message');
  const alarmMessage = document.querySelector('#alarm-message');
  const alarmLocation = document.querySelector('#alarm-location');
  const alarmButton = document.querySelector('#send-doctor-alarm');
  const alarmDialog = document.querySelector('#incoming-alarm');
  const alarmText = document.querySelector('#incoming-alarm-location');
  const callName = patientCallForm.elements.patientName;
  const callPatientButton = document.querySelector('#call-patient-button');
  let currentUser;
  let currentDoctor;
  let alarmAudio;
  let alarmInterval;
  let lastAlarmId;
  callName.disabled = true;
  callPatientButton.disabled = true;
  alarmButton.disabled = true;

  function showPageMessage(text, isError = false) {
    doctorPageMessage.textContent = text;
    doctorPageMessage.classList.toggle('is-error', isError);
  }

  async function loadMyCalls() {
    const { data, error } = await window.authClient
      .from('patient_calls')
      .select('id, patient_name, called_at')
      .eq('doctor_id', currentDoctor.id)
      .order('called_at', { ascending: false });
    if (error) throw error;

    myCalls.replaceChildren();
    (data || []).forEach((call) => {
      const row = document.createElement('div');
      row.className = 'my-call-row';
      const name = document.createElement('strong');
      name.textContent = call.patient_name;
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'secondary-button';
      clear.textContent = 'Afslut kald';
      clear.addEventListener('click', async () => {
        clear.disabled = true;
        const { error: removeError } = await window.authClient
          .from('patient_calls')
          .delete()
          .eq('id', call.id)
          .eq('doctor_id', currentDoctor.id);
        if (removeError) {
          callMessage.textContent = 'Kaldet kunne ikke afsluttes: ' + removeError.message;
          clear.disabled = false;
          return;
        }
        await loadMyCalls();
      });
      row.append(name, clear);
      myCalls.append(row);
    });
    if (!data?.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Ingen aktive kald.';
      myCalls.append(empty);
    }
  }

  async function enableAlarmAudio() {
    try {
      alarmAudio ??= new AudioContext();
      if (alarmAudio.state === 'suspended') await alarmAudio.resume();
    } catch (error) {
      console.warn('Alarmlyd kunne ikke aktiveres:', error);
    }
  }

  document.addEventListener('pointerdown', enableAlarmAudio, { once: true });

  function playAlarmBeep() {
    try {
      if (!alarmAudio || alarmAudio.state !== 'running') return;
      const oscillator = alarmAudio.createOscillator();
      const volume = alarmAudio.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = 880;
      volume.gain.value = 0.12;
      oscillator.connect(volume);
      volume.connect(alarmAudio.destination);
      oscillator.start();
      window.setTimeout(() => oscillator.stop(), 700);
    } catch (error) {
      console.warn('Alarmlyd kunne ikke afspilles:', error);
    }
  }

  function showAlarm(destination) {
    alarmText.textContent = `Gå til ${destination}.`;
    if (!alarmDialog.open) alarmDialog.showModal();
    playAlarmBeep();
    if (!alarmInterval) alarmInterval = window.setInterval(playAlarmBeep, 2_000);
  }

  async function startDoctorApp() {
    if (!window.authClient) {
      window.location.replace(loginUrl);
      return;
    }
    const { data: sessionData, error: sessionError } = await window.authClient.auth.getSession();
    currentUser = sessionData?.session?.user;
    if (sessionError || !currentUser) {
      window.location.replace(loginUrl);
      return;
    }

    const { data: doctor, error } = await window.authClient
      .from('doctors')
      .select('id, name, location')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    if (error || !doctor) {
      showPageMessage('Denne konto er ikke knyttet til en læge. Kontakt administratoren.', true);
      return;
    }
    currentDoctor = doctor;
    callName.disabled = false;
    callPatientButton.disabled = false;
    document.querySelector('#doctor-name').textContent = doctor.name;
    document.querySelector('#doctor-location').textContent = doctor.location;

    const { data: doctors, error: doctorsError } = await window.authClient
      .from('doctors')
      .select('id, name, location')
      .order('sort_order', { ascending: true });
    if (doctorsError) throw doctorsError;
    alarmLocation.replaceChildren();
    doctors.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.location;
      option.textContent = item.location + ' · ' + item.name;
      alarmLocation.append(option);
    });
    alarmButton.disabled = doctors.length === 0;

    await loadMyCalls();
    window.authClient
      .channel('doctor-patient-calls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_calls', filter: `doctor_id=eq.${doctor.id}` }, loadMyCalls)
      .subscribe();
    window.setInterval(loadMyCalls, 15_000);

    function receiveAlarm(alarm) {
      if (!alarm || String(alarm.id) === lastAlarmId) return;
      lastAlarmId = String(alarm.id);
      showAlarm(alarm.destination);
    }
    const alertChannel = window.authClient
      .channel('private-doctor-alarms')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doctor_alerts' }, (payload) => {
        receiveAlarm(payload.new);
      });
    await alertChannel.subscribe();

    const recentSince = new Date(Date.now() - 60_000).toISOString();
    const { data: recentAlarm } = await window.authClient
      .from('doctor_alerts')
      .select('id, destination')
      .gt('created_at', recentSince)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentAlarm) receiveAlarm(recentAlarm);
    window.setInterval(async () => {
      const { data } = await window.authClient
        .from('doctor_alerts')
        .select('id, destination')
        .gt('created_at', recentSince)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) receiveAlarm(data);
    }, 10_000);
  }

  patientCallForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    callPatientButton.disabled = true;
    callMessage.textContent = '';
    const { error } = await window.authClient.from('patient_calls').insert({
      doctor_id: currentDoctor.id,
      patient_name: callName.value.trim(),
      created_by: currentUser.id,
    });
    if (error) {
      callMessage.textContent = 'Patienten kunne ikke kaldes ind: ' + error.message;
      callMessage.classList.add('is-error');
    } else {
      callMessage.textContent = 'Patientkaldet vises nu på venteværelsesskærmen.';
      callMessage.classList.remove('is-error');
      patientCallForm.reset();
      await loadMyCalls();
    }
    callPatientButton.disabled = false;
  });

  alarmButton.addEventListener('click', async () => {
    if (!alarmLocation.value) return;
    if (!window.confirm(`Send alarm til alle læger: Gå til ${alarmLocation.value}?`)) return;
    alarmButton.disabled = true;
    const { error } = await window.authClient.from('doctor_alerts').insert({
      destination: alarmLocation.value,
      created_by: currentUser.id,
    });
    alarmMessage.textContent = error ? 'Alarmen kunne ikke sendes: ' + error.message : 'Alarmen er sendt til lægecomputere.';
    alarmMessage.classList.toggle('is-error', Boolean(error));
    alarmButton.disabled = false;
  });

  function stopAlarmSound() {
    window.clearInterval(alarmInterval);
    alarmInterval = undefined;
  }
  document.querySelector('#acknowledge-alarm').addEventListener('click', () => alarmDialog.close());
  alarmDialog.addEventListener('close', stopAlarmSound);
  document.querySelector('#doctor-logout').addEventListener('click', async () => {
    await window.authClient.auth.signOut();
    window.location.replace('logon.html?next=app.html');
  });

  startDoctorApp().catch((error) => {
    console.error('Lægeappen kunne ikke startes:', error.message);
    showPageMessage('Lægeappen kunne ikke starte. Kontrollér Supabase-opsætningen.', true);
  });
}
