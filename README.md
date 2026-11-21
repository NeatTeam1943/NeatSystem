# NeatSystem

המערכת המאוחדת של Neat Team 1943: כניסה אחת, משתמשים אחד, ומערכות שכל אחת מהן היא טאב.

- **NeatSystem (הריפו הזה)** מחזיק:
  - התחברות ומשתמשים (סכימה `hub`)
  - פרופילים
  - הרשאות
  - הוצאה מהקבוצה עם ארכיון
  - המעטפת: ניווט, בית, חיפוש, ניהול
- **כל תת-מערכת היא ריפו משלה עם נתונים משלה**, ומחוברת כאן כ-git submodule תחת `systems/`:

| טאב | ריפו | תיקייה |
|---|---|---|
| הכשרות | StudentTracker | `systems/trainings` |
| NEATHUB | NeatHub | `systems/neathub` |
| MoneyTeam | MoneyTeam (לא משתנה) | `systems/moneyteam` |
| Sunday | בעתיד | |

## תת-מערכות: איך זה עובד

**הטאב.** כל ריפו מייצא את `neatsystem/tab.jsx` לפי חוזה 1 (`src/core/tabs.ts`): מזהה, שם, אייקון, `Root`, כרטיסים לבית, ואיפה לקרוא את החלק שלו בפרופיל.
- בזמן הבנייה NeatSystem מוצא את כל `systems/*/neatsystem/tab.*` ומרכיב מהם את הניווט והנתיבים (`/trainings/*`, `/neathub/*`).
- כל טאב נטען בנפרד. טאב שלא נטען, או שקורס, מופיע ב"ניהול → מערכות" ומציג הודעה במקומו. כל השאר ממשיך לעבוד.
- ה-CSS של טאב מוגבל לטאב אוטומטית (`scripts/scope-css.ts`).
- העיצוב מגיע מ-`@neatsystem/kit` (`src/kit`). זה מה שגורם לכל הטאבים להיראות כמו אתר אחד.

**הנתונים.** כל תת-מערכת יושבת באותו פרויקט Supabase, בשתי סכימות משלה:
- `<sys>` — הטבלאות. סגורות לגמרי.
- `<sys>_api` — הפונקציות, שהן החוזה היחיד כלפי חוץ.

ממה ש-NeatSystem מחזיק, תת-מערכת משתמשת רק ב-`hub.people`, `hub.is_active`, `hub.has_perm`, ובפונקציות ההרשמה `hub.register_permissions` ו-`hub.register_subsystem` (`0002_platform.sql`). היא אף פעם לא כותבת לטבלאות של `hub`.

**הפרופיל.** לכל תת-מערכת יש `<sys>_api.profile_v1(user)` מסוג STABLE שמחזירה JSON בפורמט תצוגה קבוע (`src/core/profileBlocks.ts`). NeatSystem מצייר את זה בעצמו.
- הקריאה נעשית ב-GET, ו-PostgREST מריץ GET בטרנזקציה לקריאה בלבד. כלומר, הפרופיל לא יכול לשנות שום דבר בתת-מערכת.
- כל מערכת נקראת ונבדקת לבד. חוזה אחר, שגיאה, timeout או JSON שבור מציגים "המידע מ-X לא זמין כרגע", ושאר הפרופיל מוצג.

**הוצאה מהקבוצה.** `hub.archive_member` (בממשק: עריכת חברות → "הוצאה מהקבוצה…") עושה את הדברים הבאים:
- חוסם מיד את הגישה לכל המערכות, כי כל אחת בודקת `hub.is_active`.
- שומר ב-`hub.member_archives` את שורת הפרופיל, את היומן ואת ה-snapshot שכל תת-מערכת החזירה ב-`profile_v1` באותו רגע. הקריאה מתבצעת רק לפונקציות STABLE, ומערכת שבורה נרשמת כשגיאה בלי לעצור את ההוצאה.
- לא מוחק כלום ולא נוגע בנתונים של תת-המערכות. `hub.restore_member` מחזיר.

### להוסיף תת-מערכת (למשל Sunday)
1. ריפו חדש:
   - `neatsystem/tab.jsx` לפי החוזה.
   - `supabase/migrations/0001_<sys>.sql` עם סכימות `<sys>` ו-`<sys>_api`, `profile_v1`, `hub.register_permissions` ו-`hub.register_subsystem`.
   - בדיקות SQL ב-`supabase/tests/`. דוגמאות ב-StudentTracker וב-NeatHub.
2. כאן: `git submodule add -b main ../<Repo>.git systems/<folder>` ואז commit. שום קובץ אחר לא משתנה.
3. ב-Supabase:
   - להריץ את המיגרציה.
   - Settings → API → Exposed schemas: להוסיף את `<sys>_api`.

