/**
 * Replacement for `vue/require-valid-default-prop` (no native oxlint equivalent — oxc#15761).
 *
 * Two distinct bugs, both silent:
 * 1. `{ type: Array, default: [] }` shares ONE array across every instance of the component.
 *    Push to it in one place and it appears everywhere. Vue requires a factory (`default: () => []`)
 *    precisely so each instance gets its own.
 * 2. `{ type: String, default: 1 }` declares one type and defaults to another. Nothing complains
 *    at runtime; the component just receives a number when nothing was passed.
 *
 * A SCRIPT rule — oxlint's own `Program(node)` AST, correct positions, no dependency on oxc#20501.
 *
 * Semantics confirmed against eslint-plugin-vue:
 * - Array/Object defaults must be a factory function; `null` and `undefined` are accepted.
 * - Primitives may ALSO use a factory (`{ type: String, default: () => "s" }` is accepted).
 * - When the default IS a factory, its RETURNED expression is type-checked instead
 *   (`{ type: Array, default: () => ({}) }` is reported).
 * - A union `type: [String, Number]` is satisfied by a default matching ANY member.
 * - A prop with no `type`, or no `default`, is never reported.
 * - The report anchors on the default VALUE expression (or on the factory's returned expression).
 *
 * Deliberately conservative: any expression whose type cannot be determined statically — an
 * identifier, a call, a conditional — is treated as UNKNOWN and never reported. A prop default
 * pulled from a constant is extremely common and reporting it would be wrong, so this trades
 * completeness for zero false positives.
 */

const NATIVE_TYPES = new Set([
    "String",
    "Number",
    "Boolean",
    "Array",
    "Object",
    "Function",
    "Symbol",
    "BigInt",
    "Date",
]);
/** Types whose default MUST be produced by a factory, because the value would be shared. */
const REFERENCE_TYPES = new Set(["Array", "Object"]);

/** Declared prop types as a Set of native type names, or null when not statically known. */
function declaredTypes(typeNode) {
    if (!typeNode) {
        return null;
    }
    if (typeNode.type === "Identifier" && NATIVE_TYPES.has(typeNode.name)) {
        return new Set([typeNode.name]);
    }
    if (typeNode.type === "ArrayExpression") {
        const names = new Set();
        for (const element of typeNode.elements ?? []) {
            if (element?.type === "Identifier" && NATIVE_TYPES.has(element.name)) {
                names.add(element.name);
            } else {
                return null; // an unrecognised member makes the whole union unknown
            }
        }
        return names.size ? names : null;
    }
    return null;
}

/**
 * Strip `ParenthesizedExpression` wrappers. oxc-parser preserves them, so `() => ({})` has a
 * parenthesized body — and upstream anchors its report on the INNER expression, not the paren.
 */
function unwrap(node) {
    let current = node;
    while (current?.type === "ParenthesizedExpression") {
        current = current.expression;
    }
    return current;
}

/** The native type a value expression evaluates to, `"null"`, or null when unknown. */
function inferType(input) {
    const node = unwrap(input);
    if (!node) {
        return null;
    }
    switch (node.type) {
        case "ArrayExpression":
            return "Array";
        case "ObjectExpression":
            return "Object";
        case "TemplateLiteral":
            return "String";
        case "ArrowFunctionExpression":
        case "FunctionExpression":
            return "Function";
        case "Literal": {
            if (node.value === null) {
                return "null";
            }
            switch (typeof node.value) {
                case "string":
                    return "String";
                case "number":
                    return "Number";
                case "boolean":
                    return "Boolean";
                default:
                    return null;
            }
        }
        case "UnaryExpression":
            // `-1` is a number; `!x` a boolean. Only handle the unambiguous numeric case.
            return node.operator === "-" || node.operator === "+"
                ? inferType(node.argument)
                : null;
        case "Identifier":
            return node.name === "undefined" ? "null" : null;
        default:
            return null;
    }
}

