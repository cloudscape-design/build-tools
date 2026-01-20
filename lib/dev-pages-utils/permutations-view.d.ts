import React from "react";
export interface PermutationsViewProps<T> {
    permutations: ReadonlyArray<T>;
    render: (_props: T, _index?: number) => React.ReactElement;
    direction?: "vertical" | "horizontal";
}
export declare function PermutationsView<T>({ permutations, render, direction }: PermutationsViewProps<T>): React.JSX.Element;
