# Copy (AR / EN)

Purpose: every user-facing string in the product, English and Arabic side by side, in the chapter's friendly voice. This file is the source for the app's string files `src/i18n/en.json` and `src/i18n/ar.json`; no user-facing text may be hard-coded in components. Keys match the ones listed per screen in `SCREENS.md`. Trivia questions live in `docs/content/trivia-questions.json`, not here.

Last updated: 2026-09-24

---

## 1. Voice

- **Friendly, short, playful, never corporate.** Like the chapter's Instagram: "You're in!", not "Registration successful".
- **Celebrate people by name.** Boards say names big; results congratulate.
- **Never blame.** Errors say what to do next ("Check the big screen"), not what the guest did wrong.
- **Arabic**: Modern Standard Arabic that reads naturally, with a light Jordanian touch only in a few calls to action (e.g. «يلّا نلعب!»). Brand and product names stay in Latin script (Google, GDG, Gemini). Western digits (ADR-123).
- **Length**: phone strings fit one line at 360 px where possible; buttons ≤ 20 characters in both languages.
- Native-speaker review of every Arabic string is part of Phase 5 (OQ-04). Strings marked ⚑ need a second opinion on tone.

## 2. Format rules

- Placeholders use `{name}` and are never translated. Numbers passed in are already formatted with Western digits.
- **Plurals** use `Intl.PluralRules`: English needs `one`/`other`; Arabic needs `zero`/`one`/`two`/`few`/`many`/`other`. Plural keys are marked (plural) and list every form.
- `{game}` is filled with the `game.<id>.name` string in the same language.
- JSON files are flat maps: `"join.code.title": "…"`; plural keys become nested objects: `"lobby.players_count": {"one": "…", "other": "…"}`.
- Scripts check that `en.json` and `ar.json` have identical key sets and the same placeholders (`TESTING.md` §3).

## 3. Common and join

| Key | English | العربية |
|---|---|---|
| `app.name` | GDG Booth Games | ألعاب ركن GDG |
| `common.lang_toggle` | العربية | English |
| `common.cancel` | Cancel | إلغاء |
| `common.confirm` | Yes, do it | نعم، تابع |
| `common.done` | Done | تم |
| `join.code.title` | Enter the code on the big screen | أدخل الرمز الظاهر على الشاشة الكبيرة |
| `join.code.placeholder` | 4-digit code | رمز من 4 أرقام |
| `join.code.next` | Next | التالي |
| `join.code.error_format` | Codes have 4 digits | الرمز مكوّن من 4 أرقام |
| `join.code.error_invalid` | That code isn't active. Check the big screen for the current one. | هذا الرمز غير فعّال. تحقّق من الرمز الحالي على الشاشة الكبيرة. |
| `join.back` | Change code | تغيير الرمز |
| `join.name.title` | What should we call you? | بماذا نناديك؟ |
| `join.name.placeholder` | Your name | اسمك |
| `join.name.hint` | Up to 12 letters or numbers | حتى 12 حرفًا أو رقمًا |
| `join.name.counter` | {n} / {max} | {n} / {max} |
| `join.name.submit` | Let's play! | يلّا نلعب! ⚑ |
| `join.name.error_empty` | Type a name first | اكتب اسمًا أولًا |
| `join.name.error_invalid` | Letters, numbers and spaces only | أحرف وأرقام ومسافات فقط |
| `join.name.error_blocked` | Let's pick a different name | لنختر اسمًا آخر |
| `join.error_rate` | Lots of people joining right now. Trying again… | كثيرون ينضمّون الآن. نحاول مرة أخرى… |
| `join.error_network` | No connection. Check your mobile data and try again. | لا يوجد اتصال. تحقّق من بيانات الجوال وحاول مجددًا. |
| `join.error_warming` | We're warming up. Try again in a minute. | نجهّز اللعبة. حاول مجددًا بعد دقيقة. |
| `join.error_wait` | Too many tries. Wait {s} s and try again. | محاولات كثيرة. يمكنك المحاولة مجددًا بعد {s} ث. |

