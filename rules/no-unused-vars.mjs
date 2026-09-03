import {
    NODE_ELEMENT,
    NODE_INTERPOLATION,
    PROP_DIRECTIVE,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "../utils/vue-sfc.mjs";
import {
    bindingsWithOffsets,
    declaredAlias,
    positionalGroups,
} from "../utils/vue-bindings.mjs";

/**
 * Replacement for `vue/no-unused-vars` (no native oxlint equivalent — oxc#15761).
 *
 * Note this is the TEMPLATE rule, not `@typescript-eslint/no-unused-vars`: it flags variables
 * introduced BY the template — `v-for` aliases and `v-slot` destructuring — that the template
 * then never reads. An unused alias is usually a leftover from a refactor, and an unused slot
 * prop often means the consumer is reading the wrong name and silently rendering nothing.
 *
 * Semantics confirmed against eslint-plugin-vue case by case:
 * - `v-for="item in items"` with no use of `item` → reported, anchored on `item` itself.
 * - `v-for` aliases are POSITIONAL — `(value, key, index)` — so upstream applies `after-used`
 *   logic to them: an unused alias BEFORE a used one is unavoidable and is not reported.
 *   `v-for="(_, index) in items"` with `index` used is therefore clean, while
 *   `v-for="(item, i)"` with only `item` used does report `i`. Getting this wrong produced 5
 *   false positives here, all of the `(_, index)` shape.
 * - `v-slot`/`#name="{ a, b }"` destructuring is NOT positional, so every unused binding is
 *   reported regardless of order (confirmed: `{ a, b }` with only `b` used reports `a`).
 * - `_` is NOT exempt. eslint-plugin-vue has an `ignorePattern` option but its default ignores
 *   nothing, and our ESLint config never set one — so `v-for="_ in items"` IS reported, and
 *   adding an underscore escape hatch here would silently diverge.
 * - A use anywhere in the element's subtree counts, including inside attributes (`:key="o.id"`)
 *   and nested children.
 *
 * Binding extraction lives in utils/vue-bindings.mjs (shared with vue-no-template-shadow) and is
 * a positioned scan rather than a full pattern parse. Usage detection here is a word-boundary
 * scan over the subtree's expression sources, so a name that appears only inside a string
 * literal counts as used. Both approximations fail toward FALSE NEGATIVES (a missed unused
 * variable), never toward reporting a variable that is genuinely used.
 */

/** Concatenated expression sources inside `element`'s subtree, excluding `skip`. */
function subtreeExpressionText(element, skip) {
    const parts = [];
    walkTemplate(element, (node) => {
        if (node.type === NODE_INTERPOLATION && node.content?.content) {
            parts.push(node.content.content);
            return;
        }
        if (node.type !== NODE_ELEMENT) {
            return;
        }
        for (const prop of node.props ?? []) {
            if (prop.type !== PROP_DIRECTIVE) {
                continue;
            }
            if (prop.exp?.content && prop.exp !== skip) {
                parts.push(prop.exp.content);
            }
            // A dynamic argument (`:[key]`, `@[evt]`) reads a binding too.
            if (prop.arg?.content && prop.arg.isStatic === false) {
                parts.push(prop.arg.content);
            }
        }
    });
    return parts.join("\n");
}

function usesName(text, name) {
    return new RegExp(`\\b${name}\\b`).test(text);
}

export default {
    meta: {
        type: "suggestion",
        docs: {
            description: "disallow unused variable definitions of v-for directives or scope attributes",
            recommended: true,
        },
        schema: [],
        messages: { m: "" },
    },
    create(context) {
        if (!context.filename.endsWith(".vue")) {
            return {};
        }
        return {
            Program() {
                const entry = parseSfc(context.filename);
                const ast = entry.descriptor.template?.ast;
                if (!ast) {
                    return;
                }
                walkTemplate(ast, (node) => {
                    if (node.type !== NODE_ELEMENT) {
                        return;
                    }
                    for (const prop of node.props ?? []) {
                        if (prop.type !== PROP_DIRECTIVE || !prop.exp?.content) {
                            continue;
                        }
                        const alias = declaredAlias(prop);
                        if (!alias) {
                            continue;
                        }
                        const usage = subtreeExpressionText(node, prop.exp);
                        // For `v-for`, the right-hand side is evaluated in the OUTER scope, so it
                        // is not a use of the alias — but it lives in the same expression node,
                        // which `skip` removed wholesale. Add it back so `v-for="a in a"` and
                        // similar do not read as unused.
                        const isFor = prop.name === "for";
                        const rhs = isFor ? prop.exp.content.slice(alias.text.length) : "";
                        const haystack = `${usage}\n${rhs}`;
                        const report = (binding, groupOffset) => {
                            const start =
                                prop.exp.loc.start.offset +
                                alias.offset +
                                groupOffset +
                                binding.offset;
                            reportAtFileOffset(
                                context,
                                entry,
                                start,
                                start + binding.name.length,
                                `\`${binding.name}\` is defined by this ${isFor ? "v-for" : "v-slot"} but never used in the template.`,
                            );
                        };

                        if (!isFor) {
                            // v-slot destructuring is not positional: report every unused name.
                            for (const binding of bindingsWithOffsets(alias.text)) {
                                if (!usesName(haystack, binding.name)) {
                                    report(binding, 0);
                                }
                            }
                            continue;
                        }

                        // v-for: positional, so apply `after-used` — only groups AFTER the last
                        // group containing a used binding can be reported.
                        const groups = positionalGroups(alias.text).map((group) => ({
                            ...group,
                            bindings: bindingsWithOffsets(group.text),
                        }));
                        let lastUsed = -1;
                        groups.forEach((group, index) => {
                            if (group.bindings.some((b) => usesName(haystack, b.name))) {
                                lastUsed = index;
                            }
                        });
                        for (let index = lastUsed + 1; index < groups.length; index += 1) {
                            const group = groups[index];
                            for (const binding of group.bindings) {
                                if (!usesName(haystack, binding.name)) {
                                    report(binding, group.offset);
                                }
                            }
                        }
                    }
                });
            },
        };
    },
};
