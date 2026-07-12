"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, X } from "lucide-react";
import { NODE_ICON_NAMES, type CharacterNodeModel, type NodeData, type NodeIconName, type NodeType } from "@/domain/nodes";
import { useCharacterUiStore } from "@/store/character-ui-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableEditor } from "@/components/characters/table-editor";
import { NodeIconPicker } from "@/components/characters/node-icons";
import { useI18n } from "@/i18n/client";

const nodeTypes: NodeType[] = ["NUMBER", "BAR", "TEXT", "TABLE", "CONTAINER", "GROUP"];

export function NodeEditor({ characterId, templateId, nodes }: { characterId?: string; templateId?: string; nodes: CharacterNodeModel[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const selectedNodeId = useCharacterUiStore((state) => state.selectedNodeId);
  const selectNode = useCharacterUiStore((state) => state.selectNode);
  const mode = useCharacterUiStore((state) => state.editorMode);
  const setEditorMode = useCharacterUiStore((state) => state.setEditorMode);
  const selected = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formRevision, setFormRevision] = useState(0);
  const apiBase = characterId
    ? `/api/characters/${characterId}/nodes`
    : `/api/templates/${templateId}/nodes`;

  function cancel() {
    setEditorMode("add");
    selectNode(null);
    setError(null);
    setFormRevision((value) => value + 1);
  }

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    const type = String(formData.get("type")) as NodeType;
    const payload = { name: String(formData.get("name")), data: readNodeData(type, formData) };
    const editing = mode === "edit" && selected;
    const response = await fetch(
      editing ? `${apiBase}/${selected.id}` : apiBase,
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? payload : { ...payload, type, parentId: formData.get("parentId") || null })
      }
    );
    setPending(false);
    if (!response.ok) {
      setError(t("node.saveFailed"));
      return;
    }
    cancel();
    router.refresh();
  }

  async function remove() {
    if (!selected || !window.confirm(t("node.deleteConfirm", { name: selected.name }))) return;
    setPending(true);
    const response = await fetch(`${apiBase}/${selected.id}`, { method: "DELETE" });
    setPending(false);
    if (!response.ok) {
      setError(t("node.deleteFailed"));
      return;
    }
    cancel();
    router.refresh();
  }

  const active = mode === "edit" ? selected : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">{active ? t("node.editing") : t("node.new")}</h3>
        <Button size="sm" variant="outline" onClick={cancel}><Plus className="h-4 w-4" />{t("node.new")}</Button>
      </div>
      <NodeForm
        key={`${mode}-${active?.id ?? "new"}-${formRevision}`}
        nodes={nodes}
        active={active}
        selectedParentId={mode === "add" ? selected?.id : null}
        pending={pending}
        error={error}
        submit={submit}
        cancel={cancel}
        remove={active ? remove : undefined}
      />
    </div>
  );
}

