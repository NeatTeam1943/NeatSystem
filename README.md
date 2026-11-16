# NeatSystem

המערכת המאוחדת של Neat Team 1943. משימה 1 (שלבים א׳+ב׳): השלד, משתמשים, הרשאות, פרופיל, ניהול ויומן פעולות,
וכניסה ל-MoneyTeam בלחיצה — **בלי לשנות שום דבר ב-MoneyTeam**.

## איך זה בנוי

| שכבה | מה | איפה |
|---|---|---|
| אתר | React + TypeScript + Vite, ניתוב hash | `src/` → GitHub Pages ב-`neatteam1943.github.io/NeatSystem/` |
| נתונים | פרויקט Supabase **נפרד** של NeatSystem, סכימה `hub` | `supabase/migrations/` |
| התחברות | Google דרך Supabase Auth (PKCE) | |
| כתיבה | רק דרך פונקציות SQL (`hub.request_join`, `hub.decide_join`…) שבודקות הרשאה ורושמות ליומן באותה טרנזקציה | `0001_hub_core.sql` |
| קריאה | `hub.people` — מסתיר טלפון/תאריך לידה/מייל ממי שלא מורשה | `0001_hub_core.sql` |
| MoneyTeam | אתר ופרויקט נפרדים, לא משתנים | `src/modules/money/bridge.ts` |

### MoneyTeam: כניסה בלחיצה, בלי לגעת בו
שני האתרים יושבים על אותו origin (`neatteam1943.github.io`), אז הם חולקים localStorage.
בלחיצה על MoneyTeam, NeatSystem מתחיל את כניסת ה-Google **בשם MoneyTeam**: הוא שומר את קוד ה-PKCE במפתח ש-MoneyTeam עצמו
קורא (`sb-<ref>-auth-token-code-verifier`), עם `login_hint` של המייל, ו-Google מחזיר ל-MoneyTeam שמסיים את הכניסה בקוד הקיים שלו.
אם כבר יש חיבור ל-MoneyTeam בדפדפן — פשוט נפתח.
עם החיבור הזה NeatSystem גם **קורא** (לא כותב) את מה ש-MoneyTeam כבר מרשה לאדם לראות: שורת החברות שלו ורשימת הקניות הפתוחה.

- `mt-auth` נעול על **auth-js 2.110.8 — אותה גרסה של MoneyTeam**. גרסאות חדשות מוסיפות `sb_flow_id` לכתובת החזרה. אם MoneyTeam משדרג את supabase-js, לשדרג גם כאן.
- `src/__tests__/moneyBridge.test.ts` בודק את זה: המפתח, כתובת החזרה המדויקת, ה-login_hint.
- כתובת החזרה היא בדיוק `https://neatteam1943.github.io/MoneyTeam/` — אותה כתובת ש-MoneyTeam משתמש בה בכניסה שלו, אז היא כבר מאושרת אצלו.
- כל אתר Pages תחת `neatteam1943` יכול לקרוא localStorage של האחרים (כבר היום). לכן רק אנשים מהימנים יוצרים ריפואים עם Pages בארגון.

### מודולים
כל תת-מערכת היא תיקייה ב-`src/modules/<name>` שמייצאת אובייקט `HubModule` (`src/core/module.ts`):
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
npm run dev:mock        # בלי Supabase: נתונים מומצאים + בורר "צפייה בתור"
npm test                # בדיקות יחידה (כולל הגשר ל-MoneyTeam)
npm run test:db         # מיגרציות + בדיקות הרשאה על Postgres מקומי (צריך Postgres 15+, לא כ-root)
```

עם Supabase אמיתי: להעתיק `.env.example` ל-`.env.local`, למלא, ו-`npm run dev`.

## הקמה (פעם אחת)

1. **Supabase — פרויקט חדש ל-NeatSystem** (בתוכנית החינמית אפשר 2 פרויקטים פעילים: MoneyTeam + זה):
   1. Authentication → Providers → Google: להפעיל, עם OAuth client חדש ב-Google Cloud (לא של MoneyTeam), שה-callback שלו הוא כתובת ה-callback שהפרויקט החדש מציג.
   2. SQL Editor → להריץ את `supabase/migrations/0001_hub_core.sql`.
   3. Settings → API → Exposed schemas: להוסיף `hub`.
   4. Authentication → URL Configuration: Site URL ו-Redirect URLs = `https://neatteam1943.github.io/NeatSystem/` (ולפיתוח `http://localhost:5173/`).
   5. להתחבר פעם אחת לאתר עם Google, ואז ב-SQL Editor: `select hub.bootstrap_mentor('your@gmail.com', 'השם המלא');`
2. **GitHub** (הריפו NeatSystem):
   1. Settings → Pages → Source: GitHub Actions.
   2. Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (של הפרויקט **החדש**).
   3. Variables (לא סודיים — MoneyTeam כבר שולח אותם לכל דפדפן): `MONEYTEAM_SUPABASE_URL`, `MONEYTEAM_SUPABASE_ANON_KEY`.
   4. לגיבוי הלילי: Secrets `SUPABASE_DB_URL` (Session pooler של הפרויקט החדש, עם סיסמה) ו-`BACKUP_PASSPHRASE`.
   5. בהגדרות הארגון: להגביל מי יכול ליצור ריפואים ולהפעיל Pages.

**ב-MoneyTeam לא משנים כלום** — לא קוד, לא מסד, לא הגדרות.

## Workflows
- `deploy.yml` — בדיקות + בנייה + פרסום ל-Pages בכל push ל-main.
- `checks.yml` — typecheck, בדיקות, בנייה, ובדיקות ה-SQL מול Postgres בכל PR.
- `backup.yml` — `pg_dump` לילי של הפרויקט של NeatSystem, מוצפן, נשמר 30 יום.

## הערות
- Supabase Advisor יסמן את `hub.people` ו-`hub.audit` כ-"security definer view". זה מכוון: ה-view הוא המקום שבו נאכפים כללי הצפייה,
  והטבלאות עצמן סגורות לגמרי ללקוח.
- תוכנית חינמית: פרויקט שלא נעשה בו שימוש 7 ימים מושהה. מחדשים ידנית מהדשבורד.
