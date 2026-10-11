// Henter informationsbilleder til TV-skærmen og administrerer dem fra dashboardet.
const infoImage = document.querySelector('#info-slide-image');
if (infoImage) {
  const placeholder = document.querySelector('#info-slide-placeholder');
  const placeholderMessage = document.querySelector('#info-slide-message');
  const caption = document.querySelector('#info-slide-caption');
  const position = document.querySelector('#info-slide-position');
  let slides = [];
  let activeIndex = 0;
  let rotationTimer;

  function showSlide(index) {
    window.clearTimeout(rotationTimer);
    if (!slides.length) {
      infoImage.hidden = true;
      caption.hidden = true;
      position.textContent = '';
      placeholder.hidden = false;
      placeholderMessage.textContent = 'Der er ikke tilføjet billeder endnu.';
      return;
    }

    activeIndex = (index + slides.length) % slides.length;
    const slide = slides[activeIndex];
    infoImage.hidden = false;
    placeholder.hidden = true;
    infoImage.alt = slide.title || 'Information fra klinikken';
    infoImage.src = slide.image_url;
    caption.textContent = slide.title || '';
    caption.hidden = !slide.title;
    position.textContent = `${activeIndex + 1} / ${slides.length}`;
    rotationTimer = window.setTimeout(
      () => showSlide(activeIndex + 1),
      Math.max(5, Number(slide.duration_seconds) || 15) * 1000,
    );
  }

  async function loadInfoSlides() {
    if (!window.authClient) {
      placeholderMessage.textContent = 'Informationsskærmen kunne ikke forbindes til Supabase.';
      return;
    }
    const { data, error } = await window.authClient
      .from('info_slides')
      .select('id, title, image_url, duration_seconds, sort_order')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    if (error) {
      console.error('Kunne ikke hente informationsbilleder:', error.message);
      placeholder.hidden = false;
      placeholderMessage.textContent = 'Informationsbilleder kunne ikke hentes. Kontrollér Supabase-opsætningen.';
      return;
    }

    const oldSlideId = slides[activeIndex]?.id;
    slides = data || [];
    const retainedIndex = slides.findIndex((slide) => slide.id === oldSlideId);
    showSlide(retainedIndex >= 0 ? retainedIndex : 0);
  }

  loadInfoSlides();
  infoImage.addEventListener('error', () => {
    placeholder.hidden = false;
    placeholderMessage.textContent = 'Billedet kunne ikke indlæses. Kontrollér billedets offentlige HTTPS-adresse.';
  });
  window.authClient?.channel('public-info-slides')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'info_slides' }, loadInfoSlides)
    .subscribe();
}

