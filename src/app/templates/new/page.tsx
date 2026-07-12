import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePageGM } from "@/server/page-auth";
import { TemplateForm } from "@/components/templates/template-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslator } from "@/i18n/server";

export default async function NewTemplatePage() {
  await requirePageGM("/templates/new");
  const { t } = await getTranslator();
  return <div className="mx-auto max-w-2xl space-y-5"><Button asChild variant="ghost"><Link href="/templates"><ArrowLeft className="h-4 w-4" />{t("template.back")}</Link></Button><Card><CardHeader><CardTitle>{t("template.new")}</CardTitle></CardHeader><CardContent><TemplateForm /></CardContent></Card></div>;
}
