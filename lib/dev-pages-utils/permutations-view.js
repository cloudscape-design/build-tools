// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import React from "react";
function formatValue(_key, value) {
    if (typeof value === "function") {
        return value.toString();
    }
    if (value && value.$$typeof) {
        // serialize React content to string
        return JSON.stringify(value);
    }
    return value;
}
const maximumPermutations = 276;
export function PermutationsView({ permutations, render }) {
    if (permutations.length > maximumPermutations) {
        throw new Error(`Too many permutations (${permutations.length}), maximum is ${maximumPermutations}`);
    }
    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "16px" } }, permutations.map((permutation, index) => {
        const id = JSON.stringify(permutation, formatValue);
        return (React.createElement("div", { key: id, "data-permutation": id }, render(permutation, index)));
    })));
}
