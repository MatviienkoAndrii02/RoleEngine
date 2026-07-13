UPDATE "TemplateTag"
SET "color" = 'gray-soft'
WHERE "color" = 'gray';

ALTER TABLE "TemplateTag"
ALTER COLUMN "color" SET DEFAULT 'gray-soft';