## 4. Lobby, rounds, results

| Key | English | العربية |
|---|---|---|
| `lobby.in` | You're in! | أنت معنا! |
| `lobby.you_are` | Playing as {name} | اسمك في اللعبة: {name} |
| `lobby.lineup` | Your games | ألعابك |
| `lobby.waiting` | Waiting for the host to start… | بانتظار أن يبدأ المضيف… |
| `lobby.next_round` | You're in the next round | أنت في الجلسة القادمة |
| `lobby.next_round_sub` | The current game is almost done. Hang tight! | الجلسة الحالية على وشك الانتهاء. لن يطول الانتظار! |
| `lobby.players_count` (plural) | one: 1 player · other: {n} players | zero: لا يوجد لاعبون بعد · one: لاعب واحد · two: لاعبان · few: {n} لاعبين · many: {n} لاعبًا · other: {n} لاعب |
| `removed.title` | Removed by host | أزالك المضيف من الجلسة |
| `removed.body` | You can join the next game with its new code. | يمكنك الانضمام إلى الجلسة القادمة برمزها الجديد. |
| `removed.cta` | Enter a new code | أدخل رمزًا جديدًا |
| `round.label` | Round {n} of {total} | الجولة {n} من {total} |
| `round.get_ready` | Get ready… | استعد… |
| `round.go` | Go! | انطلق! |
| `round.time_left` | {s} s left | متبقٍّ {s} ث |
| `round.your_score` | Your score | نتيجتك |
| `round.board_title` | Round leaderboard | ترتيب الجولة |
| `round.waiting_others` | Waiting for others… {done}/{total} done | بانتظار الآخرين… {done}/{total} أنهوا |
| `round.missed` | You missed this round. The next one's yours! | فاتتك هذه الجولة. القادمة لك! |
| `round.no_scores` | No scores this round | لا نتائج في هذه الجولة |
| `intermission.round_board` | Round {n} results | نتائج الجولة {n} |
| `intermission.session_total` | Total so far | المجموع حتى الآن |
| `intermission.next` | Next: {game} | التالي: {game} |
| `intermission.skip` | Next round now | الجولة التالية الآن |
| `results.title` | Final results | النتائج النهائية |
| `results.your_total` | Your total | مجموعك |
| `results.rank` | You placed #{rank} of {n} | حللت في المركز {rank} من {n} |
| `results.breakdown_missing` | – | – |
| `results.no_scores` | No scores this session | لا نتائج في هذه الجلسة |
| `results.new_best` | New personal best! | رقم شخصي جديد! |
| `results.join_next` | Join the next game | انضم للجلسة القادمة |
| `results.session_ended` | This game has ended. Join the next one! | انتهت هذه الجلسة. انضم إلى القادمة! |
| `dayboard.title` | Today's best | أفضل نتائج اليوم |
| `dayboard.empty` | No scores yet. Be the first! | لا نتائج بعد. من سيكون الأول؟ |

## 5. Games

| Key | English | العربية |
|---|---|---|
| `game.odd_one_out.name` | Odd One Out | أيّها المختلف؟ |
| `game.stop_the_clock.name` | Stop the Clock | أوقف الساعة |
| `game.simon.name` | Simon | سايمون |
| `game.perfect_circle.name` | Perfect Circle | الدائرة المثالية |
| `game.trivia.name` | Trivia | أسئلة سريعة |
| `game.odd_one_out.pitch` (`game.ooo.pitch`) | One chevron is different. Find it fast. | شكل واحد مختلف. اعثر عليه بسرعة. |
| `game.stop_the_clock.pitch` (`game.stc.pitch`) | No clock, no hints. Stop it when you feel the time is up. | لا ساعة ولا تلميحات. اضغط «أوقف» حين تشعر أن الوقت انتهى. |
| `game.simon.pitch` | Watch the pads light up, then repeat the pattern. | راقب الأزرار وهي تضيء، ثم كرّر التسلسل. |
| `game.perfect_circle.pitch` (`game.pc.pitch`) | Draw one circle with your finger. How round can you go? | ارسم دائرة واحدة بإصبعك. هل ستكون مثالية؟ |
| `game.trivia.pitch` | 5 quick questions. Faster right answers score more. | 5 أسئلة سريعة. كلما أسرعت في الإجابة الصحيحة زادت نقاطك. |

