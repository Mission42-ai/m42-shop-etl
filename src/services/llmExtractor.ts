import OpenAI from 'openai';
import { apiConfig, localeConfig } from '../config/index.js';
import { z } from 'zod';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: apiConfig.openai.apiKey,
});

// Product extraction schema
const productExtractionSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  product_type: z.enum([
    'fashion', 
    'furniture', 
    'electronics', 
    'food', 
    'beauty', 
    'sports', 
    'toys', 
    'books', 
    'other'
  ]).nullable().optional(),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  
  price: z.number().nullable().optional(),
  price_original: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  availability: z.enum([
    'in_stock', 
    'out_of_stock', 
    'on_request', 
    'preorder', 
    'discontinued'
  ]).nullable().optional(),
  
  brand: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
  ean: z.string().nullable().optional(),
  
  claims: z.array(z.string()).nullable().optional(),
  warnings: z.array(z.string()).nullable().optional(),
  
  specifications: z.record(z.any()).nullable().optional(),
  attributes: z.record(z.any()).nullable().optional(),
  
  images: z.array(z.object({
    url: z.string(),
    alt: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
  })).nullable().optional(),
  
  videos: z.array(z.object({
    url: z.string(),
    title: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
  })).nullable().optional(),
  
  rating_value: z.number().nullable().optional(),
  rating_count: z.number().nullable().optional(),
  
  delivery_time: z.string().nullable().optional(),
  shipping_info: z.string().nullable().optional(),
});

export type ProductExtraction = z.infer<typeof productExtractionSchema>;

const EXTRACTION_PROMPT = `You are a product data extractor for e-commerce websites.
Extract structured product information from the provided markdown content and return it as valid JSON.

Important guidelines:
1. Only extract information that is clearly present in the content
2. Be precise with product names and descriptions
3. Extract prices as numbers (without currency symbols)
4. Identify the product type from the categories list
5. Claims should include all marketing claims, certifications, and unique selling points
6. Warnings should include safety warnings, age restrictions, allergens, etc.
7. Specifications should include all technical details, dimensions, materials, etc.
8. Attributes are for other flexible properties not covered above
9. Return the result as a valid JSON object

For German content, extract in German but use the English enum values for product_type and availability.`;

interface ExtractionInput {
  markdown: string;
  metadata?: any;
  url: string;
  locale?: string;
}

