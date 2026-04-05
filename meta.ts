export type Metadata = { name: string; description: string; author: string; url: string };
export type NameStyle = "kebab" | "camel" | "pascal";

function normalizeName(name: string, style: NameStyle) {
  const parts = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (style === "camel") {
    return (
      parts[0]!.toLowerCase() +
      parts
        .slice(1)
        .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
        .join("")
    );
  }

  if (style === "pascal") {
    return parts.map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase()).join("");
  }

  return parts.map((part) => part.toLowerCase()).join("-");
}

export function getMetadata(file: string, style: NameStyle = "kebab", fallbackName = ""): Metadata {
  const metadata = file
    .split("\n")
    .filter((line) => line.trim().startsWith("//"))
    .slice(0, 4)
    .map((line) =>
      line
        .replace(/\/\/\s*/, "")
        .split(": ")
        .slice(1)
        .join(": "),
    );
  const result = Object.fromEntries(
    metadata.map((value, index) => {
      const keys: (keyof Metadata)[] = ["name", "description", "author", "url"];

      return [keys[index], value];
    }),
  ) as Metadata;
  result.name ||= fallbackName;
  result.description ||= "";
  result.author ||= "";
  result.url ||= "";
  result.name = normalizeName(result.name, style);
  return result;
}
