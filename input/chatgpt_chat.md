Ich möchte gerne die Produktdatenbank von everdrop vektorisieren, sodass ein Agent eine Vektorsuche als Hilfe zum Produktkauf nutzen kann. 

Schau dir mal das Produkt hier an:
https://www.everdrop.de/products/delicates-detergent

Wie sollte ich den zu vektorisierenden Datensatz aufbauen? Welche Felder, Metadaten, etc.?


ChatGPT:

Nachgedacht für 22s
Kurz & direkt: Für eine gute Produkt-Vektorsuche brauchst du (1) sauber strukturierte, semantisch dichte Textfelder, (2) präzise Filter-Metadaten und (3) Quellen/Versionierung. Für das verlinkte everdrop-Produkt (Feinwaschmittel/Delicates) skizziere ich dir erst das Ziel-Schema, dann ein MVP-Schema (wenn du schnell starten willst), plus Chunking-/Index-Tipps und ein konkretes JSON-Beispiel.

Ziel-Schema (empfohlen)
Collection: products

Pflichtfelder (Metadaten für Filter/Facets, kein Embedding)

product_id (string, stabil)

sku / variant_id (string)

slug / url (string) – zur Rückverfolgung

locale (enum: de-DE, en-DE, …)

country (enum: DE, AT, CH …)

brand (string: everdrop)

category (z. B. Laundry > Detergents > Delicates)

tags (array: ["vegan","ohne Mikroplastik","Feinwäsche","Wolle","Seide"])

price (number), currency (string), subscription_available (bool)

rating_value (number), rating_count (int)

availability (enum: in_stock/out_of_stock)

shipping_info (Kurzfelder: z. B. „freie Lieferung ab X“)

hazard_statements (array kurzer Codes/Text; wichtig für Compliance/Filter)

allergen_notes (array, z. B. ["Limonene","Citral","Linalool"])

sustainability_claims (array: ["vegan","ohne Mikroplastik"])

water_hardness_concept (bool) – everdrop-spezifisch

images (array: {url, alt}) – Bildpfade (für spätere Multimodalität)

source (URL), source_last_seen_at (ISO-Zeit), version (Hash/ETag)

Textfelder (gehen in Embeddings)

title – Kurz & präzise

one_liner – Nutzenversprechen in 1–2 Sätzen

short_description – Produktteaser

long_description – vollständiger Text (ohne rechtliche Blöcke)

use_cases – Liste typischer Nutzerfragen/Anwendungen („Wolle“, „Seide“, „Sportkleidung“, „niedrige Temperaturen“)

how_to_use – Dosierung/Anwendung (strukturiert + in Klartext)

ingredients_plain – Inhaltsstoffe in Klartext (plus Wirkung)

scent_profile – z. B. „Jasmin | Apfel | Lotusblüte“

compatibility – Material/Faser-Kompatibilität + Ausschlüsse

care_labels_supported – Pflegesymbole/Temperaturen als Text („Handwäsche, 20–40 °C“)

faq_qa – flache Liste „Q:… A:…“ (aus Seite/Helpcenter)

safety_notes – H-Sätze in Klartext („reizt Haut/Augen“ + Hinweise)

sustainability_details – was heißt „vegan“, „ohne Mikroplastik“, Konzept Wasserhärte

comparisons – kurze Abgrenzung zu Universal-/Color-Detergent

seo_synonyms – Synonyme & Query-Phrasen („Feinwaschmittel“, „Wollwaschmittel“, „Seide waschen“ …)

Numerische/strukturierte Felder (optional, aber wertvoll)

wash_loads (int) – z. B. 38

dosage_ml – Tabellenstruktur pro Härtegrad/Beladung/Verschmutzung

temp_range_c – [min,max]

wl_price_eur – Preis pro Waschladung

weight_g / content_wl

packaging – z. B. „Nachfüllpack, plastikfrei“

Warum so?
– Metadaten → präzise Filter (Preis, Allergene, Eignung).
– Textfelder → semantische Antworten („Ist das für Seide? Riecht wie?“).
– Sicherheits-/Allergen-Blöcke → notwendige Compliance & korrekte Agent-Antworten.

Quellenhinweise zu diesem Produkt (Faktenbasis):
– Produktseite DE & EN (Infos zu Eignung für Wolle/Seide/Feines, 38 WL, Duft „Jasmin/Apfel/Lotusblüte“, vegan/ohne Mikroplastik, Abo, Versandschwellen). 
Everdrop
+2
Everdrop
+2

– Ingredients/Surfactant-Erklärung & Wasserhärte-Konzept. 
Everdrop
Everdrop

– CH-Seite mit Sicherheits-/Allergenhinweisen (Warnung, Limonene/Citral/Linalool). 
Everdrop

MVP-Schema (wenn du heute loslegen willst)
Pflicht:

json
Kopieren
Bearbeiten
{
  "product_id": "...",
  "url": "...",
  "locale": "de-DE",
  "brand": "everdrop",
  "category": "Laundry > Detergents > Delicates",
  "price": 13.99,
  "currency": "EUR",
  "rating_value": 4.8,
  "rating_count": 528,
  "tags": ["Feinwäsche","Wolle","Seide","vegan","ohne Mikroplastik"],
  "hazard_statements": ["Achtung: Reizt Haut/Augen"],
  "allergen_notes": ["Limonene","Citral","Linalool"],
  "wash_loads": 38,
  "water_hardness_concept": true,
  "source": "https://www.everdrop.de/products/delicates-detergent",
  "source_last_seen_at": "2025-08-13T09:00:00Z"
}
Embeddings-Text (ein Feld genügt fürs MVP, später aufsplitten):

embed_text: konkat. Klartext = title + one_liner + short_description + long_description + how_to_use + ingredients_plain + scent_profile + use_cases + safety_notes + sustainability_details + comparisons + faq_qa

Damit kann dein Agent sofort brauchbare Antworten geben und du hast genug Metadaten für Facettierung.

Chunking & Index-Strategie
Hybrid Search: BM25 (Keyword) + Vektor-Ähnlichkeit (cosine). Re-Ranking via Cross-Encoder – deutlich bessere Präzision bei Produktsuchen.

Chunking: 300–700 Token pro Chunk, semantisch schneiden:

overview (Title, One-liner, Kategorien, Duft, Nutzen)

how_to_use (Dosierung, Temperaturen, Wasserhärte)

compatibility (Fasern/Do-Don’t)

ingredients + sustainability

safety + allergens

faq_qa

Mehrsprachigkeit: pro Sprache separater Datensatz (locale) und ein canonical_id zur Verknüpfung. Queries aus DE → primär de-DE, Fallback en-DE.

Ranking-Gewichte: compatibility, how_to_use, scent_profile, safety_notes höher gewichten (z. B. bei Retrieval-Mischung 0.6 Vektor, 0.4 Keyword).

Versionierung: version (Hash aus HTML-Text), scraped_at, valid_from/valid_to.

Collections:

products (Hauptinhalte)

faqs (querproduktliche FAQs)

reviews_snippets (Top-N Sätze mit Stimmungs-Label) – optional

dosage_tables (strukturierte Matrix, auch ohne Embedding gut filterbar)

Beispiel (konkret für „Feinwaschmittel / Delicates detergent“)
Record 1 – Metadaten + Kerntexte (de-DE)

