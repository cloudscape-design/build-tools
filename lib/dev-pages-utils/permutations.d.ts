export type ComponentPermutations<Props> = {
    [prop in keyof Props]: ReadonlyArray<Props[prop]>;
};
export declare function createPermutations<Props>(permutations: Array<ComponentPermutations<Props>>): Props[];
