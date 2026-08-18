# Working on tangocho from any computer

Nothing about your **study data** lives on a computer. It is in Cloudflare, tied to your
Google sign-in, and it follows you to any device that opens the site. Nothing here affects
it. This file is only about editing the **code**.

## First time on a new machine

Needs [Node.js](https://nodejs.org) and [Git](https://git-scm.com) installed, then:

```bash
git clone https://github.com/MatthewAmes/tangocho.git
cd tangocho
git checkout dev
npm install
```

Then log in to Cloudflare once, so this machine is allowed to deploy:

```bash
npm run login
```

That opens a browser and takes about ten seconds. It is stored outside the repo, so it is
per-machine and you only ever do it once per computer.

That is the whole setup. You do **not** need to copy any keys or secrets across. The
Worker's secrets live on Cloudflare, not on your laptop.

## Every time you sit down

Start by pulling whatever the other machine did:

```bash
git pull
```

Work is always on the `dev` branch. If `git pull` ever complains, just say so — do not
force anything.

## Every time you stand up

Commit and push, or the next machine will not see it:

```bash
git add -A && git commit -m "what you changed" && git push
```

Claude Code does this for you at the end of a change. The thing that strands work is
closing the laptop *without* pushing.

## The commands

| | |
|---|---|
| `npm run dev` | build and serve at http://localhost:3123 |
| `npm run build` | build only — runs every guard and refuses on a failure |
| `npm test` | the test suites on their own |
| `npm run deploy` | build, then push live to the real site |
| `npm run login` | one-off Cloudflare login for this machine |

The live site is <https://tangocho.deskbuddies.workers.dev> (short link:
<https://jp.deskbuddies.workers.dev>).

## The one file that does not travel

`.env.local` holds the YouTube API key and is deliberately not in git. It is only used by
`tools/yt-*.mjs` when rebuilding the video index for the Input tab, which is roughly a
once-a-year job. Everything else — building, deploying, all the study tabs — works without
it. If you ever need it, copy it across by hand; do not commit it.

## If two machines edited the same thing

Git will say so on `git pull`. Do not force-push or reset — tell Claude Code and it will
merge them. Both sides of the work still exist at that point; forcing is what loses one.