json
Kopieren
Bearbeiten
{
  "product_id": "everdrop-delicates-38wl-de",
  "canonical_id": "everdrop-delicates-38wl",
  "locale": "de-DE",
  "country": "DE",
  "brand": "everdrop",
  "category": "Laundry > Detergents > Delicates",
  "slug": "delicates-detergent",
  "url": "https://www.everdrop.de/products/delicates-detergent",
  "price": 13.99,
  "currency": "EUR",
  "wl_price_eur": 0.30,
  "subscription_available": true,
  "rating_value": 4.8,
  "rating_count": 528,
  "availability": "in_stock",
  "wash_loads": 38,
  "temp_range_c": [20, 40],
  "water_hardness_concept": true,
  "sustainability_claims": ["ohne Mikroplastik","vegan"],
  "allergen_notes": ["Limonene","Citral","Linalool"],
  "hazard_statements": ["Achtung: Verursacht Hautreizung und schwere Augenreizung"],
  "tags": ["Feinwäsche","Wolle","Seide","Sportkleidung","schonend","Nachfüllpack"],
  "images": [
    {"url": "https://cdn.everdrop.../delicates-front.jpg", "alt": "everdrop Feinwaschmittel Packung"}
  ],
  "title": "Feinwaschmittel – für Wolle, Seide & Feines",
  "one_liner": "Schonende Reinigung für empfindliche Fasern; Duft: Jasmin | Apfel | Lotusblüte.",
  "short_description": "38 Waschladungen, dermatologisch getestet, ohne Mikroplastik, 100 % vegan.",
  "long_description": "Pflegendes Waschmittel speziell für Wolle, Seide und feine Textilien. Entwickelt mit Wasserhärtekonzept zur optimierten Dosierung und reduzierten Chemikalienbelastung.",
  "scent_profile": "Jasmin | Apfel | Lotusblüte",
  "compatibility": "Geeignet für Wolle, Seide, feine Synthetics und Mischgewebe. Nicht für stark verschmutzte Arbeitskleidung; niedrige Temperaturen empfohlen.",
  "how_to_use": "Dosierung gemäß Wasserhärte und Verschmutzungsgrad; schonende Programme oder Handwäsche nutzen; Pflegeetiketten beachten.",
  "ingredients_plain": "Anionische Tenside (z. B. Sodium C12–18 Alkyl Sulfate) – auf Basis erneuerbarer Rohstoffe; weitere Hilfsstoffe lt. INCI.",
  "sustainability_details": "Formulierung mit angepasster Dosierung je nach regionaler Wasserhärte zur Reduktion von Chemikalien; plastikfreie Nachfülloption; 100 % vegan.",
  "safety_notes": "Achtung: Kann Haut- und Augenreizungen verursachen; enthält Limonene, Citral, Linalool – kann allergische Reaktionen auslösen. Nach Kontakt gründlich spülen.",
  "use_cases": ["Handwäsche von Seide", "Pflege von Wollpullovern", "Feine Sporttextilien mit empfindlichen Fasern"],
  "faq_qa": [
    {"q":"Ist es für Seide geeignet?", "a":"Ja, speziell für Seide, Wolle und Feines entwickelt."},
    {"q":"Wie dosiere ich bei harter Wasserhärte?", "a":"Etwas höher dosieren; Richtwerte siehe Tabelle/Packung."}
  ],
  "source": "https://www.everdrop.de/products/delicates-detergent",
  "source_last_seen_at": "2025-08-13T09:00:00Z",
  "version": "sha256:…"
}
Record 2 – Sicherheits-/CH-Hinweise als separater Chunk (de-CH Quelle)

json
Kopieren
Bearbeiten
{
  "product_id": "everdrop-delicates-38wl-de-safety",
  "canonical_id": "everdrop-delicates-38wl",
  "locale": "de-DE",
  "chunk_type": "safety",
  "embed_text": "Sicherheitswarnung: Verursacht Hautreizung und schwere Augenreizung. Enthält Limonene, Citral, Linalool. Kann allergische Reaktionen hervorrufen. Bei Kontakt mit den Augen: Einige Minuten behutsam mit Wasser spülen.",
  "allergen_notes": ["Limonene","Citral","Linalool"],
  "hazard_statements": ["H315","H319 (sinngemäß)"],
  "source": "https://www.everdrop.ch/en/products/delicates-detergent",
  "source_last_seen_at": "2025-08-13T09:00:00Z",
  "version": "sha256:…"
}
Record 3 – Ingredients-Erklärung/Surfactant (en-Quelle, deutsch paraphrasiert)

json
Kopieren
Bearbeiten
{
  "product_id": "everdrop-delicates-38wl-de-ingredients",
  "canonical_id": "everdrop-delicates-38wl",
  "locale": "de-DE",
  "chunk_type": "ingredients",
  "embed_text": "Sodium C12–18 Alkyl Sulfate (anionisches Tensid): reduziert die Oberflächenspannung des Wassers, löst Fett/Schmutz. In EU leicht biologisch abbaubar vorgeschrieben; bei everdrop auf Basis erneuerbarer zertifizierter Rohstoffe.",
  "source": "https://www.everdrop.de/en/mission/ingredients",
  "source_last_seen_at": "2025-08-13T09:00:00Z",
  "version": "sha256:…"
}
Record 4 – Dosiertabelle (strukturierter Index, ohne Embedding nötig)

json
Kopieren
Bearbeiten
{
  "product_id": "everdrop-delicates-38wl-dosage",
  "locale": "de-DE",
  "dosage_table": [
    {"water_hardness":"weich","load_kg":"4-5","soil":"normal","dose_ml":35},
    {"water_hardness":"mittel","load_kg":"4-5","soil":"normal","dose_ml":47}
  ],
  "notes": "Für 6–8 kg 1.5× dosieren; niedrige Temperaturen bevorzugen.",
  "source": "Packungsangaben/Website",
  "source_last_seen_at": "2025-08-13T09:00:00Z"
}
(Zahlen in der Beispiel-Tabelle sind Platzhalter – echte Werte bitte aus Packung/Herstellerangaben übernehmen.)

Quellen zu obigen Feldern: Produktseiten & Ingredients/Everdrop (Duft, WL, vegan, Wasserhärte, Warn-/Allergenhinweise). 
Everdrop
+3
Everdrop
+3
Everdrop
+3
Everdrop

Umsetzungstipps (praktisch)
Index: Qdrant/pgvector/Weaviate – speichere pro Chunk: {id, product_id, chunk_type, embed_vector, locale, filters{…}, text, source, version}.

Query-Routing:

„Darf ich das für Seide nutzen?“ → boost compatibility/how_to_use.

„Riecht das blumig?“ → boost scent_profile.

„Allergie Limonene?“ → erst Filter (allergen_notes), dann semantisch.

Antwortformat des Agents: Immer Quelle + Zeitstempel mitschicken; bei Sicherheit/Allergenen zuerst warnen, dann Alternativen.

Evaluation: 20–30 echte Userfragen sammeln → nDCG@10 + Hit@3 messen, A/B: Hybrid vs. nur Vektor.

Wenn du’s schlanker willst (einfacher, klarer Weg)
Starte mit MVP-Schema + 4 Chunks (overview, how_to_use, ingredients+sustainability, safety). Füge danach faq_qa und comparisons hinzu, wenn die ersten Suchlogs zeigen, dass Nutzer das brauchen. Alles andere (Reviews-Snippets, Dosiertabellen, Multimodal-Bilder) kannst du iterativ ergänzen.

