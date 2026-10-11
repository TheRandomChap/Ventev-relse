# Venteværelsesskærm – Lægehuset i Fårevejle

En enkel webside til en skærm i et venteværelse. Den viser klinikkens logo, dato og klokkeslæt, dagens læger, deres lokation samt klinikkens kontaktoplysninger.

> **Bemærk:** Lægenavne og lokationer administreres fra dashboardet og gemmes i Supabase.

## Sådan åbner du siden

Åbn projektet med en lokal webserver, f.eks. VS Code Live Server, eller brug den udgivne HTTPS-adresse. Lægelisten kræver internetforbindelse og den Supabase-opsætning, der er beskrevet nedenfor. Logoet hentes også fra klinikkens hjemmeside.

På en skærm, der skal vise siden løbende, kan du åbne den i browserens fuldskærmstilstand. I de fleste browsere slås fuldskærm til med `F11`.

## Projektets filer

| Fil | Hvad den bruges til |
| --- | --- |
| `tvscreen.html` | Venteværelsesskærmens indhold; lægelisten hentes fra Supabase. |
| `logon.html` | Loginformular til administratorer og læger. |
| `dashboard.html` | Administratorkontrolpanel til læger og konti. |
| `doctor.html` | Lægens private patientkald og personalealarm. |
| `Style.css` | Samlet udseende for TV-skærm, login og dashboard. |
| `Script.js` | Dato og klokkeslæt på TV-skærmen samt popup-vinduet til læger i dashboardet. |
| `auth.js` | Supabase-konfiguration, login, sessionskontrol og log ud. |
| `doctors.js` | Henter læger til TV-skærmen og lader personalet administrere dem fra dashboardet. |
| `calls.js` | Synkroniserer patientkald til TV'et og håndterer lægekald og alarmer i lægeappen. |
| `electron-main.cjs` | Starter Windows-appen på lægecomputeren. |
| `package.json` / `package-lock.json` | Electron-afhængigheder og build-kommandoer til Windows-installeren. |
| `forge.config.mjs` | Indstillinger for at pakke lægeappen som Windows-installationsfil. |
| `copy-installer.cjs` | Kopierer den færdige installer til `dist`. |
| `supabase/functions/create-doctor-account/index.ts` | Opretter lægekonti sikkert på serversiden. |
| `README.md` | Denne vejledning og opsætning. |
## Administrer læger fra dashboardet

Når Supabase er sat op, kan en administrator oprette læger med navn, lokation, e-mail og startadgangskode fra `dashboard.html`. Læger logger ind på `doctor.html`, kalder patienter ind til deres rum og kan sende en alarm til alle lægecomputere. TV-siden viser aktive patientkald med patientens navn og lægens rum. Alarmen er kun på lægecomputere.

### Opret lægetabellen i Supabase

Åbn Supabase-projektet, vælg **SQL Editor → New query**, indsæt SQL'en herunder, tilpas admin-e-mailen, og vælg **Run**. Hvis du allerede har oprettet `doctors` med den tidligere vejledning, skal du først køre SQL'en på en kopi af projektet eller kontrollere, at den kan tilføje de nye kolonner uden at fjerne dine data.

