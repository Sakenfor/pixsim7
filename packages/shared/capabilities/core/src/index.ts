/**
 * @pixsim7/shared.capabilities.core
 *
 * Core capability registries - pure TypeScript, no React/DOM dependencies.
 *
 * Modules:
 * - provider: ContextHub-style capability providers (priority + availability).
 * - app: App-facing capabilities (features/routes/actions/states).
 * - descriptor: Capability descriptor metadata registry.
 * - contract: Capability contract compatibility checks.
 * - bridge: App action/state key-generation helpers.
 */

export * from "./provider";
export * as Provider from "./provider";

export * from "./app";
export * as App from "./app";

export * from "./descriptor";
export * as Descriptor from "./descriptor";

export * from "./contract";
export * as Contract from "./contract";

export * from "./bridge";
export * as Bridge from "./bridge";
