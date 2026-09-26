export const callGraph = (kind: 'chain' | 'diamond' | 'fanout', depth: number): string => {
  const declarations = ['const f0 = (value: number): number => value + 1;'];
  for (let index = 1; index <= depth; index += 1) {
    const previous = `f${index - 1}(value)`;
    if (kind === 'diamond') {
      declarations.push(`const left${index} = (value: number) => ${previous};`);
      declarations.push(`const right${index} = (value: number) => ${previous};`);
    }
    const expression =
      kind === 'chain'
        ? previous
        : kind === 'diamond'
          ? `left${index}(value) + right${index}(value)`
          : `${previous} + ${previous}`;
    declarations.push(`const f${index} = (value: number): number => ${expression};`);
  }
  return [...declarations, `export { f${depth} };`].join('\n');
};
