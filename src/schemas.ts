import type { DMMF } from "@prisma/generator-helper";
import fs from "fs/promises";
import path from "path";
import type { EffectMajor } from "./effect-major";

// One `Schema.X` expression per Prisma scalar type, validating what the
// Prisma client returns at runtime (Date instances, bigint, Uint8Array,
// Prisma.Decimal) — the decode side, not a wire format. v3 needs the
// `*FromSelf` variants; v4's plain schemas already accept the instances.
function schemaForScalar(type: string, major: EffectMajor): string {
  switch (type) {
    case "String":
      return "Schema.String";
    case "Boolean":
      return "Schema.Boolean";
    case "Int":
      return "Schema.Int";
    case "Float":
      return "Schema.Number";
    case "DateTime":
      return major === 3 ? "Schema.DateFromSelf" : "Schema.Date";
    case "BigInt":
      return major === 3 ? "Schema.BigIntFromSelf" : "Schema.BigInt";
    case "Bytes":
      return major === 3 ? "Schema.Uint8ArrayFromSelf" : "Schema.Uint8Array";
    case "Json":
      return "Schema.Unknown";
    case "Decimal":
      return "Schema.instanceOf(Prisma.Decimal)";
    default:
      throw new Error(
        `effect-prisma-generator: unknown Prisma scalar type "${type}"`,
      );
  }
}

// The schema expression for one model field, or undefined for fields that
// have no row representation: relations (query-shaped, `include`-dependent —
// consumers compose them) and `Unsupported(...)` columns.
function schemaForField(
  field: DMMF.Field,
  major: EffectMajor,
): string | undefined {
  if (field.kind === "object" || field.kind === "unsupported") {
    return undefined;
  }
  // Enum fields reference the enum schema emitted above the structs.
  const inner =
    field.kind === "enum" ? field.type : schemaForScalar(field.type, major);
  // Prisma list fields are never nullable, so list and NullOr don't stack.
  if (field.isList) {
    return `Schema.Array(${inner})`;
  }
  return field.isRequired ? inner : `Schema.NullOr(${inner})`;
}

function schemaForEnum(e: DMMF.DatamodelEnum, major: EffectMajor): string {
  const values = e.values.map((v) => JSON.stringify(v.name));
  const literal =
    major === 3
      ? `Schema.Literal(${values.join(", ")})`
      : `Schema.Literals([${values.join(", ")}])`;
  return `export const ${e.name} = ${literal}\nexport type ${e.name} = typeof ${e.name}.Type\n`;
}

// `clientImportPath` is documented relative to the `output` file. When the
// schemas file lives in a different directory, a relative specifier must be
// re-based onto it; bare specifiers ("@prisma/client") pass through.
export function rebaseImportPath(
  importPath: string,
  fromDir: string,
  toDir: string,
): string {
  if (!importPath.startsWith(".")) {
    return importPath;
  }
  const resolved = path.resolve(fromDir, importPath);
  const rebased = path.relative(toDir, resolved).split(path.sep).join("/");
  return rebased.startsWith(".") ? rebased : `./${rebased}`;
}

// Emits one `<Model>Row` struct per model (scalar + enum fields only) and one
// schema per datamodel enum, named verbatim. Enums come first so structs can
// reference them by name.
export async function generateSchemas(
  models: DMMF.Model[],
  enums: DMMF.DatamodelEnum[],
  schemaOutputPath: string,
  clientImportPath: string,
  major: EffectMajor,
  header: string,
) {
  const enumSchemas = enums.map((e) => schemaForEnum(e, major));

  const modelSchemas = models.map((model) => {
    const fields = model.fields
      .map((field) => {
        const schema = schemaForField(field, major);
        return schema === undefined ? undefined : `  ${field.name}: ${schema},`;
      })
      .filter((line) => line !== undefined);
    const rowName = `${model.name}Row`;
    return `export const ${rowName} = Schema.Struct({\n${fields.join("\n")}\n})\nexport type ${rowName} = typeof ${rowName}.Type\n`;
  });

  const hasDecimal = models.some((model) =>
    model.fields.some(
      (field) => field.kind === "scalar" && field.type === "Decimal",
    ),
  );
  const prismaImport = hasDecimal
    ? `\nimport { Prisma } from "${clientImportPath}"`
    : "";

  const content = `${header}
import { Schema } from "effect"${prismaImport}

${[...enumSchemas, ...modelSchemas].join("\n")}`;

  await fs.mkdir(path.dirname(schemaOutputPath), { recursive: true });
  await fs.writeFile(schemaOutputPath, content);
}
