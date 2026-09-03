import { NODE_ELEMENT, PROP_DIRECTIVE, parseSfc, walkTemplate } from "../utils/vue-sfc.mjs";

/**
 * Replacement for `vue/no-unused-components` (no native oxlint equivalent — oxc#15761).
 *
 * IMPORTANT — this rule is currently INERT in this repo, by design of the upstream rule rather
 * than by any choice here. `vue/no-unused-components` only inspects Options API registration
 * (`export default { components: { … } }`); it says nothing about `<script setup>`, where an
 * unused component import is caught by `@typescript-eslint/no-unused-vars` instead. This repo has
 * **zero** SFCs with a `components:` block and **zero** non-`setup` `<script>` blocks, so upstream
 * reports nothing here and neither does this port — verified both ways.
 *
 * It is ported anyway, rather than dropped, so the check does not silently disappear the moment
 * someone adds an Options API component. That does mean its correctness rests on synthetic probes
 * matched against eslint-plugin-vue, NOT on the 1581-SFC corpus — the corpus cannot exercise a
 * rule whose trigger does not occur. Recorded in OXLINT_MIGRATION.md.
 *
 * Semantics confirmed against upstream:
 * - Registration is matched case-insensitively across naming styles: `<used />` and `<used-two />`
 *   satisfy `Used` and `UsedTwo`, because Vue resolves kebab-case to the PascalCase registration.
 * - `ignoreWhenBindingPresent` defaults to true: if the template contains ANY
 *   `<component :is="binding">`, the rule suppresses itself entirely, since the binding could
 *   resolve to any registered component. A static `is="Foo"` does not suppress.
 * - The report anchors on the registration property in the script, not on anything in the template.
 */

/** `UsedTwo` / `used-two` / `used_two` all normalize to `usedtwo`. */
function normalizeName(name) {
    return name.replace(/[-_]/g, "").toLowerCase();
}

/** The `components: { … }` object expression from an Options API default export, or null. */
function findComponentsObject(program) {
    let found = null;
    const inspectObject = (object) => {
        for (const property of object.properties ?? []) {
            const key = property.key;
            const name = key?.name ?? key?.value;
            if (name === "components" && property.value?.type === "ObjectExpression") {
                found = property.value;
            }
        }
    };
    for (const statement of program?.body ?? []) {
        if (statement.type !== "ExportDefaultDeclaration") {
            continue;
        }
        const declaration = statement.declaration;
        if (declaration?.type === "ObjectExpression") {
            inspectObject(declaration);
        } else if (
            declaration?.type === "CallExpression" &&
            declaration.arguments?.[0]?.type === "ObjectExpression"
        ) {
            // `export default defineComponent({ … })`
            inspectObject(declaration.arguments[0]);
        }
    }
    return found;
}

export default {
    meta: {
        type: "suggestion",
        docs: {
            description: "disallow registering components that are not used inside templates",
            recommended: true,
        },
        schema: [],
        messages: {
            unusedComponent:
                'The "{{name}}" component is registered but never used in the template. Remove the registration, or use the component.',
        },
    },
    create(context) {
        if (!context.filename.endsWith(".vue")) {
            return {};
        }
        return {
            Program(program) {
                const componentsObject = findComponentsObject(program);
                if (!componentsObject) {
                    return;
                }
                const entry = parseSfc(context.filename);
                const ast = entry.descriptor.template?.ast;
                if (!ast) {
                    return;
                }

                const usedTags = new Set();
                let hasDynamicIs = false;
                walkTemplate(ast, (node) => {
                    if (node.type !== NODE_ELEMENT) {
                        return;
                    }
                    usedTags.add(normalizeName(node.tag));
                    if (node.tag !== "component") {
                        return;
                    }
                    for (const prop of node.props ?? []) {
                        const isBoundIs =
                            prop.type === PROP_DIRECTIVE &&
                            prop.name === "bind" &&
                            prop.arg?.content === "is";
                        if (isBoundIs) {
                            hasDynamicIs = true;
                        }
                    }
                });
                // A dynamic `:is` could resolve to any registration, so upstream stays quiet.
                if (hasDynamicIs) {
                    return;
                }

                for (const property of componentsObject.properties ?? []) {
                    const name = property.key?.name ?? property.key?.value;
                    if (typeof name !== "string") {
                        continue;
                    }
                    if (usedTags.has(normalizeName(name))) {
                        continue;
                    }
                    context.report({
                        node: property,
                        messageId: "unusedComponent",
                        data: { name },
                    });
                }
            },
        };
    },
};
