# Woodhouse Email Templates

A library of customer service and admin email templates for Woodhouse
Adventure Park. Find a template, pick the building, fill in the blanks, copy,
paste into Outlook.

## Using it

1. **Search** at the top. Press `/` from anywhere to jump there. Every word
   you type has to appear somewhere in the template (name, subject, keywords,
   building, category or email body), and partial words count, so
   `hooper avail` works. Use `↑` `↓` to move through results and `Enter` to
   open one; the cursor goes straight to the first thing to fill in.
2. **Pick the building** if the template has building versions. If your
   search named a building ("hooper availability"), it's already selected.
   That building's price, capacity, check-in times and so on go into the email
   automatically.
3. **Fill in** the placeholders (`[Customer Name]`, `[Arrival Date]`, …). The
   preview on the right updates as you type. Anything still unfilled is
   highlighted, and stays as `[Like This]` in the copied text.
4. **Copy email** and paste into Outlook. Paragraph spacing is kept, and links
   stay clickable. **Copy subject** copies the subject line separately.

You can also edit the subject and body for one email before copying. Those
edits aren't saved unless you press **Save changes**; **Cancel** puts the
saved text back.

Copying a template adds it to **Recently used**. Star a template to add it to
**Favourites**.

## Building variations

A template can have one version per building instead of seven near-identical
copies. In **Edit template**, tick *This template has a version for each
building*. You get a table:

- each **row** is a building;
- each **column** is a detail that changes between buildings (Price,
  Capacity, Minimum Numbers, Check-in, …). Add, rename or remove columns as
  needed;
- write the column name in square brackets in the email, e.g. `[Price]`, and
  the chosen building's value goes in. `[Building Name]` always works.

If one building needs a genuinely different email, tick **Own email** on its
row and write its own subject and body there. Templates that don't need
building versions just leave the box unticked.

## Bold text and images

Above every email body there's a **B** button and an **Image** button.

- **Bold:** select some text and click **B** (or press Ctrl+B). In the editor
  it shows as `**like this**`; in the preview and in Outlook it's bold. Do the
  same again to remove it.
- **Images:** put the cursor where the picture should go and click
  **Image**. Upload a picture (or drag one in, or paste one with Ctrl+V), give
  it a description, pick a size (Small 200 px, Medium 400 px, Large 600 px or
  actual size) and click **Insert image**. The email body shows a line like
  `{{image:abc123…|Park map|400}}`; the preview shows the picture.

Uploaded images go into a shared library, so the same map or logo can be used
in any template. Big photos are shrunk automatically (to 1400 px wide) before
they're saved. Deleting an image warns you if a template still uses it.

When you copy an email, each image goes in as a link to the picture on this
site, at the size you chose. Image addresses are public on purpose: Outlook
and your customers don't have the staff password, so a password-protected
picture would show up blank. Each address is a long random code that can't be
guessed, and the list of images is still behind the password. Don't upload
anything confidential as an image.

Depending on the recipient's email settings, they may have to click
"download pictures" before linked images appear. If a picture must always
show, attach it in Outlook instead.

Copying as **plain text** (Settings) leaves out bold and images.

## Placeholders

Anything in square brackets becomes a fill-in field, so you can invent your
own (`[Group Size]`, `[Feedback Link]`). Common ones have Insert buttons in the
editor. `[Your Name]` fills itself in once you set your name under
**Settings** (the sliders icon, top right).

**Internal notes** on a template are shown in amber when you open it and are
never copied into the email.

## Settings, backup and import

The sliders icon, top right:

- **Your name** and **font when pasted into Outlook** (Aptos, Calibri, Arial
  or plain text). These are remembered on that computer only.
- **Download JSON backup**: the whole library, including building versions
  and images. It can be imported again.
- **Export CSV**: opens in Excel. One row per template; building versions are
  in the `variations` column as JSON.
- **Import**: a JSON backup or a CSV in the export's format. Templates with
  the same ID are updated and others are added. Tick *Replace the whole
  library* to start fresh from the file.
- **Add the starter examples**: puts back any of the example templates.

**Manage categories** is at the bottom of the left-hand list: add, rename or
delete them. Deleting a category keeps its templates; they move to
*Uncategorised*.

The starter templates are examples. **Their prices, capacities and times are
made up**, so check and edit them (or delete them) before using them with
customers.

## Where things are saved

Templates, images, categories, favourites and recently used are saved in a
Cloudflare D1 database, so they're the same on every computer and survive closing the
browser. The top bar shows *All changes saved* when the database is
connected. If two people (or two tabs) edit the same template, the second save
is stopped with a warning rather than silently overwriting the first.

If the site is ever opened without the database (e.g. the HTML file straight
from disk), a yellow banner says *Saved in this browser only* and everything
is kept in that browser's local storage instead.

## Password

The whole site sits behind a staff password, the same way as the Voucher
Desk. Nothing loads without it, including the template data. Signing in lasts
30 days; **Sign out** is the arrow icon, top right.

The password is the Worker secret `ACCESS_PASSWORD`: **Workers & Pages →
email-templates → Settings → Variables and Secrets**. If the secret is
missing, the site stays locked.

## Files

```
src/index.js        password check, the /api/ routes that read and save templates,
                    and the public /img/ addresses for images in emails
public/index.html   page layout and styles
public/app.js       the app: search, editing, variations, copying, import/export
public/seed.js      starter categories and example templates (loaded once, on first run)
wrangler.jsonc      Cloudflare Worker settings
```

There is no build step and nothing to install.

## Hosting (first-time setup)

A Cloudflare Worker with static assets, called `email-templates`, set up like
`vouchers`:

1. **Workers & Pages → Create → Import a repository**, choose
   `email-templates`, and keep the default deploy command
   (`npx wrangler deploy`).
2. On the first deploy Wrangler creates the D1 database
   (`email-templates`) and links it automatically. The table inside it is
   created the first time the app loads, and the starter templates are added.
3. Add the `ACCESS_PASSWORD` secret (see *Password*) and deploy again.
4. Optional: attach a domain such as `templates.woodhousestaff.app` under
   **Workers & Pages → email-templates → Domains**.

After that, every push to the production branch redeploys within a minute.
Redeploying never touches saved templates.

If the first deploy complains about the database instead of creating it,
create one by hand (**Storage & Databases → D1 → Create**, name it
`email-templates`), copy its ID, and add `"database_id": "<that ID>"` next to
`"database_name"` in `wrangler.jsonc`.

To back up the database directly, use **D1 → email-templates → Backups**, or
the JSON backup in the app.

### Running it locally

```bash
echo 'ACCESS_PASSWORD=test' > .dev.vars
```

```bash
npx wrangler dev
```

Then open http://localhost:8787. Local runs use a separate local database.
