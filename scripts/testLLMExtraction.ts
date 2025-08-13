import { extractWithLLM } from '../src/services/llmExtractor.js';
import dotenv from 'dotenv';

dotenv.config();

// Mock markdown content for an Everdrop product
const mockMarkdown = `
# Feinwaschmittel

Unser Feinwaschmittel reinigt empfindliche Textilien besonders schonend und effektiv.

## Produktbeschreibung
Das everdrop Feinwaschmittel ist speziell für empfindliche Stoffe wie Wolle, Seide und Kaschmir entwickelt. 
Es reinigt gründlich bei niedrigen Temperaturen und schützt die Fasern vor dem Ausbleichen.

## Preis
24,99 € (Originalpreis: 29,99 €)

## Eigenschaften
- Für empfindliche Textilien
- Wirksam ab 20°C
- Dermatologisch getestet
- Vegan und tierversuchsfrei
- Made in Germany

## Inhaltsstoffe
Enthält 5-15% anionische Tenside, <5% nichtionische Tenside, Enzyme, Duftstoffe

## Verfügbarkeit
Auf Lager - Lieferzeit 2-3 Werktage
`;

async function testLLMExtraction() {
  try {
    console.log('🧪 Testing LLM extraction with mock data...\n');
    
    const result = await extractWithLLM({
      url: 'https://www.everdrop.de/products/delicates-detergent',
      markdown: mockMarkdown,
      metadata: {
        title: 'Feinwaschmittel - everdrop',
        description: 'Schonendes Waschmittel für empfindliche Textilien',
      },
      locale: 'de',
    });
    
    console.log('\n✅ Extraction successful!');
    console.log('\n📊 Extracted data:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Extraction failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
  }
}

testLLMExtraction();