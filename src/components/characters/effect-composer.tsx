"use client";

import { useState } from "react";
import type { CharacterNodeModel } from "@/domain/nodes";
import type { TemplateSlotModel } from "@/domain/template-slots";
import { NumericEffectBuilder } from "@/components/characters/numeric-effect-builder";
import { StructuralEffectBuilder } from "@/components/characters/structural-effect-builder";
import { TriggeredEffectBuilder } from "@/components/characters/triggered-effect-builder";
import { useI18n } from "@/i18n/client";

type EffectComposerProps =
  | { characterId: string; templateId?: never; nodes: CharacterNodeModel[]; slots?: never }
  | { templateId: string; characterId?: never; nodes: CharacterNodeModel[]; slots?: TemplateSlotModel[] };

type EffectComposerMode = "numeric" | "structural" | "triggered";

const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";

export function EffectComposer({ characterId, templateId, nodes, slots = [] }: EffectComposerProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<EffectComposerMode>("numeric");

  return (
    <div className="space-y-4">
      <label className="block space-y-2 text-sm font-medium">
        <span>{t("effect.type")}</span>
        <select value={mode} onChange={(event) => setMode(event.target.value as EffectComposerMode)} className={selectClass}>
          <option value="numeric">{t("character.numericEffects")}</option>
          <option value="structural">{t("character.structuralEffects")}</option>
          <option value="triggered">{t("character.triggeredEffects")}</option>
        </select>
      </label>
      {characterId && mode === "numeric" && <NumericEffectBuilder key="character-numeric" characterId={characterId} nodes={nodes} />}
      {characterId && mode === "structural" && <StructuralEffectBuilder key="character-structural" characterId={characterId} nodes={nodes} />}
      {characterId && mode === "triggered" && <TriggeredEffectBuilder key="character-triggered" characterId={characterId} nodes={nodes} />}
      {templateId && mode === "numeric" && <NumericEffectBuilder key="template-numeric" templateId={templateId} nodes={nodes} slots={slots} />}
      {templateId && mode === "structural" && <StructuralEffectBuilder key="template-structural" templateId={templateId} nodes={nodes} slots={slots} />}
      {templateId && mode === "triggered" && <TriggeredEffectBuilder key="template-triggered" templateId={templateId} nodes={nodes} slots={slots} />}
    </div>
  );
}
