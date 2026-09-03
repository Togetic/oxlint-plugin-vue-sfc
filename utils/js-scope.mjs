/**
 * Minimal lexical scope resolution for oxlint JS-plugin rules that work on the script AST.
 *
 * Why this exists: a name-only lookup is not good enough. The first cut of
 * vue-no-ref-as-operand collected ref names globally and flagged every matching identifier,
 * which produced 14 false positives on this repo — all the same shape:
 *
 *     const giveTicker = ref("");                        // module scope: a ref
 *     ...
 *     const giveTicker = parseMaybeArrayRouteParam(x);   // inner scope: NOT a ref
 *     if (giveTicker && !receiveTicker) { … }            // was wrongly reported
 *
 * So resolution has to respect shadowing. This is a deliberately small implementation — it
 * models block/function/catch/loop scopes and the declaration forms that appear in SFC scripts,
 * not the full ECMAScript scope algorithm.
 *
 * Known simplifications, all chosen to fail toward FALSE NEGATIVES rather than false positives:
 * - `var` is treated as block-scoped rather than function-scoped. A `var` ref declared inside a
 *   block is therefore invisible outside it: missed reports, never wrong ones.
 * - No hoisting. Declarations are visible from the point they are recorded onward within their
 *   scope, which matches `const`/`let` semantics (a use before declaration is a TDZ error) and
 *   under-reports for hoisted `var`/`function`.
 * - Destructuring binds its names but never marks them as refs, since `const { a } = ref(…)` is
 *   not a ref-valued binding.
 */

const SCOPE_NODES = new Set([
    "Program",
    "FunctionDeclaration",
    "FunctionExpression",
    "ArrowFunctionExpression",
    "BlockStatement",
    "StaticBlock",
    "ForStatement",
    "ForInStatement",
    "ForOfStatement",
    "CatchClause",
    "ClassDeclaration",
    "ClassExpression",
]);

/** Collect every name bound by a binding pattern into `sink`. */
function collectPatternNames(pattern, sink) {
    if (!pattern || typeof pattern !== "object") {
        return;
    }
    switch (pattern.type) {
        case "Identifier":
            sink(pattern.name);
            break;
        case "ObjectPattern":
            for (const property of pattern.properties ?? []) {
                collectPatternNames(property.value ?? property.argument, sink);
            }
            break;
        case "ArrayPattern":
            for (const element of pattern.elements ?? []) {
                collectPatternNames(element, sink);
            }
            break;
        case "AssignmentPattern":
            collectPatternNames(pattern.left, sink);
            break;
        case "RestElement":
            collectPatternNames(pattern.argument, sink);
            break;
        default:
            break;
    }
}

/**
 * Walk `program`, tracking lexical scopes, and report identifiers whose nearest binding
 * satisfies `isTracked`.
 *
 * @param program the Program node from oxlint's `Program(node)` visitor
 * @param isMarkedInit (init) => boolean — does this initializer make the binding "tracked"
 *        (for vue-no-ref-as-operand: is it a `ref()`/`computed()`/… call)
 * @param onNode (node, scopeLookup) => void — called for every AST node, with a
 *        `scopeLookup(name)` that returns `true` when the nearest binding of `name` is tracked,
 *        `false` when it is shadowed by an untracked one, and `undefined` when unbound.
 */
export function walkWithScopes(program, isMarkedInit, onNode) {
    /** Stack of Map<name, boolean /* tracked *\/>, innermost last. */
    const stack = [new Map()];

    const lookup = (name) => {
        for (let i = stack.length - 1; i >= 0; i -= 1) {
            const scope = stack[i];
            if (scope.has(name)) {
                return scope.get(name);
            }
        }
        return undefined;
    };

    const declare = (name, tracked) => {
        stack[stack.length - 1].set(name, tracked);
    };

    /** Record the bindings a node introduces INTO THE CURRENT scope, before descending. */
    const recordDeclarations = (node) => {
        switch (node.type) {
            case "VariableDeclarator": {
                if (node.id?.type === "Identifier") {
                    declare(node.id.name, Boolean(isMarkedInit(node.init)));
                } else {
                    collectPatternNames(node.id, (name) => declare(name, false));
                }
                break;
            }
            case "FunctionDeclaration":
            case "ClassDeclaration":
                if (node.id?.type === "Identifier") {
                    declare(node.id.name, false);
                }
                break;
            case "ImportDeclaration":
                for (const specifier of node.specifiers ?? []) {
                    if (specifier.local?.type === "Identifier") {
                        declare(specifier.local.name, false);
                    }
                }
                break;
            default:
                break;
        }
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

        const opensScope = SCOPE_NODES.has(node.type);
        if (opensScope) {
            stack.push(new Map());
            // Parameters and the catch binding belong to the scope the node opens.
            for (const param of node.params ?? []) {
                collectPatternNames(param, (name) => declare(name, false));
            }
            if (node.type === "CatchClause") {
                collectPatternNames(node.param, (name) => declare(name, false));
            }
        }

        recordDeclarations(node);
        onNode(node, lookup);

        for (const key of Object.keys(node)) {
            if (key === "parent" || key === "loc" || key === "range") {
                continue;
            }
            walk(node[key]);
        }

        if (opensScope) {
            stack.pop();
        }
    };

    walk(program);
}
