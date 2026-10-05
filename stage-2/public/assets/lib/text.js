// Characters, not UTF-16 units: an emoji counts once (stage-1 D5).
export const charCount = (text) => [...text].length;