Passt das für deinen Agent-Use-Case? Wenn ja, baue ich dir im nächsten Schritt ein kleines ETL-Skript (Scrape → Normalize → Chunk → Embed → Upsert) für Qdrant/pgvector inkl. deutscher/englischer Pipeline.











Quellen
Du:
Ich habe bisher die folgende Tabelle: 
create table public.products (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp without time zone null default now(),
  name text null,
  url text null,
  image_url text null,
  description text null,
  scrape_id uuid null,
  page_markdown text null,
  vector extensions.vector null,
  shop_id uuid not null,
  constraint products_pkey primary key (id),
  constraint products_shop_id_fkey foreign KEY (shop_id) references shop (id) on update RESTRICT on delete RESTRICT
) TABLESPACE pg_default;

Dort speicher ich aber bisher nur die Daten, die ich via Firecrawl Scrape bekomme. Kannst du mir die noch so erweitern, dass der Rest ebenfalls gespeichert wird? Wichtig ist aber, dass es generisch aufgebaut ist, sodass ich produkte von diversen shops (jenseits von Everdrop) dort speichern und vektorisieren kann. 


ChatGPT:

Nachgedacht für 14s
Koni, so wie’s jetzt ist, bekommst du „nur“ einen Seitenschnappschuss pro Produkt in eine Zeile. Für eine robuste, shop-übergreifend generische Vektorsuche brauchst du (a) normierte Stammdaten, (b) flexible Attribute, (c) Chunk-basierte Embeddings, (d) Quellen/Versionierung und (e) Preis/Verfügbarkeit getrennt von Content.

Unten bekommst du zwei Wege:

A. Quick Patch (bestehende Tabelle erweitern – heute nutzbar)

B. Sauber & skalierbar (normales Schema mit separaten Tabellen; empfehle ich)

A) Quick Patch (heute live gehen)
Ziel: ohne große Migration sofort mehr Felder + Hybrid Search.
Hinweis: Behalte vector vorerst, ergänze aber schon products_chunks für wirklich gute Retrievals.

sql
Kopieren
Bearbeiten
-- 1) Voraussetzungen
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";      -- falls noch nicht aktiv
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2) Produkte minimal erweitern
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS locale text,                          -- z.B. 'de-DE'
  ADD COLUMN IF NOT EXISTS country text,                         -- z.B. 'DE'
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS category text,                        -- grob; sauber in B)
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS price_numeric numeric(12,2),
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS subscription_available boolean,
  ADD COLUMN IF NOT EXISTS rating_value numeric(3,2),
  ADD COLUMN IF NOT EXISTS rating_count int,
  ADD COLUMN IF NOT EXISTS availability text,                    -- 'in_stock', 'out_of_stock', ...
  ADD COLUMN IF NOT EXISTS sustainability_claims text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hazard_statements text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allergen_notes text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS temp_range_c int[] DEFAULT NULL,      -- [min, max]
  ADD COLUMN IF NOT EXISTS content_units text,                   -- z.B. '38 WL' / '500 ml'
  ADD COLUMN IF NOT EXISTS properties jsonb DEFAULT '{}'::jsonb, -- freie Key/Value-Box
  ADD COLUMN IF NOT EXISTS source_etag text,
  ADD COLUMN IF NOT EXISTS source_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS version_hash text,                    -- sha256 über page_markdown o.ä.
  ADD COLUMN IF NOT EXISTS tsv tsvector;                         -- Hybrid Search

-- 3) Trigger: updated_at automatisch pflegen
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Fulltext: deutsch/englisch mischen -> simple, oder getrennte Spalten; hier simple
CREATE OR REPLACE FUNCTION public.products_update_tsv() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.tsv :=
    setweight(to_tsvector('simple', coalesce(NEW.name,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.description,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.page_markdown,'')), 'C');
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_products_tsv ON public.products;
CREATE TRIGGER trg_products_tsv
BEFORE INSERT OR UPDATE OF name, description, page_markdown
ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_update_tsv();

-- 5) Indexe
CREATE INDEX IF NOT EXISTS idx_products_shop ON public.products (shop_id);
CREATE INDEX IF NOT EXISTS idx_products_trgm_name ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_tsv ON public.products USING gin (tsv);
CREATE INDEX IF NOT EXISTS idx_products_tags ON public.products USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_products_properties ON public.products USING gin (properties);

-- 6) Chunk-basierte Embeddings (neu, generisch!)
CREATE TABLE IF NOT EXISTS public.products_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  chunk_type text,                               -- 'overview','how_to_use','safety','faq','ingredients',...
  locale text,
  position int,                                  -- Reihenfolge im Produkt
  text_content text NOT NULL,                    -- der eigentliche Embedding-Text
  embedding vector(1536),                        -- je nach Modellgröße anpassen
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_chunks_product ON public.products_chunks (product_id);
CREATE INDEX IF NOT EXISTS idx_products_chunks_locale ON public.products_chunks (locale);
-- HNSW (ab PGVector 0.5+ / Supabase hat HNSW)
CREATE INDEX IF NOT EXISTS idx_products_chunks_embedding
ON public.products_chunks USING hnsw (embedding vector_cosine_ops);

-- 7) Produkt-Images (generisch)
CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url text NOT NULL,
  alt text,
  position int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON public.product_images(product_id);
So kannst du sofort:

Chunks erzeugen und vektorisieren (besseres Retrieval).

Metadaten filtern (Arrays/JSONB).

Hybrid Search fahren (tsv + Embeddings).

B) Sauber & skalierbar (empfohlen)
Ziel: Multi-Shop, Multi-Locale, Varianten, Preise, Quellen, Attribute – ohne Felder-Flickenteppich.

Kernobjekte
sql
Kopieren
Bearbeiten
-- Shops (hast du bereits als "shop"; hier der Vollständigkeit halber)
-- CREATE TABLE public.shop (id uuid PK, name text, base_url text, ...);

-- 1) Produkt-Stamm (sprachneutral)
CREATE TABLE IF NOT EXISTS public.product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shop(id) ON DELETE RESTRICT,
  canonical_sku text,                -- optional, shop-übergreifender Schlüssel
  brand text,
  category_path text,                -- "Laundry > Detergents > Delicates" (für schnelle Facets)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_shop ON public.product(shop_id);

-- 2) Produkt-Variante (Größe, Farbe, Packungsinhalt etc.)
CREATE TABLE IF NOT EXISTS public.product_variant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.product(id) ON DELETE CASCADE,
  sku text,
  variant_label text,                -- "38 WL", "500 ml", "Refill Pack"
  barcode text,
  weight_g numeric(12,3),
  volume_ml numeric(12,3),
  attributes jsonb DEFAULT '{}'::jsonb,  -- flexible Variant-Merkmale
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_variant_product ON public.product_variant(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variant_attrs ON public.product_variant USING gin (attributes);

-- 3) Lokalisierte Inhalte (Name, Beschreibungen, SEO, FAQ …)
CREATE TABLE IF NOT EXISTS public.product_locale_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.product(id) ON DELETE CASCADE,
  locale text NOT NULL,              -- 'de-DE', 'en-DE', ...
  url text,                          -- kanonische URL für diese Sprache
  slug text,
  name text,
  one_liner text,
  short_description text,
  long_description text,
  page_markdown text,
  images jsonb DEFAULT '[]'::jsonb,  -- [{url,alt,position}]
  tags text[] DEFAULT '{}',
  properties jsonb DEFAULT '{}'::jsonb, -- z.B. scent_profile, compatibility, care_labels, etc.
  tsv tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_plc_product_locale ON public.product_locale_content(product_id, locale);
