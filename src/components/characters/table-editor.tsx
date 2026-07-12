"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { TableColumnType, TableNodeData } from "@/domain/nodes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

type TableColumn = TableNodeData["columns"][number];
type TableRow = Record<string, unknown>;

export function TableEditor({ data }: { data?: Partial<TableNodeData> }) {
  const { t } = useI18n();
  const initialColumns = useMemo(() => normalizeColumns(data?.columns), [data?.columns]);
  const [columns, setColumns] = useState<TableColumn[]>(initialColumns);
  const [rows, setRows] = useState<TableRow[]>(() => normalizeRows(data?.rows, initialColumns));
  const serialized = useMemo(() => JSON.stringify({ columns, rows }), [columns, rows]);
  const columnTypes = useMemo<Array<{ value: TableColumnType; label: string }>>(() => [
    { value: "text", label: t("table.boolean.text") },
    { value: "number", label: t("table.boolean.number") },
    { value: "boolean", label: t("table.boolean.boolean") },
    { value: "bar", label: t("table.boolean.bar") },
  ], [t]);

  function addColumn() {
    const id = createColumnId(columns);
    setColumns((current) => [...current, { id, label: t("table.newColumn"), type: "text" }]);
    setRows((current) => current.map((row) => ({ ...row, [id]: "" })));
  }

  function updateColumn(id: string, patch: Partial<Pick<TableColumn, "label" | "type">>) {
    const nextColumns = columns.map((column) => column.id === id ? { ...column, ...patch } : column);
    setColumns(nextColumns);
    setRows((current) =>
      current.map((row) => {
        const column = nextColumns.find((item) => item.id === id);
        if (!column) return row;
        return { ...row, [id]: normalizeCell(row[id], column.type) };
      }),
    );
  }

  function removeColumn(id: string) {
    setColumns((current) => current.filter((column) => column.id !== id));
    setRows((current) =>
      current.map((row) => {
        const nextRow = { ...row };
        delete nextRow[id];
        return nextRow;
      }),
    );
  }

  function addRow() {
    setRows((current) => [...current, createEmptyRow(columns)]);
  }

  function updateCell(rowIndex: number, column: TableColumn, value: unknown) {
    setRows((current) =>
      current.map((row, index) => index === rowIndex ? { ...row, [column.id]: normalizeCell(value, column.type) } : row),
    );
  }

  function removeRow(rowIndex: number) {
    setRows((current) => current.filter((_, index) => index !== rowIndex));
  }

  return (
    <div className="space-y-4 rounded-md border bg-muted/20 p-3">
      <input type="hidden" name="tableData" value={serialized} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t("table.columnsTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("table.columnsHint")}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addColumn}>
          <Plus className="h-4 w-4" />
          {t("table.addColumn")}
        </Button>
      </div>

      {columns.length === 0 ? (
        <div className="rounded-md border border-dashed bg-background p-4 text-sm text-muted-foreground">
          {t("table.noColumns")}
        </div>
      ) : (
        <div className="space-y-2">
          {columns.map((column) => (
            <div key={column.id} className="grid gap-2 rounded-md border bg-background p-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
              <Input
                value={column.label}
                aria-label={t("table.columnName")}
                onChange={(event) => updateColumn(column.id, { label: event.target.value })}
              />
              <select
                value={column.type}
                aria-label={t("table.columnType")}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                onChange={(event) => updateColumn(column.id, { type: event.target.value as TableColumnType })}
              >
                {columnTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="justify-self-end text-destructive hover:bg-destructive/10"
                aria-label={t("table.deleteColumn", { name: column.label })}
                onClick={() => removeColumn(column.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t("table.rowsTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("table.rowsSummary", { rows: rows.length, columns: columns.length })}</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={columns.length === 0} onClick={addRow}>
          <Plus className="h-4 w-4" />
          {t("table.addRow")}
        </Button>
      </div>

      {columns.length > 0 && rows.length === 0 && (
        <div className="rounded-md border border-dashed bg-background p-4 text-sm text-muted-foreground">
          {t("table.noRows")}
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead className="bg-muted/60">
              <tr>
                {columns.map((column) => (
                  <th key={column.id} className="border-b px-2 py-2 text-left font-medium">{column.label || t("table.unnamed")}</th>
                ))}
                <th className="w-12 border-b px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t">
                  {columns.map((column) => (
                    <td key={column.id} className="min-w-36 px-2 py-2 align-top">
                      <TableCellEditor
                        column={column}
                        value={row[column.id]}
                        onChange={(value) => updateCell(rowIndex, column, value)}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-2 align-top">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10"
                      aria-label={t("table.deleteRow", { index: rowIndex + 1 })}
                      onClick={() => removeRow(rowIndex)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function TablePreview({ data, className }: { data: TableNodeData; className?: string }) {
  const { t } = useI18n();
  const columns = normalizeColumns(data.columns);
  const rows = normalizeRows(data.rows, columns);

  if (columns.length === 0) {
    return <div className={cn("rounded-md border border-dashed p-3 text-sm text-muted-foreground", className)}>{t("table.empty")}</div>;
  }

  return (
    <div className={cn("overflow-x-auto rounded-md border bg-background", className)}>
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead className="bg-muted/70">
          <tr>
            {columns.map((column) => <th key={column.id} className="border-b px-3 py-2 text-left font-medium">{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-4 text-muted-foreground" colSpan={columns.length}>{t("table.noRows")}</td>
            </tr>
          ) : rows.map((row, index) => (
            <tr key={index} className="border-t">
              {columns.map((column) => (
                <td key={column.id} className="px-3 py-2 align-top">{formatCell(row[column.id], column.type, t)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableCellEditor({ column, value, onChange }: { column: TableColumn; value: unknown; onChange: (value: unknown) => void }) {
  const { t } = useI18n();

  if (column.type === "boolean") {
    return (
      <label className="flex h-9 items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        {t("common.yes")}
      </label>
    );
  }

  if (column.type === "number") {
    return <Input type="number" step="any" value={toInputNumber(value)} onChange={(event) => onChange(event.target.value)} />;
  }

  if (column.type === "bar") {
    const bar = toBarValue(value);
    return (
      <div className="grid grid-cols-2 gap-2">
        <Input aria-label={`${column.label} ${t("node.current").toLowerCase()}`} type="number" step="any" value={toInputNumber(bar.current)} onChange={(event) => onChange({ ...bar, current: Number(event.target.value || 0) })} />
        <Input aria-label={`${column.label} ${t("node.maximum").toLowerCase()}`} type="number" step="any" value={toInputNumber(bar.max)} onChange={(event) => onChange({ ...bar, max: Number(event.target.value || 0) })} />
      </div>
    );
  }

  return <Input value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />;
}

function normalizeColumns(value: unknown): TableColumn[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const id = sanitizeColumnId(String(record.id ?? `col_${index + 1}`), seen);
    const label = String(record.label ?? id).trim() || id;
    const type = isColumnType(record.type) ? record.type : "text";
    seen.add(id);
    return [{ id, label, type }];
  });
}

function normalizeRows(value: unknown, columns: TableColumn[]): TableRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const source = row && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : {};
    const nextRow: TableRow = {};
    for (const column of columns) {
      nextRow[column.id] = normalizeCell(source[column.id], column.type);
    }
    return nextRow;
  });
}

function createEmptyRow(columns: TableColumn[]): TableRow {
  return Object.fromEntries(columns.map((column) => [column.id, normalizeCell(undefined, column.type)]));
}

function normalizeCell(value: unknown, type: TableColumnType): unknown {
  if (type === "boolean") return Boolean(value);
  if (type === "number") return toFiniteNumber(value, 0);
  if (type === "bar") return toBarValue(value);
  return String(value ?? "");
}

function formatCell(value: unknown, type: TableColumnType, t: ReturnType<typeof useI18n>["t"]) {
  if (type === "boolean") return Boolean(value) ? t("common.yes") : t("common.no");
  if (type === "number") return String(toFiniteNumber(value, 0));
  if (type === "bar") {
    const bar = toBarValue(value);
    return `${bar.current}/${bar.max}`;
  }
  return String(value ?? "");
}

function toBarValue(value: unknown): { current: number; max: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { current: 0, max: 0 };
  const record = value as Record<string, unknown>;
  return { current: toFiniteNumber(record.current, 0), max: toFiniteNumber(record.max, 0) };
}

function toFiniteNumber(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toInputNumber(value: unknown) {
  const number = toFiniteNumber(value, 0);
  return Number.isFinite(number) ? String(number) : "";
}

function isColumnType(value: unknown): value is TableColumnType {
  return value === "number" || value === "text" || value === "boolean" || value === "bar";
}

function createColumnId(columns: TableColumn[]) {
  const seen = new Set(columns.map((column) => column.id));
  let index = columns.length + 1;
  let id = `col_${index}`;
  while (seen.has(id)) {
    index += 1;
    id = `col_${index}`;
  }
  return id;
}

function sanitizeColumnId(raw: string, seen: Set<string>) {
  const base = raw.trim().replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "col";
  let id = base;
  let index = 2;
  while (seen.has(id)) {
    id = `${base}_${index}`;
    index += 1;
  }
  return id;
}
