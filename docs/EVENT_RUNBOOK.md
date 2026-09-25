# Event Runbook

Purpose: everything the person running the booth needs, in the order they need it: setup checklist, how to run a session, what to say to guests, what to do when something breaks, and the end-of-day steps. Written for a chapter member who didn't build the system. Keep a printed copy at the booth.

Last updated: 2026-09-25

---

## 0. Before the event (one-time)

- [ ] Dry run passed the day before (`TESTING.md` §8); release tag noted in `PROGRESS.md`.
- [ ] **Brand approval from the chapter lead** (OQ-07): logo use, palette, Google colours in Simon, shatter motif, copy. Google has brand guidelines for community chapters; the chapter lead confirms we follow them.
- [ ] Admin email and password in the team password manager; at least two people can sign in.
- [ ] Netlify auto publishing locked; nobody merges during the event (ADR-032).
- [ ] Printed: this runbook, the booth script (§3), the admin login (sealed, for emergencies).

## 1. Setup at the booth (every event day, ~15 min)

- [ ] Laptop on power; sleep, screen saver and notifications **off**; browser up to date; only one host tab.
- [ ] Laptop internet: team phone hotspot (don't rely on venue WiFi; guests use their own data).
- [ ] Open `/host`, sign in **before** connecting the projector. Check the green connection state (no banner).
- [ ] Projector connected, browser fullscreen (F11). From the back of the booth area, check that the code and QR are readable. Scan the QR with your own phone.
- [ ] Dashboard (D6): the current event day is today. If not: "Start new event day" (§6.2).
- [ ] Settings on the big screen: language (EN or AR for the non-join text), reduce motion off, theme per the dry-run decision.
- [ ] Admin phone: `/dashboard` signed in, open on the Names page (for fast hiding).
- [ ] Check the supabase project status is Active (dashboard) if a teammate has access.

## 2. Running a session

1. **Lobby.** The big screen shows the code, the QR and the lineup. Pick 3 games (tap in order; the last lineup is preselected). Invite people (§3).
2. **Watch the list.** Names appear as guests join. Offensive name → tap `×` → confirm (it's gone from their phone too).
3. **Start** when you have players (1 is enough; 4–10 is fun). The session locks; the next session's code appears in the corner for latecomers.
4. **During rounds.** Nothing to do. Cheer people on by name. If the round is stuck on one or two missing players whose phones are dead or gone, tap **End round** (scores so far count).
5. **Between rounds.** The board shows the round results, then the running total, then the next game. To move faster, tap **Next round now**.
6. **Results.** Congratulate the winner by name. When ready, tap **Show day board** (15 s animation), then **New session**. Latecomers are already in the new lobby.
7. You can change the next session's games any time during play with **next games ▾**; it never affects the running session.

Typical session: 3–6 minutes. Aim for a new session every ~8 minutes at busy times.

**Picking games for the crowd (10 in the pool, ADR-134, ADR-136).**
- *Crowds and busy times* (fast, readable from outside, fun to watch): **Close the Brackets** and **Color Clash** (30 s each, the room sees the scores climb), **Odd One Out**, **Trivia** (people shout answers), **How Many?** (the big-screen count reveal is a group "wisdom of the crowd" moment) and **Swipe Sort** (fast hand movement is visible from a distance). A quick lineup: Color Clash → Odd One Out → Close the Brackets (≈ 3 min).
- *Solo players and quiet moments* (focus, a story to tell afterwards): **Stop the Clock** (the guess reveal is best with 3+ players, but works alone), **Perfect Circle**, **Simon** (the longest; a good player can take ~2 min), **Pairs** (calm, self-paced memory) and **How Many?** (also works well alone).
- **Pairs** is the calmest of the ten and the best fit for a child at the booth (no timer pressure to see, tap-to-flip, partial credit for an unfinished board); avoid it in a lineup meant to draw a crowd from a distance, since nothing on screen moves fast.
- Mix a fast game with a focus game so everyone has a chance. Colour-blind guests can play Color Clash (the buttons carry names, the inks differ in lightness) and Swipe Sort (chevron shape/orientation is a second cue), but a guest who can't tell colours at all should get a lineup without either if unsure.

## 3. What to say (short script)

Use whichever language the guest speaks (full lines in `COPY.md` §9).

- **Hook:** "Want to play? Three quick games on your phone, and your name goes on the big screen." / «بدك تلعب؟ ثلاث ألعاب سريعة على جوالك، واسمك على الشاشة الكبيرة.»
- **How:** "Scan the code, type the four digits and your name. That's it." / «امسح الرمز، اكتب الأرقام الأربعة واسمك، وخلصنا.»
- **Late:** "We just started. Use the small code in the corner and you're in the next round."
- **After:** "Nice! Beat your score next round, or come back later: the day board is up all day."
- **About us:** "We're GDG on Campus, a free community for anyone who likes building things with tech."

## 4. Rules to know (answers to guest questions)

- One game code per session; each session is 3 games; every game is scored 0–1000; the session winner has the highest total.
- The day board keeps each name's best score per game, today.
- Joining again later: just enter the new code; the name is remembered.
- Nothing is collected except the name they type.

## 5. Failure playbook

### 5.1 Supabase paused / database unreachable (red banner "Database unreachable", guests see "We're warming up")
1. Check the phone hotspot / laptop internet first (open any website).
2. A teammate with dashboard access opens supabase.com → the project. If it shows **Paused**: click **Resume project** and wait (can take several minutes). Free projects can be resumed for up to a year after pausing (https://supabase.com/docs/guides/platform/free-project-pausing).
3. Meanwhile: run a spoken trivia round at the booth (ADR-106); keep the crowd.
4. When it's back: reload `/host`; open a new lobby. Report in `PROGRESS.md` (the keepalive failed: why?).

### 5.2 Site not loading for everyone ("Site not available")
Netlify credits are exhausted or the site is paused. Nothing can be fixed from the booth on the Free plan (credits reset at the next billing cycle); the account owner can upgrade the plan. Fall back to the spoken trivia round. Prevented by the credit check at the dry run (ADR-126).

### 5.3 One guest's phone can't load or join
- Make sure they're on mobile data (not a captive-portal WiFi), then reload.
- If a QR scanner app opened an in-app browser: open the short URL in Safari/Chrome instead.
- Private browsing blocks storage on some phones: use a normal tab.
- Old phones: let them watch, or join the next session from a teammate's spare phone.
- Still stuck after 1 minute: move on kindly; don't hold the session.

### 5.4 Offensive name
- In the **lobby**: tap `×` next to it. Done.
- **After Start** (or on a day board): admin phone → Dashboard → Names → type the name → **Hide everywhere** → confirm. Gone from every board within seconds. It takes about 10 seconds end to end: practise it once in the dry run.
- Repeat offender with a variant spelling: add the word to **Blocked words** (whole word) so new joins with it fail.

### 5.5 Admin laptop crash / tab closed / battery died
- Phones keep playing the current round and saving their scores.
- Reopen the browser → `/host` (you stay signed in). The host view rebuilds from the database and continues: overdue rounds end immediately, then the intermission and next round follow.
- If the sign-in is lost: sign in again (password manager).
- If the laptop is dead: any laptop/phone can open `/host` and sign in; project it if possible.

### 5.6 Projector problems
- No signal: re-seat the cable, check the input source, set display mode to "Duplicate".
- Too dim/washed out: switch the theme in settings (light ↔ dark) and pick the more readable one.
- Wrong resolution: the layout scales with the screen height; set 1080p if available.
- No projector at all: run the host view on the laptop screen turned toward the booth; the dashboard on a phone.

### 5.7 A round is stuck
All phones done but the round doesn't end, or a phone is dead: tap **End round**. If the screen itself is frozen: reload `/host` (state comes back from the database).

### 5.8 Realtime lag at very high crowds
If the big screen or phones lag with very large sessions (dozens of phones at once), cap sessions informally: start the session when ~30 people are in and let the rest go to the next one via the corner code (OQ-16).

## 6. End of day

### 6.1 Results
1. Let the last session finish; tap **New session** (don't leave a session playing).
2. Dashboard → **All results** → Day = today → **Export CSV** (once with "Best per name" on, once off). Save both files to the team drive.
3. Optional announcements: the top name per game from the day board.
4. Metrics (PRD §5) for the day, from the SQL editor (maintainer):
   ```sql
   -- players per hour (today)
   select date_trunc('hour', created_at) h, count(distinct player_id) players
   from scores where event_day_id = (select id from event_days where is_current) group by 1 order by 1;
   -- return players (≥ 2 sessions)
   select count(*) filter (where n >= 2)::float / count(*) from
     (select player_id, count(distinct session_id) n from scores
      where event_day_id = (select id from event_days where is_current) group by 1) t;
   ```
5. Note incidents and numbers in `PROGRESS.md`.

### 6.2 Start the next event day
Do it at the end of the day or first thing the next morning (before any session): Dashboard → **Days** → **Start new event day**, label e.g. "Day 2" → confirm. Today's boards move to history; tomorrow's boards start empty. Not possible while a session is playing. Without the dashboard, a maintainer can paste `scripts/new-event-day.sql` into the Supabase SQL editor (same effect; nothing is deleted).

### 6.3 Shutdown
Sign out of `/host` and `/dashboard` on shared devices. Leave the Supabase project running (the keepalive covers the overnight gap).