Key aliasing: game docs use short ids (`ooo`, `stc`, `pc`) for readability; the string files use the full game id (`odd_one_out`, `stop_the_clock`, `perfect_circle`). `game.ooo.x` in a game doc = `game.odd_one_out.x` in the JSON.

### 5.1 Stop the Clock

| Key | English | العربية |
|---|---|---|
| `game.stop_the_clock.intro` | 3 tries · hidden timer | 3 محاولات · مؤقّت مخفي |
| `game.stop_the_clock.try` | Try {n} of 3 | المحاولة {n} من 3 |
| `game.stop_the_clock.target` (plural on {s}) | one: 1 second · other: {s} seconds | zero: 0 ثانية · one: ثانية واحدة · two: ثانيتان · few: {s} ثوانٍ · many: {s} ثانية · other: {s} ثانية |
| `game.stop_the_clock.start` | Start | ابدأ |
| `game.stop_the_clock.stop` | Stop | أوقف |
| `game.stop_the_clock.locked` | Locked in ✓ | تم التسجيل ✓ |
| `game.stop_the_clock.next` | Next: {target} | التالي: {target} |
| `game.stop_the_clock.missed` | Missed the start | فاتتك البداية |
| `game.stop_the_clock.result_row` | {target} → {guess} s | {target} ← {guess} ث |
| `game.stop_the_clock.reveal_title` | Everyone's guesses | تخمينات الجميع |
| `game.stop_the_clock.reveal_axis` | Target | الهدف |

`{target}` in `next` is the formatted `target` string.

### 5.2 Odd One Out

| Key | English | العربية |
|---|---|---|
| `game.odd_one_out.intro` | 3 grids · each one harder | 3 شبكات · كل واحدة أصعب |
| `game.odd_one_out.grid` | Grid {n} of 3 | الشبكة {n} من 3 |
| `game.odd_one_out.penalty` | +2 s | +2 ث |
| `game.odd_one_out.timeout` | Time's up for this one | انتهى وقت هذه الشبكة |
| `game.odd_one_out.result_row` | Grid {n} · {s} s | الشبكة {n} · {s} ث |
| `game.odd_one_out.penalty_note` | incl. {p} s penalty | منها {p} ث عقوبة |

### 5.3 Simon

| Key | English | العربية |
|---|---|---|
| `game.simon.intro` | Starts at 3 · one mistake ends it | تبدأ بـ 3 · خطأ واحد ينهيها |
| `game.simon.watch` | Watch… | راقب… |
| `game.simon.your_turn` | Your turn | دورك |
| `game.simon.length` | Length {n} | الطول {n} |
| `game.simon.nice` | Nice! | رائع! |
| `game.simon.reached` | Reached length {n} | وصلت إلى الطول {n} |
| `game.simon.won` | You beat Simon! | هزمت سايمون! |
| `game.simon.result` | Length {n} · speed bonus +{b} | الطول {n} · مكافأة السرعة +{b} |
| `game.simon.pad_up` | Up | أعلى |
| `game.simon.pad_right` | Right | يمين |
| `game.simon.pad_down` | Down | أسفل |
| `game.simon.pad_left` | Left | يسار |

### 5.4 Perfect Circle

