import {
    NODE_ELEMENT,
    NODE_INTERPOLATION,
    PROP_DIRECTIVE,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "../utils/vue-sfc.mjs";

/**
 * Replacement for `vue/require-explicit-emits` (no native oxlint equivalent — oxc#15761).
 *
 * An event emitted but not declared in `defineEmits` still fires, so nothing breaks loudly — but
 * the component's contract is now a lie. Consumers reading `defineEmits` do not know the event
 * exists, TypeScript cannot check the payload, and Vue falls back to treating the listener as a
 * native attribute, which can double-fire it on the root element.
 *
 * A CORRELATION rule: declared events come from the script AST (`Program(node)`), emit calls from
 * both the script and the template.
 *
 * Declaration forms handled:
 * - Type, property form: `defineEmits<{ save: []; close: [] }>()`.
 * - Type, CALL-SIGNATURE form: `defineEmits<{ (e: "save"): void }>()`. This is the dominant style
 *   in this repo (122+ SFCs) and omitting it made the declared set EMPTY, which turned every emit
 *   in those files into a false positive — 219 of them. Handled by reading the string-literal type
 *   of a call signature's FIRST parameter.
 * - Runtime array: `defineEmits(["save", "close"])`.
 * - Runtime object: `defineEmits({ save: null })`.
 * - Options API `emits: [...]` / `emits: {...}`.
 * - A NAMED type reference — `defineEmits<CopyInputEmits>()` — resolved against `interface` /
 *   `type` declarations in the SAME script. All 15 such references in this repo are local, so no
 *   cross-file resolution is needed; an unresolvable reference makes the declared set unknown and
 *   the rule stays silent rather than reporting every emit.
 *
 * Emit sites handled: `$emit("x")` and `<emitVar>("x")` in template expressions, and
 * `<emitVar>("x")` in the script.
 *
 * Deliberately conservative — it only reports when BOTH halves are statically known:
 * - If no declaration is found at all, the rule stays silent. A component with no `defineEmits`
 *   is a different finding, and guessing would report every emit in the file.
 * - Only literal event names are checked. `emit(dynamicName)` is skipped.
 * The template side is a lexical scan for `$emit(` / `emit(` followed by a quoted literal rather
 * than a parse of each expression; a name built at runtime is therefore invisible, which is a
 * false negative and never a false positive.
 */

/** Event names declared by a `defineEmits` call or an `emits:` option. */
function declaredFrom(node) {
    const names = new Set();
    const fromTypeLiteral = (typeNode) => {
        const walk = (current) => {
            if (!current || typeof current !== "object") {
                return;
            }
            if (Array.isArray(current)) {
                for (const item of current) {
                    walk(item);
                }
                return;
            }
            if (
                (current.type === "TSPropertySignature" ||
                    current.type === "TSMethodSignature") &&
                current.key
            ) {
                const name = current.key.name ?? current.key.value;
                if (typeof name === "string") {
                    names.add(name);
                }
            }
            // `(event: "edit", payload: string): void` — the event name is the FIRST parameter's
            // string-literal type, not a property key.
            if (
                current.type === "TSCallSignatureDeclaration" ||
                current.type === "TSFunctionType"
            ) {
                const first = current.params?.[0] ?? current.parameters?.[0];
                const annotation = first?.typeAnnotation?.typeAnnotation ?? first?.typeAnnotation;
                if (annotation?.type === "TSLiteralType") {
                    const value = annotation.literal?.value;
                    if (typeof value === "string") {
                        names.add(value);
                    }
                }
            }
            for (const key of Object.keys(current)) {
                if (key === "parent" || key === "loc" || key === "range") {
                    continue;
                }
                walk(current[key]);
            }
        };
        walk(typeNode);
    };

    const fromValue = (value) => {
        if (value?.type === "ArrayExpression") {
            for (const element of value.elements ?? []) {
                if (typeof element?.value === "string") {
                    names.add(element.value);
                }
            }
        } else if (value?.type === "ObjectExpression") {
            for (const property of value.properties ?? []) {
                const name = property.key?.name ?? property.key?.value;
                if (typeof name === "string") {
                    names.add(name);
                }
            }
        }
    };

    if (node.type === "CallExpression") {
        fromValue(node.arguments?.[0]);
        // Type argument key differs across parser versions; scan the node for TS signatures.
        for (const key of Object.keys(node)) {
            if (key.startsWith("type")) {
                fromTypeLiteral(node[key]);
            }
        }
    } else if (node.type?.startsWith("TS")) {
        // A resolved type body: `TSInterfaceBody`, `TSTypeLiteral`, … — scan it for signatures
        // rather than treating it as a runtime value.
        fromTypeLiteral(node);
    } else {
        fromValue(node);
    }
    return names;
}

/** The name of a single `TSTypeReference` type argument on a call, or null. */
function referencedTypeName(call) {
    for (const key of Object.keys(call)) {
        if (!key.startsWith("type")) {
            continue;
        }
        const container = call[key];
        const params = container?.params ?? container?.parameters;
        const first = Array.isArray(params) ? params[0] : null;
        if (first?.type === "TSTypeReference" && first.typeName?.type === "Identifier") {
            return first.typeName.name;
        }
    }
    return null;
}

/** Map of locally declared type/interface name -> its body node. */
function localTypeDeclarations(program) {
    const map = new Map();
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
        if (node.type === "TSInterfaceDeclaration" && node.id?.name) {
            map.set(node.id.name, node.body);
        }
        if (node.type === "TSTypeAliasDeclaration" && node.id?.name) {
            map.set(node.id.name, node.typeAnnotation);
        }
        for (const key of Object.keys(node)) {
            if (key === "parent" || key === "loc" || key === "range") {
                continue;
            }
            walk(node[key]);
        }
    };
    walk(program);
    return map;
}

