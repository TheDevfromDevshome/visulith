import type { SourceRef } from "../diagnostics.js";
import { TYPES, type TypeRef } from "../types.js";

export const IR_VERSION = "0.1";

/** Provenance kept on IR elements. Canvas coordinates never enter semantic IR. */
export type SourceOrigin = SourceRef;

export interface SourceMapping {
  /** 1-based line in generated output. */
  generatedLine: number;
  /** 1-based column in generated output. */
  generatedColumn: number;
  origin: SourceOrigin;
}

export interface IrModule {
  irVersion: string;
  id: string;
  functions: IrFunction[];
}

export interface IrParameter {
  id: string;
  type: TypeRef;
}

export interface IrFunction {
  id: string;
  parameters: IrParameter[];
  returnType: TypeRef;
  body: IrStatement[];
  origin: SourceOrigin;
}

export type IrStatement =
  | IrCallStatement
  | IrVariableDeclaration
  | IrConditional
  | IrLoop
  | IrReturnStatement;

export interface IrCallStatement {
  kind: "call";
  target: string;
  arguments: IrExpression[];
  origin: SourceOrigin;
}

export interface IrVariableDeclaration {
  kind: "variable";
  name: string;
  value: IrExpression;
  origin: SourceOrigin;
}

export interface IrConditional {
  kind: "conditional";
  condition: IrExpression;
  thenBody: IrStatement[];
  elseBody: IrStatement[];
  origin: SourceOrigin;
}

export interface IrLoop {
  kind: "loop";
  count: IrExpression;
  body: IrStatement[];
  origin: SourceOrigin;
}

export interface IrReturnStatement {
  kind: "return";
  value?: IrExpression;
  origin: SourceOrigin;
}

export type IrExpression =
  | IrStringLiteral
  | IrIntegerLiteral
  | IrFloatLiteral
  | IrBooleanLiteral
  | IrVariableReference
  | IrBinaryExpression;

export interface IrStringLiteral {
  kind: "string";
  value: string;
}

export interface IrIntegerLiteral {
  kind: "integer";
  value: number;
}

export interface IrFloatLiteral {
  kind: "float";
  value: number;
}

export interface IrBooleanLiteral {
  kind: "boolean";
  value: boolean;
}

export interface IrVariableReference {
  kind: "variable";
  name: string;
}

export type IrBinaryOperator = "===" | "!==";

export interface IrBinaryExpression {
  kind: "binary";
  operator: IrBinaryOperator;
  left: IrExpression;
  right: IrExpression;
}

export function unitType(): TypeRef {
  return TYPES.unit;
}
