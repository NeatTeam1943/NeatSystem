# איך הקוד בנוי

## המבנה

```
src/
  app/          App.tsx (נתב + ספקים), features.ts (רשימת הטאבים)
  core/         מה שמשותף לכולם: api (Supabase / mock), session, feature.ts (החוזה), data (cache), format, labels
  ui/           רכיבי העיצוב: Button, Card, Sheet, Confirm, Tabs...
  shell/        המסגרת: סרגל צד, dock בטלפון, חיפוש
  styles/       העיצוב הכללי
  features/
    <id>/       טאב אחד: index.tsx מייצא Feature
supabase/
  migrations/   0001_core.sql, ואחריו מיגרציה לכל טאב עם נתונים
  tests/        בדיקות SQL (npm run test:db)
  data/         שלבי נתונים חד-פעמיים
```

## טאב (Feature)

כל טאב הוא תיקייה ב-`src/features/<id>/` שמייצאת אובייקט אחד מסוג `Feature` (`src/core/feature.ts`), ושורה אחת ב-`src/app/features.ts`.
המעטפת בונה מהרשימה את הניווט, הנתיבים, "לטיפולי", החיפוש, הבית והפרופיל. הוספת טאב לא משנה אף קובץ אחר.

| שדה | מה |
|---|---|
| `nav` | כניסה בסרגל (ו-`dock` למקום בטלפון) |
| `routes` | הנתיבים, יחסית לשורש (`trainings/p/:id`) |
| `home` | כרטיסים לדף הבית |
| `profile` | חלק בדף הפרופיל של אדם |
| `useInbox`, `useSearch` | פריטים ל"לטיפולי" ולחיפוש (hooks) |
| `permissions` | ההרשאות שהטאב בודק, בדיוק כמו במיגרציה שלו (בדיקה ב-`src/__tests__/features.test.ts`) |
| `ArchiveView` | איך מוצג החלק של הטאב ברשומת ארכיון |

### שכבות בתוך טאב

```
features/trainings/
  domain/   לוגיקה טהורה: טיפוסים, מודל, כללים. בלי React ובלי רשת. כאן הבדיקות.
  data/     repository.ts (ממשק), supabase.ts, memory.ts (לתצוגה המקדימה), index.ts בוחר ביניהם
  ui/       רכיבים. קוראים נתונים רק דרך ה-Context של הטאב
  index.tsx ה-Feature
  *.css     מוגבל לטאב אוטומטית
```

- ה-UI לא מדבר עם Supabase ישירות; רק דרך ה-repository.
- `memory.ts` עובד לפי אותם כללים כמו ה-SQL, כדי ש-`npm run dev:mock` יתנהג כמו האמיתי. ה-SQL הוא הקובע.
- CSS של טאב (`src/features/<id>/**.css`) מקבל `[data-feature="<id>"]` לפני כל כלל (`scripts/scope-css.ts`), ולכן לא משפיע על טאבים אחרים. `@keyframes` נשארים גלובליים; לתת להם קידומת.
- חלונות (`Sheet`, `Confirm`) נשארים בתוך ה-CSS של הטאב שפתח אותם.

## נתונים

כל טאב עם נתונים מקבל שתי סכימות באותו פרויקט Supabase:

- `<id>`: הטבלאות. סגורות לגמרי ללקוח.
- `<id>_api`: הפונקציות שהלקוח קורא. כל כתיבה בודקת הרשאה בשרת.

מ-`hub` טאב משתמש רק ב-`hub.people`, `hub.is_active`, `hub.has_perm`, ובשתי פונקציות ההרשמה. הוא אף פעם לא כותב לטבלאות של `hub`.

```sql
select hub.register_permissions('<id>', '[{"key": "<id>.manage", "label": "…", "grp": "…", "sort": 1, "roles": ["mentor"]}]'::jsonb);
select hub.register_feature('<id>', 'שם', '<id>.on_profile_claimed(uuid,uuid)', '<id>.snapshot(uuid)', 50);
```

- **הרשאות**: הטאב מגדיר אותן ואת המשמעות שלהן. העריכה של מי מקבל מה נעשית במסך אחד: ניהול → טבלת הרשאות, עם חלק לכל טאב.
- **`on_claim`**: כשפרופיל שנוצר מראש מתחבר לחשבון, הטאב מעביר את השורות שלו ל-id החדש. רוב ה-FK הם `on update cascade`, אז לרוב זה ריק.
- **`snapshot`**: STABLE. מה הטאב שומר על אדם כשהוא יוצא מהקבוצה (`hub.archive_member`). לא מוחקים כלום.
- NeatSystem קורא מטאבים כדי להציג, ולא משנה בהם נתונים. השינויים היחידים מבחוץ הם אירועי מחזור החיים: הוספה, הוצאה, סיום עונה, עליית שכבה.

### מיגרציות

- כל מיגרציה רצה שוב בלי נזק (`create … if not exists`, `create or replace`).
- שדרוג של מסד קיים: בחלק "Upgrades" שבסוף הקובץ.
- `npm run test:db` מריץ כל מיגרציה פעמיים ואז את כל `supabase/tests/`.

## להוסיף טאב

1. `src/features/<id>/` עם `index.tsx` שמייצא `Feature`, ושורה ב-`src/app/features.ts`.
2. אם יש נתונים: `supabase/migrations/000N_<id>.sql` עם שתי הסכימות, `hub.register_permissions`, `hub.register_feature`, ובדיקות ב-`supabase/tests/`.
3. `permissions` ב-Feature זהה למיגרציה.
4. ב-Supabase: להריץ את המיגרציה ולהוסיף את `<id>_api` ל-Exposed schemas.

## סגנון

- TypeScript strict. בלי `any`.
- טקסט בממשק בעברית, קצר. בלי משפטי הסבר שלא צריך.
- שמות מומצאים בלבד בנתוני דוגמה ובבדיקות.