```sql
create table if not exists public.doctors (
  id bigint generated always as identity primary key,
  name text not null,
  location text not null,
  sort_order integer not null default 0,
  user_id uuid unique references auth.users(id) on delete set null,
  email text unique
);

alter table public.doctors add column if not exists user_id uuid unique references auth.users(id) on delete set null;
alter table public.doctors add column if not exists email text unique;

create table if not exists public.clinic_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.patient_calls (
  id bigint generated always as identity primary key,
  doctor_id bigint not null references public.doctors(id) on delete cascade,
  patient_name text not null check (length(trim(patient_name)) between 1 and 100),
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  called_at timestamptz not null default now()
);

create table if not exists public.doctor_alerts (
  id bigint generated always as identity primary key,
  destination text not null,
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.doctors enable row level security;
alter table public.clinic_admins enable row level security;
alter table public.patient_calls enable row level security;
alter table public.doctor_alerts enable row level security;

revoke all on public.doctors, public.clinic_admins, public.patient_calls, public.doctor_alerts from anon, authenticated;
grant select (id, name, location, sort_order) on public.doctors to anon;
grant select (id, name, location, sort_order, user_id) on public.doctors to authenticated;
grant update (name, location), delete on public.doctors to authenticated;
grant select (user_id) on public.clinic_admins to authenticated;
grant select (id, patient_name, doctor_id, called_at) on public.patient_calls to anon, authenticated;
grant insert (doctor_id, patient_name, created_by), delete on public.patient_calls to authenticated;
grant select (id, destination, created_by, created_at), insert (destination, created_by) on public.doctor_alerts to authenticated;

drop policy if exists "Signed-in staff can manage doctors" on public.doctors;
drop policy if exists "Anyone can view doctors" on public.doctors;
create policy "Anyone can view doctors"
on public.doctors for select
to anon, authenticated
using (true);

create policy "Clinic administrators can update doctors"
on public.doctors for update
to authenticated
using (exists (select 1 from public.clinic_admins where user_id = auth.uid()))
with check (exists (select 1 from public.clinic_admins where user_id = auth.uid()));

create policy "Clinic administrators can delete doctors"
on public.doctors for delete
to authenticated
using (exists (select 1 from public.clinic_admins where user_id = auth.uid()));

create policy "Users can read their own administrator role"
on public.clinic_admins for select
to authenticated
using (user_id = auth.uid());

create policy "Anyone can view active patient calls"
on public.patient_calls for select
to anon, authenticated
using (true);

create policy "Doctors can create calls for their own room"
on public.patient_calls for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (select 1 from public.doctors where id = doctor_id and user_id = auth.uid())
);

create policy "Doctors can dismiss their own calls"
on public.patient_calls for delete
to authenticated
using (
  created_by = auth.uid()
  and exists (select 1 from public.doctors where id = doctor_id and user_id = auth.uid())
);

create policy "Doctors can read alarms"
on public.doctor_alerts for select
to authenticated
using (exists (select 1 from public.doctors where user_id = auth.uid()));

create policy "Doctors can send alarms"
on public.doctor_alerts for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (select 1 from public.doctors where user_id = auth.uid())
);

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'patient_calls') then
    alter publication supabase_realtime add table public.patient_calls;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'doctor_alerts') then
    alter publication supabase_realtime add table public.doctor_alerts;
  end if;
end $$;
```

Erstat `ADMIN-EMAIL@example.com` med din administrators e-mail i sidste SQL-linje herunder, og kør den for at give din konto administratorrettigheder:

```sql
insert into public.clinic_admins (user_id)
select id from auth.users where lower(email) = lower('ADMIN-EMAIL@example.com')
on conflict do nothing;
```

Slå offentlige brugertilmeldinger fra i Supabase. Lægekonti oprettes fra dashboardet via Edge Function, ikke direkte fra browseren. Patientnavne bliver synlige på venteværelsesskærmen; brug testnavne under udvikling, og få klinikkens godkendelse af den arbejdsgang, før rigtige navne vises.

### Udgiv kontooprettelsesfunktionen

Installer Node.js LTS, og kør i projektmappen:

```powershell
npx supabase login
npx supabase link --project-ref ytinlidtxathvoamqebl
npx supabase functions deploy create-doctor-account
```

Funktionen bruger Supabase' server-side secret/service-role-nøgle fra Edge Function-miljøet. Den nøgle må aldrig kopieres ind i HTML, JavaScript eller Electron-appen.

### Lægeappen og EXE

Installér Node.js LTS, åbn en ny PowerShell i projektmappen, og kør:

```powershell
npm install
npm run make
```

Windows-installationsfilen kopieres til `dist/LaegeKald-Setup.exe`. Installationsprogrammet lægger en genvej på skrivebordet. Installér EXE'en på lægernes computere. På TV'et åbner du fortsat `tvscreen.html` i browseren; patientkald synkroniseres via Supabase Realtime, mens personalealarmen kun findes i lægeappen. En ikke-signeret EXE kan give en Windows SmartScreen-advarsel.

Hvis SQL Editor siger, at en tabel eller policy allerede findes, er den sandsynligvis oprettet tidligere. Undgå at køre SQL'en igen uden først at kontrollere tabellen under **Table Editor**.

## Skift logoet

Logoet ligger øverst i `tvscreen.html` som et `<img class="clinic-logo">`-element. Ret `src`-adressen for at bruge et andet billede. Du kan bruge en webadresse eller et billede i projektmappen, for eksempel `images/logo.png`.

Logoets størrelse styres af `.clinic-logo` i `Style.css`. `width` bestemmer bredden, og `max-height` begrænser højden. Logoet hentes aktuelt fra en ekstern hjemmeside, så det vises kun, hvis skærmen har internetadgang, og billedadressen fortsat virker.

## Ret klinikkens oplysninger

Adresse og telefonnummer står i `<footer>` nederst i `tvscreen.html`. Ret teksten dér. HTML-tagget `<br>` laver et linjeskift.

