# VisuMaker desktop

Wraps `apps/maker` in Electron so it installs and runs like a normal app (Windows installer, macOS dmg, Linux AppImage).

```
cd apps/maker-desktop
npm install
npm start        # run it
npm run dist     # build the installer into dist/
```

GitHub Actions builds the installers on every push (workflow "maker"). The macOS build is not signed yet, so the first launch needs right-click > Open.
