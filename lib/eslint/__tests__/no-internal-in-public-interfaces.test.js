// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { createRequire } from "node:module";

import { RuleTester } from "eslint";
import { describe, test } from "vitest";

import rule from "../no-internal-in-public-interfaces";

const require = createRequire(import.meta.url);

// A public component interface file (the contract applies here).
const PUBLIC = "./src/foo/interfaces.ts";
const PUBLIC_TSX = "./src/foo/interfaces.tsx";
// Locations where internal types legitimately live (the rule must be a no-op).
const INTERNAL_INTERFACES = "./src/foo/internal-interfaces.ts";
const INTERNAL_DIR_INDEX = "./src/internal/interfaces.ts";
const NESTED_INTERFACES = "./src/internal/components/foo/interfaces.ts";
const NON_INTERFACE = "./src/foo/internal.tsx";

const runRule = testCase =>
  new RuleTester({
    parser: require.resolve("@typescript-eslint/parser"),
    parserOptions: { ecmaVersion: 2020, sourceType: "module", ecmaFeatures: { jsx: true } },
  }).run("no-internal-in-public-interfaces", rule, { valid: [], invalid: [], ...testCase });

describe("no-internal-in-public-interfaces", () => {
  test("valid", () =>
    runRule({
      valid: [
        // Public types declared in a public interface file are fine.
        { code: "export interface FooProps { id: string; }", filename: PUBLIC },
        { code: 'export type Variant = "a" | "b";', filename: PUBLIC_TSX },
        // Allowed sources: another component's interfaces, src/types, and external packages.
        { code: "import { BarProps } from '../bar/interfaces';\nexport interface FooProps extends BarProps {}", filename: PUBLIC },
        { code: "import { BaseComponentProps } from '../types/base-component';\nexport interface FooProps extends BaseComponentProps {}", filename: PUBLIC },
        { code: "import React from 'react';\nexport interface FooProps { node: React.ReactNode; }", filename: PUBLIC },
        { code: "import { PortalProps } from '@cloudscape-design/component-toolkit/internal';\nexport interface FooProps { p: PortalProps; }", filename: PUBLIC },
        { code: "export { BarProps } from '../bar/interfaces';", filename: PUBLIC },
        { code: "export type { Breakpoint } from '../types/breakpoint';", filename: PUBLIC },
        // Aliasing a public imported type to a local Internal* name is fine (the declared name is public).
        {
          code: "import { Breakpoint as InternalBreakpoint } from '../types/breakpoint';\nexport type Breakpoint = InternalBreakpoint;",
          filename: PUBLIC,
        },
        // The rule is a no-op outside public interface files.
        {
          code: "import { InternalBaseComponentProps } from '../internal/base-component';\nimport { ItemProps } from './internal-interfaces';\nexport interface InternalFooProps extends InternalBaseComponentProps {}",
          filename: INTERNAL_INTERFACES,
        },
        { code: "import { x } from './helper';\nexport interface InternalThing { x: typeof x; }", filename: INTERNAL_DIR_INDEX },
        { code: "import { x } from './helper';\nexport interface InternalNested { x: typeof x; }", filename: NESTED_INTERFACES },
        { code: "import { x } from './ace-modes';\nexport type Y = typeof x;", filename: NON_INTERFACE },
        // Respects a custom publicInterfacesPattern: a file not matching the pattern is ignored.
        {
          code: "import { InternalThing } from '../internal/types';\nexport type X = InternalThing;",
          filename: PUBLIC,
          options: [{ publicInterfacesPattern: "./widgets/*/interfaces.{ts,tsx}" }],
        },
      ],
    }));

  test("invalid", () =>
    runRule({
      invalid: [
        // Declaring an internal-named type in a public interface file.
        {
          code: "export interface InternalFooProps { id: string; }",
          filename: PUBLIC,
          errors: [{ messageId: "internalDeclaration", data: { name: "InternalFooProps" } }],
        },
        {
          code: "interface InternalHelper { x: number; }\nexport interface FooProps { h: InternalHelper; }",
          filename: PUBLIC,
          errors: [{ messageId: "internalDeclaration", data: { name: "InternalHelper" } }],
        },
        // Importing from a sibling internal-interfaces module.
        {
          code: "import { ItemProps } from './internal-interfaces';\nexport interface FooProps { item: ItemProps; }",
          filename: PUBLIC,
          errors: [{ messageId: "disallowedImport", data: { source: "./internal-interfaces" } }],
        },
        {
          code: "import { InternalToken } from '../property-filter/internal-interfaces';\nexport type X = InternalToken;",
          filename: PUBLIC,
          errors: [{ messageId: "disallowedImport", data: { source: "../property-filter/internal-interfaces" } }],
        },
        // Importing from src/internal.
        {
          code: "import { SomeRequired } from '../internal/types';\nexport type X = SomeRequired;",
          filename: PUBLIC,
          errors: [{ messageId: "disallowedImport", data: { source: "../internal/types" } }],
        },
        // Importing a type from a non-interface implementation file in another component.
        {
          code: "import { BaseCheckboxProps } from '../checkbox/base-checkbox';\nexport interface FooProps extends BaseCheckboxProps {}",
          filename: PUBLIC,
          errors: [{ messageId: "disallowedImport", data: { source: "../checkbox/base-checkbox" } }],
        },
        // Importing a type from a non-interface file in the same component.
        {
          code: "import { AceModes } from './ace-modes';\nexport type X = typeof AceModes;",
          filename: PUBLIC,
          errors: [{ messageId: "disallowedImport", data: { source: "./ace-modes" } }],
        },
        // Re-exporting from a disallowed source.
        {
          code: "export { InternalToken } from './internal-interfaces';",
          filename: PUBLIC,
          errors: [{ messageId: "disallowedReexport", data: { source: "./internal-interfaces" } }],
        },
        {
          code: "export * from '../internal/types';",
          filename: PUBLIC,
          errors: [{ messageId: "disallowedReexport", data: { source: "../internal/types" } }],
        },
        // Re-exporting a binding under an internal name.
        {
          code: "import { Foo } from '../bar/interfaces';\nexport { Foo as InternalFoo };",
          filename: PUBLIC,
          errors: [{ messageId: "internalReexportName", data: { name: "InternalFoo" } }],
        },
        // A custom publicInterfacesPattern makes an otherwise-ignored path a public interface.
        {
          code: "import { InternalThing } from '../internal/types';\nexport type X = InternalThing;",
          filename: "./widgets/foo/interfaces.ts",
          options: [{ publicInterfacesPattern: "./widgets/*/interfaces.{ts,tsx}" }],
          errors: [{ messageId: "disallowedImport", data: { source: "../internal/types" } }],
        },
      ],
    }));
});
