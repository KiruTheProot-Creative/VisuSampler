# VisuMaker desktop

Wraps `apps/maker` in Electron so it installs and runs like a normal Windows app. **Send to VisuPlayer** in the Export tab saves the library into `Documents\\VisuSampler\\Libraries`, where the VST finds it.

```
cd apps/maker-desktop
npm install
npm start        # run it
npm run dist     # build the installer into dist/
```

GitHub Actions builds the Windows installer when the Maker changes (workflow "maker").
