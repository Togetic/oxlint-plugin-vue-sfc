# oxlint-plugin-vue-sfc

Vue SFC template rules for [oxlint](https://oxc.rs), as a JS plugin.

oxlint cannot read Vue templates natively ([oxc#15761](https://github.com/oxc-project/oxc/issues/15761)),
so projects keep ESLint around for `eslint-plugin-vue`. These 24 rules self-parse the SFC with
`@vue/compiler-sfc` and walk the real template AST, so the checks run under oxlint instead.

Ports of `eslint-plugin-vue` rules that oxlint has no native equivalent for. Validated against a
production Nuxt monorepo — 1581 SFCs, all template-first — where they replaced the corresponding
`vue/*` ESLint rules outright.

## Install

```bash
npm i -D oxlint-plugin-vue-sfc
```

## Usage

Extend a preset from your `.oxlintrc.json`:

```jsonc
{
    "extends": ["./node_modules/oxlint-plugin-vue-sfc/configs/recommended.json"]
}
```

Two presets:

| Preset | Rules | For |
| --- | --- | --- |
| `configs/recommended.json` | all 24 | plain oxlint — you want the full set |
| `configs/complement.json` | 13 | you also run [`oxlint-vue`](https://github.com/vad1ym/oxlint-vue), which covers the other 11 |

Or wire it up by hand:

```jsonc
{
    "jsPlugins": ["./node_modules/oxlint-plugin-vue-sfc/index.mjs"],
    "rules": {
        "vue-sfc/require-v-for-key": "error",
        "vue-sfc/no-raw-text": "off"
    }
}
```

The plugin namespace is `vue-sfc`, not `vue` — oxlint reserves `vue` for its native plugin and
rejects a JS plugin that claims it.

## Rules

| Rule | Default | In `complement` | Description |
| --- | --- | --- | --- |
| `vue-sfc/no-child-content` | error |  | disallow element's child contents which would be overwritten by a directive like `v-html` or `v-text` |
| `vue-sfc/no-dupe-v-else-if` | error |  | disallow duplicate conditions in `v-if` / `v-else-if` chains |
| `vue-sfc/no-duplicate-attributes` | error |  | disallow duplication of attributes on the same element |
| `vue-sfc/no-lone-template` | warn | yes | disallow unnecessary `<template>` |
| `vue-sfc/no-mutating-props` | error |  | disallow mutation of component props |
| `vue-sfc/no-parsing-error` | error | yes | disallow parsing errors in `<template>` |
| `vue-sfc/no-raw-text` | off | yes | disallow untranslated raw text in Vue templates (use i18n) |
| `vue-sfc/no-ref-as-operand` | error | yes | require `.value` when using a `ref` as an operand |
| `vue-sfc/no-template-key` | error |  | disallow `key` attribute on `<template>` without `v-for` |
| `vue-sfc/no-template-shadow` | warn | yes | disallow variable declarations from shadowing variables declared in the outer scope |
| `vue-sfc/no-textarea-mustache` | error |  | disallow mustaches in `<textarea>` |
| `vue-sfc/no-unused-components` | error | yes | disallow registering components that are not used inside templates |
| `vue-sfc/no-unused-vars` | error | yes | disallow unused variable definitions of v-for directives or scope attributes |
| `vue-sfc/no-use-v-if-with-v-for` | error |  | disallow use of `v-if` on the same element as `v-for` |
| `vue-sfc/no-useless-template-attributes` | error | yes | disallow useless attribute on `<template>` |
| `vue-sfc/no-v-text-v-html-on-component` | warn |  | disallow `v-text` / `v-html` on component |
| `vue-sfc/require-component-is` | error |  | require `v-bind:is` of `<component>` elements |
| `vue-sfc/require-explicit-emits` | warn | yes | require `emits` option with name triggered by `$emit()` |
| `vue-sfc/require-toggle-inside-transition` | error | yes | require control the display of the content inside `<transition>` |
| `vue-sfc/require-v-for-key` | error |  | require `v-bind:key` with `v-for` directives |
| `vue-sfc/require-valid-default-prop` | error | yes | enforce props default values to be valid |
| `vue-sfc/this-in-template` | warn |  | disallow usage of `this` in template |
| `vue-sfc/use-v-on-exact` | error | yes | enforce usage of `exact` modifier on `v-on` |
| `vue-sfc/v-on-event-hyphenation` | warn | yes | enforce `v-on` event naming style on custom components in template |

`no-raw-text` defaults to `off`: it is an i18n rule (a replacement for
`@intlify/vue-i18n/no-raw-text`) and only makes sense in a translated app. It takes
`{ ignoreTags, ignorePattern }`.

## Known limitation: diagnostic positions

Template diagnostics currently render on the `<script>` block, with the true template position
prepended to the message:

```
Comp.vue:13:1  error  vue-sfc(require-v-for-key): [template 3:9] <li> uses v-for without a :key...
```

oxlint gives JS-plugin rules a script-relative view of an SFC, so a template position — which in a
template-first file is a negative offset — cannot be expressed. The workaround clamps the range and
puts the real location in the message text.

[oxc#26001](https://github.com/oxc-project/oxc/pull/26001) fixes this upstream with an `actualRange`
on the diagnostic, and would give every rule here correct positions **with no rule changes**. Until
it lands, editor jump-to-error goes to the script block.

## Reduced-scope ports

Six rules deliberately implement less than their upstream counterpart. Each says so in its own file
header:

- `no-dupe-v-else-if` — exact duplicate conditions only, not subsumption
- `this-in-template`, `no-mutating-props` — lexical template scan
- `require-explicit-emits` — silent on an unresolvable named type reference
- `no-unused-vars`, `no-template-shadow` — positioned scan, not a full destructuring-pattern parse
- `no-unused-components` — upstream only inspects Options API `components: {}`, so it is inert in a
  `<script setup>` codebase; ported so the check does not vanish if that changes

They gate new violations rather than opening a migration: all 24 report zero diagnostics across the
1581-SFC corpus they were built against.

## Tests

```bash
npm test    # node:test, 320 specs across 24 rules
```

## License

MIT
