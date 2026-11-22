# NeatSystem

המערכת של Neat Team 1943: כניסה אחת, פרופיל אחד לכל חבר/ת קבוצה, וכל הכלים של הקבוצה כטאבים באותו אתר.

| טאב | מה | איפה בקוד |
|---|---|---|
| בית, לטיפולי, חברי הקבוצה, ניהול | המעטפת, פרופילים, הצטרפות, הרשאות, ארכיון | `src/features/{home,inbox,people,admin}` |
| הכשרות | הסמכות, דרגות ויומן לכל צוות (לשעבר StudentTracker) | `src/features/trainings` |
| NEATHUB | הקישורים של הקבוצה כארגזים וחלקי משחק | `src/features/neathub` |
| MoneyTeam | האתר של MoneyTeam עצמו ב-iframe. לא משתנה | `src/features/money` |

איך הקוד בנוי ואיך מוסיפים טאב: [CONTRIBUTING.md](CONTRIBUTING.md).

## הרצה מקומית

```bash
npm install
npm run dev:mock        # בלי Supabase: נתונים מומצאים + בורר "צפייה בתור"
npm test                # בדיקות יחידה
npm run test:db         # כל המיגרציות (פעמיים) וכל בדיקות ה-SQL על Postgres מקומי (15+, לא כ-root)
npm run typecheck
```

עם Supabase אמיתי: להעתיק את `.env.example` ל-`.env.local`, למלא, ו-`npm run dev`.

## הקמה (פעם אחת)

1. **Supabase**, פרויקט נפרד מזה של MoneyTeam:
   1. Authentication → Providers → Google: להפעיל, עם OAuth client משלו.
   2. SQL Editor: להריץ לפי הסדר את `supabase/migrations/0001_core.sql`, `0002_trainings.sql`, `0003_neathub.sql`. מותר להריץ שוב; כל מיגרציה גם משדרגת מסד שנוצר בגרסה קודמת.
   3. Settings → API → Exposed schemas: `hub`, `trainings_api`, `neathub_api`.
   4. Authentication → URL Configuration: Site URL ו-Redirect URLs = `https://neatteam1943.github.io/NeatSystem/` (ולפיתוח `http://localhost:5173/`).
   5. להתחבר פעם אחת עם Google, ואז ב-SQL Editor: `select hub.bootstrap_mentor('your@gmail.com', 'השם המלא');`
2. **GitHub**:
   1. Settings → Pages → Source: GitHub Actions.
   2. Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
   3. Variables (או Secrets): `MONEYTEAM_SUPABASE_URL`, `MONEYTEAM_SUPABASE_ANON_KEY`. הם ציבוריים; האתר של MoneyTeam כבר שולח אותם לכל דפדפן.

**ב-MoneyTeam לא משנים כלום**: לא קוד, לא מסד, לא הגדרות.

## פרופילים

- אפשר ליצור פרופיל מראש (חברי הקבוצה → הוספת חבר/ה), עם מייל, טלפון, צוות ותפקיד.
- מי שמתחבר/ת עם המייל הזה מקבל/ת את הפרופיל אוטומטית.
- מי שמתחבר/ת עם מייל אחר שולח/ת בקשת הצטרפות. אם הטלפון או השם תואמים פרופיל קיים, המנטור רואה את זה באישור ובוחר אם לחבר.
- שם לבד אף פעם לא מחבר אוטומטית.
- בחיבור, כל טאב מעביר את הנתונים שלו לחשבון (`on_claim` ב-`hub.features`).

### פרופילים מהנתונים של StudentTracker

`supabase/data/2026-11-studenttracker-people.sql` יוצר פרופיל לכל מי שיש לו הסמכות ועוד אין לו פרופיל, ומעביר אליו את ההסמכות. להריץ פעם אחת אחרי המיגרציות. מותר להריץ שוב.

## Workflows

- `deploy.yml`: בדיקות, בנייה ופרסום ל-Pages בכל push ל-main.
- `checks.yml`: typecheck, בדיקות, בנייה, ובדיקות ה-SQL מול Postgres בכל PR.
- הגיבוי הלילי רץ בריפו הפרטי `NeatSystem-backups`.

## הערות

- Supabase Advisor יסמן את `hub.people` ו-`hub.audit` כ-"security definer view". זה מכוון: ה-view הוא המקום שבו נאכפים כללי הצפייה, והטבלאות עצמן סגורות ללקוח.
- בתוכנית החינמית פרויקט שלא נעשה בו שימוש 7 ימים מושהה. מחדשים ידנית מהדשבורד.
- MoneyTeam ו-NeatSystem יושבים על אותו origin (`neatteam1943.github.io`) וחולקים localStorage. כך NeatSystem פותח את MoneyTeam כשהוא כבר מחובר. הפרטים ב-`src/features/money/bridge.ts`.
