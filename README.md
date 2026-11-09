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
2. **Choose the building** if the template has building versions. Nothing
   is chosen for you, and the email doesn't appear until you pick one. The
   exception: if your search names exactly one building ("hooper", "st george
   3"), that one is already chosen.
3. **Fill in** the blanks (`[Customer Name]`, `[Arrival Date]`, …). The
   preview on the right updates as you type. Anything still unfilled is
   highlighted, and stays as `[Like This]` in the copied text. Gate codes,
   lock codes, links and maps fill themselves in from **Codes & links**;
   they're listed under *Filled in for you*.
4. **Copy email** and paste into Outlook. Paragraph spacing, bold, links and
   maps come across. **Copy subject** copies the subject line separately.

Any last tweaks to the wording are made in Outlook after pasting; this screen
doesn't edit the email text. To change a template for everyone, use
**Edit template**.

Opening a template starts a fresh email: blanks are cleared and a new gate
code is picked. What you type in **Your Name** is remembered on that computer.

Copying a template adds it to **Recently used**. Star a template to add it to
**Favourites**.

## Codes & links

**Codes & links** (top right) holds the details that many templates share and
that change often. It's saved in the database, so a change applies to every
template and every computer straight away. Click any `[name]` shown there to
copy it for pasting into a template.

| Tab | What it holds | In a template |
| --- | --- | --- |
| Gate codes | The **rotating** gate codes; each email picks one at random (*Use a different code* picks another). | `[Gate Code]` |
| | The **fixed** gate code (e.g. for the chalets), never rotated. | `[Fixed Gate Code]` |
| Places & lock codes | One row per building, chalet, bell tent or camping area: lock code, web page and map. When an email's building is chosen, its row fills in the three on the right. | `[Lock Code]` `[Building Link]` `[Building Map]` |
| | Each place's web page by name, for use anywhere. | e.g. `[Rymill Centre Link]` |
| Links | Activity and other pages. | e.g. `[Disc Golf Link]` |
| Maps | Map pictures and their size. A place with no map of its own, or a map still waiting for its picture, shows *Entry Map* (or the first map), so you can set up a map slot first and upload the picture later. | e.g. `[Entry Map]` |
| Other details | Anything else shared, e.g. the caretaker's phone. | e.g. `[Caretaker Phone]` |
| Banking codes | The departments (name and number) and, under each, its banking codes (name, code and other names to search by). See *Banking codes* below. | `[Department]` `[Department Number]` `[Banking Code]` `[Banking Code Name]` |

To link words to one of these, select the words in the template editor, click
**Link** and choose it under *Saved link*. That writes
`{{link:[Disc Golf Link]|Disc Golf}}`, which always follows the address saved
in Codes & links.

A place's name must match the building's name in the template exactly (for
example *Bell Tent St George 2*). If something in Codes & links is left blank,
emails that use it show it as a blank to fill in instead.

## Banking codes

Put any of `[Department]`, `[Department Number]`, `[Banking Code]` or
`[Banking Code Name]` in a template and the email screen shows a **Banking
code** box:

1. Click the department (the buttons show its number).
2. Type part of a code's name, e.g. `equ`, and pick from the list (`↑` `↓`
   and `Enter` work). The code number fills in. *Change* picks another.

You can also search before choosing a department: the list then covers every
department, and picking a code chooses its department too.

Set them up under **Codes & links → Banking codes**. Each department has a
name, a number and its list of codes. A code's *Other names* are extra words
that find it as well (e.g. `gear, kit` for *Equipment hire*). To add lots at
once, open **Paste a list** and paste two columns from Excel (name, then
code; a third column becomes other names), or type `Name, Code` one per line.
A name that's already in the department gets its code updated rather than
added twice. The box at the top finds a code in the list.

### Uploading codes from a spreadsheet

**Upload spreadsheet** (in the Banking codes tab) takes an Excel `.xlsx` or a
`.csv` with these headings in the first row:

| Department | Department Number | Code | Name | Type | Other names |
| --- | --- | --- | --- | --- | --- |
| Woodhouse | 190010 | 2638 | R & M - Grounds | Expense | Bunnings, Mitre 10 |

- One row per code. *Type* (e.g. Expense or Income) and *Other names* are
  optional; *Type* shows next to the code when searching.
- Rows that are **crossed out** (strikethrough) in Excel are left out.
- Before anything changes it tells you how many codes it found per department
  and asks to confirm.
- Each department in the file has its codes **replaced** by the file's list.
  Departments are matched by number (or name); departments not in the file are
  left alone. Blank departments are filled first, so the first upload doesn't
  add extra ones.

**Download as spreadsheet** saves the current codes in the same layout, so the
easiest way to make changes in bulk is to download, edit in Excel and upload.

## Building variations

A template can have one version per building instead of seven near-identical
copies. In **Edit template**, tick *This template has a version for each
building*. You get a table:

- each **row** is a building;
- each **column** is a detail that changes between buildings (Price,
  Capacity, Minimum Numbers, Check-in, …). Add, rename or remove columns as
  needed;
- write the column name in square brackets in the email, e.g. `[Price]`, and
  the chosen building's value goes in. `[Building Name]` always works, and so
  do `[Lock Code]`, `[Building Link]` and `[Building Map]` from Codes & links.

Codes and maps belong in Codes & links rather than in these columns, so they
can be changed in one place. Use columns for wording that differs between
buildings (the after-hours building email uses *Full Name* and *Short Name*).
The **Add 3 chalets**-style buttons under the table add every place of that
type from Codes & links.

If one building needs a genuinely different email, tick **Own email** on its
row and write its own subject and body there. Templates that don't need
building versions just leave the box unticked.

## Bold text and images

Above every email body there are **B**, **Link** and **Image** buttons.

- **Bold:** select some text and click **B** (or press Ctrl+B). In the editor
  it shows as `**like this**`; in the preview and in Outlook it's bold. Do the
  same again to remove it.
- **Links:** select the words to link and click **Link** (or press Ctrl+K,
  as in Outlook). Enter a web address, an email address or a phone number;
  `www.` and `https://` are added for you. In the editor a link shows as
  `{{link:https://…|the words}}`; in the preview and in Outlook it's a normal
  clickable link. To change or remove a link, put the cursor anywhere inside
  it and click **Link** again. The address can be a placeholder, e.g.
  `[Feedback Link]`, and then it's filled in per email like any other.
  Web and email addresses typed straight into the text become links
  automatically too.
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

Copying as **plain text** (Settings) leaves out bold and images, and writes
links as "the words (address)".

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
- **Download JSON backup**: the whole library, including building versions,
  images and Codes & links. It can be imported again.
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
