# Local OCR runtime

The low-level adapter in `engine.mjs` is adapted from the published
`tesseract-wasm` 0.11.0 package at upstream commit
`9aab28490d27a424019187e8169a62a64a50a028`. Its browser transport was omitted;
instantiation uses the bundled precompiled `core.wasm` instead of compiling or
fetching code at runtime. The BSD license is retained in `LICENSE.txt`.

The compressed English LSTM model is the `4.0.0_best_int` model distributed by
[the English model package](https://www.npmjs.com/package/@tesseract.js-data/eng) 1.0.0 (MIT package). It is loaded from the application
bundle. Original bytes, page images and recognized text stay in the same local
runtime. No OCR provider, model endpoint or remote font is contacted.

OCR output is a rebuildable search derivative. It never replaces original
bytes, gives scanner clearance or changes document permissions. The ordinary
archive and erasure fences also cover this text. Search labels unavailable or
incomplete extraction explicitly; encrypted originals need a readable copy.