CREATE INDEX IF NOT EXISTS idx_plc_tags ON public.product_locale_content USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_plc_properties ON public.product_locale_content USING gin (properties);
CREATE INDEX IF NOT EXISTS idx_plc_tsv ON public.product_locale_content USING gin (tsv);

-- optional: Trigger für tsv (ähnlich wie oben) – aus name/short/long/page_markdown

-- 4) Content-Chunks je Locale (Embedding-Einträge)
CREATE TABLE IF NOT EXISTS public.product_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.product(id) ON DELETE CASCADE,
  locale text NOT NULL,
  chunk_type text,                   -- 'overview','how_to_use','compatibility','ingredients','safety','faq',...
  position int,
  text_content text NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pc_product_locale ON public.product_chunks(product_id, locale);
CREATE INDEX IF NOT EXISTS idx_pc_chunktype ON public.product_chunks(chunk_type);
CREATE INDEX IF NOT EXISTS idx_pc_embedding ON public.product_chunks USING hnsw (embedding vector_cosine_ops);

-- 5) Preise & Verfügbarkeit (zeitlich versionierbar)
CREATE TABLE IF NOT EXISTS public.product_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_variant_id uuid NOT NULL REFERENCES public.product_variant(id) ON DELETE CASCADE,
  currency text NOT NULL,
  price numeric(12,2) NOT NULL,
  list_price numeric(12,2),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  availability text,                 -- 'in_stock','out_of_stock','preorder',...
  subscription_available boolean,
  meta jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_pp_variant_valid ON public.product_pricing(product_variant_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_pp_availability ON public.product_pricing(availability);

-- 6) Recht & Sicherheit (allgemein, sprachspezifisch möglich)
CREATE TABLE IF NOT EXISTS public.product_safety (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.product(id) ON DELETE CASCADE,
  locale text,                       -- optional: pro Sprache unterschiedliche Phrasen
  hazard_statements text[] DEFAULT '{}',
  allergen_notes text[] DEFAULT '{}',
  safety_text text,
  source_url text,
  source_last_seen_at timestamptz,
  version_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_product ON public.product_safety(product_id);

-- 7) Quellen/Versionierung (Scrapes, APIs, ETags, Checksums)
CREATE TABLE IF NOT EXISTS public.product_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.product(id) ON DELETE CASCADE,
  locale text,
  source_type text NOT NULL,         -- 'scrape','api','manual'
  url text,
  etag text,
  checksum text,                     -- z.B. sha256 des Rohtexts
  scraped_at timestamptz,
  raw jsonb,                         -- Rohantwort / extrahierte Struktur
  notes text
);

CREATE INDEX IF NOT EXISTS idx_ps_product ON public.product_source(product_id);
CREATE INDEX IF NOT EXISTS idx_ps_scraped_at ON public.product_source(scraped_at);

-- 8) Freies Attribut-Modell (präzise filterbar, ohne Schema-Änderungen)
CREATE TABLE IF NOT EXISTS public.product_attribute (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.product(id) ON DELETE CASCADE,
  locale text,
  key text NOT NULL,                 -- z.B. 'water_hardness_concept','temp_min_c','scent_family','material_ok'
  value_text text,
  value_num numeric,
  value_bool boolean,
  unit text,                         -- '°C','ml','WL'
  UNIQUE(product_id, locale, key, value_text, value_num, value_bool, unit)
);

CREATE INDEX IF NOT EXISTS idx_pa_product ON public.product_attribute(product_id);
CREATE INDEX IF NOT EXISTS idx_pa_key ON public.product_attribute(key);
Warum diese Aufteilung?

product = shop-neutrale Identität.

product_variant = kaufbare Einheit (SKU etc.).

product_locale_content = Texte/Bilder pro Sprache (für Embedding-Quellen).

product_chunks = Retrieval-Einheit (Chunk-Vektoren).

product_pricing = zeitliche Preis-/Stock-Historie (Reporting + aktuelle Facets).

product_safety/product_attribute = Compliance & flexible Filter ohne Schemaänderung.

product_source = reproduzierbare ETL & Diff-Erkennung (etwa via checksum).

Praktische Hinweise (Agent/Retrieval)
Write-Path (ETL): scrape → normalize → product/product_locale_content upsert → semantic chunking (overview/how_to_use/ingredients/safety/faq) → embed → product_chunks upsert → Preise/Stock in product_pricing → Safety/Allergene in product_safety → Raw/Checksums in product_source.

Read-Path (Query):

Facet-Filter (z. B. allergens not contains, availability=in_stock, price range via product_pricing aktuellster Datensatz).

Hybrid Search: product_locale_content.tsv (BM25) + product_chunks.embedding (cosine) → Cross-Encoder Re-rank.

Mehrsprachig: locale überall mitführen; Query-Locale bevorzugen, Fallback via product_id-Join.

Index-Tuning: HNSW auf Embeddings, GIN auf JSONB/Tags/TSV, trigram auf name/slug.

Migration von deiner bestehenden Tabelle
Wenn du erst A) nutzt, kannst du später schmerzarm auf B) migrieren:

public.products → product + product_locale_content (splitte sprachabhängige Felder).

vector Spalte wird zu Chunks: kopiere page_markdown in 1–3 Chunks (overview, details, other) und re-embedde.

Preise/Stock aus properties ins product_pricing extrahieren, sobald verfügbar.

Wenn du magst, schreibe ich dir als Nächstes ein kleines SQL/TypeScript-ETL-Gerüst (Supabase/Node):

Firecrawl-JSON → Normalisierung ins Schema B

Heuristik-Chunking (Markdown-Headings)

Embedding (pgvector) + Upsert

Rebuild-TSV für Hybrid Search.









Quellen
Du:
Ich würde den MVP gerne in n8n aufbauen. Ich bräuchte deine Hilfe für den ETL Prozess - und insbesondere die Extraktion der Informationen aus der einzelnen Seite. Ich würde dafür gerne ein LLM verwenden, brauche dafür aber unter anderem das Ziel JSON Schema für den structured output. 
Kannst du mir als erstes einmal helfen High-Level die Steps im n8n Workflow zu skizzieren? 


ChatGPT:

Nachgedacht für 11s
Super – machen wir den MVP in n8n schlank, aber robust. Hier ist eine High-Level-ETL-Skizze vom URL-Input bis zur vektorisierten Ablage in Postgres/pgvector. Fokus: eine Seite → strukturiertes JSON via LLM, plus Chunking & Embedding.

0) Grundannahmen & Secrets
Inputs: product_url, shop_id, locale? (optional; sonst autodetect).

Infra: Postgres (Supabase) mit Tabellen aus deinem „Quick Patch“ (oder mind. products, products_chunks).

Secrets in n8n: OPENAI_API_KEY (oder Azure), DATABASE_URL, ggf. FIRECRAWL_API_KEY.

