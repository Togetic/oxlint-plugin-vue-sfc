import { NODE_ELEMENT, PROP_DIRECTIVE, parseSfc, reportAtFileOffset } from "oxlint-vue-sfc-harness";
import {
    bindingsWithOffsets,
    declaredAlias,
    scriptTopLevelNames,
} from "../utils/vue-bindings.mjs";

/**
 * Replacement for `vue/no-template-shadow` (no native oxlint equivalent — oxc#15761).
 *
 * A `v-for` alias or `v-slot` binding that reuses a name already in scope hides the outer one for
 * the whole subtree. `<ul v-for="row in rows"><li v-for="row in row.kids">` reads as if the inner
 * loop iterates the outer row, and it does — once. After that every `row` in the subtree means
 * the inner one, so a later reference to the outer row silently resolves to the wrong value.
 * Renaming is free; debugging this is not.
 *
 * This is the plugin's first CORRELATION rule: it needs both halves of the SFC. The template side
 * comes from `parseSfc` as usual, and the script side from oxlint's own `Program(node)` AST, whose
 * top-level bindings are exactly what `<script setup>` exposes to the template. A template alias
 * is reported when it collides with EITHER an enclosing template binding or a script binding —
 * both confirmed against eslint-plugin-vue.
 *
 * Scoping detail that matters: only ANCESTOR template bindings shadow. Two sibling subtrees may
 * each bind `item` without conflict, which is why this walks with an explicit scope stack rather
 * than using the flat `walkTemplate` helper the other rules share.
 */

export default {
    meta: {
        type: "suggestion",
        docs: {
            description: "disallow variable declarations from shadowing variables declared in the outer scope",
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
            Program(program) {
                const entry = parseSfc(context.filename);
                const ast = entry.descriptor.template?.ast;
                if (!ast) {
                    return;
                }
                const scriptNames = scriptTopLevelNames(program);

                /**
                 * @param node current template node
                 * @param outer Set of names visible from ancestors (template aliases only;
                 *        script names are checked separately so they are never "shadowed away")
                 */
                const visit = (node, outer) => {
                    if (!node) {
                        return;
                    }
                    let scope = outer;
                    if (node.type === NODE_ELEMENT) {
                        const declared = [];
                        for (const prop of node.props ?? []) {
                            if (prop.type !== PROP_DIRECTIVE) {
                                continue;
                            }
                            const alias = declaredAlias(prop);
                            if (!alias) {
                                continue;
                            }
                            for (const binding of bindingsWithOffsets(alias.text)) {
                                const collides =
                                    outer.has(binding.name) || scriptNames.has(binding.name);
                                if (collides) {
                                    const start =
                                        prop.exp.loc.start.offset + alias.offset + binding.offset;
                                    reportAtFileOffset(
                                        context,
                                        entry,
                                        start,
                                        start + binding.name.length,
                                        `\`${binding.name}\` shadows a ${outer.has(binding.name) ? "variable declared by an enclosing template scope" : "binding from <script>"}. Every reference in this subtree resolves to the inner one — rename it.`,
                                    );
                                }
                                declared.push(binding.name);
                            }
                        }
                        if (declared.length) {
                            scope = new Set(outer);
                            for (const name of declared) {
                                scope.add(name);
                            }
                        }
                    }
                    for (const child of node.children ?? []) {
                        visit(child, scope);
                    }
                    // v-if chains keep branches off `children` in a transformed AST; harmless here.
                    for (const branch of node.branches ?? []) {
                        visit(branch, scope);
                    }
                };

                visit(ast, new Set());
            },
        };
    },
};
