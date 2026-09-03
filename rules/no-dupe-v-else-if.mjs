import {
    NODE_ELEMENT,
    findDirective,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "oxlint-vue-sfc-harness";

/**
 * Replacement for `vue/no-dupe-v-else-if` (no native oxlint equivalent — oxc#15761).
 *
 * A condition repeated later in a `v-if` / `v-else-if` chain can never be reached: the
 * earlier branch always wins. So one of the two branches is dead code, and the author
 * almost certainly meant a different condition in the second one.
 *
 * Chain reconstruction: `@vue/compiler-sfc`'s `parse()` returns the UNTRANSFORMED template,
 * where `v-if` / `v-else-if` / `v-else` are plain directives on sibling elements rather than
 * a branches structure. A chain is therefore a run of consecutive element siblings starting
 * at `v-if`, continuing while each next sibling has `v-else-if` (or `v-else`, which ends it).
 * Non-element siblings (whitespace text, comments) are skipped rather than breaking the run,
 * because they do not break the chain for Vue either.
 *
 * DELIBERATELY NARROWER than eslint-plugin-vue: this compares normalized condition SOURCE
 * TEXT for exact equality only. eslint-plugin-vue additionally detects logical subsets
 * (`a` after `a && b`, and `a || b` overlaps). Doing that safely needs real expression
 * analysis; getting it wrong reports working code. False negatives are acceptable here,
 * false positives are not — so subset detection stays with ESLint until it is worth building
 * properly. Any rule ported at reduced scope must say so; see OXLINT_MIGRATION.md.
 */

const NODE_COMMENT = 3;
const NODE_TEXT = 2;

/** Condition source, whitespace-normalized so formatting differences don't hide a duplicate. */
function conditionText(directive) {
    return (directive.exp?.content ?? "").replace(/\s+/g, " ").trim();
}

function isSkippable(node) {
    if (node.type === NODE_COMMENT) {
        return true;
    }
    return node.type === NODE_TEXT && (node.content ?? "").trim() === "";
}

export default {
    meta: {
        type: "problem",
        docs: {
            description: "disallow duplicate conditions in `v-if` / `v-else-if` chains",
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
                // Every node with children can host a chain among those children.
                walkTemplate(ast, (parent) => {
                    const children = (parent.children ?? []).filter((c) => !isSkippable(c));
                    let seen = null;
                    for (const child of children) {
                        if (child.type !== NODE_ELEMENT) {
                            seen = null;
                            continue;
                        }
                        const vIf = findDirective(child, "if");
                        const vElseIf = findDirective(child, "else-if");
                        if (vIf) {
                            seen = new Set([conditionText(vIf)]);
                            continue;
                        }
                        if (vElseIf) {
                            if (!seen) {
                                // `v-else-if` with no preceding `v-if` is a different error
                                // (vue/valid-v-else-if); not this rule's business.
                                continue;
                            }
                            const text = conditionText(vElseIf);
                            if (text && seen.has(text)) {
                                // Anchor on the CONDITION, not the whole directive: that is
                                // where eslint-plugin-vue points (verified at exact column
                                // parity), and it is the part the author must change.
                                const at = vElseIf.exp?.loc ?? vElseIf.loc;
                                reportAtFileOffset(
                                    context,
                                    entry,
                                    at.start.offset,
                                    at.end.offset,
                                    `This condition is a duplicate of an earlier branch in the same v-if chain, so this branch is unreachable: \`${text}\`.`,
                                );
                            } else if (text) {
                                seen.add(text);
                            }
                            continue;
                        }
                        // `v-else` terminates the chain, and an element with no chain directive
                        // breaks it. Either way the run ends here.
                        seen = null;
                    }
                });
            },
        };
    },
};