1) Workflow-Übersicht (Nodes & Reihenfolge)
Manual Trigger / Webhook (Start)

Payload: { url, shop_id, locale? }

Normalize URL (Function)

Trimme, canonicalize (ohne Tracking-Query-Params).

Output: normalized_url.

Fetch HTML

Wahl A: HTTP Request (GET normalized_url)

Wahl B: Firecrawl Node (falls du schon nutzt: scrape: markdown + metadata + language)

Output: raw_html, markdown, metadata (title, og-tags, lang).

Detect Locale (Function)

Heuristik: metadata.lang → de-DE/en-DE; Fallback: Language-Detect (LLM klein) oder Regex im HTML.

Output: locale.

Pre-Parse (Function) – regelbasiert, ohne LLM

Extrahiere „low-hanging fruit“:

title: <title>/og:title

images[]: og:image, <img> Hauptbilder

price, currency: versuche JSON-LD (application/ld+json), Microdata, oder Regex (€, CHF, „€ 13,99“)

rating_value, rating_count: JSON-LD AggregateRating

Ziel: LLM nur für semantische Felder nutzen (günstiger/stabiler).

Prepare LLM Prompt (Function)

Baue ein kompaktes Prompt mit:

Kurzer Systemanweisung (Extraktionsregeln)

Ziel-JSON-Schema (siehe unten)

Kontext: markdown (oder, wenn zu groß, wichtige Abschnitte + metadata)

Shop-Kontext (generisch halten)

Hinweis: Falls markdown > Tokenlimit → Chunk vor Extraktion: nur Hauptbereiche (Produktbeschreibung, Anwendung, Sicherheit).

LLM: Structured Extraction (OpenAI/Claude Node)

Mode: JSON Structured Output (mit response_format: { type: "json_object" }) oder Tool/Schema-Aufruf.

Output: extracted_product (validiertes JSON).

Upsert: products (Postgres Node)

Prüfe per SELECT ob URL schon existiert (Unique-Index auf url empfehlenswert).

INSERT/UPDATE Felder:

name, url, image_url, description (kurzer Teaser),

page_markdown, locale, country, brand, category,

tags[], price_numeric, currency, subscription_available,

rating_value, rating_count, availability,

sustainability_claims[], hazard_statements[], allergen_notes[],

temp_range_c[], content_units, properties (jsonb),

source_last_seen_at, version_hash (SHA256 aus markdown).

Output: product_id.

Semantic Chunking (Function)

Erzeuge 3–6 Chunks aus extracted_product:

overview, how_to_use, compatibility, ingredients+sustainability, safety, faq

Achte auf 300–700 Tokens pro Chunk (kurz & prägnant).

Embeddings (LLM Embeddings Node)

Für jeden Chunk: text_content → embedding.

Output: Liste { product_id, chunk_type, position, locale, text_content, embedding }.

Upsert: products_chunks (Postgres Node)

Insert (DELETE/UPSERT je nach version_hash – d. h. wenn Hash neu, ersetze vorhandene Chunks).

HNSW-Index auf embedding vorhanden.

Images persistieren (optional)

product_images Insert aus LLM/Pre-Parse, mit position, alt.

Safety / Attributes (optional)

product_safety/product_attribute Inserts, falls befüllt.

Observability & Idempotenz

Execution Log (Postgres Node): speichere url, shop_id, status, version_hash, token_usage, errors?.

If Error → Retry: n8n „Error Workflow“: limited Retry, bei 4xx/5xx differenziert.

Skip on Same version_hash: Wenn version_hash identisch, Workflow kurz-circuiten (keine Re-Embeddings).

Ziel-JSON-Schema (MVP, generisch & schlank)
Hinweis: Das Schema ist Shop-agnostisch und deckt 95 % gängiger Produktseiten ab. Nicht gefundene Felder einfach leer lassen. properties ist die flexible Box.

json
Kopieren
Bearbeiten
{
  "type": "object",
  "required": ["title", "url", "locale"],
  "properties": {
    "title": { "type": "string" },
    "one_liner": { "type": "string" },
    "short_description": { "type": "string" },
    "long_description": { "type": "string" },

    "url": { "type": "string" },
    "locale": { "type": "string", "examples": ["de-DE","en-DE"] },
    "country": { "type": "string", "examples": ["DE","AT","CH"] },
    "brand": { "type": "string" },
    "category": { "type": "string" },
    "tags": { "type": "array", "items": { "type": "string" } },

    "image_primary": { "type": "string" },
    "images": {
      "type": "array",
      "items": { "type": "object",
        "properties": {
          "url": { "type": "string" },
          "alt": { "type": "string" },
          "position": { "type": "integer" }
        }
      }
    },

    "price_numeric": { "type": "number" },
    "currency": { "type": "string", "examples": ["EUR","CHF"] },
    "subscription_available": { "type": "boolean" },
    "availability": { "type": "string", "examples": ["in_stock","out_of_stock","preorder"] },

    "rating_value": { "type": "number" },
    "rating_count": { "type": "integer" },

    "wash_loads": { "type": "integer" },
    "temp_range_c": { "type": "array", "items": { "type": "integer" }, "minItems": 2, "maxItems": 2 },
    "content_units": { "type": "string", "description": "e.g. '38 WL', '500 ml'" },

    "scent_profile": { "type": "string" },
    "compatibility": { "type": "string" },
    "how_to_use": { "type": "string" },

    "ingredients_plain": { "type": "string" },
    "sustainability_claims": { "type": "array", "items": { "type": "string" } },
    "sustainability_details": { "type": "string" },

    "hazard_statements": { "type": "array", "items": { "type": "string" } },
    "allergen_notes": { "type": "array", "items": { "type": "string" } },
    "safety_notes": { "type": "string" },

    "faq_qa": {
      "type": "array",
      "items": { "type": "object",
        "required": ["q","a"],
        "properties": { "q": { "type": "string" }, "a": { "type": "string" } }
      }
    },

    "dosage_table": {
      "type": "array",
      "items": { "type": "object",
        "properties": {
          "water_hardness": { "type": "string" },
          "load_kg": { "type": "string" },
          "soil": { "type": "string" },
          "dose_ml": { "type": "number" }
        }
      }
    },

    "properties": { "type": "object", "additionalProperties": true },

    "source_last_seen_at": { "type": "string", "format": "date-time" },
    "version_hash": { "type": "string" }
  }
}
LLM-Prompt (Skeleton, kurz & robust)
System:

Du bist ein extraktiver Parser. Analysiere Produktseiten-Markdown/HTML und gib valide JSON nach dem vorgegebenen Schema zurück. Keine freien Texte außerhalb von JSON. Verwende nur Belege aus dem Text; wenn unbekannt, Feld leer lassen. Preise als Zahl + Währung. Sicherheit/Allergene exakt und vorsichtig.

User (Beispiel-Template):

makefile
Kopieren
Bearbeiten
SCHEMA:
<JSON-SCHEMA-HIER>

CONTEXT:
- URL: {{ normalized_url }}
- LOCALE_HINT: {{ locale || "auto" }}
- METADATA: {{ json(metadata) }}

MARKDOWN:
<<<
{{ markdown_truncated }}
>>>

