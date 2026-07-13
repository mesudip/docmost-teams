export const marked = {
  use: jest.fn(),
  setOptions: jest.fn(),
  parse: jest.fn((value: string) => value),
};
