# Article authoring guide

Write articles for this project's `article` content type, then save them with the
built-in `create_article` tool. An article has these fields:

| Field         | Type                 | Notes                                  |
| ------------- | -------------------- | -------------------------------------- |
| `title`       | string               | The headline.                          |
| `description` | text (max 80 chars)  | Short summary used in listings.        |
| `slug`        | uid                  | Generated from `title`; do not set it. |
| `cover`       | media (single)       | Optional image, file, or video.        |
| `author`      | relation             | An existing `author` entry.            |
| `category`    | relation             | An existing `category` entry.          |
| `blocks`      | dynamic zone         | The article body. See below.           |

## The body lives in `blocks`, not a `content` field

There is no single rich-text `content` field. The body is a `blocks` dynamic zone,
assembled from these components:

- `shared.rich-text` — `{ body }`, a markdown/rich-text string. The main prose.
- `shared.quote` — `{ title, body }`.
- `shared.media` — `{ file }`, a single media item.
- `shared.slider` — `{ files }`, multiple images.

Put the whole written article in one `shared.rich-text` block unless a quote,
image, or slider genuinely helps. A human editor can split it into more blocks
in the admin later.

## What to send to `create_article`

```json
{
  "title": "React Server Components, Explained",
  "description": "What RSC change, and when to still reach for client components.",
  "blocks": [
    {
      "__component": "shared.rich-text",
      "body": "**TL;DR**\n\n- RSC run on the server and cut client-side JavaScript.\n\n## What are they?\n\n..."
    }
  ]
}
```

## Rich-text body format

Inside the `shared.rich-text` `body`, follow the house format:

- **TL;DR** — a bold label (not a heading), then 3-5 concise bullets.
- Main content — enrich with current research; use `##` headings; include code
  blocks for technical topics.
- **Citations** — a bold label, then one `- Title: https://url` per line.

Keep `description` under 80 characters, and leave `slug` unset (Strapi derives it
from `title`).