| Key | English | العربية |
|---|---|---|
| `game.perfect_circle.intro` | One circle · one try | دائرة واحدة · محاولة واحدة |
| `game.perfect_circle.draw` | Draw! | ارسم! |
| `game.perfect_circle.hint.short` | Draw a full circle | ارسم دائرة كاملة |
| `game.perfect_circle.hint.small` | Bigger! | أكبر! |
| `game.perfect_circle.hint.open` | Close your circle | أغلق دائرتك |
| `game.perfect_circle.hint.loops` | Just one loop | لفّة واحدة فقط |
| `game.perfect_circle.tries_left` | Clean tries left: {n} | المحاولات المتبقية: {n} |
| `game.perfect_circle.result` | Roundness {r}% · Closed {c}% | الاستدارة {r}% · الإغلاق {c}% |
| `game.perfect_circle.sr_result` | Score {score}. Roundness {r} percent, closed {c} percent. | النتيجة {score}. الاستدارة {r} بالمئة، والإغلاق {c} بالمئة. |

### 5.5 Trivia

| Key | English | العربية |
|---|---|---|
| `game.trivia.intro` | 5 questions · 10 s each | 5 أسئلة · 10 ثوانٍ لكل سؤال |
| `game.trivia.progress` | {n} / 5 | {n} من 5 |
| `game.trivia.bucket.google_dev` | Google & dev | Google والبرمجة |
| `game.trivia.bucket.ai_basics` | AI basics | أساسيات الذكاء الاصطناعي |
| `game.trivia.bucket.gdg_community` | Community | المجتمع |
| `game.trivia.times_up` | Time's up | انتهى الوقت |
| `game.trivia.correct_points` | +{p} | +{p} |
| `game.trivia.five_left` | 5 seconds left | متبقٍّ 5 ثوانٍ |
| `game.trivia.result` | {n} / 5 correct | {n} من 5 إجابات صحيحة |
| `game.trivia.unavailable` | Needs 5+ ready questions | يحتاج 5 أسئلة جاهزة على الأقل |

## 6. Host view (big screen)

The lobby join strings (`host.lobby.scan`, `host.lobby.or_visit`, `host.lobby.code_label`) are rendered in **both** languages at once (SCREENS H1).

| Key | English | العربية |
|---|---|---|
| `host.signin.title` | Host sign-in | دخول المضيف |
| `host.signin.email` | Email | البريد الإلكتروني |
| `host.signin.password` | Password | كلمة المرور |
| `host.signin.submit` | Sign in | دخول |
| `host.signin.error` | Wrong email or password | البريد الإلكتروني أو كلمة المرور غير صحيحة |
| `host.signin.not_admin` | This account isn't a host account | هذا الحساب ليس حساب مضيف |
| `host.lobby.scan` | Scan to play | امسح الرمز لتلعب |
| `host.lobby.or_visit` | or visit {url} | أو زُر {url} |
| `host.lobby.code_label` | Game code | رمز الجلسة |
| `host.lobby.players` (plural) | one: 1 player · other: {n} players | zero: لا يوجد لاعبون بعد · one: لاعب واحد · two: لاعبان · few: {n} لاعبين · many: {n} لاعبًا · other: {n} لاعب |
| `host.lobby.empty` | Waiting for players… be the first! | بانتظار اللاعبين… من سيكون الأول؟ |
| `host.lobby.remove` | Remove | إزالة |
| `host.lobby.remove_confirm` | Remove {name} from this game? | إزالة {name} من هذه الجلسة؟ |
| `host.lineup.title` | Games: pick {n} | الألعاب: اختر {n} |
| `host.lineup.next_title` | Next session's games | ألعاب الجلسة القادمة |
| `host.lineup.need` (plural) | one: Pick 1 game · other: Pick {n} different games | zero: اختر {n} ألعاب مختلفة · one: اختر لعبة واحدة · two: اختر لعبتين مختلفتين · few: اختر {n} ألعاب مختلفة · many: اختر {n} لعبة مختلفة · other: اختر {n} لعبة مختلفة |
| `host.start` | Start | ابدأ |
| `host.start_disabled_hint` | Needs at least 1 player | يحتاج لاعبًا واحدًا على الأقل |
| `host.round.finished` | {done}/{total} finished | {done}/{total} أنهوا |
| `host.round.force_end` | End round | إنهاء الجولة |
| `host.round.force_end_confirm` | End this round now? Scores so far count. | إنهاء هذه الجولة الآن؟ النتائج الحالية تُحتسب. |
| `host.corner.next_code` | Next game: {code} | الجلسة القادمة: {code} |
| `host.corner.late` | Late? Join the next session | تأخرت؟ انضم للجلسة القادمة |
| `host.results.winner` | Winner! | المركز الأول! |
| `host.results.show_day_board` | Show day board | عرض لوحة اليوم |
| `host.results.total` | Total | المجموع |
| `host.new_session` | New session | جلسة جديدة |
| `host.settings.language` | Screen language | لغة الشاشة |
| `host.settings.theme` | Dark screen | شاشة داكنة |
| `host.settings.reduced_motion` | Reduce motion | تقليل الحركة |
| `host.signout` | Sign out | تسجيل الخروج |
| `host.banner.reconnecting` | Reconnecting… | نعيد الاتصال… |
| `host.banner.db_down` | Database unreachable. See runbook §5.1. | تعذّر الوصول إلى قاعدة البيانات. راجع دليل التشغيل §5.1. |

