import React from "react";
export interface PermutationsViewProps<T> {
    permutations: ReadonlyArray<T>;
    render: (_props: T, _index?: number) => React.ReactElement;
}
export declare function PermutationsView<T>({ permutations, render }: PermutationsViewProps<T>): React.JSX.Element;
