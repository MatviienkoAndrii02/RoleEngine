export const TEMPLATE_TAG_COLOR_NAMES = [
  "gray-soft",
  "gray-solid",
  "gray-deep",
  "red-soft",
  "red-solid",
  "red-deep",
  "orange-soft",
  "orange-solid",
  "orange-deep",
  "yellow-soft",
  "yellow-solid",
  "yellow-deep",
  "green-soft",
  "green-solid",
  "green-deep",
  "teal-soft",
  "teal-solid",
  "teal-deep",
  "blue-soft",
  "blue-solid",
  "blue-deep",
  "violet-soft",
  "violet-solid",
  "violet-deep",
  "pink-soft",
  "pink-solid",
  "pink-deep",
] as const;

export type TemplateTagColorName = (typeof TEMPLATE_TAG_COLOR_NAMES)[number];

export type TemplateTagModel = {
  id: string;
  name: string;
  color: TemplateTagColorName;
};

export function parseTemplateTagColor(value: string | null | undefined): TemplateTagColorName {
  return TEMPLATE_TAG_COLOR_NAMES.includes(value as TemplateTagColorName) ? value as TemplateTagColorName : "gray-soft";
}

export function templateTagColorClass(color: string | null | undefined) {
  const parsed = parseTemplateTagColor(color);
  return tagColorClasses[parsed];
}

export function templateTagColorLineClass(color: string | null | undefined) {
  const parsed = parseTemplateTagColor(color);
  return tagLineColorClasses[parsed];
}

const tagColorClasses: Record<TemplateTagColorName, string> = {
  "gray-soft": "border-slate-200 bg-slate-100 text-slate-900",
  "gray-solid": "border-slate-400 bg-slate-500 text-white",
  "gray-deep": "border-slate-700 bg-slate-900 text-white",
  "red-soft": "border-red-200 bg-red-100 text-red-950",
  "red-solid": "border-red-500 bg-red-600 text-white",
  "red-deep": "border-red-800 bg-red-950 text-white",
  "orange-soft": "border-orange-200 bg-orange-100 text-orange-950",
  "orange-solid": "border-orange-500 bg-orange-600 text-white",
  "orange-deep": "border-orange-800 bg-orange-950 text-white",
  "yellow-soft": "border-yellow-200 bg-yellow-100 text-yellow-950",
  "yellow-solid": "border-yellow-500 bg-yellow-500 text-yellow-950",
  "yellow-deep": "border-yellow-800 bg-yellow-900 text-white",
  "green-soft": "border-green-200 bg-green-100 text-green-950",
  "green-solid": "border-green-500 bg-green-600 text-white",
  "green-deep": "border-green-800 bg-green-950 text-white",
  "teal-soft": "border-teal-200 bg-teal-100 text-teal-950",
  "teal-solid": "border-teal-500 bg-teal-600 text-white",
  "teal-deep": "border-teal-800 bg-teal-950 text-white",
  "blue-soft": "border-blue-200 bg-blue-100 text-blue-950",
  "blue-solid": "border-blue-500 bg-blue-600 text-white",
  "blue-deep": "border-blue-800 bg-blue-950 text-white",
  "violet-soft": "border-violet-200 bg-violet-100 text-violet-950",
  "violet-solid": "border-violet-500 bg-violet-600 text-white",
  "violet-deep": "border-violet-800 bg-violet-950 text-white",
  "pink-soft": "border-pink-200 bg-pink-100 text-pink-950",
  "pink-solid": "border-pink-500 bg-pink-600 text-white",
  "pink-deep": "border-pink-800 bg-pink-950 text-white",
};

const tagLineColorClasses: Record<TemplateTagColorName, string> = {
  "gray-soft": "bg-slate-300",
  "gray-solid": "bg-slate-500",
  "gray-deep": "bg-slate-900",
  "red-soft": "bg-red-300",
  "red-solid": "bg-red-600",
  "red-deep": "bg-red-950",
  "orange-soft": "bg-orange-300",
  "orange-solid": "bg-orange-600",
  "orange-deep": "bg-orange-950",
  "yellow-soft": "bg-yellow-300",
  "yellow-solid": "bg-yellow-500",
  "yellow-deep": "bg-yellow-900",
  "green-soft": "bg-green-300",
  "green-solid": "bg-green-600",
  "green-deep": "bg-green-950",
  "teal-soft": "bg-teal-300",
  "teal-solid": "bg-teal-600",
  "teal-deep": "bg-teal-950",
  "blue-soft": "bg-blue-300",
  "blue-solid": "bg-blue-600",
  "blue-deep": "bg-blue-950",
  "violet-soft": "bg-violet-300",
  "violet-solid": "bg-violet-600",
  "violet-deep": "bg-violet-950",
  "pink-soft": "bg-pink-300",
  "pink-solid": "bg-pink-600",
  "pink-deep": "bg-pink-950",
};
