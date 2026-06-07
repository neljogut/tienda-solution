async function main() {
  const url = 'https://firestore.googleapis.com/v1/projects/dualgi3de/databases/(default)/documents/products?pageSize=10';
  const response = await fetch(url);
  const data = await response.json();
  
  if (!data.documents) {
    console.log('No documents found or error:', data);
    return;
  }

  for (const doc of data.documents) {
    const fields = doc.fields;
    const name = fields.name?.stringValue;
    const type = fields.type?.stringValue;
    const useManual = fields.useManualPrice?.booleanValue;
    const manualPrice = fields.manualRetailPrice?.doubleValue || fields.manualRetailPrice?.integerValue || 0;
    const calculatedRetail = fields.calculatedRetailPrice?.doubleValue || fields.calculatedRetailPrice?.integerValue || 0;
    const calculatedCost = fields.calculatedCost?.doubleValue || fields.calculatedCost?.integerValue || 0;
    const weightGrams = fields.weightGrams?.doubleValue || fields.weightGrams?.integerValue || 0;
    const printTime = fields.printTimeMinutes?.integerValue || 0;
    const filamentIds = fields.filamentIds?.arrayValue?.values?.map(v => v.stringValue) || [];

    console.log(`Product: ${name}`);
    console.log(`  Type: ${type}`);
    console.log(`  Weight: ${weightGrams}g, Print Time: ${printTime}m`);
    console.log(`  useManualPrice: ${useManual}`);
    console.log(`  Prices -> Manual: ${manualPrice}, Calc Retail: ${calculatedRetail}, Calc Cost: ${calculatedCost}`);
    console.log(`  Filaments:`, filamentIds);
    console.log('');
  }
}

main().catch(console.error);
