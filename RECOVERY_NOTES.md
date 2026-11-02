# JanuAi Recovery Notes
Date: 2026-11-02

## Verified recovery
- Project folder: ~/JanuAi
- Local project size: 270 MB
- Local recovery archive: ~/JanuAi-recovery-2026-11-02.tar.gz (62 MB)
- Android Gradle project exists.
- APK found: apk-download/Janu-AI-debug.apk (not yet verified by installation).
- Git branch: main, previously aligned with origin/main.
- Seven existing Git commits were found.
- Uncommitted changes found in package.json, package-lock.json and server.ts.
- Untracked server.ts.before-byok-backup found.
- Gemini Live token backend endpoint found in server.ts.
- Settings API key save UI is not yet implemented/verified.
- Gemini Live toggle is currently UI-only; live connection is not yet implemented.
- .env, .env.local and .env.production are ignored by Git.

## Recovery commands confirmed in this session
du -sh ~/JanuAi
df -h ~
git status --short --branch
git log -5 --oneline --decorate
ls -la src/components
ls -la android
find . -type f -name "*.apk" -print
find . -maxdepth 3 -type f \( -iname "*backup*" -o -iname "*.bak" -o -iname "*.old" -o -iname "*.log" \) -print
git log --all --oneline --decorate --date-order -20
git diff --stat
git diff -- server.ts
grep -nEi 'api.?key|live|secure|token' src/components/SettingsModal.tsx src/App.tsx src/types/piya.ts
git check-ignore .env .env.local .env.production

## Next work
1. Review staged files before pushing.
2. Save Gemini API key securely in Android settings.
3. Connect the Gemini Live ON/OFF control.
4. Build, install and test the APK.
