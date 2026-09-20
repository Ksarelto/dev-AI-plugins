# Template: deck.json

Load-bearing input to `render_deck.py`. Hex is 6 digits, no `#`. Copy structure, replace values.

See `skills/build-pptx/scripts/schema/deck.schema.json` and `skills/build-pptx/fixtures/sample-deck.json`.

Required theme color keys: `bg`, `surface`, `text`, `muted`, `accent`, `accent_text`, `cover_bg`, `cover_text`.

Slide 1 `layout` must be `cover`. Last slide `layout` must be `cta`.