AUFGABE:
1) Extrahiere Felder entsprechend SCHEMA.
2) Schreibe Listen (tags, sustainability_claims, hazard_statements, allergen_notes, faq_qa) kurz & präzise.
3) "version_hash" = sha256 des gesamten MARKDOWN (berechne nicht, setze Platzhalter "__TO_BE_FILLED__").
4) "source_last_seen_at" = aktuelle UTC ISO8601.

ANTWORT:
Gib ausschließlich ein JSON-Objekt, das exakt dem SCHEMA entspricht.
Hinweis: Den version_hash berechnest du in n8n (Function Node) aus markdown und ersetzt danach im JSON.

Chunking-Logik (Function Node)
Baue Strings je Chunk:

overview: title + one_liner + short_description + scent_profile

how_to_use: how_to_use + dosage_table (linearisiert)

compatibility: compatibility + temp_range_c + care labels aus properties

ingredients+sustainability: ingredients_plain + sustainability_claims + sustainability_details

safety: hazard_statements + allergen_notes + safety_notes

faq: faq_qa als „Q:… A:…“ Zeilen

Entferne HTML/Markdown-Noise, limit ~ 1.5–3k Zeichen pro Chunk.

Postgres Writes (MVP)
products (UPSERT)

key: url (unique)

set: alle strukturierten Felder + page_markdown, locale, source_last_seen_at, version_hash.

products_chunks (UPSERT/REPLACE by version_hash)

Wenn version_hash neu: DELETE WHERE product_id = ?; INSERT …

Spalten: product_id, chunk_type, position, locale, text_content, embedding.

Fehlerfälle & Guards
Thin Pages/JS-only: Falls HTML leer → Firecrawl Render oder Puppeteer-Fallback.

Preis nicht erkennbar: Leerlassen, nicht halluciniert füllen.

Duplikate: url unique + Normalizer (ohne UTM).

Locale unklar: locale="und" setzen, nicht raten.

Token-Limits: Trunkieren des Markdowns mit Priorität: Hero → Description → How-to → Ingredients → Safety → FAQs.

Optional (aber sinnvoll)
Hybrid Search vorbereiten: tsv Trigger aus name + description + page_markdown.

Reviews-Snippets: späteres Feature; eigener Extract-Flow.

Scheduler: n8n Cron für Re-Crawl (alle 14 Tage) → Hash-Vergleich → nur bei Änderung re-embedden.

Wenn das so passt, baue ich dir als Nächstes:

den exakten n8n-Node-Plan (Node-Typen + Feld-Mapping)

Function-Node Snippets (Hash, Chunking, JSON-Validation)

Postgres SQL für die notwendigen Indizes/Constraints.

Sag nur, ob du OpenAI, Azure OpenAI oder ein lokales Embedding (z. B. text-embedding-3-large vs. gte-large) nutzen willst – ich optimiere dann die Embedding-Node entsprechend.








Du:
Ich habe das Gefühl ich wäre schneller, wenn wir mit einem Mini Javascript oder Python Projekt für den ETL Prozess arbeiten. Was denkst du? Du könntest wahrscheinlich den meisten Code einfach generieren, oder?


ChatGPT:

Nachgedacht für 14s
Ja – ein kleines ETL-Projekt (JS/Python) ist oft schneller und stabiler als n8n für den Start: du hast Versionierung, Tests, sauberes Error-Handling und volle Kontrolle über Prompting & Chunking. Ich würde mit Node.js (JavaScript) starten (leicht zu deployen, gute libs). Unten bekommst du ein komplettes Mini-Projekt: Ordnerstruktur, env, SQL, und lauffähige Dateien für

HTML/Markdown holen (per Firecrawl oder Fallback HTTP),

LLM-Extraktion (structured JSON),

Chunking,

Embeddings,

Upserts in Postgres/pgvector.

Wenn du lieber Python willst, packe ich dir danach die Spiegelung in FastAPI/Pydantic.

1) Projektstruktur
pgsql
Kopieren
Bearbeiten
etl/
  .env.example
  package.json
  src/
    index.js
    config.js
    fetchPage.js
    schema.js
    extractLLM.js
    chunking.js
    embed.js
    db.js
    upsert.js
    hash.js
  sql/
    create_products_chunks.sql
    add_products_columns.sql
  README.md
2) .env (Beispiel)
ini
Kopieren
Bearbeiten
OPENAI_API_KEY=sk-...
DATABASE_URL=postgres://user:pass@host:5432/db
FIRECRAWL_API_KEY=fc_...   # optional
EMBED_MODEL=text-embedding-3-large   # oder text-embedding-3-small
EMBED_DIM=3072              # 3072 für -large, 1536 für -small
LLM_MODEL=gpt-4.1-mini      # kosteneffizient für Extraktion
DEFAULT_LOCALE=de-DE
WICHTIG: Stelle sicher, dass deine products_chunks.embedding-Spalte die gleiche Dimension wie EMBED_DIM hat.

3) SQL (einmalig ausführen)
sql/create_products_chunks.sql

sql
Kopieren
Bearbeiten
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE IF NOT EXISTS public.products_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  chunk_type text,
  locale text,
  position int,
  text_content text NOT NULL,
  embedding vector(${EMBED_DIM}), -- <--- ERSETZEN passend zu .env
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_chunks_product ON public.products_chunks (product_id);
CREATE INDEX IF NOT EXISTS idx_products_chunks_locale ON public.products_chunks (locale);
CREATE INDEX IF NOT EXISTS idx_products_chunks_embedding
ON public.products_chunks USING hnsw (embedding vector_cosine_ops);
sql/add_products_columns.sql (Erweiterung deiner bestehenden products-Tabelle – safe to run mehrfach)

sql
Kopieren
Bearbeiten
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS locale text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS price_numeric numeric(12,2),
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS subscription_available boolean,
  ADD COLUMN IF NOT EXISTS rating_value numeric(3,2),
  ADD COLUMN IF NOT EXISTS rating_count int,
  ADD COLUMN IF NOT EXISTS availability text,
  ADD COLUMN IF NOT EXISTS sustainability_claims text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hazard_statements text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allergen_notes text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS temp_range_c int[],
  ADD COLUMN IF NOT EXISTS content_units text,
  ADD COLUMN IF NOT EXISTS properties jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS version_hash text;

-- Optional: schneller Textsuche-Index
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tsv tsvector;
CREATE INDEX IF NOT EXISTS idx_products_tsv ON public.products USING gin (tsv);
4) package.json
json
Kopieren
Bearbeiten
{
  "name": "m42-etl",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "etl": "node src/index.js",
    "fmt": "node -e \"import('prettier').then(p=>p.format)\""
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "node-fetch": "^3.3.2",
    "openai": "^4.56.0",
    "pg": "^8.11.5",
    "remark": "^15.0.1",
    "unified": "^11.0.4",
    "crypto-js": "^4.2.0"
  }
}
5) Code
src/config.js

js
Kopieren
Bearbeiten
import 'dotenv/config';

export const cfg = {
  dbUrl: process.env.DATABASE_URL,
  openaiKey: process.env.OPENAI_API_KEY,
  firecrawlKey: process.env.FIRECRAWL_API_KEY || null,
  embedModel: process.env.EMBED_MODEL || 'text-embedding-3-small',
  embedDim: parseInt(process.env.EMBED_DIM || '1536', 10),
  llmModel: process.env.LLM_MODEL || 'gpt-4.1-mini',
  defaultLocale: process.env.DEFAULT_LOCALE || 'de-DE'
};
src/db.js