### עבודה יומיומית עם submodules
```bash
git clone --recurse-submodules https://github.com/NeatTeam1943/NeatSystem.git   # או אחרי clone רגיל: git submodule update --init
cd systems/trainings && git checkout main     # עריכה, commit ו-push לריפו של התת-מערכת
cd ../.. && git add systems/trainings && git commit -m "trainings: …"   # NeatSystem מצביע על הגרסה החדשה
git submodule update --remote                 # למשוך את הגרסאות האחרונות של כולן
```
בפעם הראשונה (אחרי ש-StudentTracker ו-NeatHub נדחפו): `bash scripts/add-systems.sh` ואז commit.

## איך זה בנוי

| שכבה | מה | איפה |
|---|---|---|
| אתר | React + TypeScript + Vite, ניתוב hash | `src/` → GitHub Pages ב-`neatteam1943.github.io/NeatSystem/` |
| נתונים | פרויקט Supabase **נפרד** של NeatSystem, סכימה `hub` | `supabase/migrations/` |
| התחברות | Google דרך Supabase Auth (PKCE) | |
| כתיבה | רק דרך פונקציות SQL (`hub.request_join`, `hub.decide_join`…) שבודקות הרשאה ורושמות ליומן באותה טרנזקציה | `0001_hub_core.sql` |
| קריאה | `hub.people` — מסתיר טלפון/תאריך לידה/מייל ממי שלא מורשה | `0001_hub_core.sql` |
| MoneyTeam | אתר ופרויקט נפרדים, לא משתנים | `src/modules/money/bridge.ts` |

### MoneyTeam: טאב, בלי לגעת בו
הטאב מציג את האתר של MoneyTeam עצמו ב-iframe מאותו origin.
- Google לא מאפשר כניסה בתוך frame. לכן בפעם הראשונה בכל דפדפן יש כפתור "התחברות ל-MoneyTeam": הגשר שלמטה פותח כרטיסייה, MoneyTeam שומר את החיבור ב-localStorage המשותף, ו-NeatSystem מזהה את זה (אירוע `storage`) ומציג את ה-frame.
- התיקייה `systems/moneyteam` נעולה על גרסה מסוימת רק כדי שבדיקה ב-CI תוודא שגרסת ה-auth שלנו זהה לשלו.
שני האתרים יושבים על אותו origin (`neatteam1943.github.io`), אז הם חולקים localStorage.
בלחיצה על MoneyTeam, NeatSystem מתחיל את כניסת ה-Google **בשם MoneyTeam**: הוא שומר את קוד ה-PKCE במפתח ש-MoneyTeam עצמו
קורא (`sb-<ref>-auth-token-code-verifier`), עם `login_hint` של המייל, ו-Google מחזיר ל-MoneyTeam שמסיים את הכניסה בקוד הקיים שלו.
אם כבר יש חיבור ל-MoneyTeam בדפדפן — פשוט נפתח.
עם החיבור הזה NeatSystem גם **קורא** (לא כותב) את מה ש-MoneyTeam כבר מרשה לאדם לראות: שורת החברות שלו ורשימת הקניות הפתוחה.

- `mt-auth` נעול על **auth-js 2.110.8 — אותה גרסה של MoneyTeam**. גרסאות חדשות מוסיפות `sb_flow_id` לכתובת החזרה. אם MoneyTeam משדרג את supabase-js, לשדרג גם כאן.
- `src/__tests__/moneyBridge.test.ts` בודק את זה: המפתח, כתובת החזרה המדויקת, ה-login_hint.
- כתובת החזרה היא בדיוק `https://neatteam1943.github.io/MoneyTeam/` — אותה כתובת ש-MoneyTeam משתמש בה בכניסה שלו, אז היא כבר מאושרת אצלו.
- כל אתר Pages תחת `neatteam1943` יכול לקרוא localStorage של האחרים (כבר היום). לכן רק אנשים מהימנים יוצרים ריפואים עם Pages בארגון.

### מודולים פנימיים
החלקים של NeatSystem עצמו (בית, אנשים, ניהול, MoneyTeam) הם תיקיות ב-`src/modules/<name>` שמייצאות `HubModule` (`src/core/module.ts`):
ניווט, נתיבים, פריטים ל"לטיפולי", תוצאות חיפוש, ווידג׳טים לבית וחלקים לפרופיל. מוסיפים אותה לרשימה ב-`src/app/modules.ts`,
ואת הטבלאות שלה במיגרציה משלה. המעטפת בונה את הכול מהרשימה — שום קובץ אחר לא משתנה.

