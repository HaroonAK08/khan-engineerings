# Khan Engineerings desktop

Install `Khan-Engineerings-Setup.exe` on Windows and open the **Khan Engineerings** desktop shortcut. The app includes the UI, API, and MongoDB. Open the shortcut and enter your four-digit PIN on the same login screen used by the website. A previously configured desktop PIN is preserved. A configured installation does not contact the cloud before opening the app.

## Set up once

1. **New, empty installation:** choose **Use local records only**. Only choose this if no existing records are needed.
2. **Move existing website records:** on a trusted admin machine, use a read-only Atlas credential as `MONGODB_URI`, then run `node desktop/export-setup-archive.cjs /path/to/factory.bson.gz` from the repo. In desktop setup, choose **Import a setup archive file** and select that file. Pause website editing during export and keep the website read-only after cutover to avoid two independent histories. The archive contains unencrypted factory data: transfer it privately and remove temporary copies after verifying the import.
3. **Turn on automatic cloud backup:** deploy the updated Express API. Set `DESKTOP_BACKUP_TOKEN` (64 lowercase hex characters, generated randomly) and `DESKTOP_BACKUP_DEVICE` (an identifier of 8–128 letters, digits, underscores, periods, colons, or hyphens) on the API server. Separately generate a 32-byte random key encoded as standard Base64. Store the key, device ID, API origin, and token privately in a password manager. Do not put the key in server configuration or any credential in the installer. Open **File → Setup and recovery → Keep local records and enable cloud backup** and enter those values. You can do this on first launch if the local data is already present. Cloud backup requires OS secure storage; on Linux, a working keyring is needed.
4. Use **File → Back up to cloud now**, confirm it succeeds, then test a recovery on a separate machine before retiring the old setup. If the prototype API was previously deployed, remove its old `createdAt` TTL index on `syncuploads` before relying on long-term recovery. Prototype snapshots without nonce/tag metadata are not recoverable by this flow; upload a fresh backup from the original desktop.

## Daily use and recovery

All entries are saved on the desktop. The app attempts an encrypted snapshot on startup and every 15 minutes while open, and retries on the next interval after a failure. The website is not updated by this backup. If the computer fails before a backup completes, the cloud cannot recover entries made after the last successful backup.

On a replacement machine, choose **Restore the latest cloud backup** and enter the same API origin, device ID and recovery key, plus the current backup token. To recover on the existing machine, use **File → Setup and recovery**. Recovery downloads each chunk, verifies and decrypts the archive, then loads it into a fresh local database before activating it. Existing local records are not merged; they remain in the original database and a local safety archive. Local archives contain unencrypted data and should be protected with OS access controls and disk encryption. Do not continue entering data on the old desktop after moving to a replacement.

## Build and verify

Run `npm --prefix desktop test` after installing backend dependencies. The **Desktop installer** GitHub workflow builds Windows NSIS and Linux AppImage installers. Build and run the Windows installer on a clean machine before handoff. Test first launch, imported record totals, offline launch after restart, offline data entry, cloud backup after reconnect, and replacement-machine recovery. The development browser launcher (`desktop/launch.cjs`) is not the packaged setup/recovery experience.
