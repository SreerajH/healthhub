# Testing HealthHub in Expo Go

Start the dev server with a clean cache, then scan the QR code in Expo Go:

```bash
npx expo start -c --tunnel
```

Use `--tunnel`: the LAN address doesn't reach the phone on this setup. Today in the app is **Tue 17 Nov 2026** (the mock data is pinned to it), whatever the phone's clock says.

Three things can only be checked on a real phone, so start with these:

- [ ] **Camera** — Records → Upload → Camera. Allow access, take a photo, see it compressed (the file card shows the size and dimensions).
- [ ] **Share and PDF** — open any record → Share (the system share sheet) and Download PDF (photos should be inside the PDF).
- [ ] **Add to calendar** — Bookings → an appointment → Add to calendar. Allow access, then check the event, with reminders 24 h and 2 h before.
- [ ] **Success haptic** — finish a booking and feel the tap as the tick draws.

## First run

- [ ] Splash: the mark lifts, the wordmark fades in, then the app appears.
- [ ] The tips tour starts on Home: 5 tips, each spotlighting the right thing. Skip works, and so does Got it.
- [ ] Reopen the app: the tour doesn't come back. Profile → Replay app tips brings it back.

## Home

- [ ] Switch members: Coming up and the records list follow the selected person.
- [ ] Consult → specialties, Lab tests → packages, Upload record → the upload form, Reminders/Medicines → reminders.
- [ ] Coming up: "Mark as taken" logs the dose (check it in Reminders); tapping a booking opens it.
- [ ] The bell opens Notifications; unread rows have a dot and a tinted background.
- [ ] Pull to refresh.

## Records

- [ ] Filter by member and by type; "Clear filters" appears when nothing matches.
- [ ] Upload: Gallery (multiple), PDF, and the camera. Progress runs 0–100% per file, then the record opens.
- [ ] Record details: tap a photo for full screen (pinch to zoom on iOS), ⋯ → Delete asks first.

## Doctor booking

- [ ] Specialties: search "skin", "chest pain", "teeth" — sensible matches.
- [ ] Doctor list: each filter changes the count; sort by fee and by rating.
- [ ] Profile: Get directions opens maps; Book appointment goes to the slot picker.
- [ ] Slot picker: Sundays and taken slots are greyed; today only shows slots an hour or more away.
- [ ] Review: pick UPI, card, or pay at the clinic, then confirm. The tick animates, and the booking ID copies.
- [ ] The new booking shows on Home and in Bookings.

## Lab booking

- [ ] Packages and Single tests; the category chips filter packages.
- [ ] Package details: the test groups expand; the fasting note matches the package.
- [ ] Members: Kabir (6) is blocked on adult packages; Sunita (68) gets the senior-checkup tip. The total scales per person.
- [ ] Add a new address, pick a collection slot (today isn't offered), then confirm.

## Bookings

- [ ] Upcoming is grouped This week / Later; Past shows Visited and Cancelled.
- [ ] Reschedule an appointment: the current time is shown, the new one sticks, and the card re-sorts.
- [ ] Cancel: the sheet names the refund; after confirming, the booking moves to Past.
- [ ] A booking less than 2 hours away offers no reschedule or cancel (lab: 12 hours).

## Reminders

- [ ] Today's doses with Taken and Skip; the Undo in the toast puts it back.
- [ ] The streak band: filter to Sunita for the 12-day streak.
- [ ] Add a medicine: pick times and days, then check it appears under today if it runs today.
- [ ] Add a vaccine: it shows under Vaccines with its due date.

## Profile and the rest

- [ ] Every row opens its screen; the counts (members, bookings, reminders) are right.
- [ ] Search: type "thyroid" — lab tests, doctors and records, with tabs to narrow.
- [ ] Log out asks first.

## Accessibility

- [ ] VoiceOver / TalkBack: every button and chip is announced, and slot chips say "booked" when they're taken.
- [ ] Largest text size: nothing is clipped on Home, Bookings or the slot picker.
- [ ] Reduce motion on: the success tick appears without animating, and the splash just fades.

## Notifications (C7) — phone only

Notifications are scheduled on the phone, so none of this can be checked in a browser.
Local notifications work in Expo Go; only remote push was removed from Expo Go on Android.

- [ ] Add a medicine reminder (Reminders → Add). After saving, the "Never miss a dose or a visit" screen appears once.
- [ ] "Turn on reminders" shows the system dialog. Allow it.
- [x] Set a medicine for two minutes from now (Remind me at → **Other time…**). The notification arrives with the medicine name, dose and person.
- [x] Long-press / expand it: **Taken** and **Skip** buttons. Tap Taken, then open Reminders — the dose shows "Taken". (Works in Expo Go on Android, checked 2026-11-24.)
- [ ] Tap the notification body: the app opens on Reminders.
- [ ] Book a doctor slot about 3 hours away: a "Appointment in 2 hours" notification arrives an hour later. (A slot 2+ days away also gets one 24 hours before.)
- [ ] Profile → Notifications: turning "Medicine reminders" off stops dose notifications; turning it back on restores them.
- [ ] Deny permission (or turn it off in the phone's Settings): Profile → Notifications says reminders are off and offers "Open Settings".
- [ ] Sign out: no HealthHub notifications fire afterwards.
- [ ] Android 12+: without the exact-alarm permission, notifications can arrive a few minutes late. That's expected.

## Privacy, consent and app lock (C8)

Checked in the browser on 2026-11-24: the consent screen after sign-in, the Privacy and data screen, Download my data (web zip), the DELETE dialog, and the just-in-time ask. The export and delete functions were also tested on the server with a throwaway account.

- [ ] First sign-in: "Your data, your choice" appears before the profile. Unticking "Your account and profile" disables Agree.
- [ ] Untick Bookings at sign-up, then book a doctor: "Allow bookings?" appears before paying. Not now cancels the booking; Allow carries on.
- [ ] Add a child under 18: the guardian checkbox is required.
- [ ] Profile → Privacy and data → Require unlock → "Opening the app": your fingerprint or PIN is asked for. Leave the app for over a minute and come back: it's locked.
- [ ] "Records only": Home opens freely, but the Records tab and record details ask to unlock.
- [ ] App switcher: on Android, the preview is blank while you're on Records (screenshots are blocked there too). On iOS, the HealthHub cover shows instead of the screen.
- [ ] Download my data: the share sheet opens with a zip; save it and check data.json and files/.
- [ ] Airplane mode: the "You're offline" strip appears, and what's loaded stays on screen.
- [ ] Delete my account: only with a throwaway account. Type DELETE, and you're signed out with everything gone.
