/**
 * @pixsim7/capabilities-core
 *
 * Core capability registries - pure TypeScript, no React/DOM dependencies.
 *
 * Modules:
 * - provider: ContextHub-style capability providers (priority + availability).
 * - app: App-facing capabilities (features/routes/actions/states).
 */

export * from "./provider";
export * as Provider from "./provider";

export * from "./app";
export * as App from "./app";
