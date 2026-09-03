import {
    NODE_ELEMENT,
    NODE_INTERPOLATION,
    PROP_DIRECTIVE,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "oxlint-vue-sfc-harness";

/**
 * Replacement for `vue/no-mutating-props` (no native oxlint equivalent — oxc#15761).
 *
 * Props are the parent's state. Writing to one changes the child's copy until the parent next
 * re-renders, at which point the value snaps back — so the bug shows up as a field that "won't
 * stay changed", which is a miserable thing to debug. Vue warns at runtime for the direct case and
 * says nothing at all for nested mutation (`props.obj.a = 1`).
 *
 * A CORRELATION rule covering BOTH halves: script assignments via the AST, and template mutations
 * (`@click="props.x++"`, `v-model="props.x"`) via a lexical scan.
 *
 * Deliberately conservative, because a false positive on a prop read would be intolerable — the
 * template side reports ONLY two unambiguous shapes:
 * 1. `v-model` (or `v-model:arg`) whose expression is rooted at a prop. v-model IS an assignment,
 *    so there is no ambiguity about intent.
 * 2. An expression containing a prop root followed by an assignment or increment operator
 *    (`=` not part of `==`/`===`/`!=`/`>=`/`<=`, or `++`/`--`/`+=`/`-=`/`*=`/`/=`/`%=`).
 * Anything else — a read, a method call, a comparison — is never reported. String literals and
 * comments are blanked before the scan so prose cannot trigger it.
 *
 * The script side is exact rather than lexical: it walks for `AssignmentExpression` and
 * `UpdateExpression` whose target's ROOT object is the props variable or a destructured prop.
 */

const PROP_FACTORIES = new Set(["defineProps"]);
const MUTATION_AFTER_ROOT = /^\s*(?:\.\s*[\w$]+|\[[^\]]*\])*\s*(?:\+\+|--|[+\-*/%]=|=(?!=))/;

/** Blank string-literal and comment CONTENTS, preserving length so offsets stay valid. */
function blankStringsAndComments(source) {
    const out = [...source];
    let quote = null;
    let comment = null;
    for (let i = 0; i < out.length; i += 1) {
        const ch = out[i];
        if (comment === "line") {
            out[i] = " ";
            continue;
        }
        if (comment === "block") {
            if (ch === "*" && out[i + 1] === "/") {
                out[i] = " ";
                out[i + 1] = " ";
                i += 1;
                comment = null;
                continue;
            }
            out[i] = " ";
            continue;
        }
        if (quote === null) {
            if (ch === "/" && out[i + 1] === "/") {
                comment = "line";
                out[i] = " ";
                continue;
            }
            if (ch === "/" && out[i + 1] === "*") {
                comment = "block";
                out[i] = " ";
                out[i + 1] = " ";
                i += 1;
                continue;
            }
            if (ch === "'" || ch === '"' || ch === "`") {
                quote = ch;
            }
            continue;
        }
        if (ch === "\\") {
            out[i] = " ";
            if (i + 1 < out.length) {
                out[i + 1] = " ";
            }
            i += 1;
            continue;
        }
        if (ch === quote) {
            quote = null;
            continue;
        }
        out[i] = " ";
    }
    return out.join("");
}

/** The props variable name and any destructured prop names. */
function analyzeProps(program) {
    let propsVar = null;
    const destructured = new Set();
    const isPropsCall = (node) => {
        if (node?.type !== "CallExpression") {
            return false;
        }
        if (node.callee?.type === "Identifier" && PROP_FACTORIES.has(node.callee.name)) {
            return true;
        }
        // `withDefaults(defineProps<…>(), { … })`
        return (
            node.callee?.type === "Identifier" &&
            node.callee.name === "withDefaults" &&
            isPropsCall(node.arguments?.[0])
        );
    };
    const walk = (node) => {
        if (!node || typeof node !== "object") {
            return;
        }
        if (Array.isArray(node)) {
            for (const item of node) {
                walk(item);
            }
            return;
        }
        if (typeof node.type !== "string") {
            return;
        }
        if (node.type === "VariableDeclarator" && isPropsCall(node.init)) {
            if (node.id?.type === "Identifier") {
                propsVar = node.id.name;
            } else if (node.id?.type === "ObjectPattern") {
                for (const property of node.id.properties ?? []) {
                    const target = property.value ?? property.argument;
                    if (target?.type === "Identifier") {
                        destructured.add(target.name);
                    }
                }
            }
        }
        for (const key of Object.keys(node)) {
            if (key === "parent" || key === "loc" || key === "range") {
                continue;
            }
            walk(node[key]);
        }
    };
    walk(program);
    return { propsVar, destructured };
}