/** Walk the program collecting the declared event set and the emit variable name. */
function analyzeScript(program) {
    const localTypes = localTypeDeclarations(program);
    let declared = null;
    let emitVar = null;
    const walk = (node, parent) => {
        if (!node || typeof node !== "object") {
            return;
        }
        if (Array.isArray(node)) {
            for (const item of node) {
                walk(item, parent);
            }
            return;
        }
        if (typeof node.type !== "string") {
            return;
        }
        if (
            node.type === "CallExpression" &&
            node.callee?.type === "Identifier" &&
            node.callee.name === "defineEmits"
        ) {
            declared = declaredFrom(node);
            // `defineEmits<NamedEmits>()`: resolve the reference against local declarations.
            // If it cannot be resolved, leave `declared` null so the rule stays silent rather
            // than treating an empty set as "nothing is declared" and flagging every emit.
            if (declared.size === 0) {
                const referenced = referencedTypeName(node);
                const body = referenced ? localTypes.get(referenced) : null;
                declared = body ? declaredFrom(body) : null;
                if (declared && declared.size === 0) {
                    declared = null;
                }
            }
            if (parent?.type === "VariableDeclarator" && parent.id?.type === "Identifier") {
                emitVar = parent.id.name;
            }
        }
        if (
            node.type === "Property" &&
            (node.key?.name ?? node.key?.value) === "emits" &&
            node.value
        ) {
            declared = declaredFrom(node.value);
        }
        for (const key of Object.keys(node)) {
            if (key === "parent" || key === "loc" || key === "range") {
                continue;
            }
            walk(node[key], node);
        }
    };
    walk(program, null);
    return { declared, emitVar };
}

/** Literal event names emitted in `text`, with the offset of each name's opening quote. */
function emitSites(text, emitVar) {
    // NOTE: no `\b` before `$emit`. `$` is not a word character, so a word boundary can never
    // match at the start of an expression like `$emit('x')` — that mistake silently disabled the
    // whole template side of this rule. `$emit` is distinctive enough not to need a guard (and
    // `this.$emit(...)` should match too); the script variable does get a `\b`.
    const escaped = emitVar ? emitVar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : null;
    const callees = ["\\$emit", ...(escaped ? [`\\b${escaped}`] : [])];
    const pattern = new RegExp(`(?:${callees.join("|")})\\s*\\(\\s*(['"])([^'"]*)\\1`, "g");
    const sites = [];
    let match = pattern.exec(text);
    while (match !== null) {
        // index of the opening quote inside the whole match
        const quoteOffset = match[0].lastIndexOf(match[1], match[0].length - match[2].length - 1);
        sites.push({ name: match[2], offset: match.index + quoteOffset });
        match = pattern.exec(text);
    }
    return sites;
}

export default {
    meta: {
        type: "problem",
        docs: {
            description: "require `emits` option with name triggered by `$emit()`",
            recommended: true,
        },
        schema: [],
        messages: {
            undeclared:
                'The "{{name}}" event is emitted but not declared in `defineEmits`, so the component\'s contract does not mention it and its payload is unchecked.',
        },
    },
    create(context) {
        if (!context.filename.endsWith(".vue")) {
            return {};
        }
        return {
            Program(program) {
                const { declared, emitVar } = analyzeScript(program);
                // No declaration at all: reporting every emit would be a different rule.
                if (!declared) {
                    return;
                }

                // --- script side: emitVar("name") -------------------------------------------
                if (emitVar) {
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
                        if (
                            node.type === "CallExpression" &&
                            node.callee?.type === "Identifier" &&
                            node.callee.name === emitVar
                        ) {
                            const first = node.arguments?.[0];
                            if (
                                typeof first?.value === "string" &&
                                !declared.has(first.value)
                            ) {
                                context.report({
                                    node: first,
                                    messageId: "undeclared",
                                    data: { name: first.value },
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
                }

                // --- template side: $emit("name") / emitVar("name") -------------------------
                const entry = parseSfc(context.filename);
                const ast = entry.descriptor.template?.ast;
                if (!ast) {
                    return;
                }
                const check = (expression) => {
                    if (!expression?.content) {
                        return;
                    }
                    for (const site of emitSites(expression.content, emitVar)) {
                        if (declared.has(site.name)) {
                            continue;
                        }
                        const start = expression.loc.start.offset + site.offset;
                        reportAtFileOffset(
                            context,
                            entry,
                            start,
                            start + site.name.length + 2,
                            `The "${site.name}" event is emitted but not declared in \`defineEmits\`, so the component's contract does not mention it and its payload is unchecked.`,
                        );
                    }
                };
                walkTemplate(ast, (node) => {
                    if (node.type === NODE_INTERPOLATION) {
                        check(node.content);
                        return;
                    }
                    if (node.type !== NODE_ELEMENT) {
                        return;
                    }
                    for (const prop of node.props ?? []) {
                        if (prop.type === PROP_DIRECTIVE) {
                            check(prop.exp);
                        }
                    }
                });
            },
        };
    },
};
