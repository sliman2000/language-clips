# Language Clips

Members study English and Korean phrases from short subtitled video or audio clips, then practice them in listening, meaning and speaking quizzes. Admins write the lessons.

Inspired by https://cake.day

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Admins create, publish and delete lessons with a clip, subtitles and key expressions; members filter published lessons by language, level and topic.
- Play a clip with its subtitles highlighted, show or hide translations, jump to any line and repeat one line.
- Take a quiz on a lesson's expressions by listening, picking the meaning and speaking or typing the phrase.
- Keep a daily streak, earn stars and see lessons completed per level.
- Save expressions to a personal list, mark them learned and review them one at a time.

Left out: accounts and sign-in, which your Gateway handles; mobile apps and notifications; subscriptions; a bundled lesson catalogue; leaderboards and missions; pronunciation scoring.

## Setup

- Install: `pnpm install`
- Run locally: `pnpm dev`
- Test: `pnpm test` for the unit tests; `checks/` holds the release checks that run against a packaged build.
- Deploy: `pnpm run deploy` through your EveryApp Gateway. It creates the D1 database and the R2 bucket for clips. There are no secrets or settings to fill in.

Members with the organization's owner or admin role can write lessons; everyone else studies them.

## Limitations

- The app ships with no lessons: an admin uploads each clip and types its subtitles and expressions.
- Clips are up to 50 MB each and are stored in your Cloudflare account's R2, which must be enabled once.
- Speaking answers use the browser's speech recognition where it exists (Chrome, Edge, Safari); elsewhere members type the phrase.
- Deploying to a real Gateway was not part of local testing.