## 7. Dashboard

| Key | English | العربية |
|---|---|---|
| `dash.title` | Dashboard | لوحة التحكم |
| `dash.nav.today` | Today | اليوم |
| `dash.nav.sessions` | Sessions | الجلسات |
| `dash.nav.results` | All results | كل النتائج |
| `dash.nav.names` | Names | الأسماء |
| `dash.nav.days` | Event days | أيام الفعالية |
| `dash.today.running` | Running now | قيد التشغيل الآن |
| `dash.today.none` | No session running | لا توجد جلسة قيد التشغيل |
| `dash.stat.players` | Players | اللاعبون |
| `dash.stat.sessions` | Sessions | الجلسات |
| `dash.stat.scores` | Scores | النتائج |
| `dash.sessions.col.start` | Started | وقت البدء |
| `dash.sessions.col.code` | Code | الرمز |
| `dash.sessions.col.games` | Games | الألعاب |
| `dash.sessions.col.players` | Players | اللاعبون |
| `dash.sessions.col.top` | Winner | الفائز |
| `dash.sessions.col.status` | Status | الحالة |
| `dash.session.detail_title` | Session {code} | الجلسة {code} |
| `dash.session.removed` | Removed | أُزيل |
| `dash.session.end_reason.all_finished` | Everyone finished | أنهى الجميع |
| `dash.session.end_reason.time_cap` | Time ran out | انتهى الوقت |
| `dash.session.end_reason.force_end` | Ended by host | أنهاها المضيف |
| `dash.session.col.round` | Round {n} | الجولة {n} |
| `dash.session.col.total` | Total | المجموع |
| `dash.results.best_toggle` | Best per name | الأفضل لكل اسم |
| `dash.results.filter_day` | Day | اليوم |
| `dash.results.filter_game` | Game | اللعبة |
| `dash.results.all` | All | الكل |
| `dash.results.col.name` | Name | الاسم |
| `dash.results.col.game` | Game | اللعبة |
| `dash.results.col.score` | Score | النتيجة |
| `dash.results.col.time` | Time | الوقت |
| `dash.results.col.session` | Session | الجلسة |
| `dash.results.empty` | No results yet | لا نتائج بعد |
| `dash.export` | Export CSV | تصدير CSV |
| `dash.names.hide_title` | Hide a name | إخفاء اسم |
| `dash.names.hide_input` | Name to hide | الاسم المراد إخفاؤه |
| `dash.names.hide_btn` | Hide everywhere | إخفاء من كل اللوحات |
| `dash.hide_confirm` | Hide “{name}” from every leaderboard? | إخفاء «{name}» من كل لوحات الترتيب؟ |
| `dash.names.hide_preview_empty` | No names match | لا توجد أسماء مطابقة |
| `dash.names.hide_preview_count` (plural) | one: 1 name matches · other: {n} names match | zero: لا توجد أسماء مطابقة · one: اسم واحد مطابق · two: اسمان مطابقان · few: {n} أسماء مطابقة · many: {n} اسمًا مطابقًا · other: {n} اسم مطابق |
| `dash.names.hidden_list` | Hidden names | الأسماء المخفية |
| `dash.names.hidden_empty` | No hidden names | لا توجد أسماء مخفية |
| `dash.names.unhide` | Unhide | إظهار |
| `dash.names.blocked_title` | Blocked words | الكلمات المحظورة |
| `dash.names.blocked_add` | Add word | إضافة كلمة |
| `dash.names.blocked_empty` | No blocked words yet | لا توجد كلمات محظورة بعد |
| `dash.names.match_word` | Whole word | كلمة كاملة |
| `dash.names.match_substring` | Anywhere in the name | في أي جزء من الاسم |
| `dash.names.remove` | Remove | حذف |
| `dash.days.current` | Current day | اليوم الحالي |
| `dash.days.current_badge` | Current | الحالي |
| `dash.days.start_new` | Start new event day | بدء يوم فعالية جديد |
| `dash.days.label` | Day label | اسم اليوم |
| `dash.days.confirm` | Start a new day? Today's boards are archived and fresh day boards begin. | بدء يوم جديد؟ ستُؤرشف لوحات اليوم وتبدأ لوحات جديدة. |
| `dash.days.blocked_running` | Finish the running session first | أنهِ الجلسة الجارية أولًا |
| `dash.days.col.started` | Started | وقت البدء |
| `dash.days.col.ended` | Ended | انتهى |
| `dash.days.col.sessions` | Sessions | الجلسات |
| `dash.sessions.empty` | No sessions yet | لا توجد جلسات بعد |
| `status.pending` | Next up | التالية |
| `status.lobby` | Lobby | الانتظار |
| `status.playing` | Playing | قيد اللعب |
| `status.results` | Results | النتائج |
| `status.closed` | Closed | مغلقة |