// Kontrolpanelets formular og liste til at tilføje, rette, sortere og slette billeder.
const slideForm = document.querySelector('#info-slide-form');
if (slideForm) {
  const dialog = document.querySelector('#info-dialog');
  const list = document.querySelector('#info-slide-list');
  const message = document.querySelector('#info-admin-message');
  const submitButton = document.querySelector('#info-slide-submit');
  const idInput = slideForm.elements.slideId;
  const titleInput = slideForm.elements.title;
  const urlInput = slideForm.elements.imageUrl;
  const fileInput = slideForm.elements.imageFile;
  const durationInput = slideForm.elements.durationSeconds;
  const storageBucket = 'info-slides';
  let slides = [];

  function storagePathFromPublicUrl(imageUrl) {
    try {
      const url = new URL(imageUrl);
      const prefix = `/storage/v1/object/public/${storageBucket}/`;
      return url.pathname.startsWith(prefix)
        ? decodeURIComponent(url.pathname.slice(prefix.length))
        : null;
    } catch {
      return null;
    }
  }

  async function removeStoredImage(imageUrl) {
    const path = storagePathFromPublicUrl(imageUrl);
    if (!path) return null;
    const { error } = await window.authClient.storage.from(storageBucket).remove([path]);
    return error;
  }

  async function uploadImage(file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;
    const { data, error } = await window.authClient.storage
      .from(storageBucket)
      .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });
    if (error) throw error;
    return window.authClient.storage.from(storageBucket).getPublicUrl(data.path).data.publicUrl;
  }

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle('is-error', isError);
  }

  function resetForm() {
    slideForm.reset();
    idInput.value = '';
    durationInput.value = '15';
    submitButton.textContent = 'Tilføj billede';
  }

  async function refreshSlides() {
    if (!window.authClient) {
      setMessage('Supabase er ikke konfigureret.', true);
      return;
    }
    const { data, error } = await window.authClient
      .from('info_slides')
      .select('id, title, image_url, duration_seconds, sort_order')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    if (error) {
      setMessage('Kunne ikke hente slides. Kontrollér SQL-opsætningen: ' + error.message, true);
      return;
    }

    slides = data || [];
    list.replaceChildren();
    if (!slides.length) {
      const empty = document.createElement('p');
      empty.className = 'doctor-admin-empty';
      empty.textContent = 'Der er endnu ikke tilføjet informationsbilleder.';
      list.append(empty);
      return;
    }

    slides.forEach((slide, index) => {
      const row = document.createElement('div');
      row.className = 'doctor-admin-row';
      const details = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = slide.title || 'Billede uden overskrift';
      const duration = document.createElement('span');
      duration.textContent = `${slide.duration_seconds} sekunder`;
      details.append(title, duration);

      const actions = document.createElement('div');
      actions.className = 'doctor-admin-actions';
      const moveUp = document.createElement('button');
      moveUp.type = 'button';
      moveUp.className = 'secondary-button';
      moveUp.textContent = '↑';
      moveUp.setAttribute('aria-label', 'Flyt op');
      moveUp.disabled = index === 0;
      moveUp.addEventListener('click', () => changeOrder(index, index - 1));
      const moveDown = document.createElement('button');
      moveDown.type = 'button';
      moveDown.className = 'secondary-button';
      moveDown.textContent = '↓';
      moveDown.setAttribute('aria-label', 'Flyt ned');
      moveDown.disabled = index === slides.length - 1;
      moveDown.addEventListener('click', () => changeOrder(index, index + 1));
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'secondary-button';
      edit.textContent = 'Rediger';
      edit.addEventListener('click', () => {
        idInput.value = String(slide.id);
        titleInput.value = slide.title || '';
        urlInput.value = slide.image_url;
        durationInput.value = String(slide.duration_seconds);
        submitButton.textContent = 'Gem ændringer';
        setMessage('Redigerer ' + (slide.title || 'billede'));
        titleInput.focus();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary-button delete-button';
      remove.textContent = 'Slet';
      remove.addEventListener('click', async () => {
        if (!window.confirm('Vil du slette dette billede fra informationsskærmen?')) return;
        const { error: deleteError } = await window.authClient.from('info_slides').delete().eq('id', slide.id);
        if (deleteError) {
          setMessage('Billedet kunne ikke slettes: ' + deleteError.message, true);
          return;
        }
        const storageError = await removeStoredImage(slide.image_url);
        setMessage(storageError
          ? 'Billedet blev fjernet fra listen, men filen kunne ikke slettes fra Storage: ' + storageError.message
          : 'Billedet blev slettet.');
        await refreshSlides();
      });
      actions.append(moveUp, moveDown, edit, remove);
      row.append(details, actions);
      list.append(row);
    });
  }

  async function changeOrder(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= slides.length) return;
    const reordered = [...slides];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    for (const [sortOrder, slide] of reordered.entries()) {
      const { error } = await window.authClient
        .from('info_slides')
        .update({ sort_order: sortOrder })
        .eq('id', slide.id);
      if (error) {
        setMessage('Rækkefølgen kunne ikke gemmes: ' + error.message, true);
        return;
      }
    }
    setMessage('Rækkefølgen blev gemt.');
    await refreshSlides();
  }

  slideForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const selectedFile = fileInput.files[0];
    const typedUrl = urlInput.value.trim();
    if (!selectedFile && !typedUrl) {
      setMessage('Vælg en billedfil eller indsæt en HTTPS-adresse.', true);
      return;
    }
    if (selectedFile && !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(selectedFile.type)) {
      setMessage('Vælg en PNG-, JPG-, WebP- eller GIF-fil.', true);
      return;
    }
    if (selectedFile && selectedFile.size > 10 * 1024 * 1024) {
      setMessage('Billedfilen må højst være 10 MB.', true);
      return;
    }
    let externalUrl = '';
    if (!selectedFile) {
      try {
        externalUrl = new URL(typedUrl).href;
      } catch {
        setMessage('Indtast en gyldig HTTPS-billedadresse.', true);
        return;
      }
      if (!externalUrl.startsWith('https://')) {
        setMessage('Billedets adresse skal begynde med https://', true);
        return;
      }
    }
    const duration = Number(durationInput.value);
    if (!Number.isInteger(duration) || duration < 5 || duration > 300) {
      setMessage('Visningstiden skal være mellem 5 og 300 sekunder.', true);
      return;
    }

    submitButton.disabled = true;
    setMessage(selectedFile ? 'Uploader og gemmer…' : 'Gemmer…');
    const id = idInput.value;
    const previousSlide = slides.find((slide) => String(slide.id) === id);
    let uploadedUrl = '';
    try {
      if (selectedFile) uploadedUrl = await uploadImage(selectedFile);
      const slide = {
        title: titleInput.value.trim(),
        image_url: uploadedUrl || externalUrl,
        duration_seconds: duration,
      };
      let result;
      if (id) {
        result = await window.authClient.from('info_slides').update(slide).eq('id', id);
      } else {
        slide.sort_order = slides.length ? Math.max(...slides.map((item) => item.sort_order)) + 1 : 0;
        result = await window.authClient.from('info_slides').insert(slide);
      }
      if (result.error) {
        if (uploadedUrl) await removeStoredImage(uploadedUrl);
        throw result.error;
      }
      if (uploadedUrl && previousSlide?.image_url) await removeStoredImage(previousSlide.image_url);
      if (id && !uploadedUrl && externalUrl && previousSlide?.image_url !== externalUrl) {
        await removeStoredImage(previousSlide.image_url);
      }
      resetForm();
      setMessage(id ? 'Ændringerne blev gemt.' : 'Billedet blev tilføjet.');
      await refreshSlides();
    } catch (error) {
      setMessage('Billedet kunne ikke gemmes: ' + error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  });

  document.querySelector('#cancel-info-edit').addEventListener('click', () => {
    resetForm();
    setMessage('');
  });
  document.querySelector('#open-info-dialog').addEventListener('click', () => dialog.showModal());
  document.querySelector('#close-info-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  refreshSlides();
}
