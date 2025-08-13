import { ProductExtraction } from './llmExtractor.js';

export interface ProductChunk {
  chunkType: 'main' | 'specs' | 'details' | 'attributes' | 'claims';
  chunkContent: string;
  metadata: Record<string, any>;
}

/**
 * Create semantic chunks from extracted product data
 * Each chunk should be self-contained and optimized for vector search
 */
export function createChunks(product: ProductExtraction): ProductChunk[] {
  const chunks: ProductChunk[] = [];
  
  // Main chunk: Core product information
  const mainContent = buildMainChunk(product);
  if (mainContent) {
    chunks.push({
      chunkType: 'main',
      chunkContent: mainContent,
      metadata: {
        productName: product.name,
        productType: product.product_type,
        category: product.category,
      },
    });
  }
  
  // Specifications chunk: Technical details
  const specsContent = buildSpecsChunk(product);
  if (specsContent) {
    chunks.push({
      chunkType: 'specs',
      chunkContent: specsContent,
      metadata: {
        productName: product.name,
        hasSpecs: true,
      },
    });
  }
  
  // Details chunk: Additional product details
  const detailsContent = buildDetailsChunk(product);
  if (detailsContent) {
    chunks.push({
      chunkType: 'details',
      chunkContent: detailsContent,
      metadata: {
        productName: product.name,
        hasWarnings: (product.warnings?.length ?? 0) > 0,
      },
    });
  }
  
  // Claims chunk: Marketing claims and certifications
  const claimsContent = buildClaimsChunk(product);
  if (claimsContent) {
    chunks.push({
      chunkType: 'claims',
      chunkContent: claimsContent,
      metadata: {
        productName: product.name,
        claimsCount: product.claims?.length ?? 0,
      },
    });
  }
  
  // Attributes chunk: Flexible attributes
  const attributesContent = buildAttributesChunk(product);
  if (attributesContent) {
    chunks.push({
      chunkType: 'attributes',
      chunkContent: attributesContent,
      metadata: {
        productName: product.name,
        attributeKeys: Object.keys(product.attributes || {}),
      },
    });
  }
  
  return chunks;
}

function buildMainChunk(product: ProductExtraction): string | null {
  const parts: string[] = [];
  
  // Product name and type
  parts.push(`Produkt: ${product.name}`);
  
  if (product.product_type && product.product_type !== 'other') {
    parts.push(`Typ: ${product.product_type}`);
  }
  
  // Category hierarchy
  if (product.category) {
    const categoryPath = product.subcategory 
      ? `${product.category} > ${product.subcategory}`
      : product.category;
    parts.push(`Kategorie: ${categoryPath}`);
  }
  
  // Brand
  if (product.brand) {
    parts.push(`Marke: ${product.brand}`);
  }
  
  // Description
  if (product.description) {
    parts.push(`Beschreibung: ${product.description}`);
  }
  
  // Tags
  if (product.tags && product.tags.length > 0) {
    parts.push(`Tags: ${product.tags.join(', ')}`);
  }
  
  // Price and availability
  if (product.price !== undefined) {
    const priceInfo = product.price_original 
      ? `${product.price} ${product.currency || 'EUR'} (Original: ${product.price_original} ${product.currency || 'EUR'})`
      : `${product.price} ${product.currency || 'EUR'}`;
    parts.push(`Preis: ${priceInfo}`);
  }
  
  if (product.availability) {
    const availabilityText = {
      'in_stock': 'Auf Lager',
      'out_of_stock': 'Ausverkauft',
      'on_request': 'Auf Anfrage',
      'preorder': 'Vorbestellbar',
      'discontinued': 'Nicht mehr verfügbar',
    }[product.availability] || product.availability;
    parts.push(`Verfügbarkeit: ${availabilityText}`);
  }
  
  // Ratings
  if (product.rating_value && product.rating_count) {
    parts.push(`Bewertung: ${product.rating_value}/5 (${product.rating_count} Bewertungen)`);
  }
  
  return parts.length > 0 ? parts.join('\n') : null;
}

