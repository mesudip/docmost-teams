export function customAlphabet(alphabet: string, defaultSize = 10) {
  return (size = defaultSize) => alphabet[0].repeat(size);
}