function NodeForm({ nodes, active, selectedParentId, pending, error, submit, cancel, remove }: {
  nodes: CharacterNodeModel[];
  active: CharacterNodeModel | null;
  selectedParentId: string | null | undefined;
  pending: boolean;
  error: string | null;
  submit: (data: FormData) => void;
  cancel: () => void;
  remove?: () => void;
}) {
  const { t } = useI18n();
  const initialType = active?.type ?? "NUMBER";
  const [type, setType] = useState<NodeType>(initialType);

  useEffect(() => {
    setType(initialType);
  }, [initialType]);

  return (
    <form action={submit} className="space-y-4">
      <FormField label={t("common.name")} name="name" required defaultValue={active?.name} />
      {!active && (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="parentId">{t("node.parent")}</label>
          <select id="parentId" name="parentId" defaultValue={selectedParentId ?? ""} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">{t("common.rootCharacter")}</option>
            {nodes.map((node) => <option key={node.id} value={node.id}>{getNodeBreadcrumb(node, nodes)}</option>)}
          </select>
        </div>
      )}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="node-type">{t("common.type")}</label>
        {active && <input type="hidden" name="type" value={type} />}
        <select id="node-type" name={active ? undefined : "type"} disabled={Boolean(active)} value={type} onChange={(event) => setType(event.target.value as NodeType)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
          {nodeTypes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="description">{t("common.description")}</label>
        <textarea id="description" name="description" defaultValue={active?.data.description ?? ""} placeholder={t("node.shortDescription")} className="min-h-20 w-full resize-y rounded-md border border-input bg-background p-3 text-sm" />
      </div>
      <NodeIconPicker key={`icon-${type}-${active?.id ?? "new"}`} type={type} defaultValue={active?.data.icon} />
      <DataFields key={`data-${type}-${active?.id ?? "new"}`} type={type} data={active?.type === type ? active.data : undefined} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex w-full flex-wrap gap-2">
        <Button type="submit" disabled={pending}><Save className="h-4 w-4" />{pending ? t("common.saving") : t("common.save")}</Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={cancel}><X className="h-4 w-4" />{t("common.cancel")}</Button>
        {remove && <Button type="button" variant="outline" className="ml-auto border-destructive/40 text-destructive hover:bg-destructive/10" disabled={pending} onClick={remove}><Trash2 className="h-4 w-4" />{t("common.delete")}</Button>}
      </div>
    </form>
  );
}

function DataFields({ type, data }: { type: NodeType; data?: NodeData }) {
  const { t } = useI18n();
  const value = data as Record<string, unknown> | undefined;
  if (type === "NUMBER") return <><NumberField name="value" label={t("common.value")} value={value?.value ?? 0} /><div className="grid grid-cols-2 gap-3"><NumberField name="min" label={t("node.minimum")} value={value?.min ?? ""} /><NumberField name="max" label={t("node.maximum")} value={value?.max ?? ""} /></div><label className="flex items-center gap-2 text-sm"><input name="allowNegative" type="checkbox" defaultChecked={Boolean(value?.allowNegative)} />{t("node.allowNegative")}</label></>;
  if (type === "BAR") return <div className="grid grid-cols-3 gap-3"><NumberField name="current" label={t("node.current")} value={value?.current ?? 0} /><NumberField name="min" label={t("node.minimum")} value={value?.min ?? ""} /><NumberField name="max" label={t("node.maximum")} value={value?.max ?? 10} /></div>;
  if (type === "TEXT") return <div className="space-y-2"><label className="text-sm font-medium" htmlFor="text">{t("node.text")}</label><textarea id="text" name="text" defaultValue={String(value?.text ?? "")} className="min-h-32 w-full resize-y rounded-md border border-input bg-background p-3 text-sm" /></div>;
  if (type === "TABLE") return <TableEditor data={value} />;
  if (type === "CONTAINER") return <label className="flex items-center gap-2 text-sm"><input name="collapsedByDefault" type="checkbox" defaultChecked={Boolean(value?.collapsedByDefault)} />{t("node.collapsedDefault")}</label>;
  return <FormField label={t("node.groupColor")} name="color" defaultValue={String(value?.color ?? "teal")} />;
}

function FormField({ label, ...props }: React.ComponentProps<typeof Input> & { label: string }) {
  return <div className="space-y-2"><label className="text-sm font-medium" htmlFor={props.name}>{label}</label><Input id={props.name} {...props} /></div>;
}

function NumberField({ name, label, value }: { name: string; label: string; value: unknown }) {
  return <FormField name={name} label={label} type="number" step="any" defaultValue={String(value)} />;
}

function readNodeData(type: NodeType, form: FormData): NodeData {
  const number = (name: string, fallback: number | null = 0) => {
    const raw = String(form.get(name) ?? "");
    return raw === "" ? fallback : Number(raw);
  };
  const description = String(form.get("description") ?? "").trim() || undefined;
  const icon = readIcon(form.get("icon"));
  if (type === "NUMBER") return { description, icon, value: number("value") ?? 0, min: number("min", null), max: number("max", null), allowNegative: form.get("allowNegative") === "on" };
  if (type === "BAR") return { description, icon, current: number("current") ?? 0, min: number("min", null), max: number("max") ?? 0 };
  if (type === "TEXT") return { description, icon, text: String(form.get("text") ?? "") };
  if (type === "TABLE") {
    const parsed = readTableData(String(form.get("tableData") ?? ""));
    return { description, icon, columns: parsed.columns, rows: parsed.rows };
  }
  if (type === "CONTAINER") return { description, icon, collapsedByDefault: form.get("collapsedByDefault") === "on" };
  return { description, icon, color: String(form.get("color") ?? "teal") };
}

function readIcon(value: FormDataEntryValue | null): NodeIconName | undefined {
  const icon = String(value ?? "");
  return (NODE_ICON_NAMES as readonly string[]).includes(icon) ? icon as NodeIconName : undefined;
}

function readTableData(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { columns: [], rows: [] };
    const record = parsed as Record<string, unknown>;
    return {
      columns: Array.isArray(record.columns) ? record.columns : [],
      rows: Array.isArray(record.rows) ? record.rows : [],
    };
  } catch {
    return { columns: [], rows: [] };
  }
}

function getNodeBreadcrumb(node: CharacterNodeModel, nodes: CharacterNodeModel[]) {
  const names = [node.name];
  let parentId = node.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodes.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(" / ");
}
