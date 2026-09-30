# Putting 1 Bell online with accounts

The code is ready. What's left are accounts only you can create: a free Supabase project (sign-in and data) and a free GitHub repo (hosting). This takes about 20–30 minutes.

## 1. Supabase (sign-in + database)

1. Sign up at <https://supabase.com> and create a **New project**. Any name and region will do. Save the database password somewhere, though the app doesn't use it.
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates the `plans` table. It also adds the rules that let each person read and write only their own row.
3. Open **Project Settings → API** (on newer dashboards: **API Keys**). Copy the **Project URL** and the **anon / publishable** key into [`config.js`](config.js). Both are meant to be public. The row rules from step 2 are what keep data private.
4. Open **Authentication → URL Configuration**:
   - **Site URL**: `https://YOUR-GITHUB-NAME.github.io/1-bell/`
   - **Redirect URLs**: add that same URL, and `http://localhost:8000/` for local testing.
5. Open **Authentication → Email Templates**. In both **Magic Link** and **Confirm signup**, add a line with the code, for example:

   ```
   <p>Or type this code in the app: <b>{{ .Token }}</b></p>
   ```

   On iPhone you need the code. An app on the home screen doesn't share storage with Safari, so tapping the link signs you in to Safari, not the app.
6. **Before inviting other people:** Supabase's built-in email sender only delivers to your project's own team members, and only a few emails an hour. To let anyone sign up, open **Authentication → SMTP Settings** (under Emails on some dashboards). Connect a mail service there; [Resend](https://resend.com) has a free tier. It asks you to verify a domain you own. Until then you can test with your own address.

Note: free Supabase projects pause after about a week with no activity. You can resume one from the dashboard.

## 2. GitHub Pages (hosting)

Git isn't installed on this PC, so the simplest route is the website:

1. Sign up at <https://github.com> and create a **new public repository** named `1-bell`.
2. Click **Add file → Upload files**. Drag in everything from this folder except `.claude`: `index.html`, `app.js`, `styles.css`, `config.js`, `sw.js`, `manifest.webmanifest`, and the `icons` and `supabase` folders. Then **Commit**.
3. Open **Settings → Pages** and set **Source: Deploy from a branch**, **Branch: main / (root)**. Click **Save**.
4. After a minute the app is live at `https://YOUR-GITHUB-NAME.github.io/1-bell/`.

To make updates easier later, you could install [GitHub Desktop](https://desktop.github.com) and push changes from there.

**When you change the app:** bump `VERSION` in `sw.js` (for example `'v1'` to `'v2'`), or phones keep showing the cached old version.

## 3. On your phone

- **iPhone:** open the URL in **Safari**, tap **Share → Add to Home Screen**, then open 1 Bell from the new icon. Sign in there by typing the email code.
- **Android:** open the URL in **Chrome** and tap **Install app** (or **⋮ → Add to Home screen**).

Once it has loaded one time, the app opens and runs workouts offline. Logged sessions sync the next time you're online.

## Testing on this PC

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File .claude/serve.ps1 8000
```

Then open <http://localhost:8000>. With the placeholders still in `config.js`, the app runs without accounts, as before.