### הרשאות
- `hub.permissions` — הקטלוג (כל מודול מוסיף את שלו).
- `hub.role_permissions` — ברירת מחדל לכל תפקיד + עמודת "אדמין" שמתווספת למי שמסומן אדמין. נערך ממסך ניהול → טבלת הרשאות.
- `hub.user_permissions` — הרשאה נוספת לאדם אחד. נערכת מהפרופיל / ממסך המשתמשים.
- הלקוח מסתיר כפתורים לפי `hub.my_permissions()`, אבל **השרת בודק כל כתיבה בעצמו**.

## הרצה מקומית

```bash
npm install             # בפעם הראשונה: לעשות commit ל-package-lock.json שנוצר (הגרסאות כבר נעולות ב-package.json)
npm run dev:mock        # בלי Supabase: נתונים מומצאים (גם של הטאבים) + בורר "צפייה בתור"
npm test                # בדיקות יחידה (כולל הגשר ל-MoneyTeam)
npm run test:systems    # הבדיקות של כל תת-מערכת
npm run test:db         # המיגרציות של NeatSystem ושל כל תת-מערכת + כל בדיקות ה-SQL, על Postgres מקומי (Postgres 15+, לא כ-root)
```

עם Supabase אמיתי: להעתיק `.env.example` ל-`.env.local`, למלא, ו-`npm run dev`.

## הקמה (פעם אחת)

1. **Supabase — פרויקט חדש ל-NeatSystem** (בתוכנית החינמית אפשר 2 פרויקטים פעילים: MoneyTeam + זה):
   1. Authentication → Providers → Google: להפעיל, עם OAuth client חדש ב-Google Cloud (לא של MoneyTeam), שה-callback שלו הוא כתובת ה-callback שהפרויקט החדש מציג.
   2. SQL Editor → להריץ את `supabase/migrations/0001_hub_core.sql` ואז `0002_platform.sql`, ואחריהן את המיגרציה של כל תת-מערכת (`systems/*/supabase/migrations/`).
   3. Settings → API → Exposed schemas: להוסיף `hub`, `trainings_api`, `neathub_api`.
   4. Authentication → URL Configuration: Site URL ו-Redirect URLs = `https://neatteam1943.github.io/NeatSystem/` (ולפיתוח `http://localhost:5173/`).
   5. להתחבר פעם אחת לאתר עם Google, ואז ב-SQL Editor: `select hub.bootstrap_mentor('your@gmail.com', 'השם המלא');`
2. **GitHub** (הריפו NeatSystem):
   1. Settings → Pages → Source: GitHub Actions.
   2. Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (של הפרויקט **החדש**).
   3. Variables (לא סודיים — MoneyTeam כבר שולח אותם לכל דפדפן): `MONEYTEAM_SUPABASE_URL`, `MONEYTEAM_SUPABASE_ANON_KEY`.
   4. בהגדרות הארגון: להגביל מי יכול ליצור ריפואים ולהפעיל Pages.

**ב-MoneyTeam לא משנים כלום** — לא קוד, לא מסד, לא הגדרות.

## העברת הנתונים מ-Firebase (פעם אחת)
```bash
git submodule update --init
node scripts/import-firebase.mjs
```
הסקריפט שואל על כל מערכת project id ו-web API key, אותם ערכים שהיו ב-`.env` הישן או ב-Firebase console → Project settings.
- הוא קורא את Firestore מהמחשב שלך ויוצר קבצים ב-`firebase-import/`. התיקייה מוחרגת מ-git.
- ב-Supabase → SQL Editor מדביקים כל קובץ ומריצים, לפי הסדר שהסקריפט מדפיס. מותר להריץ שוב.
- לפני כן צריך להריץ את `systems/trainings/supabase/migrations/0002_firestore_import.sql`.

## Workflows
- `deploy.yml` — בדיקות + בנייה + פרסום ל-Pages בכל push ל-main.
- `checks.yml` — typecheck, בדיקות, בנייה, ובדיקות ה-SQL מול Postgres בכל PR.
- הגיבוי הלילי **לא כאן** (הריפו הזה ציבורי): הוא רץ בריפו הפרטי `NeatSystem-backups`.

## הערות
- Supabase Advisor יסמן את `hub.people` ו-`hub.audit` כ-"security definer view". זה מכוון: ה-view הוא המקום שבו נאכפים כללי הצפייה,
  והטבלאות עצמן סגורות לגמרי ללקוח.
- תוכנית חינמית: פרויקט שלא נעשה בו שימוש 7 ימים מושהה. מחדשים ידנית מהדשבורד.
