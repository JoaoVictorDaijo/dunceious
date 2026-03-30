/**
 * Splits a raw multi-record GenBank string into an array of individual
 * record strings.  Records are terminated by a line containing only "//".
 */
export function splitRecords(content: string): string[] {
  return content.split(/\r?\n\/\/\s*(?:\r?\n|$)/).filter(s => s.trim());
}