## 8. System messages

| Key | English | العربية |
|---|---|---|
| `sys.offline` | You're offline. We'll reconnect automatically. | أنت غير متصل. سنعيد الاتصال تلقائيًا. |
| `sys.reconnected` | Back online | عاد الاتصال |
| `sys.other_tab` | The game is already open in another tab | اللعبة مفتوحة في تبويب آخر |
| `sys.rotate` | Turn your phone back upright | أعد هاتفك إلى الوضع العمودي |
| `sys.saving` | Saving your score… | نحفظ نتيجتك… |
| `sys.save_failed` | Your score couldn't be saved in time | تعذّر حفظ نتيجتك في الوقت المحدد |
| `sys.generic_error` | Something went wrong. Try again. | حدث خطأ ما. حاول مجددًا. |
| `sys.try_again` | Try again | حاول مجددًا |

## 9. Booth script (spoken, for the runbook)

| Moment | English | العربية |
|---|---|---|
| Hook | "Want to play? Three quick games on your phone, your name on the big screen." | «بدك تلعب؟ ثلاث ألعاب سريعة على جوالك، واسمك على الشاشة الكبيرة.» |
| How | "Scan the code, type the four digits and your name. That's it." | «امسح الرمز، اكتب الأرقام الأربعة واسمك، وخلصنا.» |
| Waiting | "We start in a moment. Tell your friends!" | «بنبلش بعد شوي، خبّر صحابك!» |
| After | "Nice! Beat your score in the next round, or come back later: the day board resets tomorrow." | «حلو! حاول تكسر رقمك بالجولة الجاية، أو ارجع بعدين: لوحة اليوم بتتصفّر بكرة.» |
| About us | "We're GDG on Campus, a free community for anyone who likes building things with tech." | «إحنا GDG on Campus، مجتمع مجاني لكل شخص بحب يبني أشياء بالتكنولوجيا.» |

The spoken script is deliberately in Jordanian dialect; on-screen text stays MSA-leaning.