function buildSpecsChunk(product: ProductExtraction): string | null {
  if (!product.specifications || Object.keys(product.specifications).length === 0) {
    return null;
  }
  
  const parts: string[] = [`Technische Daten für ${product.name}:`];
  
  for (const [key, value] of Object.entries(product.specifications)) {
    if (value !== null && value !== undefined) {
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      if (typeof value === 'object' && !Array.isArray(value)) {
        parts.push(`${formattedKey}:`);
        for (const [subKey, subValue] of Object.entries(value)) {
          parts.push(`  - ${subKey}: ${subValue}`);
        }
      } else if (Array.isArray(value)) {
        parts.push(`${formattedKey}: ${value.join(', ')}`);
      } else {
        parts.push(`${formattedKey}: ${value}`);
      }
    }
  }
  
  // Add SKU/EAN if available
  if (product.sku) {
    parts.push(`Artikelnummer: ${product.sku}`);
  }
  if (product.ean) {
    parts.push(`EAN: ${product.ean}`);
  }
  
  return parts.length > 1 ? parts.join('\n') : null;
}

function buildDetailsChunk(product: ProductExtraction): string | null {
  const parts: string[] = [];
  
  // Delivery and shipping info
  if (product.delivery_time) {
    parts.push(`Lieferzeit: ${product.delivery_time}`);
  }
  
  if (product.shipping_info) {
    parts.push(`Versand: ${product.shipping_info}`);
  }
  
  // Manufacturer
  if (product.manufacturer && product.manufacturer !== product.brand) {
    parts.push(`Hersteller: ${product.manufacturer}`);
  }
  
  // Warnings
  if (product.warnings && product.warnings.length > 0) {
    parts.push('Hinweise und Warnungen:');
    product.warnings.forEach(warning => {
      parts.push(`- ${warning}`);
    });
  }
  
  return parts.length > 0 ? parts.join('\n') : null;
}

function buildClaimsChunk(product: ProductExtraction): string | null {
  if (!product.claims || product.claims.length === 0) {
    return null;
  }
  
  const parts: string[] = [`Eigenschaften und Zertifikate für ${product.name}:`];
  
  product.claims.forEach(claim => {
    parts.push(`- ${claim}`);
  });
  
  return parts.join('\n');
}

function buildAttributesChunk(product: ProductExtraction): string | null {
  if (!product.attributes || Object.keys(product.attributes).length === 0) {
    return null;
  }
  
  const parts: string[] = [`Weitere Eigenschaften für ${product.name}:`];
  
  for (const [key, value] of Object.entries(product.attributes)) {
    if (value !== null && value !== undefined) {
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      if (typeof value === 'boolean') {
        if (value) {
          parts.push(`✓ ${formattedKey}`);
        }
      } else if (Array.isArray(value)) {
        parts.push(`${formattedKey}: ${value.join(', ')}`);
      } else if (typeof value === 'object') {
        parts.push(`${formattedKey}: ${JSON.stringify(value)}`);
      } else {
        parts.push(`${formattedKey}: ${value}`);
      }
    }
  }
  
  return parts.length > 1 ? parts.join('\n') : null;
}

/**
 * Calculate token estimate for a text (rough approximation)
 * OpenAI uses ~1 token per 4 characters on average
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split large chunks if they exceed token limits
 */
export function splitLargeChunk(chunk: ProductChunk, maxTokens: number = 1500): ProductChunk[] {
  const estimatedTokens = estimateTokens(chunk.chunkContent);
  
  if (estimatedTokens <= maxTokens) {
    return [chunk];
  }
  
  // Split content into smaller parts
  const lines = chunk.chunkContent.split('\n');
  const chunks: ProductChunk[] = [];
  let currentContent: string[] = [];
  let currentTokens = 0;
  
  for (const line of lines) {
    const lineTokens = estimateTokens(line);
    
    if (currentTokens + lineTokens > maxTokens && currentContent.length > 0) {
      // Create a new chunk
      chunks.push({
        ...chunk,
        chunkContent: currentContent.join('\n'),
        metadata: {
          ...chunk.metadata,
          partNumber: chunks.length + 1,
        },
      });
      currentContent = [line];
      currentTokens = lineTokens;
    } else {
      currentContent.push(line);
      currentTokens += lineTokens;
    }
  }
  
  // Add the last chunk
  if (currentContent.length > 0) {
    chunks.push({
      ...chunk,
      chunkContent: currentContent.join('\n'),
      metadata: {
        ...chunk.metadata,
        partNumber: chunks.length + 1,
        totalParts: chunks.length + 1,
      },
    });
  }
  
  return chunks;
}