Hjælpeteksten til patienter står i `<aside class="help-banner">` og kan også ændres direkte i `tvscreen.html`.

## Farver og layout

De vigtigste farver er samlet øverst i `Style.css` under `:root`. Her kan du blandt andet ændre baggrund, tekst, grøn accentfarve og skillelinjer:

```css
:root {
  --green: #2e6953;
  --green-dark: #224d3e;
  --muted: #77817b;
  --line: #e5e8e2;
}
```

TV-layoutet styres øverst i `Style.css` med `.content-grid`, `.doctor-section` og `.welcome`. Login og dashboard bruger samme fil via reglerne med `.auth-`-klasser.

Hvis du ændrer HTML-klasser, skal du kontrollere, om de samme klasser også bruges i `Style.css`. Klasser forbinder HTML-indholdet med dets udseende.

## Dato og klokkeslæt

`Script.js` finder elementerne med id'erne `date` og `clock` og udfylder dem med den aktuelle dato og tid. Formatet `da-DK` viser datoen på dansk. Funktionen kører først, når siden åbner, og opdateres derefter hvert sekund:

```js
window.setInterval(updateDateTime, 1_000);
```

Tallet er millisekunder: `1_000` svarer til ét sekund. Ændr det, hvis uret skal opdateres sjældnere.

## Gode ting at tjekke før brug

- Er lægernes navne og lokationer korrekte?
- Stemmer tallet for antal læger med listen?
- Er adresse og telefonnummer korrekte?
- Virker logoet på den skærm, hvor siden skal vises?
- Er teksten læsbar på skærmen fra venteværelsets siddepladser?


## Login og database (Supabase)

Login-siden bruger Supabase Auth. Projektet opbevarer ikke adgangskoder i HTML, JavaScript eller en egen tabel. Supabase gemmer adgangskoder som saltede bcrypt-hashes; de kan derfor ikke læses tilbage som almindelige adgangskoder. Supabase krypterer også kundedata, mens de er gemt. Brugerne administreres under **Authentication → Users** i Supabase.

### Første opsætning

Projektet er almindelig HTML og JavaScript, ikke Next.js. Derfor bruger det Supabase JavaScript-biblioteket fra CDN. Next.js-pakkerne `@supabase/ssr`, `.env.local` og middleware-koden fra Connect-guiden skal ikke bruges her.

1. Opret et Supabase-projekt på [supabase.com](https://supabase.com/).
2. Find projektets **Project URL** og **publishable key** under **Connect** i projektets Dashboard.
3. Projektets URL og publishable key er allerede sat i `auth.js`. Hvis du ændrer projekt eller roterer nøglen, ret de to konstanter øverst i filen.
4. Slå offentlige tilmeldinger fra under Authentication-indstillingerne, hvis kun klinikkens personale skal have adgang. Login-siden har ikke en tilmeldingsknap.
5. Opret din egen administratorbruger under **Authentication → Users**, og giv den administratorrollen med SQL-blokken i afsnittet ovenfor. Opret derefter lægekonti fra `dashboard.html`.
6. Angiv websidens adresse under Supabase Auths **URL Configuration**, inklusive de tilladte adresser til `logon.html`, `dashboard.html` og `doctor.html`.
7. Åbn siden via en lokal webserver, f.eks. VS Code Live Server, eller via den udgivne HTTPS-adresse. Login virker ikke nødvendigvis, hvis HTML-filen åbnes direkte med `file://`.

Projektets URL og publishable key står øverst i `auth.js`. Brug kun publishable key i browseren. Læg aldrig en `secret`- eller `service_role`-key i browserkode eller GitHub.

`dashboard.html` sender brugere uden en aktiv login-session tilbage til login-siden. Det er en adgangskontrol til brugerfladen. Hvis du senere tilføjer data eller ændringer i databasen, skal de også beskyttes med Supabase Row Level Security (RLS); adgangskontrol i browseren beskytter ikke databaseindhold alene.

### Filer til login

| Fil | Formål |
| --- | --- |
| `logon.html` | Loginformularen til personalet. |
| `dashboard.html` | Kontrolpanel med lægeadministration, sessionstjek og log ud. |
| `Style.css` | Samler udseendet for TV-skærmen, login og kontrolpanel. |
| `auth.js` | Supabase-konfiguration samt login, sessionskontrol og log ud. |
| `Script.js` | Dato/klokkeslæt på TV-skærmen og popup-funktion i dashboardet. |
| `calls.js` | Synkroniserer indkaldelser til TV'et og håndterer lægealarmer. |
