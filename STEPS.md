# שלב 3 מתוך 3 — NeatSystem

מתחילים רק אחרי ששלבים 1 ו-2 נכנסו ל-`main`.

## א. הקוד
1. מחלצים את ה-zip הזה. ב-Terminal עוברים לתיקייה של הריפו NeatSystem.
2. מריצים (במקום `PATH` שמים את התיקייה שחילצת):
```bash
git checkout main && git pull
git checkout -b platform-submodules
git apply --binary PATH/1-NeatSystem.patch
npm install
bash scripts/add-systems.sh
```
3. בודקים מקומית:
```bash
npm run dev:mock
```
נפתח אתר עם נתונים מומצאים. אם הכל נראה טוב, סוגרים עם Ctrl+C.

4. מעלים:
```bash
git add -A
git commit -m "Sub-system tabs as submodules"
git push -u origin platform-submodules
```
5. ב-GitHub: פותחים Pull Request ועושים Merge ל-`main`. זה מה שמעלה את האתר.

## ב. Supabase (הפרויקט של NeatSystem)
1. SQL Editor → מדביקים את התוכן של כל קובץ ולוחצים Run. **לפי הסדר:**
   1. `0002_platform.sql` (נמצא כאן, ב-zip הזה)
   2. `0001_trainings.sql` (מה-zip של שלב 1)
   3. `0001_neathub.sql` (מה-zip של שלב 2)
2. Settings → API → Exposed schemas: מוסיפים `trainings_api` ו-`neathub_api`.

סיימת. העברת הנתונים מ-Firestore היא שלב נפרד, ואפשר לעשות אותו מתי שנוח.
