# Your Project's Title...
Your project's description...

## Environments
- Preview: https://main--{repo}--{owner}.aem.page/
- Live: https://main--{repo}--{owner}.aem.live/

## Documentation

Before using the aem-boilerplate, we recommand you to go through the documentation on https://www.aem.live/docs/ and more specifically:
1. [Developer Tutorial](https://www.aem.live/developer/tutorial)
2. [The Anatomy of a Project](https://www.aem.live/developer/anatomy-of-a-project)
3. [Web Performance](https://www.aem.live/developer/keeping-it-100)
4. [Markup, Sections, Blocks, and Auto Blocking](https://www.aem.live/developer/markup-sections-blocks)

## Installation

```sh
npm i
```

## Linting

```sh
npm run lint
```

## Local development

1. Create a new repository based on the `aem-boilerplate` template
1. Add the [AEM Code Sync GitHub App](https://github.com/apps/aem-code-sync) to the repository
1. Install the [AEM CLI](https://github.com/adobe/helix-cli): `npm install -g @adobe/aem-cli`
1. Start AEM Proxy: `aem up` (opens your browser at `http://localhost:3000`)
1. Open the `{repo}` directory in your favorite IDE and start coding :)

## Category breadcrumbs

Category PLPs and PDPs automatically render a breadcrumb using the same-origin
`/categories.json` sheet (with the existing catalog-origin fallback). Each row's
`path` defines its hierarchy and `title` supplies its label. Ancestors link to
`/categories/{path}`; the current page is not linked.

PLPs resolve their category from the page URL. PDPs match the product's
`custom.equipmentFamily.name` to a unique category title and append the product
name. Missing or ambiguous matches show only Home and the product name, without
guessing a category. Search filters do not change the page's breadcrumb.

Run the breadcrumb unit tests with:

```sh
node --experimental-default-type=module --test test/breadcrumbs.test.mjs
```