js
Kopieren
Bearbeiten
import pg from 'pg';
import { cfg } from './config.js';
export const pool = new pg.Pool({ connectionString: cfg.dbUrl });

export async function upsertProduct(p) {
  const sql = `
  INSERT INTO public.products
    (name, url, image_url, description, page_markdown, shop_id,
     locale, country, brand, category, tags, price_numeric, currency,
     subscription_available, rating_value, rating_count, availability,
     sustainability_claims, hazard_statements, allergen_notes,
     temp_range_c, content_units, properties, source_last_seen_at, version_hash, tsv)
  VALUES
    ($1,$2,$3,$4,$5,$6,
     $7,$8,$9,$10,$11,$12,$13,
     $14,$15,$16,$17,
     $18,$19,$20,
     $21,$22,$23,$24,$25,
     setweight(to_tsvector('simple', coalesce($1,'')),'A') ||
     setweight(to_tsvector('simple', coalesce($4,'')),'B') ||
     setweight(to_tsvector('simple', coalesce($5,'')),'C'))
  ON CONFLICT (url) DO UPDATE SET
    name=EXCLUDED.name,
    image_url=EXCLUDED.image_url,
    description=EXCLUDED.description,
    page_markdown=EXCLUDED.page_markdown,
    locale=EXCLUDED.locale,
    country=EXCLUDED.country,
    brand=EXCLUDED.brand,
    category=EXCLUDED.category,
    tags=EXCLUDED.tags,
    price_numeric=EXCLUDED.price_numeric,
    currency=EXCLUDED.currency,
    subscription_available=EXCLUDED.subscription_available,
    rating_value=EXCLUDED.rating_value,
    rating_count=EXCLUDED.rating_count,
    availability=EXCLUDED.availability,
    sustainability_claims=EXCLUDED.sustainability_claims,
    hazard_statements=EXCLUDED.hazard_statements,
    allergen_notes=EXCLUDED.allergen_notes,
    temp_range_c=EXCLUDED.temp_range_c,
    content_units=EXCLUDED.content_units,
    properties=EXCLUDED.properties,
    source_last_seen_at=EXCLUDED.source_last_seen_at,
    version_hash=EXCLUDED.version_hash,
    tsv=EXCLUDED.tsv
  RETURNING id;
  `;
  const vals = [
    p.title || p.name || null,
    p.url,
    p.image_primary || null,
    p.one_liner || p.short_description || null,
    p.page_markdown || null,
    p.shop_id,
    p.locale || null,
    p.country || null,
    p.brand || null,
    p.category || null,
    p.tags || [],
    p.price_numeric || null,
    p.currency || null,
    p.subscription_available ?? null,
    p.rating_value || null,
    p.rating_count || null,
    p.availability || null,
    p.sustainability_claims || [],
    p.hazard_statements || [],
    p.allergen_notes || [],
    p.temp_range_c || null,
    p.content_units || null,
    p.properties || {},
    p.source_last_seen_at || new Date().toISOString(),
    p.version_hash || null
  ];
  const { rows } = await pool.query(sql, vals);
  return rows[0].id;
}

export async function replaceChunks(productId, chunks) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM public.products_chunks WHERE product_id = $1', [productId]);
    const sql = `
      INSERT INTO public.products_chunks
        (product_id, chunk_type, locale, position, text_content, embedding)
      VALUES ($1,$2,$3,$4,$5,$6)
    `;
    for (const c of chunks) {
      await client.query(sql, [productId, c.chunk_type, c.locale, c.position, c.text_content, c.embedding]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
src/hash.js

js
Kopieren
Bearbeiten
import CryptoJS from 'crypto-js';
export function sha256(text) {
  return CryptoJS.SHA256(text || '').toString(CryptoJS.enc.Hex);
}
src/fetchPage.js (Firecrawl bevorzugt; fällt auf HTTP zurück)

js
Kopieren
Bearbeiten
import fetch from 'node-fetch';
import { cfg } from './config.js';

export async function fetchPage(url) {
  // Try Firecrawl API
  if (cfg.firecrawlKey) {
    const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.firecrawlKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url, formats: ['markdown','html','links','metadata'] })
    });
    if (r.ok) {
      const data = await r.json();
      // normalize
      return {
        markdown: data.markdown || '',
        html: data.html || '',
        metadata: data.metadata || {},
        url
      };
    }
  }
  // Fallback: raw HTML
  const res = await fetch(url, { headers: { 'User-Agent': 'Mission42-ETL/1.0' } });
  const html = await res.text();
  return { markdown: html, html, metadata: {}, url };
}
src/schema.js (Ziel-Schema; validieren kannst du optional)

js
Kopieren
Bearbeiten
export const targetSchemaKeys = [
  'title','one_liner','short_description','long_description',
  'url','locale','country','brand','category','tags',
  'image_primary','images',
  'price_numeric','currency','subscription_available','availability',
  'rating_value','rating_count',
  'wash_loads','temp_range_c','content_units',
  'scent_profile','compatibility','how_to_use',
  'ingredients_plain','sustainability_claims','sustainability_details',
  'hazard_statements','allergen_notes','safety_notes',
  'faq_qa','dosage_table','properties',
  'source_last_seen_at','version_hash'
];
src/extractLLM.js

js
Kopieren
Bearbeiten
import OpenAI from 'openai';
import { cfg } from './config.js';
import { sha256 } from './hash.js';

const client = new OpenAI({ apiKey: cfg.openaiKey });

export async function extractProductJSON({ url, localeHint, markdown, metadata }) {
  // Truncate if huge (keeps hero/desc/safety keywords heuristically simple)
  const maxChars = 60_000;
  const md = markdown.length > maxChars ? markdown.slice(0, maxChars) : markdown;

  const schema = {
    type: "object",
    required: ["title","url","locale"],
    properties: {
      title:{type:"string"}, one_liner:{type:"string"}, short_description:{type:"string"}, long_description:{type:"string"},
      url:{type:"string"}, locale:{type:"string"}, country:{type:"string"}, brand:{type:"string"}, category:{type:"string"},
      tags:{type:"array", items:{type:"string"}},
      image_primary:{type:"string"}, images:{type:"array", items:{type:"object", properties:{url:{type:"string"},alt:{type:"string"},position:{type:"integer"}}}},
      price_numeric:{type:"number"}, currency:{type:"string"}, subscription_available:{type:"boolean"}, availability:{type:"string"},
      rating_value:{type:"number"}, rating_count:{type:"integer"},
      wash_loads:{type:"integer"}, temp_range_c:{type:"array", items:{type:"integer"}}, content_units:{type:"string"},
      scent_profile:{type:"string"}, compatibility:{type:"string"}, how_to_use:{type:"string"},
      ingredients_plain:{type:"string"}, sustainability_claims:{type:"array", items:{type:"string"}}, sustainability_details:{type:"string"},
      hazard_statements:{type:"array", items:{type:"string"}}, allergen_notes:{type:"array", items:{type:"string"}}, safety_notes:{type:"string"},
      faq_qa:{type:"array", items:{type:"object", properties:{q:{type:"string"}, a:{type:"string"}}, required:["q","a"]}},
      dosage_table:{type:"array", items:{type:"object", properties:{water_hardness:{type:"string"}, load_kg:{type:"string"}, soil:{type:"string"}, dose_ml:{type:"number"}}}},
      properties:{type:"object"},
      source_last_seen_at:{type:"string"}, version_hash:{type:"string"}
    },
    additionalProperties: true
  };

  const sys = `Du bist ein extraktiver Parser. Antworte ausschließlich mit VALIDE(M) JSON nach Schema. Keine Behauptungen ohne Beleg. Wenn unbekannt, Feld auslassen oder leer lassen.`;
  const user = `
SCHEMA (JSON Schema):
${JSON.stringify(schema)}

CONTEXT:
- URL: ${url}
- LOCALE_HINT: ${localeHint || cfg.defaultLocale}
- METADATA: ${JSON.stringify(metadata || {})}

MARKDOWN:
<<<
${md}
>>>

AUFGABE:
1) Extrahiere Felder strikt nach SCHEMA. Keine Marketing-Phantasie.
2) Preise als Zahl + Währung.
3) Sicherheits-/Allergenhinweise exakt.
4) source_last_seen_at = aktuelle UTC ISO8601.
`;

  const resp = await client.chat.completions.create({
    model: cfg.llmModel,
    response_format: { type: "json_object" },
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user }
    ],
    temperature: 0
  });

  const json = JSON.parse(resp.choices[0].message.content || '{}');

  // Post-process
  json.url = url;
  json.locale = json.locale || localeHint || cfg.defaultLocale;
  json.source_last_seen_at = new Date().toISOString();
  json.version_hash = sha256(markdown);

  return json;
}
src/chunking.js

