# Contributing

Thanks for your interest. The project is in early development, so the most
useful contributions right now are feedback on the documents under `docs/`
and, soon, Spanish food-name translations and weighed test meals for the
accuracy benchmark.

## Ground rules

- Scope is defined by [`bcdd/contrato.md`](bcdd/contrato.md) and detailed in
  [`docs/02-prd.md`](docs/02-prd.md). Open an issue before working on
  anything outside it.
- No analytics, crash-reporting, or advertising SDKs. No paid services.
- Dependencies must have a license compatible with MIT distribution.
- Never commit API keys. Provider keys belong in your local environment.
- Changes to the prompt, output schema, image size, or food matcher must
  include benchmark results (see [`docs/11-qa-and-ai-accuracy.md`](docs/11-qa-and-ai-accuracy.md)).

## Workflow

1. Create a branch from `main`.
2. Keep changes small and include tests with the behavior they cover.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) for
   commit messages.
4. Open a pull request describing what changed and how you verified it.

By contributing, you agree that your contributions are licensed under the
MIT License.