export async function extractWithLLM(input: ExtractionInput): Promise<ProductExtraction> {
  try {
    // Truncate markdown if too long (to stay within token limits)
    const maxLength = 50000;
    const truncatedMarkdown = input.markdown.length > maxLength 
      ? input.markdown.substring(0, maxLength) + '\n... [truncated]'
      : input.markdown;
    
    const userPrompt = `URL: ${input.url}
LOCALE: ${input.locale || localeConfig.defaultLocale}
${input.metadata ? `METADATA: ${JSON.stringify(input.metadata, null, 2)}` : ''}

MARKDOWN CONTENT:
${truncatedMarkdown}

Extract product data and return a JSON object with these exact field names:
- name (product name, NOT product_name)
- description
- product_type (must be one of: fashion, furniture, electronics, food, beauty, sports, toys, books, other)
- category, subcategory, tags (array)
- price (number), price_original (number), currency
- availability (one of: in_stock, out_of_stock, on_request, preorder, discontinued)
- brand, manufacturer, sku, ean
- claims (array), warnings (array)
- specifications (object), attributes (object)
- images (array of {url, alt, type})
- rating_value (number), rating_count (number)
- delivery_time, shipping_info

For cleaning products like detergents, use product_type: "beauty".`;
    
    console.log(`🤖 Extracting product data from ${input.url}...`);
    
    const response = await openai.chat.completions.create({
      model: apiConfig.openai.llmModel,
      messages: [
        {
          role: 'system',
          content: EXTRACTION_PROMPT,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 4000,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }
    
    // Parse the response
    const rawExtraction = JSON.parse(content);
    console.log('📝 Raw LLM response:', JSON.stringify(rawExtraction, null, 2).substring(0, 1000));
    
    // Fix common field naming issues before validation
    const fixed = { ...rawExtraction };
    
    // Fix name field
    if (!fixed.name && (fixed.product_name || fixed.title || fixed.product_title)) {
      fixed.name = fixed.product_name || fixed.title || fixed.product_title;
      delete fixed.product_name;
      delete fixed.title;
      delete fixed.product_title;
    }
    
    // Fix category/subcategory if they're arrays (convert to string)
    if (Array.isArray(fixed.category)) {
      fixed.category = fixed.category[0] || undefined;
    }
    if (Array.isArray(fixed.subcategory)) {
      fixed.subcategory = fixed.subcategory[0] || undefined;
    }
    
    // Ensure tags is an array
    if (fixed.tags && !Array.isArray(fixed.tags)) {
      fixed.tags = [fixed.tags];
    }
    
    // Fix product_type
    if (fixed.product_type) {
      const validTypes = ['fashion', 'furniture', 'electronics', 'food', 'beauty', 'sports', 'toys', 'books', 'other'];
      if (!validTypes.includes(fixed.product_type)) {
        // Map common mismatches
        const typeMapping: Record<string, string> = {
          'detergent': 'beauty',
          'cleaning': 'beauty',
          'household': 'beauty',
          'laundry': 'beauty',
          'hygiene': 'beauty',
          'cosmetics': 'beauty',
          'personal_care': 'beauty',
        };
        
        fixed.product_type = typeMapping[fixed.product_type.toLowerCase()] || 'other';
        console.log(`🔄 Mapped product type to: ${fixed.product_type}`);
      }
    }
    
    // Fix availability
    if (fixed.availability) {
      const validAvailability = ['in_stock', 'out_of_stock', 'on_request', 'preorder', 'discontinued'];
      if (!validAvailability.includes(fixed.availability)) {
        // Map common mismatches
        const availMapping: Record<string, string> = {
          'available': 'in_stock',
          'unavailable': 'out_of_stock',
          'sold_out': 'out_of_stock',
          'back_order': 'preorder',
        };
        
        fixed.availability = availMapping[fixed.availability.toLowerCase()] || 'in_stock';
      }
    }
    
    // Ensure numeric fields are numbers
    if (typeof fixed.price === 'string') {
      fixed.price = parseFloat(fixed.price) || undefined;
    }
    if (typeof fixed.price_original === 'string') {
      fixed.price_original = parseFloat(fixed.price_original) || undefined;
    }
    if (typeof fixed.rating_value === 'string') {
      fixed.rating_value = parseFloat(fixed.rating_value) || undefined;
    }
    if (typeof fixed.rating_count === 'string') {
      fixed.rating_count = parseInt(fixed.rating_count) || undefined;
    }
    
    // Validate with fixed data
    const validated = productExtractionSchema.parse(fixed);
    
    console.log(`✅ Successfully extracted product: ${validated.name}`);
    
    return validated;
    
  } catch (error) {
    console.error('❌ Error in LLM extraction:', error);
    
    // If it's a validation error, try auto-fix with another LLM call
    if (error instanceof z.ZodError) {
      console.error('📝 Validation errors:', JSON.stringify(error.errors, null, 2));
      console.log('🔧 Attempting auto-fix with LLM...');
      
      try {
        // Prepare the auto-fix prompt similar to n8n's approach
        const autoFixPrompt = `Instructions:
--------------
${userPrompt}

The response must be valid JSON that matches the schema exactly. All field names must be as specified.
--------------
Completion:
--------------
${content}
--------------

Above, the Completion did not satisfy the constraints given in the Instructions.
Error:
--------------
${JSON.stringify(error.errors, null, 2)}
--------------

Please try again. Please only respond with valid JSON that satisfies ALL the constraints laid out in the Instructions.
Important fixes needed:
1. Use exact field names as specified (e.g., "name" not "product_name")
2. Ensure numeric fields contain numbers, not strings
3. Arrays must be arrays, not single values
4. Enum values must match exactly (e.g., product_type must be one of the valid options)
5. For null or missing values, use null or omit the field`;

        const fixResponse = await openai.chat.completions.create({
          model: apiConfig.openai.llmModel,
          messages: [
            {
              role: 'system',
              content: 'You are a JSON formatter. Fix the JSON to match the exact schema requirements. Output only valid JSON.',
            },
            {
              role: 'user',
              content: autoFixPrompt,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 4000,
        });
        
        const fixedContent = fixResponse.choices[0]?.message?.content;
        if (!fixedContent) {
          throw new Error('No response from auto-fix attempt');
        }
        
        const fixedExtraction = JSON.parse(fixedContent);
        console.log('🔧 Auto-fix response:', JSON.stringify(fixedExtraction, null, 2).substring(0, 1000));
        
        // Apply the same field fixes as before
        const fixed = { ...fixedExtraction };
        
        // Fix name field
        if (!fixed.name && (fixed.product_name || fixed.title || fixed.product_title)) {
          fixed.name = fixed.product_name || fixed.title || fixed.product_title;
          delete fixed.product_name;
          delete fixed.title;
          delete fixed.product_title;
        }
        
        // Fix category/subcategory if they're arrays
        if (Array.isArray(fixed.category)) {
          fixed.category = fixed.category[0] || undefined;
        }
        if (Array.isArray(fixed.subcategory)) {
          fixed.subcategory = fixed.subcategory[0] || undefined;
        }
        
        // Ensure tags is an array
        if (fixed.tags && !Array.isArray(fixed.tags)) {
          fixed.tags = [fixed.tags];
        }
        
        // Fix product_type
        if (fixed.product_type) {
          const validTypes = ['fashion', 'furniture', 'electronics', 'food', 'beauty', 'sports', 'toys', 'books', 'other'];
          if (!validTypes.includes(fixed.product_type)) {
            const typeMapping: Record<string, string> = {
              'detergent': 'beauty',
              'cleaning': 'beauty',
              'household': 'beauty',
              'laundry': 'beauty',
              'hygiene': 'beauty',
              'cosmetics': 'beauty',
              'personal_care': 'beauty',
            };
            fixed.product_type = typeMapping[fixed.product_type.toLowerCase()] || 'other';
          }
        }
        
        // Fix availability
        if (fixed.availability) {
          const validAvailability = ['in_stock', 'out_of_stock', 'on_request', 'preorder', 'discontinued'];
          if (!validAvailability.includes(fixed.availability)) {
            const availMapping: Record<string, string> = {
              'available': 'in_stock',
              'unavailable': 'out_of_stock',
              'sold_out': 'out_of_stock',
              'back_order': 'preorder',
            };
            fixed.availability = availMapping[fixed.availability.toLowerCase()] || 'in_stock';
          }
        }
        
        // Ensure numeric fields are numbers
        if (typeof fixed.price === 'string') {
          fixed.price = parseFloat(fixed.price) || undefined;
        }
        if (typeof fixed.price_original === 'string') {
          fixed.price_original = parseFloat(fixed.price_original) || undefined;
        }
        if (typeof fixed.rating_value === 'string') {
          fixed.rating_value = parseFloat(fixed.rating_value) || undefined;
        }
        if (typeof fixed.rating_count === 'string') {
          fixed.rating_count = parseInt(fixed.rating_count) || undefined;
        }
        
        // Try validation again
        const validated = productExtractionSchema.parse(fixed);
        console.log(`✅ Auto-fix successful! Extracted product: ${validated.name}`);
        return validated;
        
      } catch (autoFixError) {
        console.error('❌ Auto-fix attempt failed:', autoFixError);
        
        // Fall back to partial data extraction
        const rawData = error.data as any;
        if (rawData && typeof rawData === 'object') {
          const fallback: any = {
            name: rawData.name || rawData.product_name || rawData.title || 'Unknown Product',
            description: rawData.description || rawData.product_description || 'Failed to extract product information',
            product_type: 'other',
          };
          
          // Try to preserve as much valid data as possible
          if (rawData.price && typeof rawData.price === 'number') fallback.price = rawData.price;
          if (rawData.brand && typeof rawData.brand === 'string') fallback.brand = rawData.brand;
          if (rawData.category && typeof rawData.category === 'string') fallback.category = rawData.category;
          if (Array.isArray(rawData.tags)) fallback.tags = rawData.tags;
          if (Array.isArray(rawData.claims)) fallback.claims = rawData.claims;
          
          console.log('🔧 Created fallback with partial data:', JSON.stringify(fallback, null, 2));
          return fallback as ProductExtraction;
        }
        
        // Last resort fallback
        return {
          name: 'Unknown Product',
          description: 'Failed to extract product information',
          product_type: 'other',
        } as ProductExtraction;
      }
    }
    
    // Log other types of errors
    console.error('🚨 Unexpected error type:', error);
    throw error;
  }
}

// Helper function to extract product type from content
export function inferProductType(content: string): ProductExtraction['product_type'] {
  const contentLower = content.toLowerCase();
  
  const typePatterns: Record<ProductExtraction['product_type'], string[]> = {
    fashion: ['kleidung', 'clothing', 'fashion', 'shirt', 'hose', 'kleid', 'dress', 'jacket'],
    furniture: ['möbel', 'furniture', 'sofa', 'tisch', 'table', 'stuhl', 'chair', 'schrank'],
    electronics: ['elektronik', 'electronics', 'computer', 'laptop', 'phone', 'tv', 'monitor'],
    food: ['lebensmittel', 'food', 'nahrung', 'essen', 'getränk', 'drink'],
    beauty: ['kosmetik', 'beauty', 'makeup', 'pflege', 'cream', 'shampoo'],
    sports: ['sport', 'fitness', 'training', 'ball', 'equipment'],
    toys: ['spielzeug', 'toys', 'spiel', 'game', 'puppe', 'doll'],
    books: ['buch', 'book', 'bücher', 'roman', 'novel'],
    other: [],
  };
  
  for (const [type, patterns] of Object.entries(typePatterns)) {
    if (patterns.some(pattern => contentLower.includes(pattern))) {
      return type as ProductExtraction['product_type'];
    }
  }
  
  return 'other';
}