---
name: griddle
description: Start, resume, or continue a durable local grilling session through Griddle from the /griddle slash command or natural language requests to think through a plan, decision, or idea.
---

Run `/griddle`, `/griddle <topic>`, and equivalent natural-language requests through the durable Griddle workflow. This one thin `griddle` skill delegates to the existing `grilling` workflow and does not replace or modify `grill-me`.

Start by reading `docs/GRIDDLE_WORKFLOW.md`, `docs/GRIDDLE_SKILL.md`, and `docs/PI_ADAPTER.md` (present in the Griddle source checkout), then follow those contracts exactly. The web app is the authoritative question surface. The agent must never duplicate an active Griddle round in chat; chat is only for status, failures, and the final confirmation summary after answers are durable.

## 1. Detect the installed `griddle` command (do this first)

Run `griddle --version`.

- If it prints a version, the Griddle app is installed globally — continue with the `griddle` commands below.
- If it is **not found**, the Griddle app is not installed. **Stop and ask the human to install it** before doing anything else, e.g.:

  > Griddle isn't installed on this machine yet. Install it globally with
  > `npm install -g <griddle-package-or-checkout-path>` (Node 22.13+), or say the
  > word and I'll run that install for you.

  Only after `griddle --version` succeeds should you create rounds. Do not silently fall back to other tools, and do not hand-edit ledger files. (Inside a Griddle source checkout the equivalent `npm run griddle -- …` / `npm run grill -- …` / `npm run agent -- …` scripts still work — see `docs/GRIDDLE_WORKFLOW.md`.)

## 2. Choose the working directory

The current working directory **is** the session data root. Run `griddle` from the folder where the human wants the thinking saved; ledgers, temp files, and the canonical `summary.md` are written there under `./<base-root>/…` (default `--base-root griddle`). The code lives in the installed package, so outputs land in your working directory, never in the package.

The first data command starts one self-contained Griddle server (the web app + its API) bound to that working directory and prints its URL. Open that URL so the human can answer. One server per working directory; it keeps running so later commands reuse it.

## 3. Drive the lifecycle with the `griddle` command

For a new topic, first run `griddle discover --topic "<topic>"`. If matching non-terminal sessions exist, create a short-lived Griddle session that asks the human whether to resume one or start fresh; never make that choice silently. Then `griddle create --topic "<topic>" --open` (it prints the session `root` and `session`, and `--open` launches the browser). Use `griddle round --root <root> --session <session> --decision <node> --answer "<text>" [--answer-option <id>=<label>] [--depends-on <node>]` and read `activeRoundAnswers` from the completed round result before deciding the next round.

Discover facts through direct investigation or research subagents when useful. The human answers decisions and gives final completion approval in the web app. Use `griddle complete --root <root> --session <session>` to write the canonical summary, request completion, and wait for the human's `session_completed` approval. Only an explicit user request may produce `session_reopened`; use `griddle reopen --root <root> --session <session> --reason "<reason>"` after the human asks for the completed session to be reopened. Do not invent a reopen, and do not continue agent writes while completion is pending.

`griddle state --root <root> --session <session>` prints the derived state for status checks without touching the ledger.
