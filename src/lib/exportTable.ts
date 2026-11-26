/** Download an array of flat objects as a .xlsx workbook.
 *  xlsx (SheetJS) is heavy and only needed on export, so it's lazy-loaded. */
export async function exportToExcel(
  rows: Record<string, string | number | null>[],
  filename: string,
  sheet = 'Data'
) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