/** The expression a concise/blocked arrow or function returns, or null when not determinable. */
function factoryReturn(input) {
    const node = unwrap(input);
    if (node.type === "ArrowFunctionExpression" && node.body?.type !== "BlockStatement") {
        return unwrap(node.body);
    }
    const body = node.body?.body;
    if (!Array.isArray(body) || body.length !== 1 || body[0].type !== "ReturnStatement") {
        return null;
    }
    return body[0].argument ? unwrap(body[0].argument) : null;
}

/** Every `defineProps({ … })` / `props: { … }` object in the program. */
function findPropsObjects(program) {
    const objects = [];
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
            node.callee.name === "defineProps" &&
            node.arguments?.[0]?.type === "ObjectExpression"
        ) {
            objects.push(node.arguments[0]);
        }
        if (
            node.type === "Property" &&
            (node.key?.name ?? node.key?.value) === "props" &&
            node.value?.type === "ObjectExpression"
        ) {
            objects.push(node.value);
        }
        for (const key of Object.keys(node)) {
            if (key === "parent" || key === "loc" || key === "range") {
                continue;
            }
            walk(node[key]);
        }
    };
    walk(program);
    return objects;
}

const ARTICLE_NAMES = {
    String: "a string",
    Number: "a number",
    Boolean: "a boolean",
    Array: "an array",
    Object: "an object",
    Function: "a function",
};

export default {
    meta: {
        type: "problem",
        docs: {
            description: "enforce props default values to be valid",
            recommended: true,
        },
        schema: [],
        messages: {
            mustBeFactory:
                "The default for the `{{name}}` prop is shared across every instance of this component. Use a factory: `default: () => …`.",
            typeMismatch:
                "The default for the `{{name}}` prop should be {{expected}} to match its declared type.",
        },
    },
    create(context) {
        return {
            Program(program) {
                for (const propsObject of findPropsObjects(program)) {
                    for (const prop of propsObject.properties ?? []) {
                        const name = prop.key?.name ?? prop.key?.value;
                        if (typeof name !== "string" || prop.value?.type !== "ObjectExpression") {
                            continue;
                        }
                        let typeNode = null;
                        let defaultNode = null;
                        for (const entry of prop.value.properties ?? []) {
                            const key = entry.key?.name ?? entry.key?.value;
                            if (key === "type") {
                                typeNode = entry.value;
                            } else if (key === "default") {
                                defaultNode = entry.value;
                            }
                        }
                        const expected = declaredTypes(typeNode);
                        if (!expected || !defaultNode) {
                            continue;
                        }

                        defaultNode = unwrap(defaultNode);
                        const defaultType = inferType(defaultNode);
                        // `null` / `undefined` defaults are always accepted.
                        if (defaultType === "null") {
                            continue;
                        }

                        // A factory: check what it RETURNS instead, unless Function is declared.
                        if (defaultType === "Function" && !expected.has("Function")) {
                            const returned = factoryReturn(defaultNode);
                            const returnedType = inferType(returned);
                            if (!returned || !returnedType || returnedType === "null") {
                                continue; // not statically determinable — stay quiet
                            }
                            if (!expected.has(returnedType)) {
                                context.report({
                                    node: returned,
                                    messageId: "typeMismatch",
                                    data: {
                                        name,
                                        expected: [...expected]
                                            .map((t) => ARTICLE_NAMES[t] ?? t)
                                            .join(" or "),
                                    },
                                });
                            }
                            continue;
                        }

                        // A bare reference-type default is shared between instances.
                        const needsFactory = [...expected].some((t) => REFERENCE_TYPES.has(t));
                        if (needsFactory && defaultType && REFERENCE_TYPES.has(defaultType)) {
                            context.report({
                                node: defaultNode,
                                messageId: "mustBeFactory",
                                data: { name },
                            });
                            continue;
                        }

                        if (!defaultType) {
                            continue; // unknown — never report
                        }
                        if (!expected.has(defaultType)) {
                            context.report({
                                node: defaultNode,
                                messageId: "typeMismatch",
                                data: {
                                    name,
                                    expected: [...expected]
                                        .map((t) => ARTICLE_NAMES[t] ?? t)
                                        .join(" or "),
                                },
                            });
                        }
                    }
                }
            },
        };
    },
};
