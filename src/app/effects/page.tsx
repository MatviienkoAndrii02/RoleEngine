import { GitBranch, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requirePageGM } from "@/server/page-auth";
import { getTranslator } from "@/i18n/server";

export default async function EffectsPage() {
  await requirePageGM("/effects");
  const { t } = await getTranslator();
  const operations = [t("effect.add"), t("effect.subtract"), t("effect.multiply"), t("effect.percentBonus"), t("effect.setNumericField"), t("effect.createNode"), t("effect.createGroup"), t("effect.patchNode")];
  const conditions = [t("effect.conditionAlways"), t("effect.conditionExists"), t("effect.conditionGt"), t("effect.conditionLt"), t("effect.conditionEq"), "AND / OR / NOT"];
  const sources = [t("effect.number"), t("effect.otherNode"), t("effect.sourceFormula")];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("effect.builderTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("effect.builderHint")}</p>
        </div>
        <Button>
          <Plus className="h-4 w-4" />
          {t("effect.addEffect")}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>{t("effect.builderLayout")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <section className="rounded-md border p-4">
              <div className="mb-3 flex items-center gap-2 font-medium">
                <GitBranch className="h-4 w-4" />
                {t("effect.condition")}
              </div>
              <div className="flex flex-wrap gap-2">
                {conditions.map((item) => (
                  <Badge key={item}>{item}</Badge>
                ))}
              </div>
            </section>
            <section className="rounded-md border p-4">
              <div className="mb-3 font-medium">{t("effect.target")}</div>
              <p className="text-sm text-muted-foreground">{t("effect.targetHint")}</p>
            </section>
            <section className="rounded-md border p-4">
              <div className="mb-3 font-medium">{t("effect.operation")}</div>
              <div className="flex flex-wrap gap-2">
                {operations.map((item) => (
                  <Badge key={item}>{item}</Badge>
                ))}
              </div>
            </section>
            <section className="rounded-md border p-4">
              <div className="mb-3 font-medium">{t("effect.source")}</div>
              <div className="flex flex-wrap gap-2">
                {sources.map((item) => (
                  <Badge key={item}>{item}</Badge>
                ))}
              </div>
            </section>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("effect.engineContract")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{t("effect.contractJson")}</p>
            <p>{t("effect.contractEngine")}</p>
            <p>{t("effect.contractOrder")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
