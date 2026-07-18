"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type FormDraftValues = Record<string, string | string[] | boolean>;

const DRAFT_PREFIX = "role-engine:form-draft:";

export function useFormDraft({
  draftKey,
  formRef,
  enabled = true,
  onRestore,
}: {
  draftKey: string;
  formRef: RefObject<HTMLFormElement | null>;
  enabled?: boolean;
  onRestore?: (values: FormDraftValues) => void;
}) {
  const [restored, setRestored] = useState(false);
  const onRestoreRef = useRef(onRestore);
  const pausedRef = useRef(false);

  useEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);

  const saveDraft = useCallback(() => {
    if (!enabled || pausedRef.current || isPaused(draftKey) || typeof window === "undefined") return;
    const form = formRef.current;
    if (!form) return;
    window.localStorage.setItem(storageKey(draftKey), JSON.stringify(serializeForm(form)));
  }, [draftKey, enabled, formRef]);

  const clearDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(storageKey(draftKey));
    window.sessionStorage.setItem(pauseKey(draftKey), "1");
    pausedRef.current = true;
    setRestored(false);
  }, [draftKey]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const raw = window.localStorage.getItem(storageKey(draftKey));
    if (!raw) {
      setRestored(false);
      return;
    }
    const parsed = parseDraft(raw);
    if (!parsed) {
      window.localStorage.removeItem(storageKey(draftKey));
      setRestored(false);
      return;
    }
    onRestoreRef.current?.(parsed);
    window.setTimeout(() => {
      const form = formRef.current;
      if (!form) return;
      restoreForm(form, parsed);
      setRestored(true);
    }, 0);
  }, [draftKey, enabled, formRef]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const interval = window.setInterval(saveDraft, 1000);
    return () => window.clearInterval(interval);
  }, [enabled, saveDraft]);

  return {
    restored,
    saveDraft,
    clearDraft,
    formDraftProps: {
      onInputCapture: () => {
        pausedRef.current = false;
        unpauseDraft(draftKey);
        saveDraft();
      },
      onChangeCapture: () => {
        pausedRef.current = false;
        unpauseDraft(draftKey);
        saveDraft();
      },
    },
  };
}

export function clearFormDraft(draftKey: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(draftKey));
  window.sessionStorage.setItem(pauseKey(draftKey), "1");
}

export function stringDraftValue(values: FormDraftValues, name: string) {
  const value = values[name];
  return typeof value === "string" ? value : "";
}

function serializeForm(form: HTMLFormElement): FormDraftValues {
  const values: FormDraftValues = {};
  const elements = Array.from(form.elements);
  for (const element of elements) {
    if (!isNamedControl(element) || element.disabled) continue;
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      values[element.name] = element.checked;
      continue;
    }
    if (element instanceof HTMLInputElement && element.type === "radio") {
      if (element.checked) values[element.name] = element.value;
      continue;
    }
    if (element instanceof HTMLSelectElement && element.multiple) {
      values[element.name] = Array.from(element.selectedOptions).map((option) => option.value);
      continue;
    }
    values[element.name] = element.value;
  }
  return values;
}

function restoreForm(form: HTMLFormElement, values: FormDraftValues) {
  const elements = Array.from(form.elements);
  for (const element of elements) {
    if (!isNamedControl(element) || !(element.name in values)) continue;
    const value = values[element.name];
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      element.checked = Boolean(value);
      dispatchRestoreEvents(element);
      continue;
    }
    if (element instanceof HTMLInputElement && element.type === "radio") {
      element.checked = value === element.value;
      dispatchRestoreEvents(element);
      continue;
    }
    if (element instanceof HTMLSelectElement && element.multiple && Array.isArray(value)) {
      for (const option of Array.from(element.options)) option.selected = value.includes(option.value);
      dispatchRestoreEvents(element);
      continue;
    }
    if (typeof value === "string") {
      element.value = value;
      dispatchRestoreEvents(element);
    }
  }
}

function dispatchRestoreEvents(element: HTMLElement) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function parseDraft(raw: string): FormDraftValues | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as FormDraftValues;
  } catch {
    return null;
  }
}

function isNamedControl(element: Element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) && Boolean(element.name);
}

function storageKey(draftKey: string) {
  return `${DRAFT_PREFIX}${draftKey}`;
}

function pauseKey(draftKey: string) {
  return `${DRAFT_PREFIX}paused:${draftKey}`;
}

function isPaused(draftKey: string) {
  return typeof window !== "undefined" && window.sessionStorage.getItem(pauseKey(draftKey)) === "1";
}

function unpauseDraft(draftKey: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(pauseKey(draftKey));
}