/** The root identifier of a member chain (`a.b.c` -> `a`), or null. */
function rootIdentifier(node) {
    let current = node;
    while (current?.type === "MemberExpression") {
        current = current.object;
    }
    return current?.type === "Identifier" ? current : null;
}

export default {
    meta: {
        type: "problem",
        docs: {
            description: "disallow mutation of component props",
            recommended: true,
        },
        schema: [],
        messages: {
            mutating:
                "`{{name}}` is a prop, so it belongs to the parent. Writing to it is overwritten on the parent's next render — emit an event and let the parent own the change.",
        },
    },
    create(context) {
        if (!context.filename.endsWith(".vue")) {
            return {};
        }
        return {
            Program(program) {
                const { propsVar, destructured } = analyzeProps(program);
                if (!propsVar && !destructured.size) {
                    return;
                }
                const isPropRoot = (name) =>
                    (propsVar !== null && name === propsVar) || destructured.has(name);

                // --- script side: exact AST walk --------------------------------------------
                const walk = (node) => {
                    if (!node || typeof node !== "object") {
                        return;
                    }
                    if (Array.isArray(node)) {
                        for (const item of node) {
                            walk(item);
                        }
                        return;
                    }
                    if (typeof node.type !== "string") {
                        return;
                    }
                    const target =
                        node.type === "AssignmentExpression"
                            ? node.left
                            : node.type === "UpdateExpression"
                              ? node.argument
                              : null;
                    if (target) {
                        const root = rootIdentifier(target);
                        if (root && isPropRoot(root.name)) {
                            context.report({
                                node: root,
                                messageId: "mutating",
                                data: { name: root.name },
                            });
                        }
                    }
                    for (const key of Object.keys(node)) {
                        if (key === "parent" || key === "loc" || key === "range") {
                            continue;
                        }
                        walk(node[key]);
                    }
                };
                walk(program);

                // --- template side: conservative lexical scan -------------------------------
                const entry = parseSfc(context.filename);
                const ast = entry.descriptor.template?.ast;
                if (!ast) {
                    return;
                }
                const roots = [...(propsVar ? [propsVar] : []), ...destructured];
                if (!roots.length) {
                    return;
                }
                const rootPattern = new RegExp(
                    `\\b(${roots.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
                    "g",
                );

                const report = (expression, offsetInExpression, name) => {
                    const start = expression.loc.start.offset + offsetInExpression;
                    reportAtFileOffset(
                        context,
                        entry,
                        start,
                        start + name.length,
                        `\`${name}\` is a prop, so it belongs to the parent. Writing to it in the template is overwritten on the parent's next render — emit an event and let the parent own the change.`,
                    );
                };

                const scan = (expression, alwaysMutation) => {
                    if (!expression?.content) {
                        return;
                    }
                    const text = blankStringsAndComments(expression.content);
                    rootPattern.lastIndex = 0;
                    let match = rootPattern.exec(text);
                    while (match !== null) {
                        const after = text.slice(match.index + match[1].length);
                        if (alwaysMutation || MUTATION_AFTER_ROOT.test(after)) {
                            report(expression, match.index, match[1]);
                        }
                        match = rootPattern.exec(text);
                    }
                };

                walkTemplate(ast, (node) => {
                    if (node.type === NODE_INTERPOLATION) {
                        scan(node.content, false);
                        return;
                    }
                    if (node.type !== NODE_ELEMENT) {
                        return;
                    }
                    for (const prop of node.props ?? []) {
                        if (prop.type !== PROP_DIRECTIVE) {
                            continue;
                        }
                        // `v-model` IS an assignment, so its target is unambiguously mutated.
                        scan(prop.exp, prop.name === "model");
                    }
                });
            },
        };
    },
};
