export function getProductImages(product: {
  mainImage?: string;
  gallery?: string[];
}): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of [product.mainImage, ...(product.gallery ?? [])]) {
    if (url && !seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }
  return result;
}
