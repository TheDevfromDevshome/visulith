/** Shared domain types used by graph documents, IR and backends. */

export type PrimitiveTypeName =
  | "core.bool"
  | "core.i32"
  | "core.f64"
  | "core.string"
  | "core.unit";

/** Structured type reference. Display strings are deliberately not used as type identity. */
export interface TypeRef {
  kind: "primitive" | "external" | "array" | "option";
  name: string;
}

export function primitive(name: PrimitiveTypeName): TypeRef {
  return { kind: "primitive", name };
}

export const TYPES = {
  bool: primitive("core.bool"),
  i32: primitive("core.i32"),
  f64: primitive("core.f64"),
  string: primitive("core.string"),
  unit: primitive("core.unit"),
} as const;

export function typesEqual(a: TypeRef, b: TypeRef): boolean {
  return a.kind === b.kind && a.name === b.name;
}
