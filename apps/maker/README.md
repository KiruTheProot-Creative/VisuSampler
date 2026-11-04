# VisuMaker

The library maker: Samples, Mapping, Designer, FX Designer, Export. It runs on `@visusampler/core` for all audio and file work.

```
python3 apps/maker/build.py                  # builds apps/maker/app.js and index.html from src/
node apps/player/serve.mjs                   # then open http://localhost:5173/apps/maker/
node apps/maker/tests/modes.test.mjs         # headless browser checks
node apps/maker/tests/export.test.mjs
```

`src/parts/*.js` are the app's source files, joined in name order into one module (`app.js`).
`app.js` and `index.html` are generated and committed so the app runs without a build step.
