# Khan Engineerings — desktop app

## Download (what you want)

After the installer is published:

- **Page on the website:** `/download`
- **Windows:** https://github.com/HaroonAK08/khan-engineerings/releases/latest/download/Khan-Engineerings-Setup.exe
- **Linux:** https://github.com/HaroonAK08/khan-engineerings/releases/latest/download/Khan-Engineerings.AppImage
- **All files:** https://github.com/HaroonAK08/khan-engineerings/releases/latest

Then: install → desktop shortcut → open. No terminal.

The installer includes the app and a local database engine. First launch can copy data from the website if `backend/.env.production` is available on that machine. Atlas is only read.

## Publish a new installer

1. Push this repo to GitHub
2. GitHub → Actions → **Desktop installer** → Run workflow  
   or: `git tag desktop-v1 && git push origin desktop-v1`
3. The `.exe` / AppImage appear on the Releases page
4. The `/download` page already points at those files

## Dev (this Linux PC, no installer)

MongoDB must be running, then:

```bash
node desktop/import-cloud-data.cjs
node desktop/launch.cjs
```