js
Kopieren
Bearbeiten
function linearizeDosage(dosage) {
  if (!Array.isArray(dosage)) return '';
  return dosage.map(r => {
    const wh = r.water_hardness ?? '';
    const load = r.load_kg ?? '';
    const soil = r.soil ?? '';
    const dose = r.dose_ml ?? '';
    return `Härte: ${wh} | Ladung: ${load} | Verschmutzung: ${soil} | Dosis: ${dose} ml`;
  }).join('\n');
}

export function buildChunks(p) {
  const chunks = [];
  let pos = 0;
  const push = (type, text) => {
    if (!text) return;
    const clean = text.toString().replace(/\s+\n/g, '\n').trim();
    if (clean.length === 0) return;
    chunks.push({ chunk_type: type, position: pos++, text_content: clean, locale: p.locale || 'de-DE' });
  };

  push('overview', [p.title, p.one_liner, p.short_description, p.scent_profile].filter(Boolean).join('\n'));
  push('how_to_use', [p.how_to_use, linearizeDosage(p.dosage_table)].filter(Boolean).join('\n'));
  push('compatibility', [p.compatibility, p.temp_range_c ? `Temp-Bereich (°C): ${p.temp_range_c.join('–')}` : null].filter(Boolean).join('\n'));

  const ingrSust = [p.ingredients_plain, (p.sustainability_claims||[]).join(', '), p.sustainability_details].filter(Boolean).join('\n');
  push('ingredients_sustainability', ingrSust);

  const safety = [
    (p.hazard_statements||[]).join('\n'),
    (p.allergen_notes||[]).length ? `Allergene: ${(p.allergen_notes||[]).join(', ')}` : null,
    p.safety_notes
  ].filter(Boolean).join('\n');
  push('safety', safety);

  if (Array.isArray(p.faq_qa) && p.faq_qa.length) {
    const faq = p.faq_qa.map(x => `Q: ${x.q}\nA: ${x.a}`).join('\n\n');
    push('faq', faq);
  }

  return chunks;
}
src/embed.js

js
Kopieren
Bearbeiten
import OpenAI from 'openai';
import { cfg } from './config.js';

const client = new OpenAI({ apiKey: cfg.openaiKey });

export async function embedTexts(texts) {
  const input = texts.map(t => t.text_content);
  const resp = await client.embeddings.create({ model: cfg.embedModel, input });
  return resp.data.map(d => d.embedding);
}
src/upsert.js

js
Kopieren
Bearbeiten
import { upsertProduct, replaceChunks } from './db.js';
import { buildChunks } from './chunking.js';
import { embedTexts } from './embed.js';

export async function upsertAll(productLike) {
  // 1) Upsert product row
  const productId = await upsertProduct(productLike);

  // 2) Build chunks
  const chunks = buildChunks(productLike);
  if (!chunks.length) {
    console.warn('No chunks produced; skipping embeddings.');
    return { productId, chunks: 0 };
  }

  // 3) Embeddings
  const vectors = await embedTexts(chunks);

  // 4) Attach vectors & write
  const withVec = chunks.map((c, i) => ({ ...c, embedding: vectors[i] }));
  await replaceChunks(productId, withVec);
  return { productId, chunks: withVec.length };
}
src/index.js

js
Kopieren
Bearbeiten
import { cfg } from './config.js';
import { fetchPage } from './fetchPage.js';
import { extractProductJSON } from './extractLLM.js';
import { upsertAll } from './upsert.js';

async function main() {
  const url = process.argv[2];
  const shopId = process.argv[3];
  const localeHint = process.argv[4] || cfg.defaultLocale;

  if (!url || !shopId) {
    console.error('Usage: node src/index.js <product_url> <shop_id> [locale]');
    process.exit(1);
  }

  console.log('> Fetching page…', url);
  const page = await fetchPage(url);

  console.log('> Extracting structured JSON via LLM…');
  const extracted = await extractProductJSON({
    url,
    localeHint,
    markdown: page.markdown,
    metadata: page.metadata
  });

  // enrich with ETL context
  extracted.page_markdown = page.markdown;
  extracted.shop_id = shopId;

  console.log('> Upserting product + chunks + embeddings…');
  const res = await upsertAll(extracted);

  console.log('Done.', res);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
6) Nutzung
bash
Kopieren
Bearbeiten
cp .env.example .env
# .env befüllen (DB, OpenAI, ggf. Firecrawl)

# SQL vorbereiten (achte auf EMBED_DIM):
psql "$DATABASE_URL" -f sql/add_products_columns.sql
EMBED_DIM=3072 envsubst < sql/create_products_chunks.sql | psql "$DATABASE_URL"

npm i
node src/index.js "https://www.everdrop.de/products/delicates-detergent" "<SHOP_UUID>" de-DE
7) Warum das schneller ist (und schlau bleibt)
Einfachheit: ein CLI-Befehl je URL, leicht in Cron/CI/CD zu hängen.

Determinismus: version_hash → nur bei Änderungen re-embedden.

Kostenkontrolle: LLM nur für Extraktion; Embedding gebatcht.

Portabilität: Selber Code läuft später in einem Worker/Queue (BullMQ, Cloud Run, Railway etc.).

8) Python-Alternative (kurz)
Wenn du Python bevorzugst:

pydantic fürs Schema,

requests/httpx + Firecrawl,

openai SDK,

psycopg für DB,

identische Schritte (Extraktion → Chunking → Embedding → Upsert).
Sag Bescheid, dann droppe ich dir die vollständigen .py-Dateien (FastAPI-Version oder CLI).

Wenn du willst, passe ich das Prompting auf deine realen Daten an (z. B. spezielle Felder einzelner Shops), oder erweitere um JSON-LD First (Structured Data) vor LLM, um Tokens zu sparen.